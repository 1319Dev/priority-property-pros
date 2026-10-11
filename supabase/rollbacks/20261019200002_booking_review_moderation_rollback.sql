-- Rolls back job-review moderation objects. Does not delete booking_reviews or content_reports.
-- Drops admin_moderation_step_up(). The platform-review pending migration creates the same
-- helper. If that migration is still applied, re-apply it after this rollback so its RPCs
-- can still call the helper.

DROP FUNCTION IF EXISTS public.admin_moderation_step_up();
DROP FUNCTION IF EXISTS public.admin_list_booking_reviews();
DROP FUNCTION IF EXISTS public.admin_hide_booking_review_response(uuid, text);
DROP FUNCTION IF EXISTS public.admin_restore_booking_review(uuid, text);
DROP FUNCTION IF EXISTS public.admin_hide_booking_review(uuid, text);
DROP FUNCTION IF EXISTS public.submit_booking_review_response(uuid, text);
DROP FUNCTION IF EXISTS public.report_booking_review(uuid, text);
DROP FUNCTION IF EXISTS public.booking_review_moderation_reason_is_rating_only(text);

DROP INDEX IF EXISTS public.content_reports_one_booking_review_report;

DROP FUNCTION IF EXISTS public.list_public_directory_reviews(uuid);
DROP VIEW IF EXISTS public.contractor_public_reviews;

CREATE VIEW public.contractor_public_reviews
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

GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;

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

GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;

CREATE FUNCTION public.list_public_directory_reviews(p_id uuid)
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

REVOKE ALL ON FUNCTION public.list_public_directory_reviews(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_directory_reviews(uuid) TO anon, authenticated;

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_hidden_reason_len,
  DROP CONSTRAINT IF EXISTS booking_reviews_response_len,
  DROP CONSTRAINT IF EXISTS booking_reviews_response_hidden_reason_len;

ALTER TABLE public.booking_reviews
  DROP COLUMN IF EXISTS contractor_response_hidden_reason,
  DROP COLUMN IF EXISTS contractor_response_hidden_at,
  DROP COLUMN IF EXISTS contractor_response_at,
  DROP COLUMN IF EXISTS contractor_response,
  DROP COLUMN IF EXISTS hidden_reason,
  DROP COLUMN IF EXISTS hidden_by,
  DROP COLUMN IF EXISTS hidden_at;
