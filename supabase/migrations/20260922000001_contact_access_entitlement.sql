-- Contact-access entitlement gate.
-- Additive. CONFIRMED (or any booking status) alone NEVER unlocks private contact.
-- Does not enable Stripe. Does not change payments_live, charges_live, or signup_fee_enabled.
-- Job-fee payment may later grant UNLOCKED; that path is stubbed and is never called while payments are off.

CREATE TYPE public.contact_access_status AS ENUM (
  'LOCKED',
  'UNLOCKED',
  'ADMIN_OVERRIDE'
);

CREATE TYPE public.contact_grant_source AS ENUM (
  'JOB_FEE_PAYMENT',
  'ADMIN_OVERRIDE',
  'SYSTEM'
);

CREATE TABLE public.booking_contact_access (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings (id) ON DELETE CASCADE,
  status public.contact_access_status NOT NULL DEFAULT 'LOCKED',
  granted_at timestamptz,
  granted_by uuid REFERENCES public.profiles (id),
  grant_reason text,
  grant_source public.contact_grant_source NOT NULL DEFAULT 'SYSTEM',
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_contact_access_active_not_revoked CHECK (
    (status IN ('UNLOCKED', 'ADMIN_OVERRIDE') AND revoked_at IS NULL)
    OR status = 'LOCKED'
  )
);

CREATE TRIGGER booking_contact_access_set_updated_at
  BEFORE UPDATE ON public.booking_contact_access
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX booking_contact_access_status_idx
  ON public.booking_contact_access (status)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.booking_contact_access IS
  'Server-authoritative private-contact entitlement per booking. Default LOCKED. CONFIRMED does not grant access. Stripe is not a key.';

COMMENT ON COLUMN public.booking_contact_access.status IS
  'LOCKED until job-fee entitlement (UNLOCKED) or a targeted admin override (ADMIN_OVERRIDE).';

