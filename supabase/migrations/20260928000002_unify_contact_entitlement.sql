-- Unify private-contact authorization onto #14 booking_contact_access.
-- Connection / payment records remain the purchase ledger (reservation, Stripe,
-- max-3, refunds, audit). They are NOT an authorization source.
-- booking_contact_access is the ONLY store that can unlock private contact.
-- Missing entitlement row = NO ACCESS.
-- Does not fake a booking. Connection-backed rows use nullable booking_id +
-- connection_id. Does not flip payments_live / charges_live / signup_fee_enabled.
-- Does not apply itself to production.

-- ---------------------------------------------------------------------------
-- 1. Extend #14 so a paid project connection can carry entitlement without a booking
-- ---------------------------------------------------------------------------

ALTER TABLE public.booking_contact_access
  ADD COLUMN IF NOT EXISTS id uuid;

UPDATE public.booking_contact_access
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.booking_contact_access
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.booking_contact_access
  DROP CONSTRAINT IF EXISTS booking_contact_access_pkey;

ALTER TABLE public.booking_contact_access
  ADD CONSTRAINT booking_contact_access_pkey PRIMARY KEY (id);

ALTER TABLE public.booking_contact_access
  DROP CONSTRAINT IF EXISTS booking_contact_access_booking_id_key;

ALTER TABLE public.booking_contact_access
  ADD CONSTRAINT booking_contact_access_booking_id_key UNIQUE (booking_id);

