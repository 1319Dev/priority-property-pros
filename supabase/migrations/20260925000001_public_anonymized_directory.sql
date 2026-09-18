-- Public marketplace directory: APPROVED + ACTIVE contractors, anonymized for
-- logged-out / public visitors. Tightens existing customer-safe views.
--
-- Apply AFTER #14/#16:
--   20260922000001_contact_access_entitlement.sql
--   20260923000001_estimate_lifecycle_schema.sql
--   20260923000002_estimate_lifecycle_helpers.sql
--   20260923000003_estimate_lifecycle_rpcs.sql
--   20260923000004_estimate_lifecycle_select_rls.sql
--   20260924000001_contact_access_lifecycle_compat.sql
-- Preview DB: giiskdvitimksdewnelc
-- Do NOT apply to production (bersftkjpbzpgtahbqwd) from this PR.
--
-- Additive vs #14/#16: does not drop booking_contact_access, estimate lifecycle
-- RPCs/helpers, text_contains_contact_info, protect_* triggers, or payment pauses.
-- Does not enable Stripe. Does not set payments_live / charges_live / signup_fee_enabled.

-- ---------------------------------------------------------------------------
-- Extra pre-hire contact detection used by public projections.
-- Wraps #16 text_contains_contact_info; does not replace it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.text_contains_pre_hire_contact(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN false
    WHEN public.text_contains_contact_info(p_text) THEN true
    WHEN p_text ~* '[A-Za-z0-9.-]+\.(com|net|org|io|co|us|biz|info|app)(/|\y)' THEN true
    WHEN p_text ~ '[^0-9][0-9]{10}([^0-9]|$)' OR p_text ~ '^[0-9]{10}([^0-9]|$)' THEN true
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.text_contains_pre_hire_contact(text) IS
  'True when text contains an obvious phone, email, URL, or social handle. Wraps text_contains_contact_info; used for public directory sanitizing. Not surveillance.';

