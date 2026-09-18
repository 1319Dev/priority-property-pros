-- Public directory privilege fix for preview (giiskdvitimksdewnelc).
-- Apply AFTER 20260925000001_public_anonymized_directory.sql.
-- Do NOT apply to production (bersftkjpbzpgtahbqwd) from this PR.
--
-- Why: SQL IMMUTABLE helpers are inlined into SECURITY INVOKER / view plans.
-- Anon SELECT on contractor_public_* views then needs EXECUTE on those
-- pure helpers. RPCs remain the primary public API and already passed privacy.
--
-- Grants only pure text helpers (no table reads). Does not grant private
-- tables or private columns. Does not change payments_live / charges_live.

-- Label / area / blurb helpers used by public views.
GRANT EXECUTE ON FUNCTION public.anonymized_pro_label(text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.general_service_area(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_safe_blurb(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_safe_about(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generic_credential_badge_label(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_safe_portfolio_caption(text, text) TO anon, authenticated;

-- Contact detectors used by the inlined public-view sanitizers.
-- Pure boolean classifiers. No table access. No PII returned.
GRANT EXECUTE ON FUNCTION public.text_contains_pre_hire_contact(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.text_contains_contact_info(text) TO anon, authenticated;

-- Write-path guard: authenticated project/profile/portfolio inserts and updates.
-- Anon does not need this; public browse is read-only.
REVOKE ALL ON FUNCTION public.assert_no_pre_hire_contact(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_no_pre_hire_contact(text) TO authenticated;

-- Views stay readable for anon so PostgREST extras work. RPCs stay primary.
GRANT SELECT ON public.contractor_public_profiles TO anon, authenticated;
GRANT SELECT ON public.contractor_verified_credential_badges TO anon, authenticated;
GRANT SELECT ON public.contractor_public_services TO anon, authenticated;
GRANT SELECT ON public.contractor_public_areas TO anon, authenticated;
GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;
GRANT SELECT ON public.contractor_public_portfolio TO anon, authenticated;
GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_public_directory_contractors() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_directory_contractor(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_directory_portfolio(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_directory_reviews(uuid) TO anon, authenticated;

-- Fail-closed: private rows stay denied to anon.
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.projects FROM anon;
REVOKE ALL ON TABLE public.booking_reviews FROM anon;
REVOKE ALL ON TABLE public.project_private_locations FROM anon;
REVOKE ALL ON TABLE public.contractor_profiles FROM anon;
REVOKE ALL ON TABLE public.contractor_portfolio FROM anon;
REVOKE ALL ON TABLE public.booking_contact_access FROM anon;
REVOKE ALL ON FUNCTION public.contractor_is_directory_listed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_job_contact(uuid) FROM anon;

COMMENT ON FUNCTION public.anonymized_pro_label(text, text[]) IS
  'Pure helper for public directory labels. EXECUTE granted to anon/authenticated so inlined public views can run. No table access.';
COMMENT ON FUNCTION public.general_service_area(text) IS
  'Pure helper that generalizes a service area. EXECUTE granted to anon/authenticated for public views. No table access.';
COMMENT ON FUNCTION public.generic_credential_badge_label(text) IS
  'Pure helper that maps credential kind to a generic badge. EXECUTE granted to anon/authenticated. No license numbers.';
COMMENT ON FUNCTION public.text_contains_pre_hire_contact(text) IS
  'Pure contact-pattern detector for public sanitizing. EXECUTE granted to anon/authenticated because views inline it. Not surveillance.';
COMMENT ON FUNCTION public.assert_no_pre_hire_contact(text) IS
  'Write-path guard. EXECUTE granted to authenticated only; anon browse is read-only.';