ALTER TABLE public.booking_contact_access
  ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE public.booking_contact_access
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.project_connections (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contractor_profile_id uuid REFERENCES public.contractor_profiles (id);

UPDATE public.booking_contact_access a
SET
  project_id = b.project_id,
  contractor_profile_id = b.contractor_profile_id
FROM public.bookings b
WHERE a.booking_id = b.id
  AND (a.project_id IS NULL OR a.contractor_profile_id IS NULL);

ALTER TABLE public.booking_contact_access
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN contractor_profile_id SET NOT NULL;

ALTER TABLE public.booking_contact_access
  DROP CONSTRAINT IF EXISTS booking_contact_access_subject_xor;

ALTER TABLE public.booking_contact_access
  ADD CONSTRAINT booking_contact_access_subject_xor CHECK (
    (booking_id IS NOT NULL AND connection_id IS NULL)
    OR (booking_id IS NULL AND connection_id IS NOT NULL)
  );

ALTER TABLE public.booking_contact_access
  DROP CONSTRAINT IF EXISTS booking_contact_access_connection_id_key;

ALTER TABLE public.booking_contact_access
  ADD CONSTRAINT booking_contact_access_connection_id_key UNIQUE (connection_id);

CREATE INDEX IF NOT EXISTS booking_contact_access_project_contractor_idx
  ON public.booking_contact_access (project_id, contractor_profile_id)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.booking_contact_access IS
  'Server-authoritative private-contact entitlement. ONE table for booking-hire and paid $4.99 connections. Default missing/LOCKED. Project/estimate/booking/connection status, Stripe success URLs, and client input never grant access. Connection purchase rows are not consulted as an alternate authorization source.';

COMMENT ON COLUMN public.booking_contact_access.booking_id IS
  'Booking-backed entitlement. NULL for connection-fee rows. XOR with connection_id.';

COMMENT ON COLUMN public.booking_contact_access.connection_id IS
  'Connection-fee entitlement carrier. NULL for booking-hire rows. XOR with booking_id. Does not invent a booking.';

COMMENT ON COLUMN public.booking_contact_access.grant_source IS
  'JOB_FEE_PAYMENT stub (payments off). CONNECTION_FEE_PAYMENT after trusted Stripe TEST fulfill. ADMIN_OVERRIDE / SYSTEM otherwise.';

-- ---------------------------------------------------------------------------
-- 2. Protect #14 writes: admin + trusted grant RPCs only. Clients cannot insert UNLOCKED.
-- ---------------------------------------------------------------------------

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
  -- Clients have no INSERT grant; this only allows SYSTEM/LOCKED booking defaults.
  IF TG_OP = 'INSERT'
     AND NEW.status = 'LOCKED'
     AND NEW.grant_source = 'SYSTEM'
     AND NEW.granted_by IS NULL
     AND NEW.revoked_at IS NULL
     AND NEW.booking_id IS NOT NULL
     AND NEW.connection_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.ppp_rpc_is('admin_grant_booking_contact_access')
     OR public.ppp_rpc_is('admin_revoke_booking_contact_access') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'contact access cannot be written from the client';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF public.ppp_rpc_is('admin_grant_connection_contact_access')
     OR public.ppp_rpc_is('admin_revoke_connection_contact_access') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'contact access cannot be written from the client';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Future internal job-fee path only. Not granted to clients. Refuses while payments are off.
  IF public.ppp_rpc_is('grant_booking_contact_access_from_job_fee') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Trusted Connection Fee fulfill (service-role webhook / reconcile). Never a client grant path.
  IF public.ppp_rpc_is('grant_booking_contact_access_from_connection_fee')
     OR public.ppp_rpc_is('fulfill_connection_fee_checkout') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'contact access cannot be written from the client';
END;
$$;

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
  INSERT INTO public.booking_contact_access (
    booking_id, connection_id, project_id, contractor_profile_id, status, grant_source
  ) VALUES (
    NEW.id, NULL, NEW.project_id, NEW.contractor_profile_id, 'LOCKED', 'SYSTEM'
  )
  ON CONFLICT (booking_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Authorization helpers — booking_contact_access ONLY (no second table, no OR)
-- ---------------------------------------------------------------------------

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

-- Hired contractor on this project with an active #14 entitlement.
-- Connection purchase rows are never an alternate authorization source.
-- Missing entitlement = NO ACCESS. Other contractors never inherit access.
CREATE OR REPLACE FUNCTION public.contractor_has_contact_access_on_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_contact_access a
    WHERE a.project_id = p_project_id
      AND a.contractor_profile_id = public.current_contractor_profile_id()
      AND a.revoked_at IS NULL
      AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
      AND (
        a.booking_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.bookings b
          WHERE b.id = a.booking_id
            AND b.status IS DISTINCT FROM 'CANCELLED'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.connection_has_contact_access(p_connection_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_contact_access a
    WHERE a.connection_id = p_connection_id
      AND a.revoked_at IS NULL
      AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
      AND (
        public.is_admin()
        OR a.contractor_profile_id = public.current_contractor_profile_id()
        OR EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = a.project_id AND p.customer_id = auth.uid()
        )
      )
  );
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
  is_customer boolean;
  is_hired boolean;
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

  -- Owner/admin may read their own or support record. Hired contractor needs entitlement.
  -- ACCEPTED estimate status and CONFIRMED booking status are not consulted here.

  SELECT * INTO loc FROM public.project_private_locations WHERE project_id = b.project_id;
  SELECT * INTO cust FROM public.profiles WHERE id = b.customer_id;

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'unlocked', entitled,
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

-- Phone/email/street for a connection-paid contractor without inventing a booking.
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
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    IF public.is_admin() THEN
      RAISE EXCEPTION 'project not found';
    END IF;
    RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override';
  END IF;

  is_customer := proj.customer_id = auth.uid();
  entitled := public.is_admin()
    OR is_customer
    OR public.contractor_has_contact_access_on_project(p_project_id);

  SELECT * INTO access
  FROM public.booking_contact_access a
  WHERE a.project_id = p_project_id
    AND a.revoked_at IS NULL
    AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
    AND (
      a.contractor_profile_id = public.current_contractor_profile_id()
      OR is_customer
      OR public.is_admin()
    )
  ORDER BY a.granted_at DESC NULLS LAST
  LIMIT 1;

  IF NOT entitled THEN
    RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override';
  END IF;

  SELECT * INTO loc FROM public.project_private_locations WHERE project_id = proj.id;
  SELECT * INTO cust FROM public.profiles WHERE id = proj.customer_id;

  RETURN jsonb_build_object(
    'project_id', proj.id,
    'booking_id', access.booking_id,
    'connection_id', access.connection_id,
    'unlocked', entitled,
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
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Admin grant/revoke stay on #14 (booking path + connection-backed path)
-- ---------------------------------------------------------------------------

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
    booking_id, connection_id, project_id, contractor_profile_id,
    status, granted_at, granted_by, grant_reason, grant_source, revoked_at
  ) VALUES (
    b.id, NULL, b.project_id, b.contractor_profile_id,
    'ADMIN_OVERRIDE', now(), auth.uid(), v_reason, 'ADMIN_OVERRIDE', NULL
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
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'a reason is required to revoke contact access';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  INSERT INTO public.booking_contact_access (
    booking_id, connection_id, project_id, contractor_profile_id, status, grant_source
  ) VALUES (
    b.id, NULL, b.project_id, b.contractor_profile_id, 'LOCKED', 'SYSTEM'
  )
  ON CONFLICT (booking_id) DO UPDATE
    SET
      status = 'LOCKED',
      revoked_at = now()
  RETURNING * INTO access;

  PERFORM public.write_booking_event(
    b.id,
    'contact_access.revoked',
    public.strip_private_contact_keys(jsonb_build_object(
      'status', access.status,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id
    ))
  );

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking.contact_access.revoked',
    'booking',
    b.id,
    public.strip_private_contact_keys(jsonb_build_object(
      'status', access.status,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id,
      'revoked_at', access.revoked_at,
      'revoked_by', auth.uid()
    ))
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

CREATE OR REPLACE FUNCTION public.admin_grant_connection_contact_access(
  p_connection_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn public.project_connections;
  v_reason text := btrim(coalesce(p_reason, ''));
  access public.booking_contact_access;
BEGIN
  PERFORM public.ppp_set_rpc('admin_grant_connection_contact_access');
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can grant connection contact access';
  END IF;
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'a reason is required to grant contact access';
  END IF;
  SELECT * INTO conn FROM public.project_connections WHERE id = p_connection_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection not found';
  END IF;

  INSERT INTO public.booking_contact_access (
    booking_id, connection_id, project_id, contractor_profile_id,
    status, granted_at, granted_by, grant_reason, grant_source, revoked_at
  ) VALUES (
    NULL, conn.id, conn.project_id, conn.contractor_profile_id,
    'ADMIN_OVERRIDE', now(), auth.uid(), v_reason, 'ADMIN_OVERRIDE', NULL
  )
  ON CONFLICT (connection_id) DO UPDATE
    SET
      status = 'ADMIN_OVERRIDE',
      granted_at = now(),
      granted_by = auth.uid(),
      grant_reason = v_reason,
      grant_source = 'ADMIN_OVERRIDE',
      revoked_at = NULL
  RETURNING * INTO access;

  PERFORM public.write_connection_event(
    p_connection_id,
    'connection.contact_access.granted',
    jsonb_build_object('reason', v_reason, 'customer_id', conn.customer_id, 'contractor_profile_id', conn.contractor_profile_id)
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'connection.contact_access.granted',
    'booking_contact_access',
    access.id,
    jsonb_build_object(
      'reason', v_reason,
      'connection_id', p_connection_id,
      'customer_id', conn.customer_id,
      'contractor_profile_id', conn.contractor_profile_id
    )
  );

  RETURN jsonb_build_object(
    'connection_id', p_connection_id,
    'entitlement_id', access.id,
    'status', access.status,
    'grant_source', access.grant_source
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_connection_contact_access(
  p_connection_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  access public.booking_contact_access;
BEGIN
  PERFORM public.ppp_set_rpc('admin_revoke_connection_contact_access');
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can revoke connection contact access';
  END IF;

  UPDATE public.booking_contact_access
  SET
    status = 'LOCKED',
    revoked_at = now(),
    grant_reason = coalesce(nullif(btrim(p_reason), ''), grant_reason),
    updated_at = now()
  WHERE connection_id = p_connection_id
  RETURNING * INTO access;

  PERFORM public.write_connection_event(
    p_connection_id,
    'connection.contact_access.revoked',
    jsonb_build_object('reason', p_reason)
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'connection.contact_access.revoked',
    'booking_contact_access',
    coalesce(access.id, p_connection_id),
    jsonb_build_object('reason', p_reason, 'connection_id', p_connection_id)
  );
  RETURN jsonb_build_object(
    'connection_id', p_connection_id,
    'status', 'LOCKED',
    'missing_row', access.id IS NULL
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Trusted #14 grant after Stripe verification (service-role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_booking_contact_access_from_connection_fee(
  p_connection_id uuid,
  p_reason text DEFAULT 'connection_fee_payment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn public.project_connections;
  access public.booking_contact_access;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'connection_fee_payment');
BEGIN
  PERFORM public.require_service_role();
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('grant_booking_contact_access_from_connection_fee');
  END IF;

  SELECT * INTO conn FROM public.project_connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection not found';
  END IF;

  INSERT INTO public.booking_contact_access (
    booking_id, connection_id, project_id, contractor_profile_id,
    status, granted_at, granted_by, grant_reason, grant_source, revoked_at
  ) VALUES (
    NULL,
    conn.id,
    conn.project_id,
    conn.contractor_profile_id,
    'UNLOCKED',
    now(),
    NULL,
    v_reason,
    'CONNECTION_FEE_PAYMENT',
    NULL
  )
  ON CONFLICT (connection_id) DO UPDATE
    SET
      status = CASE
        WHEN booking_contact_access.status = 'ADMIN_OVERRIDE'
             AND booking_contact_access.revoked_at IS NULL
          THEN 'ADMIN_OVERRIDE'::public.contact_access_status
        ELSE 'UNLOCKED'::public.contact_access_status
      END,
      grant_source = CASE
        WHEN booking_contact_access.status = 'ADMIN_OVERRIDE'
             AND booking_contact_access.revoked_at IS NULL
          THEN booking_contact_access.grant_source
        ELSE 'CONNECTION_FEE_PAYMENT'::public.contact_grant_source
      END,
      granted_at = coalesce(booking_contact_access.granted_at, now()),
      grant_reason = coalesce(booking_contact_access.grant_reason, v_reason),
      revoked_at = NULL
  RETURNING * INTO access;

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'entitlement_id', access.id,
    'status', access.status,
    'grant_source', access.grant_source,
    'contact_unlocked', access.status IN ('UNLOCKED', 'ADMIN_OVERRIDE') AND access.revoked_at IS NULL
  );
END;
$$;

-- Deprecated name. Must not write a second entitlement table. Delegates to #14.
CREATE OR REPLACE FUNCTION public.grant_connection_contact_access_from_fee(
  p_connection_id uuid,
  p_reason text DEFAULT 'connection_fee_payment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.grant_booking_contact_access_from_connection_fee(p_connection_id, p_reason);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Purchase lifecycle: do not insert LOCKED #14 rows; fulfill grants #14 then PAID
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_project_connection(
  p_project_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  contractor_id uuid;
  existing public.project_connections;
  occupied integer;
  slot integer;
  conn public.project_connections;
  key text;
BEGIN
  PERFORM public.ppp_set_rpc('request_project_connection');

  IF public.connection_fee_checkout_enabled() THEN
    RAISE EXCEPTION 'connection fee checkout is required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  contractor_id := public.current_contractor_profile_id();
  IF contractor_id IS NULL THEN
    RAISE EXCEPTION 'only a contractor can request a connection';
  END IF;

  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id = auth.uid() THEN
    RAISE EXCEPTION 'customers do not pay a Connection Fee';
  END IF;
  IF proj.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'project is cancelled';
  END IF;
  IF proj.accepting_connections IS NOT TRUE THEN
    RAISE EXCEPTION 'customer stopped new connections';
  END IF;

  key := nullif(btrim(coalesce(p_idempotency_key, '')), '');

  IF key IS NOT NULL THEN
    SELECT * INTO existing
    FROM public.project_connections
    WHERE idempotency_key = key;
    IF FOUND THEN
      IF existing.contractor_profile_id IS DISTINCT FROM contractor_id
         OR existing.project_id IS DISTINCT FROM p_project_id THEN
        RAISE EXCEPTION 'idempotency key already used';
      END IF;
      RETURN jsonb_build_object(
        'connection_id', existing.id,
        'status', existing.status,
        'fee_cents', existing.fee_cents,
        'contact_unlocked', false,
        'paid', false,
        'idempotent', true,
        'payments_live', false,
        'charges_live', false,
        'message', 'Connection requested. Online payment setup is coming soon. Clicking Connect does not unlock contact.'
      );
    END IF;
  END IF;

  SELECT * INTO existing
  FROM public.project_connections
  WHERE project_id = p_project_id
    AND contractor_profile_id = contractor_id
    AND status IN ('INITIATED', 'RESERVED', 'PAYMENT_DISABLED', 'PAID', 'COMPLETED');
  IF FOUND THEN
    RAISE EXCEPTION 'duplicate connection';
  END IF;

  occupied := public.project_connection_occupancy(p_project_id);
  IF occupied >= 3 THEN
    RAISE EXCEPTION 'connections full';
  END IF;

  SELECT s INTO slot
  FROM generate_series(1, 3) AS s
  WHERE s NOT IN (
    SELECT slot_number FROM public.connection_slots WHERE project_id = p_project_id
  )
  ORDER BY s
  LIMIT 1;

  IF slot IS NULL THEN
    RAISE EXCEPTION 'connections full';
  END IF;

  BEGIN
    INSERT INTO public.project_connections (
      project_id,
      contractor_profile_id,
      customer_id,
      status,
      fee_cents,
      idempotency_key,
      reservation_slot,
      payments_live,
      charges_live,
      reserved_at
    ) VALUES (
      p_project_id,
      contractor_id,
      proj.customer_id,
      'PAYMENT_DISABLED',
      499,
      key,
      slot,
      false,
      false,
      now()
    )
    RETURNING * INTO conn;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate connection';
  END;

  BEGIN
    INSERT INTO public.connection_slots (
      project_id, slot_number, connection_id, contractor_profile_id
    ) VALUES (
      p_project_id, slot, conn.id, contractor_id
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'connections full';
  END;

  -- Purchase row only. Do NOT insert a #14 entitlement (missing = no access).
  PERFORM public.write_connection_event(
    conn.id,
    'connection.requested',
    jsonb_build_object(
      'project_id', p_project_id,
      'slot', slot,
      'fee_cents', 499,
      'status', 'PAYMENT_DISABLED',
      'contact_unlocked', false
    )
  );

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'status', conn.status,
    'fee_cents', 499,
    'reservation_slot', slot,
    'contact_unlocked', false,
    'paid', false,
    'idempotent', false,
    'payments_live', false,
    'charges_live', false,
    'message', 'Connection requested. Online payment setup is coming soon. Clicking Connect does not unlock contact.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_connection_checkout(
  p_project_id uuid,
  p_auth_user_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  contractor_id uuid;
  existing public.project_connections;
  occupied integer;
  slot integer;
  conn public.project_connections;
  ttl interval;
  account public.account_status;
  approval public.approval_status;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('reserve_connection_checkout');
  PERFORM public.expire_stale_connection_reservations();

  IF NOT public.connection_fee_checkout_enabled() THEN
    RAISE EXCEPTION 'connection fee checkout is disabled';
  END IF;
  IF coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'stripe_test_mode'), 1) <> 1 THEN
    RAISE EXCEPTION 'stripe_test_mode must stay 1';
  END IF;
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT p.account_status INTO account FROM public.profiles p WHERE p.id = p_auth_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;
  IF account IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;

  SELECT cp.id, cp.approval_status
    INTO contractor_id, approval
  FROM public.contractor_profiles cp
  WHERE cp.profile_id = p_auth_user_id
  LIMIT 1;
  IF contractor_id IS NULL THEN
    RAISE EXCEPTION 'only a contractor can request a connection';
  END IF;
  IF approval IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;

  ttl := make_interval(secs => public.connection_reservation_ttl_seconds());

  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id = p_auth_user_id THEN
    RAISE EXCEPTION 'customers do not pay a Connection Fee';
  END IF;
  IF proj.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'project is cancelled';
  END IF;
  IF proj.accepting_connections IS NOT TRUE THEN
    RAISE EXCEPTION 'customer stopped new connections';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.project_id = p_project_id
      AND o.contractor_profile_id = contractor_id
      AND o.status = 'ACCEPTED'
  ) THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;

  SELECT * INTO existing
  FROM public.project_connections
  WHERE project_id = p_project_id
    AND contractor_profile_id = contractor_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF existing.status IN ('PAID', 'COMPLETED', 'PAYMENT_DISABLED') THEN
      RAISE EXCEPTION 'duplicate connection';
    END IF;
    IF existing.status = 'RESERVED'
       AND (existing.reserved_until IS NULL OR existing.reserved_until > now()) THEN
      RETURN jsonb_build_object(
        'connection_id', existing.id,
        'status', existing.status,
        'fee_cents', 499,
        'reservation_slot', existing.reservation_slot,
        'reserved_until', existing.reserved_until,
        'contact_unlocked', false,
        'paid', false,
        'idempotent', true,
        'payments_live', false,
        'charges_live', false
      );
    END IF;
  END IF;

  occupied := public.project_connection_occupancy(p_project_id);
  IF occupied >= 3 THEN
    RAISE EXCEPTION 'connections full';
  END IF;

  SELECT s INTO slot
  FROM generate_series(1, 3) AS s
  WHERE s NOT IN (
    SELECT slot_number FROM public.connection_slots WHERE project_id = p_project_id
  )
  ORDER BY s
  LIMIT 1;
  IF slot IS NULL THEN
    RAISE EXCEPTION 'connections full';
  END IF;

  IF existing.id IS NOT NULL AND existing.status IN ('EXPIRED', 'FAILED', 'CANCELLED') THEN
    UPDATE public.project_connections
    SET
      status = 'RESERVED',
      fee_cents = 499,
      reservation_slot = slot,
      reserved_at = now(),
      reserved_until = now() + ttl,
      needs_refund = false,
      refund_reason = NULL,
      stripe_checkout_session_id = NULL,
      updated_at = now()
    WHERE id = existing.id
    RETURNING * INTO conn;
  ELSE
    BEGIN
      INSERT INTO public.project_connections (
        project_id,
        contractor_profile_id,
        customer_id,
        status,
        fee_cents,
        idempotency_key,
        reservation_slot,
        payments_live,
        charges_live,
        reserved_at,
        reserved_until
      ) VALUES (
        p_project_id,
        contractor_id,
        proj.customer_id,
        'RESERVED',
        499,
        nullif(btrim(coalesce(p_idempotency_key, '')), ''),
        slot,
        false,
        false,
        now(),
        now() + ttl
      )
      RETURNING * INTO conn;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'duplicate connection';
    END;
  END IF;

  BEGIN
    INSERT INTO public.connection_slots (
      project_id, slot_number, connection_id, contractor_profile_id
    ) VALUES (
      p_project_id, slot, conn.id, contractor_id
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'connections full';
  END;

  -- AVAILABLE → RESERVED only. No #14 row until trusted fulfill. Missing = no access.
  PERFORM public.write_connection_event(
    conn.id,
    'connection.reserved',
    jsonb_build_object(
      'project_id', p_project_id,
      'slot', slot,
      'fee_cents', 499,
      'status', 'RESERVED',
      'contact_unlocked', false
    )
  );

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'status', conn.status,
    'fee_cents', 499,
    'reservation_slot', slot,
    'reserved_until', conn.reserved_until,
    'contact_unlocked', false,
    'paid', false,
    'idempotent', false,
    'payments_live', false,
    'charges_live', false,
    'price_id', public.stripe_connection_price_id()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_connection_fee_checkout(
  p_stripe_checkout_session_id text,
  p_processor_event_id text,
  p_amount_cents integer,
  p_currency text,
  p_price_id text,
  p_payment_status text,
  p_livemode boolean,
  p_connection_id uuid,
  p_project_id uuid,
  p_contractor_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn public.project_connections;
  access public.booking_contact_access;
  sess public.connection_checkout_sessions;
  event_row jsonb;
  grant_row jsonb;
  unlocked boolean;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('fulfill_connection_fee_checkout');

  IF NOT public.connection_fee_checkout_enabled() THEN
    RAISE EXCEPTION 'connection fee checkout is disabled';
  END IF;
  IF coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'stripe_test_mode'), 1) <> 1 THEN
    RAISE EXCEPTION 'stripe_test_mode must stay 1';
  END IF;
  IF p_livemode IS TRUE THEN
    RAISE EXCEPTION 'live Stripe sessions are forbidden';
  END IF;
  IF left(p_stripe_checkout_session_id, 8) IS DISTINCT FROM 'cs_test_' THEN
    RAISE EXCEPTION 'only Stripe TEST checkout sessions are allowed';
  END IF;
  IF p_amount_cents IS DISTINCT FROM 499 THEN
    RAISE EXCEPTION 'connection fee is server-authoritative and must be 499 cents';
  END IF;
  IF lower(coalesce(p_currency, '')) IS DISTINCT FROM 'usd' THEN
    RAISE EXCEPTION 'connection fee currency must be usd';
  END IF;
  IF p_price_id IS DISTINCT FROM public.stripe_connection_price_id() THEN
    RAISE EXCEPTION 'wrong connection Price ID';
  END IF;
  IF p_payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'unpaid';
  END IF;

  event_row := public.record_connection_checkout_event(
    p_processor_event_id,
    'fulfill',
    p_stripe_checkout_session_id,
    jsonb_build_object('connection_id', p_connection_id, 'amount_cents', 499)
  );

  SELECT * INTO conn FROM public.project_connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection not found';
  END IF;
  IF conn.project_id IS DISTINCT FROM p_project_id
     OR conn.contractor_profile_id IS DISTINCT FROM p_contractor_profile_id THEN
    RAISE EXCEPTION 'mismatched metadata';
  END IF;

  SELECT * INTO access
  FROM public.booking_contact_access
  WHERE connection_id = conn.id
  FOR UPDATE;

  SELECT * INTO sess
  FROM public.connection_checkout_sessions
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
  FOR UPDATE;

  IF conn.status IN ('PAID', 'COMPLETED') THEN
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET status = 'CONSUMED', payment_status = 'paid', consumed_at = coalesce(consumed_at, now()), fulfilled_at = coalesce(fulfilled_at, now())
      WHERE id = sess.id;
    END IF;
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', coalesce(access.status IN ('UNLOCKED', 'ADMIN_OVERRIDE') AND access.revoked_at IS NULL, false),
      'paid', true,
      'idempotent', true,
      'duplicate_event', (event_row->>'duplicate')::boolean,
      'payments_live', false,
      'charges_live', false
    );
  END IF;

  IF conn.status IS DISTINCT FROM 'RESERVED'
     OR (conn.reserved_until IS NOT NULL AND conn.reserved_until < now())
     OR NOT EXISTS (SELECT 1 FROM public.connection_slots WHERE connection_id = conn.id) THEN
    UPDATE public.project_connections
    SET needs_refund = true, refund_reason = 'paid_but_reservation_not_active', updated_at = now()
    WHERE id = conn.id;
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET status = 'NEEDS_REFUND', needs_refund = true, refund_reason = 'paid_but_reservation_not_active', payment_status = 'paid'
      WHERE id = sess.id;
    END IF;
    PERFORM public.write_connection_event(
      conn.id,
      'connection.needs_refund',
      jsonb_build_object('reason', 'paid_but_reservation_not_active', 'checkout_session_id', p_stripe_checkout_session_id)
    );
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', false,
      'paid', false,
      'needs_refund', true,
      'reason', 'paid_but_reservation_not_active',
      'payments_live', false,
      'charges_live', false
    );
  END IF;

  -- Grant the #14 entitlement FIRST, then mark the purchase PAID.
  grant_row := public.grant_booking_contact_access_from_connection_fee(conn.id, 'connection_fee_payment');
  IF coalesce((grant_row->>'contact_unlocked')::boolean, false) IS NOT TRUE THEN
    UPDATE public.project_connections
    SET needs_refund = true, refund_reason = 'paid_but_entitlement_failed', updated_at = now()
    WHERE id = conn.id;
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET status = 'NEEDS_REFUND', needs_refund = true, refund_reason = 'paid_but_entitlement_failed', payment_status = 'paid'
      WHERE id = sess.id;
    END IF;
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', false,
      'paid', false,
      'needs_refund', true,
      'reason', 'paid_but_entitlement_failed',
      'payments_live', false,
      'charges_live', false
    );
  END IF;

  UPDATE public.project_connections
  SET
    status = 'PAID',
    paid_at = now(),
    completed_at = now(),
    needs_refund = false,
    stripe_checkout_session_id = p_stripe_checkout_session_id,
    updated_at = now()
  WHERE id = conn.id
  RETURNING * INTO conn;

  IF sess.id IS NOT NULL THEN
    UPDATE public.connection_checkout_sessions
    SET
      status = 'CONSUMED',
      payment_status = 'paid',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_processor_event_id),
      consumed_at = now(),
      fulfilled_at = now()
    WHERE id = sess.id;
  END IF;

  PERFORM public.write_connection_event(
    conn.id,
    'connection.paid',
    jsonb_build_object('fee_cents', 499, 'contact_unlocked', true, 'checkout_session_id', p_stripe_checkout_session_id)
  );

  SELECT status IN ('UNLOCKED', 'ADMIN_OVERRIDE') AND revoked_at IS NULL INTO unlocked
  FROM public.booking_contact_access
  WHERE connection_id = conn.id;

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'status', conn.status,
    'contact_unlocked', coalesce(unlocked, false),
    'paid', true,
    'idempotent', false,
    'duplicate_event', (event_row->>'duplicate')::boolean,
    'payments_live', false,
    'charges_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_new_project_connections(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  unlocked_kept integer;
BEGIN
  PERFORM public.ppp_set_rpc('stop_new_project_connections');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'only the project owner can stop new connections';
  END IF;

  UPDATE public.projects
  SET
    accepting_connections = false,
    connections_closed_at = coalesce(connections_closed_at, now()),
    connections_closed_by = coalesce(connections_closed_by, auth.uid())
  WHERE id = p_project_id
  RETURNING * INTO proj;

  SELECT count(*) INTO unlocked_kept
  FROM public.booking_contact_access a
  WHERE a.project_id = p_project_id
    AND a.connection_id IS NOT NULL
    AND a.revoked_at IS NULL
    AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE');

  PERFORM public.write_audit_log(
    auth.uid(),
    'project.connections.stopped',
    'projects',
    p_project_id,
    jsonb_build_object('unlocked_kept', unlocked_kept)
  );

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'accepting_connections', false,
    'existing_unlocked_kept', unlocked_kept,
    'deleted', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_project_connection_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('request_project_connection')
     OR public.ppp_rpc_is('stop_new_project_connections')
     OR public.ppp_rpc_is('admin_grant_connection_contact_access')
     OR public.ppp_rpc_is('admin_revoke_connection_contact_access')
     OR public.ppp_rpc_is('finalize_project_connection_payment')
     OR public.ppp_rpc_is('grant_booking_contact_access_from_connection_fee')
     OR public.ppp_rpc_is('grant_connection_contact_access_from_fee')
     OR public.ppp_rpc_is('reserve_connection_checkout')
     OR public.ppp_rpc_is('attach_connection_checkout_session')
     OR public.ppp_rpc_is('fulfill_connection_fee_checkout')
     OR public.ppp_rpc_is('expire_stale_connection_reservations')
     OR public.ppp_rpc_is('expire_connection_checkout_session')
     OR public.ppp_rpc_is('flag_connection_checkout_needs_refund') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'project connections cannot be written from the client';
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Copy any existing unlocked connection entitlements into #14, then drop the second table
-- ---------------------------------------------------------------------------

INSERT INTO public.booking_contact_access (
  booking_id,
  connection_id,
  project_id,
  contractor_profile_id,
  status,
  granted_at,
  granted_by,
  grant_reason,
  grant_source,
  revoked_at,
  created_at,
  updated_at
)
SELECT
  NULL,
  a.connection_id,
  c.project_id,
  c.contractor_profile_id,
  a.status,
  a.granted_at,
  a.granted_by,
  a.grant_reason,
  CASE a.grant_source::text
    WHEN 'CONNECTION_FEE_PAYMENT' THEN 'CONNECTION_FEE_PAYMENT'::public.contact_grant_source
    WHEN 'ADMIN_OVERRIDE' THEN 'ADMIN_OVERRIDE'::public.contact_grant_source
    ELSE 'SYSTEM'::public.contact_grant_source
  END,
  a.revoked_at,
  a.created_at,
  a.updated_at
FROM public.connection_contact_access a
JOIN public.project_connections c ON c.id = a.connection_id
WHERE a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
  AND a.revoked_at IS NULL
ON CONFLICT (connection_id) DO NOTHING;

DROP TRIGGER IF EXISTS connection_contact_access_protect_row ON public.connection_contact_access;
DROP TRIGGER IF EXISTS connection_contact_access_set_updated_at ON public.connection_contact_access;
DROP TABLE IF EXISTS public.connection_contact_access CASCADE;
DROP FUNCTION IF EXISTS public.protect_connection_contact_access_row();
DROP TYPE IF EXISTS public.connection_contact_grant_source;

-- ---------------------------------------------------------------------------
-- 8. RLS: do not weaken booking privacy; add connection-backed participants
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS booking_contact_access_select_participants ON public.booking_contact_access;
CREATE POLICY booking_contact_access_select_participants
  ON public.booking_contact_access FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      booking_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id
          AND (
            b.customer_id = auth.uid()
            OR b.contractor_profile_id = public.current_contractor_profile_id()
          )
      )
    )
    OR (
      connection_id IS NOT NULL
      AND contractor_profile_id = public.current_contractor_profile_id()
    )
    OR (
      connection_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.customer_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS project_private_locations_select_protected ON public.project_private_locations;
CREATE POLICY project_private_locations_select_protected
  ON public.project_private_locations FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_has_contact_access_on_project(project_id)
  );

