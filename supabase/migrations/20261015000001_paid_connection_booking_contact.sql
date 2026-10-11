-- Hired booking contact follows a paid $4.99 connection.
-- A contractor pays Connect once per project. Hiring used to insert a separate
-- LOCKED booking_contact_access row and booking_has_contact_access ignored the
-- earlier paid connection, so the job page stayed locked (PPP-1004).
--
-- Does not change the $4.99 or $9.99 amounts, Stripe, fee math, or matching.
-- Does not treat NOT_REQUIRED activation as contact access. Plymate still needs
-- a paid connection.
-- Does not run a backfill. Existing rows are recognized on read. A one-time
-- UPDATE belongs in the PR description only.
--
-- Replaces existing function public.connection_fee_was_paid (new).
-- Replaces existing function public.ensure_booking_contact_access_row; must be diffed against prod before apply.
-- Replaces existing function public.booking_has_contact_access; must be diffed against prod before apply.
-- Replaces existing function public.protect_booking_contact_access_row; must be diffed against prod before apply.
-- booking_contact_access_subject_xor still forbids booking_id and connection_id
-- on the same row, so the booking row stays connection_id NULL.

CREATE OR REPLACE FUNCTION public.connection_fee_was_paid(p_connection_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_connections c
    WHERE c.id = p_connection_id
      AND c.status = 'PAID'
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_connections c
    JOIN public.connection_checkout_sessions s ON s.connection_id = c.id
    WHERE c.id = p_connection_id
      AND c.status = 'COMPLETED'
      AND s.status = 'CONSUMED'
      AND s.payment_status = 'paid'
      AND s.needs_refund IS NOT TRUE
  );
$$;

COMMENT ON FUNCTION public.connection_fee_was_paid(uuid) IS
  'True only for a PAID connection, or a COMPLETED connection whose checkout session was CONSUMED and paid. INITIATED, RESERVED, PAYMENT_DISABLED, EXPIRED, FAILED, and CANCELLED are not paid. Does not read signup fee or activation status. Does not change price.';

REVOKE ALL ON FUNCTION public.connection_fee_was_paid(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_booking_contact_access_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('ppp.rpc', true), '');
  v_paid boolean := false;
BEGIN
  PERFORM public.ppp_set_rpc('ensure_booking_contact_access_row');

  SELECT EXISTS (
    SELECT 1
    FROM public.project_connections c
    JOIN public.booking_contact_access a ON a.connection_id = c.id
    WHERE c.project_id = NEW.project_id
      AND c.contractor_profile_id = NEW.contractor_profile_id
      AND a.booking_id IS NULL
      AND a.revoked_at IS NULL
      AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
      AND public.connection_fee_was_paid(c.id)
  ) INTO v_paid;

  IF v_paid THEN
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
      revoked_at
    ) VALUES (
      NEW.id,
      NULL,
      NEW.project_id,
      NEW.contractor_profile_id,
      'UNLOCKED',
      now(),
      NULL,
      'paid connection carried to hired booking',
      'CONNECTION_FEE_PAYMENT',
      NULL
    )
    ON CONFLICT (booking_id) DO NOTHING;
  ELSE
    INSERT INTO public.booking_contact_access (
      booking_id, connection_id, project_id, contractor_profile_id, status, grant_source
    ) VALUES (
      NEW.id, NULL, NEW.project_id, NEW.contractor_profile_id, 'LOCKED', 'SYSTEM'
    )
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;

  IF v_prev <> '' THEN
    PERFORM public.ppp_set_rpc(v_prev);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ensure_booking_contact_access_row() IS
  'Booking insert trigger. Copies an existing paid connection entitlement onto the booking row as UNLOCKED CONNECTION_FEE_PAYMENT. Otherwise inserts LOCKED SYSTEM. No new charge. Activation NOT_REQUIRED does not unlock.';

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
  )
  OR EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.project_connections c
      ON c.project_id = b.project_id
     AND c.contractor_profile_id = b.contractor_profile_id
    JOIN public.booking_contact_access a ON a.connection_id = c.id
    WHERE b.id = p_booking_id
      AND b.status IS DISTINCT FROM 'CANCELLED'
      AND a.booking_id IS NULL
      AND a.revoked_at IS NULL
      AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
      AND public.connection_fee_was_paid(c.id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_contact_access r
        WHERE r.booking_id = b.id
          AND r.revoked_at IS NOT NULL
      )
      AND (
        b.customer_id = auth.uid()
        OR b.contractor_profile_id = public.current_contractor_profile_id()
      )
  );
$$;

COMMENT ON FUNCTION public.booking_has_contact_access(uuid) IS
  'True for the caller when the booking row is unlocked, or when that same contractor and project already have a non-revoked connection entitlement and the connection fee was paid. An admin revoke on the booking row wins over that carry-over. Reserved, expired, and unpaid connections do not count. Booking status alone does not unlock.';

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
  IF TG_OP = 'INSERT'
     AND NEW.status = 'LOCKED'
     AND NEW.grant_source = 'SYSTEM'
     AND NEW.granted_by IS NULL
     AND NEW.revoked_at IS NULL
     AND NEW.booking_id IS NOT NULL
     AND NEW.connection_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Carry a paid connection onto the new booking row. No client unlock, no new charge.
  IF public.ppp_rpc_is('ensure_booking_contact_access_row')
     AND TG_OP = 'INSERT'
     AND NEW.status = 'UNLOCKED'
     AND NEW.grant_source = 'CONNECTION_FEE_PAYMENT'
     AND NEW.granted_by IS NULL
     AND NEW.revoked_at IS NULL
     AND NEW.booking_id IS NOT NULL
     AND NEW.connection_id IS NULL
     AND EXISTS (
       SELECT 1
       FROM public.project_connections c
       JOIN public.booking_contact_access a ON a.connection_id = c.id
       WHERE c.project_id = NEW.project_id
         AND c.contractor_profile_id = NEW.contractor_profile_id
         AND a.booking_id IS NULL
         AND a.revoked_at IS NULL
         AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
         AND public.connection_fee_was_paid(c.id)
     ) THEN
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

  IF public.ppp_rpc_is('grant_booking_contact_access_from_job_fee') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

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

REVOKE ALL ON FUNCTION public.ensure_booking_contact_access_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_booking_contact_access_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_has_contact_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_has_contact_access(uuid) TO authenticated;
