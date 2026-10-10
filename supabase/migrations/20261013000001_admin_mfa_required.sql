-- Admin authenticator step-up. Flag defaults OFF (value_int 0).
-- Does not change payments, fees, contact unlock, matching, hiring, or older migrations.
-- Does not change auth settings.
--
-- When admin_mfa_required is 0, public.is_admin() is the previous check:
-- an ACTIVE profile with account_type ADMIN for auth.uid().
-- When it is on, that same profile also needs (auth.jwt()->>'aal') = 'aal2'.
--
-- auth.uid() null (service role, webhooks, no JWT) still fails the profile
-- lookup, so is_admin() stays false. Triggers that allow service role via
-- auth.uid() IS NULL are unchanged. Non-admin profiles still fail the lookup.

INSERT INTO public.platform_settings (key, value_int, description)
VALUES (
  'admin_mfa_required',
  0,
  '0 = an active admin JWT is admin at any authenticator level. 1 = public.is_admin() also requires (auth.jwt()->>''aal'') = ''aal2''. Leave 0 until the admin has two verified authenticator devices and has signed in with a code.'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'admin_mfa_required'),
    0
  ) <> 0;
$$;

COMMENT ON FUNCTION public.admin_mfa_required() IS
  'SECURITY DEFINER, search_path public. True only when platform_settings.admin_mfa_required is a non-zero integer. A missing row is false. Does not grant admin.';

REVOKE ALL ON FUNCTION public.admin_mfa_required() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mfa_required() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND account_type = 'ADMIN'
      AND account_status = 'ACTIVE'
  )
  AND (
    NOT public.admin_mfa_required()
    OR coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'SECURITY DEFINER, search_path public. Active ADMIN profile for auth.uid(). When admin_mfa_required is on, the JWT aal claim must be aal2. auth.uid() null is not admin. Non-admin profiles are not admin. A missing aal claim is not aal2.';

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
