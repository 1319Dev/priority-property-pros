-- Rollback for 20261021000001_exclude_test_accounts_from_public_directory.
-- Restores the LIVE definitions captured before the migration (2026-10-11, prod head 20261012013300),
-- then drops the helper. Views first, then functions, so nothing references the helper when it is dropped.

CREATE OR REPLACE VIEW public.contractor_public_profiles
WITH (security_invoker = false)
AS
 SELECT cp.id,
    public_directory_label(cp.id) AS display_label,
    public_directory_primary_trade(cp.id) AS primary_trade,
    cp.years_experience,
    public_safe_blurb(cp.headline, cp.bio) AS short_description,
    public_safe_about(cp.bio, cp.headline) AS about,
    cp.accepting_work,
    cp.created_at,
    COALESCE(contractor_public_service_label(cp.id), 'Local service area'::text) AS service_area
   FROM contractor_profiles cp
     JOIN profiles p ON p.id = cp.profile_id
  WHERE cp.approval_status = 'APPROVED'::approval_status AND p.account_status = 'ACTIVE'::account_status AND NOT cp.directory_hidden AND (NOT signup_fee_enabled() OR (p.signup_fee_status = ANY (ARRAY['PAID'::signup_fee_status, 'NOT_REQUIRED'::signup_fee_status])) OR (p.account_type <> ALL (ARRAY['CUSTOMER'::account_type, 'CONTRACTOR'::account_type])));

CREATE OR REPLACE VIEW public.contractor_public_services
WITH (security_invoker = false)
AS
 SELECT cs.id,
    cs.contractor_profile_id,
    cs.category_id,
    sc.slug AS category_slug,
    sc.name AS category_name
   FROM contractor_services cs
     JOIN contractor_profiles cp ON cp.id = cs.contractor_profile_id
     JOIN profiles p ON p.id = cp.profile_id
     JOIN service_categories sc ON sc.id = cs.category_id
  WHERE cp.approval_status = 'APPROVED'::approval_status AND p.account_status = 'ACTIVE'::account_status AND NOT cp.directory_hidden AND (NOT signup_fee_enabled() OR (p.signup_fee_status = ANY (ARRAY['PAID'::signup_fee_status, 'NOT_REQUIRED'::signup_fee_status])) OR (p.account_type <> ALL (ARRAY['CUSTOMER'::account_type, 'CONTRACTOR'::account_type]))) AND NOT public_service_is_other(sc.name) AND (btrim(cp.business_name) = ''::text OR lower(btrim(sc.name)) IS DISTINCT FROM lower(btrim(cp.business_name)));

CREATE OR REPLACE VIEW public.contractor_public_areas
WITH (security_invoker = false)
AS
 SELECT a.id,
    a.contractor_profile_id,
    COALESCE(contractor_public_service_label(a.contractor_profile_id), general_service_area(cp.service_area)) AS label
   FROM contractor_service_areas a
     JOIN contractor_profiles cp ON cp.id = a.contractor_profile_id
     JOIN profiles p ON p.id = cp.profile_id
  WHERE cp.approval_status = 'APPROVED'::approval_status AND p.account_status = 'ACTIVE'::account_status AND NOT cp.directory_hidden AND (NOT signup_fee_enabled() OR (p.signup_fee_status = ANY (ARRAY['PAID'::signup_fee_status, 'NOT_REQUIRED'::signup_fee_status])) OR (p.account_type <> ALL (ARRAY['CUSTOMER'::account_type, 'CONTRACTOR'::account_type])));

CREATE OR REPLACE VIEW public.contractor_public_portfolio
WITH (security_invoker = false)
AS
 SELECT pf.id,
    pf.contractor_profile_id,
    pf.sort_order,
    public_safe_portfolio_caption(pf.title, pf.description) AS caption
   FROM contractor_portfolio pf
     JOIN contractor_profiles cp ON cp.id = pf.contractor_profile_id
     JOIN profiles p ON p.id = cp.profile_id
  WHERE pf.privacy_state = 'PUBLIC_SAFE'::portfolio_privacy_state AND cp.approval_status = 'APPROVED'::approval_status AND p.account_status = 'ACTIVE'::account_status AND NOT cp.directory_hidden AND (NOT signup_fee_enabled() OR (p.signup_fee_status = ANY (ARRAY['PAID'::signup_fee_status, 'NOT_REQUIRED'::signup_fee_status])) OR (p.account_type <> ALL (ARRAY['CUSTOMER'::account_type, 'CONTRACTOR'::account_type]))) AND NOT text_contains_pre_hire_contact(pf.title) AND NOT text_contains_pre_hire_contact(COALESCE(pf.description, ''::text));

CREATE OR REPLACE VIEW public.contractor_public_reviews
WITH (security_invoker = false)
AS
 SELECT r.id,
    r.contractor_profile_id,
    r.rating,
    public_review_body(r.body, cp.business_name, p.first_name, p.last_name) AS body,
        CASE
            WHEN r.contractor_response_hidden_at IS NOT NULL THEN NULL::text
            WHEN r.contractor_response IS NULL OR btrim(r.contractor_response) = ''::text THEN NULL::text
            WHEN text_contains_contact_info(r.contractor_response) THEN NULL::text
            ELSE public_review_body(r.contractor_response, cp.business_name, p.first_name, p.last_name)
        END AS contractor_response
   FROM booking_reviews r
     JOIN contractor_profiles cp ON cp.id = r.contractor_profile_id
     JOIN profiles p ON p.id = cp.profile_id
  WHERE r.is_verified = true AND r.reviewer_role = 'CUSTOMER'::text AND r.hidden_at IS NULL AND cp.approval_status = 'APPROVED'::approval_status AND NOT cp.directory_hidden AND p.account_status = 'ACTIVE'::account_status AND (NOT signup_fee_enabled() OR (p.signup_fee_status = ANY (ARRAY['PAID'::signup_fee_status, 'NOT_REQUIRED'::signup_fee_status])) OR (p.account_type <> ALL (ARRAY['CUSTOMER'::account_type, 'CONTRACTOR'::account_type])));

