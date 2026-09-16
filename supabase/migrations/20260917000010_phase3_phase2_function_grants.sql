-- Phase 2 leftover: CREATE OR REPLACE FUNCTION restores PUBLIC EXECUTE.
-- Trigger helpers and write_audit_log must not be callable as RPCs.
-- is_admin() stays executable for authenticated (RLS policies).

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_user_email_confirmed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_contractor_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_verifier_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forbid_audit_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.permitted_signup_account_type(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb) TO service_role;

ALTER FUNCTION public.forbid_audit_mutation() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.permitted_signup_account_type(text) SET search_path = public;

COMMENT ON VIEW public.contractor_public_services IS
  'SECURITY DEFINER on purpose: approved contractors, category names only.';
COMMENT ON VIEW public.contractor_public_areas IS
  'SECURITY DEFINER on purpose: approved contractors, city/ZIP/radius only.';
COMMENT ON VIEW public.contractor_public_portfolio IS
  'SECURITY DEFINER on purpose: approved contractors, public portfolio metadata only.';
COMMENT ON VIEW public.contractor_verified_credential_badges IS
  'SECURITY DEFINER on purpose: VERIFIED credential type only — not a Priority Verified badge.';
