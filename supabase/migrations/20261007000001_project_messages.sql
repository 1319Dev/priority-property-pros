-- Customer ↔ contractor messages for one project + contractor pair.
-- Unlocked only by booking_contact_access for that pair:
--   UNLOCKED + CONNECTION_FEE_PAYMENT ($4.99 connection), or
--   ADMIN_OVERRIDE + ADMIN_OVERRIDE.
-- $9.99 activation, Hired, booking status, and job payment do not open a thread.
-- Does not change payments_live, charges_live, signup_fee_enabled, or Stripe amounts.
-- Does not apply itself to production. Owner applies this migration.
-- Phone, email, and street stay off the thread. Body text reuses the contact scanners.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.project_message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_message_threads_pair UNIQUE (project_id, contractor_profile_id)
);

CREATE INDEX project_message_threads_contractor_idx
  ON public.project_message_threads (contractor_profile_id);

CREATE TRIGGER project_message_threads_set_updated_at
  BEFORE UPDATE ON public.project_message_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.project_message_threads IS
  'One thread per project and contractor. Exists only after that pair has a $4.99 connection entitlement (or admin override) on booking_contact_access. Not a contact-reveal record.';

CREATE TABLE public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.project_message_threads (id) ON DELETE CASCADE,
  sender_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_messages_body_len CHECK (char_length(body) BETWEEN 1 AND 4000)
);

CREATE INDEX project_messages_thread_created_idx
  ON public.project_messages (thread_id, created_at);

COMMENT ON TABLE public.project_messages IS
  'Append-only project messages. Body is scanned for phone, email, URL, handle, QR, and street. No phone, email, or street columns.';

-- ---------------------------------------------------------------------------
-- Entitlement: booking_contact_access only. Caller must be the pair.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.message_pair_has_connection_entitlement(
  p_project_id uuid,
  p_contractor_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_contact_access a
    JOIN public.projects p ON p.id = a.project_id
    WHERE a.project_id = p_project_id
      AND a.contractor_profile_id = p_contractor_profile_id
      AND a.revoked_at IS NULL
      AND (
        (a.status = 'UNLOCKED' AND a.grant_source = 'CONNECTION_FEE_PAYMENT')
        OR (a.status = 'ADMIN_OVERRIDE' AND a.grant_source = 'ADMIN_OVERRIDE')
      )
      AND (
        a.booking_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.bookings b
          WHERE b.id = a.booking_id
            AND b.status IS DISTINCT FROM 'CANCELLED'
        )
      )
      AND (
        p.customer_id = (SELECT auth.uid())
        OR a.contractor_profile_id = (SELECT public.current_contractor_profile_id())
      )
  );
$$;

COMMENT ON FUNCTION public.message_pair_has_connection_entitlement(uuid, uuid) IS
  'True only for the project owner or that contractor when booking_contact_access is an active $4.99 CONNECTION_FEE_PAYMENT unlock or admin override. Activation, Hired, and job payment are not consulted.';

