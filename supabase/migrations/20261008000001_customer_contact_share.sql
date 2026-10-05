-- Customer chooses to share name, phone, email, and project address with one
-- contractor after that pair has an active connection entitlement:
--   booking_contact_access UNLOCKED + CONNECTION_FEE_PAYMENT, or
--   ADMIN_OVERRIDE + ADMIN_OVERRIDE.
-- The $4.99 payment still only writes booking_contact_access. It does not
-- insert a share, change prices, checkout, webhooks, or payment flags.
-- Phone, email, and street are never copied into project_messages.
-- Owner applies this migration. Do not apply it to production from the PR.

-- ---------------------------------------------------------------------------
-- Consent row. No contact columns — fields are read live from profile + project.
-- ---------------------------------------------------------------------------

CREATE TABLE public.project_contact_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  shared_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_contact_shares_pair UNIQUE (project_id, contractor_profile_id)
);

CREATE INDEX project_contact_shares_contractor_idx
  ON public.project_contact_shares (contractor_profile_id);

CREATE INDEX project_contact_shares_customer_idx
  ON public.project_contact_shares (customer_id);

CREATE TRIGGER project_contact_shares_set_updated_at
  BEFORE UPDATE ON public.project_contact_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.project_contact_shares IS
  'Customer consent to show name, phone, email, and project address to one contractor. Requires an active $4.99 connection entitlement or admin override on booking_contact_access. Not a payment record. Not a chat message.';

-- ---------------------------------------------------------------------------
-- Helpers. Contact field builder is not granted to clients.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.customer_has_shared_project_contact(
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
    FROM public.project_contact_shares s
    WHERE s.project_id = p_project_id
      AND s.contractor_profile_id = p_contractor_profile_id
  );
$$;

COMMENT ON FUNCTION public.customer_has_shared_project_contact(uuid, uuid) IS
  'True when this customer has chosen to share contact with this contractor. Does not itself authorize a read.';