REVOKE ALL ON TABLE public.booking_contact_access FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.booking_contact_access TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_booking_contact_access_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_booking_contact_access_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_booking_contact_access_from_job_fee(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_booking_contact_access_from_connection_fee(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_connection_contact_access_from_fee(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.booking_has_contact_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contractor_has_contact_access_on_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.connection_has_contact_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.booking_job_contact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_job_contact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_grant_booking_contact_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_booking_contact_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_grant_connection_contact_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_connection_contact_access(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.booking_has_contact_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contractor_has_contact_access_on_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.connection_has_contact_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_job_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_job_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_booking_contact_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_booking_contact_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_connection_contact_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_connection_contact_access(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.grant_booking_contact_access_from_connection_fee(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_connection_contact_access_from_fee(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.contractor_has_contact_access_on_project(uuid) IS
  'Exact street / coordinates unlock after a #14 booking_contact_access row is UNLOCKED or ADMIN_OVERRIDE for this contractor on this project. Connection purchase tables are not an authorization source. Selection, estimates, CONFIRMED, Connect click, and Stripe success URLs are not enough. Other contractors never inherit access. Missing row = no access.';
COMMENT ON FUNCTION public.grant_booking_contact_access_from_connection_fee(uuid, text) IS
  'Service-role only. Inserts UNLOCKED on booking_contact_access for a verified $4.99 Connection Fee. Called by fulfill after Stripe TEST verification. Not granted to clients. Does not mark the purchase PAID.';
COMMENT ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid) IS
  'Service-role only. After Stripe TEST verification of Price ID + 499 USD, grants #14 CONNECTION_FEE_PAYMENT then marks the connection PAID. Never trust success URLs. Inactive reservation after charge → needs_refund, no unlock. Does not use payments_live. Does not call job-payment functions.';
COMMENT ON FUNCTION public.project_job_contact(uuid) IS
  'RPC-mediated phone/email/street after #14 entitlement on the project (booking-hire or paid connection). Unauthorized callers get an error with no private fields. Does not open profiles SELECT.';
COMMENT ON FUNCTION public.grant_connection_contact_access_from_fee(uuid, text) IS
  'Deprecated alias. Delegates to grant_booking_contact_access_from_connection_fee. Does not write a second entitlement table. Not granted to clients.';
COMMENT ON POLICY project_private_locations_select_protected ON public.project_private_locations IS
  'Owners and admins may read. Contractors need a #14 booking_contact_access entitlement on the project, not mere CONFIRMED, ACCEPTED, PAID, or Connect click.';