REVOKE ALL ON FUNCTION public.message_pair_has_connection_entitlement(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_pair_has_connection_entitlement(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Open a thread. Does not return contact fields.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_message_thread(
  p_project_id uuid,
  p_contractor_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF NOT public.message_pair_has_connection_entitlement(p_project_id, p_contractor_profile_id) THEN
    RAISE EXCEPTION 'messaging is locked until the $4.99 connection entitlement is unlocked for this contractor on this project';
  END IF;

  INSERT INTO public.project_message_threads (project_id, contractor_profile_id)
  VALUES (p_project_id, p_contractor_profile_id)
  ON CONFLICT (project_id, contractor_profile_id) DO NOTHING;

  SELECT t.id
  INTO v_id
  FROM public.project_message_threads t
  WHERE t.project_id = p_project_id
    AND t.contractor_profile_id = p_contractor_profile_id;

  RETURN jsonb_build_object(
    'thread_id', v_id,
    'project_id', p_project_id,
    'contractor_profile_id', p_contractor_profile_id
  );
END;
$$;

COMMENT ON FUNCTION public.ensure_message_thread(uuid, uuid) IS
  'Creates the pair thread after connection entitlement. Returns ids only. Does not return phone, email, or street.';

REVOKE ALL ON FUNCTION public.ensure_message_thread(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_message_thread(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- List. Labels are project title, city, state, and an anonymized pro label.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_my_message_threads()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pairs AS (
    SELECT DISTINCT ON (a.project_id, a.contractor_profile_id)
      a.project_id,
      a.contractor_profile_id
    FROM public.booking_contact_access a
    WHERE public.message_pair_has_connection_entitlement(a.project_id, a.contractor_profile_id)
    ORDER BY a.project_id, a.contractor_profile_id
  ),
  rows AS (
    SELECT
      t.id AS thread_id,
      pairs.project_id,
      pairs.contractor_profile_id,
      CASE
        WHEN public.text_contains_contact_info(p.title) OR public.text_contains_pre_hire_contact(p.title)
          THEN 'Project'
        ELSE coalesce(nullif(btrim(p.title), ''), 'Project')
      END AS project_title,
      CASE
        WHEN public.text_contains_contact_info(p.city) OR public.text_contains_pre_hire_contact(p.city)
          THEN NULL
        ELSE nullif(btrim(p.city), '')
      END AS city,
      CASE
        WHEN public.text_contains_contact_info(p.state) OR public.text_contains_pre_hire_contact(p.state)
          THEN NULL
        ELSE nullif(btrim(p.state), '')
      END AS state,
      public.anonymized_pro_label(cp.primary_trade, NULL) AS contractor_label,
      (
        SELECT m.created_at
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message_at,
      (
        SELECT left(m.body, 140)
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_preview
    FROM pairs
    JOIN public.projects p ON p.id = pairs.project_id
    JOIN public.contractor_profiles cp ON cp.id = pairs.contractor_profile_id
    LEFT JOIN public.project_message_threads t
      ON t.project_id = pairs.project_id
     AND t.contractor_profile_id = pairs.contractor_profile_id
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'thread_id', rows.thread_id,
        'project_id', rows.project_id,
        'contractor_profile_id', rows.contractor_profile_id,
        'project_title', rows.project_title,
        'city', rows.city,
        'state', rows.state,
        'contractor_label', rows.contractor_label,
        'last_message_at', rows.last_message_at,
        'last_preview', rows.last_preview
      )
      ORDER BY rows.last_message_at DESC NULLS LAST, rows.project_title
    ),
    '[]'::jsonb
  )
  FROM rows;
$$;

COMMENT ON FUNCTION public.list_my_message_threads() IS
  'Threads the caller may use after a $4.99 connection entitlement. No phone, email, street, or business name.';

REVOKE ALL ON FUNCTION public.list_my_message_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_message_threads() TO authenticated;

-- ---------------------------------------------------------------------------
-- Body scanner + notification without message text or contact fields
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_project_message_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.project_message_threads;
BEGIN
  NEW.body := btrim(coalesce(NEW.body, ''));

  IF char_length(NEW.body) < 1 THEN
    RAISE EXCEPTION 'a message is required';
  END IF;

  IF public.text_contains_contact_info(NEW.body)
     OR public.text_contains_pre_hire_contact(NEW.body) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;

  IF NEW.sender_profile_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'you can only send as yourself';
  END IF;

  SELECT * INTO v_thread FROM public.project_message_threads WHERE id = NEW.thread_id;
  IF NOT FOUND
     OR NOT public.message_pair_has_connection_entitlement(v_thread.project_id, v_thread.contractor_profile_id) THEN
    RAISE EXCEPTION 'messaging is locked until the $4.99 connection entitlement is unlocked for this contractor on this project';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_messages_protect_contact ON public.project_messages;
CREATE TRIGGER project_messages_protect_contact
  BEFORE INSERT ON public.project_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_project_message_contact();

REVOKE ALL ON FUNCTION public.protect_project_message_contact() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_project_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.project_message_threads;
  v_owner uuid;
  v_contractor_user uuid;
  v_recipient uuid;
BEGIN
  SELECT * INTO v_thread FROM public.project_message_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.project_message_threads
  SET updated_at = now()
  WHERE id = v_thread.id;

  SELECT p.customer_id INTO v_owner FROM public.projects p WHERE p.id = v_thread.project_id;
  v_contractor_user := public.contractor_owner_profile_id(v_thread.contractor_profile_id);

  IF NEW.sender_profile_id = v_owner THEN
    v_recipient := v_contractor_user;
  ELSIF NEW.sender_profile_id = v_contractor_user THEN
    v_recipient := v_owner;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_profile_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.ppp_set_rpc('notify_project_message');
  PERFORM public.enqueue_notification(
    v_recipient,
    'message.received',
    'New message',
    'You have a new message about a project.',
    'project_message_threads',
    v_thread.id,
    jsonb_build_object(
      'thread_id', v_thread.id,
      'project_id', v_thread.project_id,
      'contractor_profile_id', v_thread.contractor_profile_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_messages_notify ON public.project_messages;
CREATE TRIGGER project_messages_notify
  AFTER INSERT ON public.project_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_message();

REVOKE ALL ON FUNCTION public.notify_project_message() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notify_project_message() IS
  'In-app notice for the other party. Title and body are generic. Payload is thread ids only — never the message body, phone, email, or street.';

-- ---------------------------------------------------------------------------
-- RLS. Authenticated participants only. No anon. No client update/delete.
-- ---------------------------------------------------------------------------

ALTER TABLE public.project_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_message_threads_select
  ON public.project_message_threads
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.message_pair_has_connection_entitlement(project_id, contractor_profile_id))
  );

CREATE POLICY project_message_threads_insert
  ON public.project_message_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.message_pair_has_connection_entitlement(project_id, contractor_profile_id))
  );

CREATE POLICY project_messages_select
  ON public.project_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_message_threads t
      WHERE t.id = project_messages.thread_id
        AND (SELECT public.message_pair_has_connection_entitlement(t.project_id, t.contractor_profile_id))
    )
  );

CREATE POLICY project_messages_insert
  ON public.project_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_profile_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.project_message_threads t
      WHERE t.id = thread_id
        AND (SELECT public.message_pair_has_connection_entitlement(t.project_id, t.contractor_profile_id))
    )
  );

