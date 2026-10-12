-- Rolls back 20261021500001_legal_priority_help_live.sql.
-- Makes Terms v3 / Privacy v2 current again and restores the live
-- set_legal_acceptance_required (captured from production 2026-10-11).
-- Terms v4 / Privacy v3 rows are kept (not current, not published) when anyone
-- accepted them, because acceptances reference them; otherwise they are removed.

UPDATE public.agreements SET is_current = false
WHERE (slug, version) IN (('terms-of-use', 4), ('privacy-policy', 3)) AND is_current;

UPDATE public.agreements SET is_current = true
WHERE (slug, version) IN (('terms-of-use', 3), ('privacy-policy', 2));

UPDATE public.agreements SET published = false
WHERE (slug, version) IN (('terms-of-use', 4), ('privacy-policy', 3));

DELETE FROM public.agreements a
WHERE (a.slug, a.version) IN (('terms-of-use', 4), ('privacy-policy', 3))
  AND NOT EXISTS (SELECT 1 FROM public.agreement_acceptances x WHERE x.agreement_id = a.id);

CREATE OR REPLACE FUNCTION public.set_legal_acceptance_required(p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_service_role();

  INSERT INTO public.platform_settings (key, value_int, description)
  VALUES (
    'legal_acceptance_required',
    CASE WHEN coalesce(p_enabled, false) THEN 1 ELSE 0 END,
    '0 = draft legal acceptance is not required. 1 = require the current approved agreement versions. Does not change payment flags or delete account data.'
  )
  ON CONFLICT (key) DO UPDATE
  SET value_int = EXCLUDED.value_int
  WHERE public.platform_settings.key = 'legal_acceptance_required';

  IF NOT coalesce(p_enabled, false) THEN
    RETURN;
  END IF;

  UPDATE public.agreements
  SET is_current = false
  WHERE slug IN (
    'terms-of-use',
    'privacy-policy',
    'refund-cancellation',
    'community-guidelines',
    'review-content',
    'contractor-participation'
  )
    AND is_current;

  UPDATE public.agreements
  SET is_current = true,
      published = true,
      published_at = coalesce(published_at, now())
  WHERE (slug, version) IN (
    ('terms-of-use', 3),
    ('privacy-policy', 2),
    ('refund-cancellation', 1),
    ('community-guidelines', 1),
    ('review-content', 1),
    ('contractor-participation', 1)
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.set_legal_acceptance_required(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_legal_acceptance_required(boolean) TO service_role;
