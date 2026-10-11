-- Rolls back 20261019600001_admin_profile_edits.
-- Restores the public directory predicate and approval guard from before this
-- migration. Drops the editor functions, profile_private_locations, and
-- directory_hidden. Does not delete audit_logs rows and does not touch payment tables.

CREATE OR REPLACE VIEW public.contractor_public_profiles
WITH (security_invoker = false)
AS
SELECT
  cp.id,
  public.public_directory_label(cp.id) AS display_label,
  public.public_directory_primary_trade(cp.id) AS primary_trade,
  cp.years_experience,
  public.public_safe_blurb(cp.headline, cp.bio) AS short_description,
  public.public_safe_about(cp.bio, cp.headline) AS about,
  cp.accepting_work,
  cp.created_at,
  coalesce(
    public.contractor_public_service_label(cp.id),
    'Local service area'
  ) AS service_area
FROM public.contractor_profiles cp
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

CREATE OR REPLACE VIEW public.contractor_public_services
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
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'))
  AND NOT public.public_service_is_other(sc.name)
  AND (
    btrim(cp.business_name) = ''
    OR lower(btrim(sc.name)) IS DISTINCT FROM lower(btrim(cp.business_name))
  );

CREATE OR REPLACE VIEW public.contractor_public_reviews
WITH (security_invoker = false)
AS
SELECT
  r.id,
  r.contractor_profile_id,
  r.rating,
  public.public_review_body(r.body, cp.business_name, p.first_name, p.last_name) AS body
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

CREATE OR REPLACE VIEW public.contractor_public_areas
WITH (security_invoker = false)
AS
SELECT
  a.id,
  a.contractor_profile_id,
  coalesce(
    public.contractor_public_service_label(a.contractor_profile_id),
    public.general_service_area(cp.service_area)
  ) AS label
FROM public.contractor_service_areas a
JOIN public.contractor_profiles cp ON cp.id = a.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

CREATE OR REPLACE VIEW public.contractor_public_portfolio
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
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'))
  AND NOT public.text_contains_pre_hire_contact(pf.title)
  AND NOT public.text_contains_pre_hire_contact(coalesce(pf.description, ''));

CREATE OR REPLACE VIEW public.contractor_public_ratings
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
  AND r.reviewer_role = 'CUSTOMER'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'))
GROUP BY r.contractor_profile_id;

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
    AND public.signup_fee_is_satisfied(cp.profile_id)
  ORDER BY 2, cp.id;
$$;


REVOKE ALL ON FUNCTION public.list_public_directory_contractors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_directory_contractors() TO anon, authenticated;

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
      AND public.signup_fee_is_satisfied(cp.profile_id)
  );
$$;

REVOKE ALL ON FUNCTION public.contractor_is_directory_listed(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_contractor_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    NEW.approval_status IS DISTINCT FROM OLD.approval_status
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
    OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
    OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
    OR NEW.info_requested_at IS DISTINCT FROM OLD.info_requested_at
    OR NEW.info_requested_by IS DISTINCT FROM OLD.info_requested_by
    OR NEW.info_request_message IS DISTINCT FROM OLD.info_request_message
  ) AND auth.uid() IS NOT NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'contractors cannot self-approve or change approval fields';
    END IF;
    IF NOT (
      public.ppp_rpc_is('admin_approve_contractor')
      OR public.ppp_rpc_is('admin_reject_contractor')
      OR public.ppp_rpc_is('admin_request_contractor_info')
    ) THEN
      RAISE EXCEPTION 'approval changes must go through admin RPCs';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_get_customer_editor(uuid);
DROP FUNCTION IF EXISTS public.admin_update_customer_profile(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.admin_get_contractor_editor(uuid);
DROP FUNCTION IF EXISTS public.admin_update_contractor_profile(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.admin_profile_edit_reason(text);
DROP FUNCTION IF EXISTS public.admin_profile_edit_step_up();
DROP FUNCTION IF EXISTS public.admin_normalize_phone(text);
DROP FUNCTION IF EXISTS public.admin_normalize_email(text);
DROP FUNCTION IF EXISTS public.admin_normalize_avatar(text);
DROP FUNCTION IF EXISTS public.admin_require_public_plain_text(text, text, integer);
DROP FUNCTION IF EXISTS public.admin_require_zip(text);
DROP FUNCTION IF EXISTS public.admin_reject_money_patch(jsonb);
DROP FUNCTION IF EXISTS public.admin_audit_text(text, text);
DROP FUNCTION IF EXISTS public.admin_audit_json(text, jsonb);

DROP TABLE IF EXISTS public.profile_private_locations;
ALTER TABLE public.contractor_profiles DROP COLUMN IF EXISTS directory_hidden;