REVOKE ALL ON FUNCTION public.customer_has_shared_project_contact(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.shared_contact_fields(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'name', nullif(btrim(concat_ws(
      ' ',
      nullif(btrim(cust.first_name), ''),
      nullif(btrim(cust.last_name), '')
    )), ''),
    'phone', nullif(btrim(cust.phone), ''),
    'email', nullif(btrim(cust.email), ''),
    'street_line1', nullif(btrim(loc.street_line1), ''),
    'street_line2', nullif(btrim(loc.street_line2), ''),
    'city', nullif(btrim(proj.city), ''),
    'state', nullif(btrim(proj.state), ''),
    'zip_code', nullif(btrim(proj.zip_code), '')
  )
  FROM public.projects proj
  JOIN public.profiles cust ON cust.id = proj.customer_id
  LEFT JOIN public.project_private_locations loc ON loc.project_id = proj.id
  WHERE proj.id = p_project_id;
$$;

COMMENT ON FUNCTION public.shared_contact_fields(uuid) IS
  'Name, phone, email, and project address as stored. No coordinates. Not granted to clients.';

REVOKE ALL ON FUNCTION public.shared_contact_fields(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.contractor_may_read_shared_location(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_contact_shares s
    WHERE s.project_id = p_project_id
      AND s.contractor_profile_id = public.current_contractor_profile_id()
      AND public.customer_has_shared_project_contact(s.project_id, s.contractor_profile_id)
      AND public.message_pair_has_connection_entitlement(s.project_id, s.contractor_profile_id)
  );
$$;

COMMENT ON FUNCTION public.contractor_may_read_shared_location(uuid) IS
  'Contractor may read this project street only after the customer share and an active connection entitlement for that pair.';

REVOKE ALL ON FUNCTION public.contractor_may_read_shared_location(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_may_read_shared_location(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Client writes are rejected. Service-role purge (auth.uid() null) may delete.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_project_contact_share_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF public.ppp_rpc_is('share_project_contact') AND TG_OP = 'INSERT' THEN
    IF NEW.customer_id IS DISTINCT FROM auth.uid()
       OR NOT public.is_project_owner(NEW.project_id)
       OR NOT public.message_pair_has_connection_entitlement(NEW.project_id, NEW.contractor_profile_id) THEN
      RAISE EXCEPTION 'contact share cannot be written from the client';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'contact share cannot be written from the client';
END;
$$;

DROP TRIGGER IF EXISTS project_contact_shares_protect ON public.project_contact_shares;
CREATE TRIGGER project_contact_shares_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.project_contact_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_project_contact_share_row();

REVOKE ALL ON FUNCTION public.protect_project_contact_share_row() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read. Customers may preview their own fields once the pair is eligible.
-- Contractors receive fields only after the customer has shared.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_shared_project_contact(
  p_project_id uuid,
  p_contractor_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shared boolean;
  v_customer boolean;
  v_fields jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.message_pair_has_connection_entitlement(p_project_id, p_contractor_profile_id) THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'customer_shared', false,
      'project_id', p_project_id,
      'contractor_profile_id', p_contractor_profile_id
    );
  END IF;

  v_shared := public.customer_has_shared_project_contact(p_project_id, p_contractor_profile_id);
  v_customer := EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.customer_id = auth.uid()
  );

  IF v_customer OR v_shared THEN
    v_fields := coalesce(public.shared_contact_fields(p_project_id), '{}'::jsonb);
  ELSE
    v_fields := '{}'::jsonb;
  END IF;

  RETURN v_fields || jsonb_build_object(
    'eligible', true,
    'customer_shared', v_shared,
    'project_id', p_project_id,
    'contractor_profile_id', p_contractor_profile_id
  );
END;
$$;

COMMENT ON FUNCTION public.get_shared_project_contact(uuid, uuid) IS
  'Pair-scoped contact preview. Ineligible callers get no name, phone, email, or street. Contractors get those fields only after the customer share.';

REVOKE ALL ON FUNCTION public.get_shared_project_contact(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_project_contact(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Customer share. Does not insert a project message.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.share_project_contact(
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
  v_contractor_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF NOT public.is_project_owner(p_project_id) THEN
    RAISE EXCEPTION 'only the customer can share contact on this project';
  END IF;

  IF NOT public.message_pair_has_connection_entitlement(p_project_id, p_contractor_profile_id) THEN
    RAISE EXCEPTION 'contact share is locked until the $4.99 connection entitlement is unlocked for this contractor on this project';
  END IF;

  PERFORM public.ppp_set_rpc('share_project_contact');

  INSERT INTO public.project_contact_shares (project_id, contractor_profile_id, customer_id)
  VALUES (p_project_id, p_contractor_profile_id, auth.uid())
  ON CONFLICT (project_id, contractor_profile_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    PERFORM public.write_audit_log(
      auth.uid(),
      'contact.shared',
      'project_contact_share',
      v_id,
      jsonb_build_object(
        'project_id', p_project_id,
        'contractor_profile_id', p_contractor_profile_id
      )
    );

    v_contractor_user := public.contractor_owner_profile_id(p_contractor_profile_id);
    IF v_contractor_user IS NOT NULL AND v_contractor_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.enqueue_notification(
        v_contractor_user,
        'contact.shared',
        'Contact shared',
        'The customer shared project contact with you.',
        'project_contact_shares',
        v_id,
        jsonb_build_object(
          'project_id', p_project_id,
          'contractor_profile_id', p_contractor_profile_id
        )
      );
    END IF;
  END IF;

  RETURN public.get_shared_project_contact(p_project_id, p_contractor_profile_id);
END;
$$;

COMMENT ON FUNCTION public.share_project_contact(uuid, uuid) IS
  'Customer-only, idempotent share with one connected contractor. Does not write project_messages or payment rows. Notification payload is ids only.';

REVOKE ALL ON FUNCTION public.share_project_contact(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_project_contact(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS. Participants may see the consent fact. No client insert, update, or delete.
-- ---------------------------------------------------------------------------

ALTER TABLE public.project_contact_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_contact_shares_select
  ON public.project_contact_shares
  FOR SELECT
  TO authenticated
  USING (
    customer_id = (SELECT auth.uid())
    OR (
      contractor_profile_id = (SELECT public.current_contractor_profile_id())
      AND public.message_pair_has_connection_entitlement(project_id, contractor_profile_id)
    )
  );

REVOKE ALL ON TABLE public.project_contact_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_contact_shares TO authenticated;

-- Street stays hidden from a connected contractor until the customer shares.
DROP POLICY IF EXISTS project_private_locations_select_protected ON public.project_private_locations;
CREATE POLICY project_private_locations_select_protected
  ON public.project_private_locations FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_may_read_shared_location(project_id)
  );

COMMENT ON POLICY project_private_locations_select_protected ON public.project_private_locations IS
  'Owners and admins may read. A contractor may read the street only after the customer share and an active connection entitlement for that pair. CONFIRMED, Hired, and the connection fee alone do not reveal the street.';

-- ---------------------------------------------------------------------------
-- Existing contact RPCs. Customers and admins still read their record.
-- A hired contractor with entitlement but no customer share gets no private fields.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.booking_job_contact(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  loc public.project_private_locations;
  cust public.profiles;
  access public.booking_contact_access;
  entitled boolean;
  is_customer boolean;
  is_hired boolean;
  shared boolean;
BEGIN
  PERFORM public.expire_stale_pending_bookings();
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;

  IF NOT FOUND THEN
    IF public.is_admin() THEN
      RAISE EXCEPTION 'booking not found';
    END IF;
    RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override';
  END IF;

  SELECT * INTO access FROM public.booking_contact_access WHERE booking_id = b.id;
  -- Missing row is LOCKED / no contractor access. Never implicit unlock.
  entitled := public.booking_has_contact_access(b.id);
  is_customer := b.customer_id = auth.uid();
  is_hired := b.contractor_profile_id IS NOT DISTINCT FROM public.current_contractor_profile_id()
    AND public.current_contractor_profile_id() IS NOT NULL;

  IF NOT (
    public.is_admin()
    OR is_customer
    OR (is_hired AND entitled)
  ) THEN
    RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override';
  END IF;

  shared := public.customer_has_shared_project_contact(b.project_id, b.contractor_profile_id);

  -- Entitlement lets the customer choose to share. It does not reveal the street.
  IF is_hired AND entitled AND NOT is_customer AND NOT public.is_admin() AND NOT shared THEN
    RETURN jsonb_build_object(
      'booking_id', b.id,
      'unlocked', true,
      'customer_shared', false,
      'contact_access_status', coalesce(access.status, 'LOCKED'::public.contact_access_status),
      'charges_live', false,
      'payments_live', false
    );
  END IF;

  -- Owner/admin may read their own or support record. Hired contractor needs the customer share.
  -- ACCEPTED estimate status and CONFIRMED booking status are not consulted here.

  SELECT * INTO loc FROM public.project_private_locations WHERE project_id = b.project_id;
  SELECT * INTO cust FROM public.profiles WHERE id = b.customer_id;

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'unlocked', entitled OR is_customer OR public.is_admin(),
    'customer_shared', shared,
    'contact_access_status', coalesce(access.status, 'LOCKED'::public.contact_access_status),
    'street_line1', loc.street_line1,
    'street_line2', loc.street_line2,
    'lat', loc.lat,
    'lng', loc.lng,
    'city', (SELECT city FROM public.projects WHERE id = b.project_id),
    'state', (SELECT state FROM public.projects WHERE id = b.project_id),
    'zip_code', (SELECT zip_code FROM public.projects WHERE id = b.project_id),
    'phone', cust.phone,
    'email', cust.email,
    'first_name', cust.first_name,
    'last_name', cust.last_name,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.project_job_contact(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  loc public.project_private_locations;
  cust public.profiles;
  access public.booking_contact_access;
  entitled boolean;
  is_customer boolean;
  shared boolean;
  v_contractor uuid;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    IF public.is_admin() THEN
      RAISE EXCEPTION 'project not found';
    END IF;
    RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override';
  END IF;

  is_customer := proj.customer_id = auth.uid();
  v_contractor := public.current_contractor_profile_id();
  entitled := public.is_admin()
    OR is_customer
    OR public.contractor_has_contact_access_on_project(p_project_id);

  SELECT * INTO access
  FROM public.booking_contact_access a
  WHERE a.project_id = p_project_id
    AND a.revoked_at IS NULL
    AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
    AND (
      a.contractor_profile_id = v_contractor
      OR is_customer
      OR public.is_admin()
    )
  ORDER BY a.granted_at DESC NULLS LAST
  LIMIT 1;

  IF NOT entitled THEN
    RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override';
  END IF;

  shared := public.customer_has_shared_project_contact(proj.id, coalesce(access.contractor_profile_id, v_contractor));

  IF NOT is_customer AND NOT public.is_admin() AND NOT shared THEN
    RETURN jsonb_build_object(
      'project_id', proj.id,
      'booking_id', access.booking_id,
      'connection_id', access.connection_id,
      'unlocked', true,
      'customer_shared', false,
      'contact_access_status', coalesce(access.status, 'LOCKED'::public.contact_access_status),
      'charges_live', false,
      'payments_live', false
    );
  END IF;

  SELECT * INTO loc FROM public.project_private_locations WHERE project_id = proj.id;
  SELECT * INTO cust FROM public.profiles WHERE id = proj.customer_id;

  RETURN jsonb_build_object(
    'project_id', proj.id,
    'booking_id', access.booking_id,
    'connection_id', access.connection_id,
    'unlocked', entitled,
    'customer_shared', shared,
    'contact_access_status', coalesce(access.status, 'LOCKED'::public.contact_access_status),
    'street_line1', loc.street_line1,
    'street_line2', loc.street_line2,
    'lat', loc.lat,
    'lng', loc.lng,
    'city', proj.city,
    'state', proj.state,
    'zip_code', proj.zip_code,
    'phone', cust.phone,
    'email', cust.email,
    'first_name', cust.first_name,
    'last_name', cust.last_name,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

COMMENT ON FUNCTION public.booking_job_contact(uuid) IS
  'Phone, email, and street for the customer, an admin, or the hired contractor after that customer has shared. Connection entitlement without a share returns customer_shared false and no private fields.';

COMMENT ON FUNCTION public.project_job_contact(uuid) IS
  'Same voluntary share gate as booking_job_contact for a connection without requiring the caller to pass a booking id.';

-- ---------------------------------------------------------------------------
-- Account purge removes consent rows for the person or their contractor profile.
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

  DELETE FROM public.project_contact_shares
  WHERE customer_id = p_user_id
     OR project_id IN (SELECT id FROM public.projects WHERE customer_id = p_user_id)
     OR (v_contractor_id IS NOT NULL AND contractor_profile_id = v_contractor_id);

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