-- Existing bookings, including CONFIRMED+, stay LOCKED.
INSERT INTO public.booking_contact_access (booking_id, status, grant_source)
SELECT b.id, 'LOCKED'::public.contact_access_status, 'SYSTEM'::public.contact_grant_source
FROM public.bookings b
ON CONFLICT (booking_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_booking_contact_access_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('ensure_booking_contact_access_row');
  END IF;
  INSERT INTO public.booking_contact_access (booking_id, status, grant_source)
  VALUES (NEW.id, 'LOCKED', 'SYSTEM')
  ON CONFLICT (booking_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_ensure_contact_access
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_booking_contact_access_row();

CREATE OR REPLACE FUNCTION public.protect_booking_contact_access_row()
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

  -- Default LOCKED rows are created by the bookings insert trigger (any RPC).
  -- Clients have no INSERT grant; this only allows SYSTEM/LOCKED defaults.
  IF TG_OP = 'INSERT'
     AND NEW.status = 'LOCKED'
     AND NEW.grant_source = 'SYSTEM'
     AND NEW.granted_by IS NULL
     AND NEW.revoked_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.ppp_rpc_is('admin_grant_booking_contact_access')
     OR public.ppp_rpc_is('admin_revoke_booking_contact_access')
     OR public.ppp_rpc_is('grant_booking_contact_access_from_job_fee') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'contact access cannot be written from the client';
END;
$$;

CREATE TRIGGER booking_contact_access_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.booking_contact_access
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_booking_contact_access_row();

-- True only for the booking's customer or hired contractor, and only when
-- entitlement is UNLOCKED or ADMIN_OVERRIDE. Admins read via is_admin().
CREATE OR REPLACE FUNCTION public.booking_has_contact_access(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_contact_access a
    JOIN public.bookings b ON b.id = a.booking_id
    WHERE a.booking_id = p_booking_id
      AND a.revoked_at IS NULL
      AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
      AND b.status IS DISTINCT FROM 'CANCELLED'
      AND (
        b.customer_id = auth.uid()
        OR b.contractor_profile_id = public.current_contractor_profile_id()
      )
  );
$$;

-- Hired contractor on this project with an active entitlement. Other
-- contractors on the same project never inherit access.
CREATE OR REPLACE FUNCTION public.contractor_has_contact_access_on_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.booking_contact_access a ON a.booking_id = b.id
    WHERE b.project_id = p_project_id
      AND b.contractor_profile_id = public.current_contractor_profile_id()
      AND b.status IS DISTINCT FROM 'CANCELLED'
      AND a.revoked_at IS NULL
      AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
  );
$$;

-- Legacy helper name used by RLS. Now entitlement-based, not CONFIRMED-based.
CREATE OR REPLACE FUNCTION public.booking_is_confirmed_for_contractor(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.contractor_has_contact_access_on_project(p_project_id);
$$;

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
BEGIN
  PERFORM public.expire_stale_pending_bookings();
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  SELECT * INTO access FROM public.booking_contact_access WHERE booking_id = b.id;
  entitled := public.booking_has_contact_access(b.id);

  IF NOT (
    public.is_admin()
    OR b.customer_id = auth.uid()
    OR entitled
  ) THEN
    RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override';
  END IF;

  IF b.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND b.customer_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override';
  END IF;

  SELECT * INTO loc FROM public.project_private_locations WHERE project_id = b.project_id;
  SELECT * INTO cust FROM public.profiles WHERE id = b.customer_id;

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'unlocked', true,
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
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_booking_contact_access(p_booking_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  v_reason text;
  access public.booking_contact_access;
BEGIN
  PERFORM public.ppp_set_rpc('admin_grant_booking_contact_access');

  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can grant booking contact access';
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'a reason is required to grant contact access';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  INSERT INTO public.booking_contact_access (
    booking_id, status, granted_at, granted_by, grant_reason, grant_source, revoked_at
  ) VALUES (
    b.id, 'ADMIN_OVERRIDE', now(), auth.uid(), v_reason, 'ADMIN_OVERRIDE', NULL
  )
  ON CONFLICT (booking_id) DO UPDATE
    SET
      status = 'ADMIN_OVERRIDE',
      granted_at = now(),
      granted_by = auth.uid(),
      grant_reason = v_reason,
      grant_source = 'ADMIN_OVERRIDE',
      revoked_at = NULL
  RETURNING * INTO access;

  PERFORM public.write_booking_event(
    b.id,
    'contact_access.granted',
    jsonb_build_object(
      'status', access.status,
      'grant_source', access.grant_source,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id
    )
  );

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking.contact_access.granted',
    'booking',
    b.id,
    jsonb_build_object(
      'status', access.status,
      'grant_source', access.grant_source,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id,
      'granted_at', access.granted_at,
      'granted_by', access.granted_by
    )
  );

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', access.status,
    'grant_source', access.grant_source,
    'grant_reason', access.grant_reason,
    'granted_at', access.granted_at,
    'granted_by', access.granted_by,
    'revoked_at', access.revoked_at,
    'customer_id', b.customer_id,
    'contractor_profile_id', b.contractor_profile_id,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_booking_contact_access(p_booking_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  v_reason text;
  access public.booking_contact_access;
BEGIN
  PERFORM public.ppp_set_rpc('admin_revoke_booking_contact_access');

  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can revoke booking contact access';
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  INSERT INTO public.booking_contact_access (booking_id, status, grant_source)
  VALUES (b.id, 'LOCKED', 'SYSTEM')
  ON CONFLICT (booking_id) DO UPDATE
    SET
      status = 'LOCKED',
      revoked_at = now()
  RETURNING * INTO access;

  PERFORM public.write_booking_event(
    b.id,
    'contact_access.revoked',
    jsonb_build_object(
      'status', access.status,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id
    )
  );

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking.contact_access.revoked',
    'booking',
    b.id,
    jsonb_build_object(
      'status', access.status,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id,
      'revoked_at', access.revoked_at,
      'revoked_by', auth.uid()
    )
  );

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', access.status,
    'grant_source', access.grant_source,
    'grant_reason', access.grant_reason,
    'granted_at', access.granted_at,
    'granted_by', access.granted_by,
    'revoked_at', access.revoked_at,
    'customer_id', b.customer_id,
    'contractor_profile_id', b.contractor_profile_id,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

-- STUB. Do not call while payments_live=0 / charges_live=0. Not wired to Stripe.
-- Future successful job-fee payment may grant UNLOCKED for this booking only.
CREATE OR REPLACE FUNCTION public.grant_booking_contact_access_from_job_fee(
  p_booking_id uuid,
  p_reason text DEFAULT 'job_fee_payment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ppp_set_rpc('grant_booking_contact_access_from_job_fee');

  IF NOT public.payments_live() OR NOT public.charges_live() THEN
    RAISE EXCEPTION 'job-fee contact unlock is disabled while payments are off';
  END IF;

  RAISE EXCEPTION 'job-fee contact unlock is not wired; do not call this function';
END;
$$;

DROP POLICY IF EXISTS project_private_locations_select_protected ON public.project_private_locations;
CREATE POLICY project_private_locations_select_protected
  ON public.project_private_locations FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_has_contact_access_on_project(project_id)
  );

ALTER TABLE public.booking_contact_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_contact_access_select_participants
  ON public.booking_contact_access FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (
          b.customer_id = auth.uid()
          OR b.contractor_profile_id = public.current_contractor_profile_id()
          OR public.is_admin()
        )
    )
  );