CREATE OR REPLACE VIEW public.contractor_public_ratings
WITH (security_invoker = false)
AS
 SELECT r.contractor_profile_id,
    round(avg(r.rating), 1) AS rating_average,
    count(*)::integer AS rating_count
   FROM booking_reviews r
     JOIN contractor_profiles cp ON cp.id = r.contractor_profile_id
     JOIN profiles p ON p.id = cp.profile_id
  WHERE r.is_verified = true AND r.reviewer_role = 'CUSTOMER'::text AND r.hidden_at IS NULL AND cp.approval_status = 'APPROVED'::approval_status AND NOT cp.directory_hidden AND p.account_status = 'ACTIVE'::account_status AND (NOT signup_fee_enabled() OR (p.signup_fee_status = ANY (ARRAY['PAID'::signup_fee_status, 'NOT_REQUIRED'::signup_fee_status])) OR (p.account_type <> ALL (ARRAY['CUSTOMER'::account_type, 'CONTRACTOR'::account_type])))
  GROUP BY r.contractor_profile_id;

CREATE OR REPLACE FUNCTION public.contractor_is_directory_listed(p_contractor_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_profiles cp
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE cp.id = p_contractor_profile_id
      AND cp.approval_status = 'APPROVED'
      AND p.account_status = 'ACTIVE'
      AND public.signup_fee_is_satisfied(cp.profile_id)
      AND NOT cp.directory_hidden
  );
$$;

CREATE OR REPLACE FUNCTION public.list_public_directory_contractors()
 RETURNS TABLE(id uuid, display_label text, primary_trade text, categories text[], service_area text, years_experience integer, rating_average numeric, rating_count integer, badges jsonb, short_description text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT
    cp.id,
    public.public_directory_label(cp.id),
    public.public_directory_primary_trade(cp.id),
    public.public_directory_categories(cp.id),
    coalesce(
      public.contractor_public_service_label(cp.id),
      'Local service area'
    ),
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
    AND NOT cp.directory_hidden
    AND public.signup_fee_is_satisfied(cp.profile_id)
  ORDER BY 2, cp.id;
$$;

CREATE OR REPLACE FUNCTION public.portfolio_storage_is_publicly_readable(p_object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_portfolio pf
    JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE pf.storage_path = p_object_name
      AND pf.privacy_state = 'PUBLIC_SAFE'
      AND cp.approval_status = 'APPROVED'
      AND p.account_status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.contractor_eligible_for_project(p_project_id uuid, p_contractor_profile_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  proj public.projects;
  loc_lat numeric;
  loc_lng numeric;
  cp public.contractor_profiles;
  acct public.profiles;
  cat public.service_categories;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR proj.category_id IS NULL THEN
    RETURN false;
  END IF;
  IF proj.status IN ('DRAFT', 'CANCELLED', 'CONTRACTOR_SELECTED') THEN
    RETURN false;
  END IF;

  SELECT lat, lng INTO loc_lat, loc_lng
  FROM public.project_private_locations
  WHERE project_id = p_project_id;
  SELECT * INTO cp FROM public.contractor_profiles WHERE id = p_contractor_profile_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  SELECT * INTO acct FROM public.profiles WHERE id = cp.profile_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  SELECT * INTO cat FROM public.service_categories WHERE id = proj.category_id;

  IF acct.account_type IS DISTINCT FROM 'CONTRACTOR' THEN
    RETURN false;
  END IF;
  IF acct.account_status IS DISTINCT FROM 'ACTIVE' THEN
    RETURN false;
  END IF;
  IF cp.approval_status IS DISTINCT FROM 'APPROVED' THEN
    RETURN false;
  END IF;
  IF NOT public.signup_fee_is_satisfied(acct.id) THEN RETURN false; END IF;
  IF cp.accepting_work IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contractor_services cs
    WHERE cs.contractor_profile_id = cp.id
      AND cs.category_id = proj.category_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contractor_service_areas a
    WHERE a.contractor_profile_id = cp.id
      AND public.location_matches(proj.zip_code, loc_lat, loc_lng, a)
  ) THEN
    RETURN false;
  END IF;

  IF cp.min_job_cents IS NOT NULL
     AND proj.budget_max_cents IS NOT NULL
     AND proj.budget_max_cents < cp.min_job_cents THEN
    RETURN false;
  END IF;
  IF cp.max_job_cents IS NOT NULL
     AND proj.budget_min_cents IS NOT NULL
     AND proj.budget_min_cents > cp.max_job_cents THEN
    RETURN false;
  END IF;

  IF cat.requires_verified_credential
     AND NOT EXISTS (
       SELECT 1
       FROM public.contractor_credentials cr
       WHERE cr.contractor_profile_id = cp.id
         AND cr.status = 'VERIFIED'
         AND (cr.expires_at IS NULL OR cr.expires_at >= CURRENT_DATE)
     ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_contractor_blocks b
    WHERE b.customer_profile_id = proj.customer_id
      AND b.contractor_profile_id = cp.id
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.profile_is_test_flagged(uuid);
