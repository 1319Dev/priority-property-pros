-- Rollback for 20261015000001_paid_connection_booking_contact.sql
-- Restores the pre-change booking contact helpers. Does not rewrite rows and
-- does not lock a booking that was already carried forward.
-- Replaces existing function public.ensure_booking_contact_access_row; must be diffed against prod before apply.
-- Replaces existing function public.booking_has_contact_access; must be diffed against prod before apply.
-- Replaces existing function public.protect_booking_contact_access_row; must be diffed against prod before apply.

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

DROP FUNCTION IF EXISTS public.connection_fee_was_paid(uuid);

REVOKE ALL ON FUNCTION public.ensure_booking_contact_access_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_booking_contact_access_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_has_contact_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_has_contact_access(uuid) TO authenticated;
