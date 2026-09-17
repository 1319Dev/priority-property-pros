-- Public marketplace directory: APPROVED + ACTIVE contractors, anonymized for
-- logged-out / public visitors. Tightens existing customer-safe views.
-- Does not drop RLS, users, or payment pauses. Does not enable Stripe.

-- ---------------------------------------------------------------------------
-- Obvious pre-hire contact detection (phones, emails, URLs, social handles).
-- Not surveillance. Same copy as the client helper.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.text_contains_pre_hire_contact(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN false
    WHEN p_text ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' THEN true
    WHEN p_text ~* '(https?://|www\.)' THEN true
    WHEN p_text ~* '[A-Za-z0-9.-]+\.(com|net|org|io|co|us|biz|info|app)(/|\y)' THEN true
    WHEN p_text ~* '(instagram|facebook|tiktok|twitter|linkedin|youtube|whatsapp|telegram|snapchat|nextdoor)\.com' THEN true
    WHEN p_text ~* '(^|[^A-Za-z0-9])(fb|x)\.com' THEN true
    WHEN p_text ~* '(^|[^A-Za-z0-9])@[A-Za-z0-9._]{2,}' THEN true
    WHEN p_text ~* '(\+?1[\s\.-]*)?(\(?[0-9]{3}\)?[\s\.-]*)[0-9]{3}[\s\.-]*[0-9]{4}' THEN true
    WHEN p_text ~ '[^0-9][0-9]{10}([^0-9]|$)' OR p_text ~ '^[0-9]{10}([^0-9]|$)' THEN true
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.text_contains_pre_hire_contact(text) IS
  'True when text contains an obvious phone, email, URL, or social handle. Used to block pre-hire circumvention; not a content surveillance system.';

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

CREATE OR REPLACE FUNCTION public.reject_pre_hire_contact_estimates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_no_pre_hire_contact(NEW.notes);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_pre_hire_contact_estimates ON public.estimates;
CREATE TRIGGER trg_reject_pre_hire_contact_estimates
  BEFORE INSERT OR UPDATE OF notes ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_pre_hire_contact_estimates();

CREATE OR REPLACE FUNCTION public.reject_pre_hire_contact_contractor_profiles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_no_pre_hire_contact(NEW.business_name);
  PERFORM public.assert_no_pre_hire_contact(NEW.headline);
  PERFORM public.assert_no_pre_hire_contact(NEW.bio);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_pre_hire_contact_contractor_profiles ON public.contractor_profiles;
CREATE TRIGGER trg_reject_pre_hire_contact_contractor_profiles
  BEFORE INSERT OR UPDATE OF business_name, headline, bio ON public.contractor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_pre_hire_contact_contractor_profiles();

CREATE OR REPLACE FUNCTION public.reject_pre_hire_contact_estimate_questions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_no_pre_hire_contact(NEW.prompt);
  PERFORM public.assert_no_pre_hire_contact(NEW.answer_text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_pre_hire_contact_estimate_questions ON public.estimate_questions;
CREATE TRIGGER trg_reject_pre_hire_contact_estimate_questions
  BEFORE INSERT OR UPDATE OF prompt, answer_text ON public.estimate_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_pre_hire_contact_estimate_questions();

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
REVOKE ALL ON FUNCTION public.assert_no_pre_hire_contact(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.text_contains_pre_hire_contact(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_no_pre_hire_contact(text) TO PUBLIC;

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

REVOKE ALL ON FUNCTION public.anonymized_pro_label(text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.general_service_area(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.public_safe_blurb(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generic_credential_badge_label(text) FROM PUBLIC, anon;

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

-- ---------------------------------------------------------------------------
-- Recreate public contractor views: anonymized, ACTIVE gate, no identity.
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

-- Portfolio photos are not shown on public cards (branding / vehicle lettering risk).
DROP VIEW IF EXISTS public.contractor_public_portfolio;
CREATE VIEW public.contractor_public_portfolio
WITH (security_invoker = false)
AS
SELECT
  pf.id,
  pf.contractor_profile_id,
  pf.sort_order
FROM public.contractor_portfolio pf
JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE false;

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

COMMENT ON VIEW public.contractor_public_profiles IS
  'SECURITY DEFINER on purpose: APPROVED + ACTIVE contractors, anonymized public columns only (display label, trade, general area, years, safe blurb). No business name, email, phone, website, photo, street, or license numbers.';
COMMENT ON VIEW public.contractor_public_services IS
  'SECURITY DEFINER on purpose: APPROVED + ACTIVE contractors, category names only.';
COMMENT ON VIEW public.contractor_public_areas IS
  'SECURITY DEFINER on purpose: APPROVED + ACTIVE contractors, general area label only — not street addresses, ZIP lists, or center ZIP.';
COMMENT ON VIEW public.contractor_public_portfolio IS
  'Intentionally empty for anon/public browse. Branded / truck / logo photos are not listed on public cards.';
COMMENT ON VIEW public.contractor_verified_credential_badges IS
  'SECURITY DEFINER on purpose: generic VERIFIED credential type for APPROVED + ACTIVE contractors only — not a Priority Verified badge and not a license number.';
COMMENT ON VIEW public.contractor_public_ratings IS
  'SECURITY DEFINER on purpose: verified-review average and count for APPROVED + ACTIVE contractors. No customer or booking identifiers. Empty when no real PPP reviews exist.';

GRANT SELECT ON public.contractor_public_profiles TO anon, authenticated;
GRANT SELECT ON public.contractor_verified_credential_badges TO anon, authenticated;
GRANT SELECT ON public.contractor_public_services TO anon, authenticated;
GRANT SELECT ON public.contractor_public_areas TO anon, authenticated;
GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;
REVOKE ALL ON TABLE public.contractor_public_portfolio FROM anon, authenticated;

-- Directory views do not open profiles, projects, or reviews to anon.
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.projects FROM anon;
REVOKE ALL ON TABLE public.booking_reviews FROM anon;
REVOKE ALL ON TABLE public.project_private_locations FROM anon;
REVOKE ALL ON TABLE public.contractor_profiles FROM anon;

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
  short_description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.list_public_directory_contractors() listed
  WHERE listed.id = p_id;
$$;

COMMENT ON FUNCTION public.list_public_directory_contractors() IS
  'Public marketplace directory. APPROVED + ACTIVE only. Anonymized display label, trade, general area, ratings aggregates, badges. No business name, email, phone, website, photo, street, or license.';
COMMENT ON FUNCTION public.get_public_directory_contractor(uuid) IS
  'Single public contractor card. Same anonymized projection as list_public_directory_contractors().';

REVOKE ALL ON FUNCTION public.list_public_directory_contractors() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_directory_contractor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_directory_contractors() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_directory_contractor(uuid) TO anon, authenticated;
