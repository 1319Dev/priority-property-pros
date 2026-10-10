-- Roll back 20261013000001_admin_mfa_required.sql.
-- Restores the production is_admin() body fetched before this change
-- (pg_get_functiondef on public.is_admin()). That body matches
-- supabase/migrations/20260916000007_rls.sql. search_path formatting
-- (TO 'public') is the live catalog text.
-- Then removes the helper and the platform setting.
-- Does not change payments, fees, contact unlock, matching, or auth settings.

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND account_type = 'ADMIN'
      AND account_status = 'ACTIVE'
  );
$function$;

COMMENT ON FUNCTION public.is_admin() IS NULL;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_mfa_required();

DELETE FROM public.platform_settings WHERE key = 'admin_mfa_required';
