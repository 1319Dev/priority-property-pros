-- Per-participant read markers for project message threads.
-- Each profile reads and writes only their own row.
-- Does not change connection entitlement, fees, Stripe, or payment flags.
-- Messaging still requires the contractor's $4.99 Connect (or an admin override).

CREATE TABLE public.project_message_reads (
  thread_id uuid NOT NULL REFERENCES public.project_message_threads (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, profile_id)
);

CREATE INDEX project_message_reads_profile_idx
  ON public.project_message_reads (profile_id, last_read_at DESC);

COMMENT ON TABLE public.project_message_reads IS
  'One last_read_at per thread participant. A user can only read and write their own row.';

ALTER TABLE public.project_message_reads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.message_thread_participant(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_message_threads t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = p_thread_id
      AND public.message_pair_has_connection_entitlement(t.project_id, t.contractor_profile_id)
      AND (
        p.customer_id = (SELECT auth.uid())
        OR t.contractor_profile_id = (SELECT public.current_contractor_profile_id())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.message_thread_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_thread_participant(uuid) TO authenticated;

CREATE POLICY project_message_reads_select_own
  ON public.project_message_reads
  FOR SELECT
  TO authenticated
  USING (profile_id = (SELECT auth.uid()));

CREATE POLICY project_message_reads_insert_own
  ON public.project_message_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND public.message_thread_participant(thread_id)
  );

CREATE POLICY project_message_reads_update_own
  ON public.project_message_reads
  FOR UPDATE
  TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND public.message_thread_participant(thread_id)
  );

REVOKE ALL ON TABLE public.project_message_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.project_message_reads TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_message_thread_read(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at timestamptz := now();
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF NOT public.message_thread_participant(p_thread_id) THEN
    RAISE EXCEPTION 'not a thread participant';
  END IF;

  INSERT INTO public.project_message_reads (thread_id, profile_id, last_read_at)
  VALUES (p_thread_id, (SELECT auth.uid()), v_at)
  ON CONFLICT (thread_id, profile_id)
  DO UPDATE SET last_read_at = EXCLUDED.last_read_at
  RETURNING last_read_at INTO v_at;

  UPDATE public.notifications
  SET read_at = coalesce(read_at, v_at)
  WHERE recipient_profile_id = (SELECT auth.uid())
    AND kind = 'message.received'
    AND read_at IS NULL
    AND (
      entity_id = p_thread_id
      OR (payload ->> 'thread_id') = p_thread_id::text
    );

  RETURN jsonb_build_object('thread_id', p_thread_id, 'last_read_at', v_at);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_message_thread_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_message_thread_read(uuid) TO authenticated;

COMMENT ON FUNCTION public.mark_message_thread_read(uuid) IS
  'Sets the caller last_read_at and marks their message.received notices for that thread read. Does not read another participant row.';

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
      CASE
        WHEN p.customer_id = (SELECT auth.uid()) THEN
          CASE
            WHEN cp.business_name IS NULL
              OR btrim(cp.business_name) = ''
              OR public.text_contains_contact_info(cp.business_name)
              OR public.text_contains_pre_hire_contact(cp.business_name)
              THEN public.anonymized_pro_label(cp.primary_trade, NULL)
            ELSE btrim(cp.business_name)
          END
        ELSE
          CASE
            WHEN cust.first_name IS NULL
              OR btrim(cust.first_name) = ''
              OR public.text_contains_contact_info(cust.first_name)
              OR public.text_contains_pre_hire_contact(cust.first_name)
              THEN 'Customer'
            ELSE btrim(cust.first_name)
          END
      END AS other_party_label,
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
      ) AS last_preview,
      coalesce((
        SELECT m.sender_profile_id = (SELECT auth.uid())
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ), false) AS last_sender_is_viewer,
      coalesce((
        SELECT count(*)::int
        FROM public.project_messages m
        WHERE m.thread_id = t.id
          AND m.sender_profile_id IS DISTINCT FROM (SELECT auth.uid())
          AND m.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz)
      ), 0) AS unread_count,
      rd.last_read_at,
      (
        SELECT b.id
        FROM public.bookings b
        WHERE b.project_id = pairs.project_id
          AND b.contractor_profile_id = pairs.contractor_profile_id
          AND b.status IS DISTINCT FROM 'CANCELLED'
        ORDER BY b.created_at DESC
        LIMIT 1
      ) AS booking_id,
      (
        SELECT o.id
        FROM public.opportunities o
        WHERE o.project_id = pairs.project_id
          AND o.contractor_profile_id = pairs.contractor_profile_id
        ORDER BY o.created_at DESC
        LIMIT 1
      ) AS opportunity_id
    FROM pairs
    JOIN public.projects p ON p.id = pairs.project_id
    JOIN public.profiles cust ON cust.id = p.customer_id
    JOIN public.contractor_profiles cp ON cp.id = pairs.contractor_profile_id
    LEFT JOIN public.project_message_threads t
      ON t.project_id = pairs.project_id
     AND t.contractor_profile_id = pairs.contractor_profile_id
    LEFT JOIN public.project_message_reads rd
      ON rd.thread_id = t.id
     AND rd.profile_id = (SELECT auth.uid())
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
        'other_party_label', rows.other_party_label,
        'last_message_at', rows.last_message_at,
        'last_preview', rows.last_preview,
        'last_sender_is_viewer', rows.last_sender_is_viewer,
        'unread_count', rows.unread_count,
        'last_read_at', rows.last_read_at,
        'booking_id', rows.booking_id,
        'opportunity_id', rows.opportunity_id
      )
      ORDER BY rows.last_message_at DESC NULLS LAST, rows.project_title
    ),
    '[]'::jsonb
  )
  FROM rows;
$$;

COMMENT ON FUNCTION public.list_my_message_threads() IS
  'Inbox rows after a $4.99 connection entitlement. Customers see the contractor business name. Contractors see the customer first name. No phone, email, or street.';

REVOKE ALL ON FUNCTION public.list_my_message_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_message_threads() TO authenticated;

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
  v_from text;
BEGIN
  SELECT * INTO v_thread FROM public.project_message_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.project_message_threads
  SET updated_at = now()
  WHERE id = v_thread.id;

  SELECT p.customer_id INTO v_owner
  FROM public.projects p
  WHERE p.id = v_thread.project_id;
  v_contractor_user := public.contractor_owner_profile_id(v_thread.contractor_profile_id);

  IF NEW.sender_profile_id = v_owner THEN
    v_recipient := v_contractor_user;
    SELECT coalesce(nullif(btrim(first_name), ''), 'a customer') INTO v_from
    FROM public.profiles
    WHERE id = v_owner;
  ELSIF NEW.sender_profile_id = v_contractor_user THEN
    v_recipient := v_owner;
    SELECT coalesce(nullif(btrim(business_name), ''), 'a pro') INTO v_from
    FROM public.contractor_profiles
    WHERE id = v_thread.contractor_profile_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_profile_id THEN
    RETURN NEW;
  END IF;

  IF v_from IS NULL
     OR public.text_contains_contact_info(v_from)
     OR public.text_contains_pre_hire_contact(v_from) THEN
    v_from := CASE WHEN NEW.sender_profile_id = v_owner THEN 'a customer' ELSE 'a pro' END;
  END IF;

  PERFORM public.ppp_set_rpc('notify_project_message');
  PERFORM public.enqueue_notification(
    v_recipient,
    'message.received',
    'New message',
    'New message from ' || v_from || '.',
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

REVOKE ALL ON FUNCTION public.notify_project_message() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notify_project_message() IS
  'In-app notice names the other party. Payload is thread ids only — never the message body, phone, email, or street.';
