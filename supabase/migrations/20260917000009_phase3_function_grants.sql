-- Harden Phase 3 function grants. Postgres grants EXECUTE to PUBLIC by default;
-- RPCs must not be callable anonymously. Views stay SECURITY DEFINER on purpose:
-- they expose only customer-safe columns of approved contractors (no license numbers
-- or document paths). Underlying tables remain own-or-admin.

REVOKE ALL ON FUNCTION public.ppp_set_rpc(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ppp_rpc_is(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_project(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_estimate_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_project_completeness(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_project_status_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_project_completeness() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_estimate_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_posted_project() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_estimate_questions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_contractor_credentials() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_estimate_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_matches(text, numeric, numeric, public.contractor_service_areas) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.current_contractor_profile_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_project_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contractor_has_open_opportunity(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contractor_is_selected_on_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_opportunity(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pass_opportunity(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_estimate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_estimate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.select_estimate(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_fee_bps() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fee_preview(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_contractor_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contractor_has_open_opportunity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contractor_is_selected_on_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_opportunity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pass_opportunity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_estimate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_estimate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_estimate(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_fee_bps() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fee_preview(integer) TO authenticated;

ALTER FUNCTION public.normalize_zip(text) SET search_path = public;
ALTER FUNCTION public.haversine_miles(numeric, numeric, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.fee_cents_from_total(integer, integer) SET search_path = public;
ALTER FUNCTION public.ppp_set_rpc(text) SET search_path = public;
ALTER FUNCTION public.ppp_rpc_is(text) SET search_path = public;
ALTER FUNCTION public.normalize_estimate_item() SET search_path = public;
ALTER FUNCTION public.location_matches(text, numeric, numeric, public.contractor_service_areas) SET search_path = public;

COMMENT ON VIEW public.contractor_public_profiles IS
  'SECURITY DEFINER on purpose: approved contractors, safe columns only. Not a Priority Verified badge.';