REVOKE ALL ON TABLE public.project_message_threads FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.project_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.project_message_threads TO authenticated;
GRANT SELECT, INSERT ON TABLE public.project_messages TO authenticated;

-- Realtime for new messages when the Supabase publication exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime'
        AND n.nspname = 'public'
        AND c.relname = 'project_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.project_messages;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Account purge deletes pair threads the person owns or was hired into.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_account_owned_rows(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contractor_id uuid;
  v_is_last_admin boolean := false;
BEGIN
  PERFORM public.require_service_role();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  SELECT
    p.account_type = 'ADMIN'
    AND p.account_status = 'ACTIVE'
    AND (
      SELECT count(*)
      FROM public.profiles admins
      WHERE admins.account_type = 'ADMIN'
        AND admins.account_status = 'ACTIVE'
    ) <= 1
  INTO v_is_last_admin
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF coalesce(v_is_last_admin, false) THEN
    RAISE EXCEPTION 'cannot delete the last active admin';
  END IF;

  SELECT cp.id
  INTO v_contractor_id
  FROM public.contractor_profiles cp
  WHERE cp.profile_id = p_user_id;

  UPDATE public.contractor_profiles
  SET approved_by = NULL
  WHERE approved_by = p_user_id;

  UPDATE public.contractor_profiles
  SET rejected_by = NULL
  WHERE rejected_by = p_user_id;

  UPDATE public.contractor_profiles
  SET info_requested_by = NULL
  WHERE info_requested_by = p_user_id;

  UPDATE public.verifier_profiles
  SET approved_by = NULL
  WHERE approved_by = p_user_id;

  UPDATE public.contractor_credentials
  SET reviewer_id = NULL
  WHERE reviewer_id = p_user_id;

  UPDATE public.projects
  SET connections_closed_by = NULL
  WHERE connections_closed_by = p_user_id;

  UPDATE public.project_status_history
  SET changed_by = NULL
  WHERE changed_by = p_user_id;

  UPDATE public.project_notices
  SET created_by = NULL
  WHERE created_by = p_user_id;

  UPDATE public.booking_events
  SET actor_id = NULL
  WHERE actor_id = p_user_id;

  UPDATE public.connection_events
  SET actor_id = NULL
  WHERE actor_id = p_user_id;

  UPDATE public.connection_contact_access
  SET granted_by = NULL
  WHERE granted_by = p_user_id;

  UPDATE public.booking_contact_access
  SET granted_by = NULL
  WHERE granted_by = p_user_id;

  UPDATE public.change_orders
  SET customer_approved_by = NULL
  WHERE customer_approved_by = p_user_id;

  UPDATE public.change_orders
  SET contractor_acked_by = NULL
  WHERE contractor_acked_by = p_user_id;

  UPDATE public.projects
  SET selected_booking_id = NULL
  WHERE selected_booking_id IN (
    SELECT b.id
    FROM public.bookings b
    WHERE b.customer_id = p_user_id
       OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
  );

  IF v_contractor_id IS NOT NULL THEN
    UPDATE public.projects
    SET selected_contractor_profile_id = NULL
    WHERE selected_contractor_profile_id = v_contractor_id;
  END IF;

  DELETE FROM public.project_message_threads
  WHERE project_id IN (SELECT id FROM public.projects WHERE customer_id = p_user_id)
     OR (v_contractor_id IS NOT NULL AND contractor_profile_id = v_contractor_id);

  DELETE FROM public.change_orders
  WHERE created_by = p_user_id;

  DELETE FROM public.bookings
  WHERE customer_id = p_user_id
     OR (v_contractor_id IS NOT NULL AND contractor_profile_id = v_contractor_id);

  DELETE FROM public.project_connections
  WHERE customer_id = p_user_id
     OR (v_contractor_id IS NOT NULL AND contractor_profile_id = v_contractor_id);

  IF v_contractor_id IS NOT NULL THEN
    DELETE FROM public.estimate_questions
    WHERE asked_by_contractor_profile_id = v_contractor_id;

    DELETE FROM public.estimates
    WHERE contractor_profile_id = v_contractor_id;
  END IF;

  DELETE FROM public.content_reports
  WHERE reporter_id = p_user_id;

  PERFORM public.write_audit_log(
    p_user_id,
    'account.deleted',
    'profile',
    p_user_id,
    jsonb_build_object('self_service', true)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'contractor_profile_id', v_contractor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_account_owned_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_account_owned_rows(uuid) TO service_role;