REVOKE ALL ON TABLE public.booking_contact_access FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.booking_contact_access TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_booking_contact_access_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_booking_contact_access_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_booking_contact_access_from_job_fee(uuid, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.booking_has_contact_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contractor_has_contact_access_on_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.booking_is_confirmed_for_contractor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.booking_job_contact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_grant_booking_contact_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_booking_contact_access(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.booking_has_contact_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contractor_has_contact_access_on_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_is_confirmed_for_contractor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_job_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_booking_contact_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_booking_contact_access(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.booking_has_contact_access(uuid) IS
  'True only when contact entitlement is UNLOCKED or ADMIN_OVERRIDE and the caller is the booking customer or hired contractor. CONFIRMED status is not enough.';
COMMENT ON FUNCTION public.contractor_has_contact_access_on_project(uuid) IS
  'Exact street / coordinates unlock for the hired contractor only after contact entitlement. Selection, estimates, and CONFIRMED alone are not enough. Other contractors never inherit access.';
COMMENT ON FUNCTION public.booking_is_confirmed_for_contractor(uuid) IS
  'Legacy name. Delegates to contractor_has_contact_access_on_project. CONFIRMED does not grant access.';
COMMENT ON FUNCTION public.booking_job_contact(uuid) IS
  'RPC-mediated phone/email/street after contact entitlement. Does not open profiles SELECT. CONFIRMED alone stays locked.';
COMMENT ON FUNCTION public.admin_grant_booking_contact_access(uuid, text) IS
  'ADMIN-only. Sets ADMIN_OVERRIDE on one booking (customer↔hired contractor pair), stamps admin/time/reason, writes audit_logs. No global contractor bypass.';
COMMENT ON FUNCTION public.admin_revoke_booking_contact_access(uuid, text) IS
  'ADMIN-only. Relocks one booking contact entitlement and writes audit_logs.';
COMMENT ON FUNCTION public.grant_booking_contact_access_from_job_fee(uuid, text) IS
  'Internal stub. NEVER called while payments_live/charges_live are off. Not granted to clients. Not wired to Stripe.';
COMMENT ON FUNCTION public.confirm_booking_for_testing(uuid) IS
  'ADMIN-only test path. Production UI must not present this as Pay now succeeded. Moves status to CONFIRMED. Does NOT grant contact access. payments_live and charges_live stay false.';
COMMENT ON POLICY project_private_locations_select_protected ON public.project_private_locations IS
  'Owners and admins may read. Hired contractors need contact entitlement, not mere CONFIRMED.';