CREATE OR REPLACE FUNCTION public.assert_no_pre_hire_contact(p_text text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF public.text_contains_pre_hire_contact(p_text) THEN
    RAISE EXCEPTION 'For your privacy and protection, contact information is shared after you''re connected through Priority Property Pros.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_pre_hire_contact_projects()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_no_pre_hire_contact(NEW.title);
  PERFORM public.assert_no_pre_hire_contact(NEW.description);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_pre_hire_contact_projects ON public.projects;
CREATE TRIGGER trg_reject_pre_hire_contact_projects
  BEFORE INSERT OR UPDATE OF title, description ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_pre_hire_contact_projects();

CREATE OR REPLACE FUNCTION public.reject_pre_hire_contact_project_answers()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_no_pre_hire_contact(NEW.answer_text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_pre_hire_contact_project_answers ON public.project_answers;
CREATE TRIGGER trg_reject_pre_hire_contact_project_answers
  BEFORE INSERT OR UPDATE OF answer_text ON public.project_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_pre_hire_contact_project_answers();

REVOKE ALL ON FUNCTION public.text_contains_pre_hire_contact(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_no_pre_hire_contact(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.text_contains_pre_hire_contact(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_no_pre_hire_contact(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Anonymized public labels. Never return a real business_name to anon.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.anonymized_pro_label(p_trade text, p_categories text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_trade text;
BEGIN
  v_trade := nullif(btrim(coalesce(p_trade, '')), '');
  IF v_trade IS NULL AND p_categories IS NOT NULL AND array_length(p_categories, 1) >= 1 THEN
    v_trade := nullif(btrim(p_categories[1]), '');
  END IF;
  IF v_trade IS NULL THEN
    v_trade := 'Local';
  END IF;
  v_trade := regexp_replace(v_trade, '\s+pro$', '', 'i');
  RETURN 'Approved ' || initcap(v_trade) || ' Pro';
END;
$$;

CREATE OR REPLACE FUNCTION public.general_service_area(p_area text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_area text;
BEGIN
  v_area := nullif(btrim(coalesce(p_area, '')), '');
  IF v_area IS NULL THEN
    RETURN 'Local service area';
  END IF;
  IF public.text_contains_pre_hire_contact(v_area) THEN
    RETURN 'Local service area';
  END IF;
  IF v_area ~* '\d+\s+\w+.*\y(street|st|ave|avenue|rd|road|blvd|lane|ln|dr|drive|ct|court|way|pkwy|parkway)\y' THEN
    RETURN 'Local service area';
  END IF;
  IF v_area ~ '^[0-9]{5}(-[0-9]{4})?$' THEN
    RETURN 'Local service area';
  END IF;
  IF v_area ~* '\yarea\y' THEN
    RETURN v_area;
  END IF;
  RETURN v_area || ' Area';
END;
$$;

CREATE OR REPLACE FUNCTION public.public_safe_blurb(p_headline text, p_bio text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  v_text := nullif(btrim(coalesce(p_headline, '')), '');
  IF v_text IS NULL OR public.text_contains_pre_hire_contact(v_text) THEN
    v_text := nullif(btrim(coalesce(p_bio, '')), '');
  END IF;
  IF v_text IS NULL OR public.text_contains_pre_hire_contact(v_text) THEN
    RETURN 'Independent local contractor.';
  END IF;
  v_text := regexp_replace(v_text, '\s+', ' ', 'g');
  IF char_length(v_text) > 180 THEN
    RETURN left(v_text, 177) || '…';
  END IF;
  RETURN v_text;
END;
$$;

CREATE OR REPLACE FUNCTION public.public_safe_about(p_bio text, p_headline text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  v_text := nullif(btrim(coalesce(p_bio, '')), '');
  IF v_text IS NULL OR public.text_contains_pre_hire_contact(v_text) THEN
    v_text := nullif(btrim(coalesce(p_headline, '')), '');
  END IF;
  IF v_text IS NULL OR public.text_contains_pre_hire_contact(v_text) THEN
    RETURN 'Independent local contractor. Contact is shared after you connect through Priority Property Pros.';
  END IF;
  v_text := regexp_replace(v_text, '\s+', ' ', 'g');
  IF char_length(v_text) > 600 THEN
    RETURN left(v_text, 597) || '…';
  END IF;
  RETURN v_text;
END;
$$;

CREATE OR REPLACE FUNCTION public.generic_credential_badge_label(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(coalesce(p_kind, ''))
    WHEN 'LICENSE' THEN 'License reviewed'
    WHEN 'INSURANCE' THEN 'Insurance reviewed'
    ELSE 'Credential reviewed'
  END;
$$;

CREATE OR REPLACE FUNCTION public.public_safe_portfolio_caption(p_title text, p_description text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  v_text := nullif(btrim(coalesce(p_description, '')), '');
  IF v_text IS NULL OR public.text_contains_pre_hire_contact(v_text) OR v_text ~* '\.(jpe?g|png|webp|gif|heic|pdf)$' THEN
    v_text := nullif(btrim(coalesce(p_title, '')), '');
  END IF;
  IF v_text IS NULL OR public.text_contains_pre_hire_contact(v_text) OR v_text ~* '\.(jpe?g|png|webp|gif|heic|pdf)$' OR v_text ~ '[/\\]' THEN
    RETURN 'Screened project photo';
  END IF;
  v_text := regexp_replace(v_text, '\s+', ' ', 'g');
  IF char_length(v_text) > 80 THEN
    RETURN left(v_text, 77) || '…';
  END IF;
  RETURN v_text;
END;
$$;

REVOKE ALL ON FUNCTION public.anonymized_pro_label(text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.general_service_area(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_safe_blurb(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_safe_about(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generic_credential_badge_label(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_safe_portfolio_caption(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymized_pro_label(text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.general_service_area(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_safe_blurb(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_safe_about(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generic_credential_badge_label(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_safe_portfolio_caption(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.text_contains_contact_info(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Portfolio privacy: conservative default REVIEW_REQUIRED. No AI detection.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portfolio_privacy_state') THEN
    CREATE TYPE public.portfolio_privacy_state AS ENUM ('PUBLIC_SAFE', 'PRIVATE', 'REVIEW_REQUIRED');
  END IF;
END
$$;

ALTER TABLE public.contractor_portfolio
  ADD COLUMN IF NOT EXISTS privacy_state public.portfolio_privacy_state NOT NULL DEFAULT 'REVIEW_REQUIRED';

COMMENT ON COLUMN public.contractor_portfolio.privacy_state IS
  'PUBLIC_SAFE = manually screened for public browse. PRIVATE = never public. REVIEW_REQUIRED = default until a human screens it. No automated brand/face detection.';

CREATE OR REPLACE FUNCTION public.reject_pre_hire_contact_portfolio()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_no_pre_hire_contact(NEW.title);
  PERFORM public.assert_no_pre_hire_contact(NEW.description);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_pre_hire_contact_portfolio ON public.contractor_portfolio;
CREATE TRIGGER trg_reject_pre_hire_contact_portfolio
  BEFORE INSERT OR UPDATE OF title, description ON public.contractor_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_pre_hire_contact_portfolio();

-- ---------------------------------------------------------------------------
-- Directory listing predicate: APPROVED contractor + ACTIVE account.
-- Views run as owner (security_invoker = false) so they can join profiles
-- without granting anon SELECT on public.profiles.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.contractor_is_directory_listed(p_contractor_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_profiles cp
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE cp.id = p_contractor_profile_id
      AND cp.approval_status = 'APPROVED'
      AND p.account_status = 'ACTIVE'
  );
$$;

COMMENT ON FUNCTION public.contractor_is_directory_listed(uuid) IS
  'True only for APPROVED contractors whose account_status is ACTIVE. Used by public directory views.';

REVOKE ALL ON FUNCTION public.contractor_is_directory_listed(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.list_public_directory_contractors();
DROP FUNCTION IF EXISTS public.get_public_directory_contractor(uuid);
DROP FUNCTION IF EXISTS public.list_public_directory_portfolio(uuid);
DROP FUNCTION IF EXISTS public.list_public_directory_reviews(uuid);

-- ---------------------------------------------------------------------------
-- Recreate public contractor views: anonymized, ACTIVE gate, no identity.
-- Does not drop #14/#16 tables or RPCs.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.contractor_public_profiles;
CREATE VIEW public.contractor_public_profiles
WITH (security_invoker = false)
AS
SELECT
  cp.id,
  public.anonymized_pro_label(cp.primary_trade, NULL) AS display_label,
  cp.primary_trade,
  cp.years_experience,
  public.public_safe_blurb(cp.headline, cp.bio) AS short_description,
  public.public_safe_about(cp.bio, cp.headline) AS about,
  cp.accepting_work,
  cp.created_at,
  public.general_service_area(cp.service_area) AS service_area
FROM public.contractor_profiles cp
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

DROP VIEW IF EXISTS public.contractor_verified_credential_badges;
CREATE VIEW public.contractor_verified_credential_badges
WITH (security_invoker = false)
AS
SELECT
  cr.id,
  cr.contractor_profile_id,
  cr.kind,
  public.generic_credential_badge_label(cr.kind) AS label,
  cr.status,
  cr.expires_at
FROM public.contractor_credentials cr
JOIN public.contractor_profiles cp ON cp.id = cr.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cr.status = 'VERIFIED'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

DROP VIEW IF EXISTS public.contractor_public_services;
CREATE VIEW public.contractor_public_services
WITH (security_invoker = false)
AS
SELECT
  cs.id,
  cs.contractor_profile_id,
  cs.category_id,
  sc.slug AS category_slug,
  sc.name AS category_name
FROM public.contractor_services cs
JOIN public.contractor_profiles cp ON cp.id = cs.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
JOIN public.service_categories sc ON sc.id = cs.category_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

DROP VIEW IF EXISTS public.contractor_public_areas;
CREATE VIEW public.contractor_public_areas
WITH (security_invoker = false)
AS
SELECT
  a.id,
  a.contractor_profile_id,
  coalesce(nullif(btrim(a.label), ''), public.general_service_area(cp.service_area)) AS label
FROM public.contractor_service_areas a
JOIN public.contractor_profiles cp ON cp.id = a.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

-- Only manually screened PUBLIC_SAFE items. No storage path / original filename.
DROP VIEW IF EXISTS public.contractor_public_portfolio;
CREATE VIEW public.contractor_public_portfolio
WITH (security_invoker = false)
AS
SELECT
  pf.id,
  pf.contractor_profile_id,
  pf.sort_order,
  public.public_safe_portfolio_caption(pf.title, pf.description) AS caption
FROM public.contractor_portfolio pf
JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE pf.privacy_state = 'PUBLIC_SAFE'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND NOT public.text_contains_pre_hire_contact(pf.title)
  AND NOT public.text_contains_pre_hire_contact(coalesce(pf.description, ''));

-- Aggregate ratings only. No customer names, emails, review bodies, or booking ids.
DROP VIEW IF EXISTS public.contractor_public_ratings;
CREATE VIEW public.contractor_public_ratings
WITH (security_invoker = false)
AS
SELECT
  r.contractor_profile_id,
  round(avg(r.rating)::numeric, 1) AS rating_average,
  count(*)::integer AS rating_count
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
GROUP BY r.contractor_profile_id;

DROP VIEW IF EXISTS public.contractor_public_reviews;
CREATE VIEW public.contractor_public_reviews
WITH (security_invoker = false)
AS
SELECT
  r.id,
  r.contractor_profile_id,
  r.rating,
  CASE
    WHEN r.body IS NULL OR btrim(r.body) = '' OR public.text_contains_pre_hire_contact(r.body)
      THEN 'Verified PPP review.'
    WHEN char_length(regexp_replace(btrim(r.body), '\s+', ' ', 'g')) > 280
      THEN left(regexp_replace(btrim(r.body), '\s+', ' ', 'g'), 277) || '…'
    ELSE regexp_replace(btrim(r.body), '\s+', ' ', 'g')
  END AS body
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

COMMENT ON VIEW public.contractor_public_profiles IS
  'SECURITY DEFINER on purpose: APPROVED + ACTIVE contractors, anonymized public columns only (display label, trade, general area, years, safe blurb). No business name, email, phone, website, photo, street, or license numbers.';
COMMENT ON VIEW public.contractor_public_services IS
  'SECURITY DEFINER on purpose: APPROVED + ACTIVE contractors, category names only.';
COMMENT ON VIEW public.contractor_public_areas IS
  'SECURITY DEFINER on purpose: APPROVED + ACTIVE contractors, general area label only — not street addresses, ZIP lists, or center ZIP.';
COMMENT ON VIEW public.contractor_public_portfolio IS
  'Manually screened PUBLIC_SAFE portfolio only. Caption is sanitized. No storage_path, original filename, EXIF, or branded metadata.';
COMMENT ON VIEW public.contractor_verified_credential_badges IS
  'SECURITY DEFINER on purpose: generic VERIFIED credential type for APPROVED + ACTIVE contractors only — not a Priority Verified badge and not a license number.';
COMMENT ON VIEW public.contractor_public_ratings IS
  'SECURITY DEFINER on purpose: verified-review average and count for APPROVED + ACTIVE contractors. No customer or booking identifiers. Empty when no real PPP reviews exist.';
COMMENT ON VIEW public.contractor_public_reviews IS
  'Verified PPP review bodies only, contact-stripped, no customer name or booking id. Demo content is never stored here.';

GRANT SELECT ON public.contractor_public_profiles TO anon, authenticated;
GRANT SELECT ON public.contractor_verified_credential_badges TO anon, authenticated;
GRANT SELECT ON public.contractor_public_services TO anon, authenticated;
GRANT SELECT ON public.contractor_public_areas TO anon, authenticated;
GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;
GRANT SELECT ON public.contractor_public_portfolio TO anon, authenticated;
GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;

-- Directory views do not open profiles, projects, or reviews to anon.
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.projects FROM anon;
REVOKE ALL ON TABLE public.booking_reviews FROM anon;
REVOKE ALL ON TABLE public.project_private_locations FROM anon;
REVOKE ALL ON TABLE public.contractor_profiles FROM anon;
REVOKE ALL ON TABLE public.contractor_portfolio FROM anon;
REVOKE ALL ON TABLE public.booking_contact_access FROM anon;

-- Public directory RPC: APPROVED + ACTIVE, anonymized columns only.
CREATE OR REPLACE FUNCTION public.list_public_directory_contractors()
RETURNS TABLE (
  id uuid,
  display_label text,
  primary_trade text,
  categories text[],
  service_area text,
  years_experience integer,
  rating_average numeric,
  rating_count integer,
  badges jsonb,
  short_description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.id,
    public.anonymized_pro_label(
      cp.primary_trade,
      coalesce((
        SELECT array_agg(sc.name ORDER BY sc.name)
        FROM public.contractor_services cs
        JOIN public.service_categories sc ON sc.id = cs.category_id
        WHERE cs.contractor_profile_id = cp.id
      ), '{}'::text[])
    ),
    cp.primary_trade,
    coalesce((
      SELECT array_agg(sc.name ORDER BY sc.name)
      FROM public.contractor_services cs
      JOIN public.service_categories sc ON sc.id = cs.category_id
      WHERE cs.contractor_profile_id = cp.id
    ), '{}'::text[]),
    public.general_service_area(cp.service_area),
    cp.years_experience,
    r.rating_average,
    coalesce(r.rating_count, 0),
    (
      jsonb_build_array(jsonb_build_object('kind', 'APPROVED', 'label', 'Approved Pro'))
      || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'kind', cr.kind,
          'label', public.generic_credential_badge_label(cr.kind)
        ) ORDER BY cr.kind)
        FROM public.contractor_credentials cr
        WHERE cr.contractor_profile_id = cp.id
          AND cr.status = 'VERIFIED'
      ), '[]'::jsonb)
    ),
    public.public_safe_blurb(cp.headline, cp.bio)
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  LEFT JOIN public.contractor_public_ratings r ON r.contractor_profile_id = cp.id
  WHERE cp.approval_status = 'APPROVED'
    AND p.account_status = 'ACTIVE'
  ORDER BY 2, cp.id;
$$;

CREATE OR REPLACE FUNCTION public.get_public_directory_contractor(p_id uuid)
RETURNS TABLE (
  id uuid,
  display_label text,
  primary_trade text,
  categories text[],
  service_area text,
  years_experience integer,
  rating_average numeric,
  rating_count integer,
  badges jsonb,
  short_description text,
  about text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    listed.id,
    listed.display_label,
    listed.primary_trade,
    listed.categories,
    listed.service_area,
    listed.years_experience,
    listed.rating_average,
    listed.rating_count,
    listed.badges,
    listed.short_description,
    public.public_safe_about(cp.bio, cp.headline)
  FROM public.list_public_directory_contractors() listed
  JOIN public.contractor_profiles cp ON cp.id = listed.id
  WHERE listed.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.list_public_directory_portfolio(p_id uuid)
RETURNS TABLE (
  id uuid,
  caption text,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pf.id, pf.caption, pf.sort_order
  FROM public.contractor_public_portfolio pf
  WHERE pf.contractor_profile_id = p_id
    AND public.contractor_is_directory_listed(p_id)
  ORDER BY pf.sort_order, pf.id;
$$;

CREATE OR REPLACE FUNCTION public.list_public_directory_reviews(p_id uuid)
RETURNS TABLE (
  id uuid,
  rating smallint,
  body text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.rating, r.body
  FROM public.contractor_public_reviews r
  WHERE r.contractor_profile_id = p_id
    AND public.contractor_is_directory_listed(p_id)
  ORDER BY r.id;
$$;

COMMENT ON FUNCTION public.list_public_directory_contractors() IS
  'Public marketplace directory. APPROVED + ACTIVE only. Anonymized display label, trade, categories, general area, ratings aggregates, badges. No business name, email, phone, website, photo, street, or license.';
COMMENT ON FUNCTION public.get_public_directory_contractor(uuid) IS
  'Single public contractor card plus safe About text. Same anonymized projection as list_public_directory_contractors().';
COMMENT ON FUNCTION public.list_public_directory_portfolio(uuid) IS
  'PUBLIC_SAFE screened portfolio captions only. No storage paths or filenames.';
COMMENT ON FUNCTION public.list_public_directory_reviews(uuid) IS
  'Verified PPP review bodies only. No customer identity. Demo reviews are never included.';

REVOKE ALL ON FUNCTION public.list_public_directory_contractors() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_directory_contractor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_directory_portfolio(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_directory_reviews(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_directory_contractors() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_directory_contractor(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_directory_portfolio(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_directory_reviews(uuid) TO anon, authenticated;
