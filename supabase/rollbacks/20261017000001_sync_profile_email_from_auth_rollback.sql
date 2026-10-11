-- Undo 20261017000001_sync_profile_email_from_auth.sql.
-- Restores protect_profile_columns from 20261005000001_signup_activation_checkout.sql.

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
DROP FUNCTION IF EXISTS public.sync_profile_email_from_auth();

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'email cannot be changed from the client';
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    IF NEW.account_type = 'ADMIN' AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'ADMIN cannot be assigned from the client';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'account_type cannot be changed by the account owner';
    END IF;
  END IF;

  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'account_status cannot be changed by the account owner';
  END IF;

  IF (
    NEW.signup_fee_status IS DISTINCT FROM OLD.signup_fee_status
    OR NEW.signup_fee_paid_at IS DISTINCT FROM OLD.signup_fee_paid_at
    OR NEW.signup_fee_charge_id IS DISTINCT FROM OLD.signup_fee_charge_id
  ) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'signup fee fields cannot be changed from the client';
  END IF;

  RETURN NEW;
END;
$$;
