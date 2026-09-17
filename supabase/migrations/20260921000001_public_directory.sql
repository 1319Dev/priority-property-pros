-- Public marketplace directory: approved + ACTIVE contractors, safe columns only.
-- Tightens existing customer-safe views. Does not drop RLS, users, or payment pauses.

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

-- ---------------------------------------------------------------------------
-- Recreate public contractor views: ACTIVE gate + general service area + photo.
-- Column lists stay public-safe: no email, phone, street, license numbers,
-- document paths, or customer/project private fields.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.contractor_public_profiles;
CREATE VIEW public.contractor_public_profiles
WITH (security_invoker = false)
AS
SELECT
  cp.id,
  cp.business_name,
  cp.headline,
  cp.primary_trade,
  cp.years_experience,
  cp.bio,
  cp.website_url,
  cp.accepting_work,
  cp.created_at,
  cp.service_area,
  p.avatar_url AS photo_url
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
  cr.label,
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
  a.mode,
  a.center_zip,
  a.radius_miles,
  a.zip_codes,
  a.label
FROM public.contractor_service_areas a
JOIN public.contractor_profiles cp ON cp.id = a.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

DROP VIEW IF EXISTS public.contractor_public_portfolio;
CREATE VIEW public.contractor_public_portfolio
WITH (security_invoker = false)
AS
SELECT
  pf.id,
  pf.contractor_profile_id,
  pf.title,
  pf.description,
  pf.storage_path,
  pf.sort_order
FROM public.contractor_portfolio pf
JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

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
  'SECURITY DEFINER on purpose: APPROVED + ACTIVE contractors, public directory columns only (business name, photo, headline/bio, general service area). No email, phone, street, or license numbers. Not a Priority Verified badge.';
COMMENT ON VIEW public.contractor_public_services IS
  'SECURITY DEFINER on purpose: APPROVED + ACTIVE contractors, category names only.';
COMMENT ON VIEW public.contractor_public_areas IS
  'SECURITY DEFINER on purpose: APPROVED + ACTIVE contractors, general area label/ZIP/radius only — not street addresses.';
COMMENT ON VIEW public.contractor_public_portfolio IS
  'SECURITY DEFINER on purpose: APPROVED + ACTIVE contractors, public portfolio metadata only.';
COMMENT ON VIEW public.contractor_verified_credential_badges IS
  'SECURITY DEFINER on purpose: VERIFIED credential type for APPROVED + ACTIVE contractors only — not a Priority Verified badge.';
COMMENT ON VIEW public.contractor_public_ratings IS
  'SECURITY DEFINER on purpose: verified-review average and count for APPROVED + ACTIVE contractors. No customer or booking identifiers.';

GRANT SELECT ON public.contractor_public_profiles TO anon, authenticated;
GRANT SELECT ON public.contractor_verified_credential_badges TO anon, authenticated;
GRANT SELECT ON public.contractor_public_services TO anon, authenticated;
GRANT SELECT ON public.contractor_public_areas TO anon, authenticated;
GRANT SELECT ON public.contractor_public_portfolio TO anon, authenticated;
GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;

-- Directory views do not open profiles, projects, or reviews to anon.
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.projects FROM anon;
REVOKE ALL ON TABLE public.booking_reviews FROM anon;
REVOKE ALL ON TABLE public.project_private_locations FROM anon;

-- Public directory RPC: APPROVED + ACTIVE, public columns only.
CREATE OR REPLACE FUNCTION public.list_public_directory_contractors()
RETURNS TABLE (
  id uuid,
  business_name text,
  photo_url text,
  headline text,
  bio text,
  service_area text,
  primary_trade text,
  categories text[],
  rating_average numeric,
  rating_count integer,
  badges jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.id,
    cp.business_name,
    p.avatar_url,
    cp.headline,
    cp.bio,
    cp.service_area,
    cp.primary_trade,
    coalesce((
      SELECT array_agg(sc.name ORDER BY sc.name)
      FROM public.contractor_services cs
      JOIN public.service_categories sc ON sc.id = cs.category_id
      WHERE cs.contractor_profile_id = cp.id
    ), '{}'::text[]),
    r.rating_average,
    coalesce(r.rating_count, 0),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', cr.kind, 'label', cr.label) ORDER BY cr.label)
      FROM public.contractor_credentials cr
      WHERE cr.contractor_profile_id = cp.id
        AND cr.status = 'VERIFIED'
    ), '[]'::jsonb)
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  LEFT JOIN public.contractor_public_ratings r ON r.contractor_profile_id = cp.id
  WHERE cp.approval_status = 'APPROVED'
    AND p.account_status = 'ACTIVE'
  ORDER BY cp.business_name;
$$;

CREATE OR REPLACE FUNCTION public.get_public_directory_contractor(p_id uuid)
RETURNS TABLE (
  id uuid,
  business_name text,
  photo_url text,
  headline text,
  bio text,
  service_area text,
  primary_trade text,
  categories text[],
  rating_average numeric,
  rating_count integer,
  badges jsonb
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
  'Public marketplace directory. APPROVED + ACTIVE contractors only. No email, phone, street, or customer/project private fields.';
COMMENT ON FUNCTION public.get_public_directory_contractor(uuid) IS
  'Single public contractor card. Same privacy as list_public_directory_contractors().';

REVOKE ALL ON FUNCTION public.list_public_directory_contractors() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_directory_contractor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_directory_contractors() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_directory_contractor(uuid) TO anon, authenticated;
