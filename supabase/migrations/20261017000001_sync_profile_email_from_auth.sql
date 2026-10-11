-- Sync profiles.email after Auth finishes an email change.
-- Not applied to production by the pull request that adds this file.
-- auth.users stores the new email only after verification. This trigger copies that
-- value onto profiles and does not open client writes to role or signup-fee columns.

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
    -- ppp.profile_email_sync is a transaction-local GUC set only by
    -- sync_profile_email_from_auth. PostgREST does not expose set_config.
    -- The new address must already be auth.users.email for this profile.
    IF current_setting('ppp.profile_email_sync', true) IS DISTINCT FROM 'on'
       OR nullif(btrim(NEW.email), '') IS NULL
       OR NEW.email IS DISTINCT FROM (
         SELECT u.email FROM auth.users u WHERE u.id = NEW.id
       ) THEN
      RAISE EXCEPTION 'email cannot be changed from the client';
    END IF;
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

CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('ppp.profile_email_sync', 'on', true);

  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id
    AND email IS DISTINCT FROM NEW.email;

  IF FOUND THEN
    PERFORM public.write_audit_log(
      NEW.id,
      'profile.email_synced',
      'profiles',
      NEW.id,
      jsonb_build_object('previous_email', OLD.email, 'email', NEW.email)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_email_from_auth() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_email_from_auth() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email_from_auth();

COMMENT ON FUNCTION public.sync_profile_email_from_auth() IS
  'Copies auth.users.email onto profiles.email after Auth commits an email change. Clients cannot call it. Does not change account_type, account_status, or signup fee fields.';
