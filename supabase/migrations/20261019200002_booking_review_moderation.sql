-- Job-review moderation. Does not change submit_booking_review, update_booking_review,
-- the 30-day edit window, the one-review-per-party rule, or the low-rating block.
-- Draft PR #117 adds audit rows to booking review submit and to that block.
-- This file does not replace those functions, so that audit survives either apply order.
-- Hiding keeps the row. A low star rating is not a reason to hide.
-- Admin hide, restore, and hide-response call admin_moderation_step_up(), which
-- invokes assert_admin_sensitive_step_up() only when PR #110 has created it.
-- The admin list RPC is read-only and does not call step-up.
-- Does not change card charges, fee amounts, or hiring.

ALTER TABLE public.booking_reviews
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hidden_reason text,
  ADD COLUMN IF NOT EXISTS contractor_response text,
  ADD COLUMN IF NOT EXISTS contractor_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS contractor_response_hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS contractor_response_hidden_reason text;

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_hidden_reason_len;
ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_hidden_reason_len
  CHECK (hidden_at IS NULL OR char_length(btrim(hidden_reason)) BETWEEN 20 AND 500);

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_response_len;
ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_response_len
  CHECK (contractor_response IS NULL OR char_length(btrim(contractor_response)) BETWEEN 20 AND 500);

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_response_hidden_reason_len;
ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_response_hidden_reason_len
  CHECK (
    contractor_response_hidden_at IS NULL
    OR char_length(btrim(contractor_response_hidden_reason)) BETWEEN 20 AND 500
  );

CREATE UNIQUE INDEX IF NOT EXISTS content_reports_one_booking_review_report
  ON public.content_reports (reporter_id, target_id)
  WHERE target_type = 'booking_review';

-- Leftover text shorter than 12 characters, after rating words are removed, is not evidence.
CREATE OR REPLACE FUNCTION public.booking_review_moderation_reason_is_rating_only(p_reason text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_text text;
BEGIN
  v_text := lower(regexp_replace(coalesce(p_reason, ''), '[^a-z0-9]+', ' ', 'g'));
  v_text := regexp_replace(
    v_text,
    '\m(stars|star|ratings|rating|scores|score|negative|low|bad|poor|one|two|three|because|only|just|too|reviews|review|the|an|of|a|1|2|3)\M',
    ' ',
    'g'
  );
  v_text := btrim(regexp_replace(v_text, '\s+', ' ', 'g'));
  RETURN char_length(v_text) < 12;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_booking_review(p_review_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.booking_reviews%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_report_id uuid;
  v_contractor uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_reason) < 3 OR char_length(v_reason) > 200 THEN
    RAISE EXCEPTION 'a report reason must be 3 to 200 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_review
  FROM public.booking_reviews
  WHERE id = p_review_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'P0002';
  END IF;

  v_contractor := public.current_contractor_profile_id();
  IF v_review.reviewer_role = 'CUSTOMER' THEN
    IF auth.uid() = v_review.customer_id OR v_contractor IS DISTINCT FROM v_review.contractor_profile_id THEN
      RAISE EXCEPTION 'only the other party can report this review' USING ERRCODE = '42501';
    END IF;
  ELSIF v_review.reviewer_role = 'CONTRACTOR' THEN
    IF v_contractor = v_review.contractor_profile_id OR auth.uid() IS DISTINCT FROM v_review.customer_id THEN
      RAISE EXCEPTION 'only the other party can report this review' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'only the other party can report this review' USING ERRCODE = '42501';
  END IF;

  BEGIN
    INSERT INTO public.content_reports (reporter_id, target_type, target_id, reason)
    VALUES (auth.uid(), 'booking_review', v_review.id, v_reason)
    RETURNING id INTO v_report_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'you already reported this review' USING ERRCODE = '23505';
  END;

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking_review.reported',
    'booking_reviews',
    v_review.id,
    jsonb_build_object('report_id', v_report_id, 'reason', v_reason, 'reviewer_role', v_review.reviewer_role)
  );

  RETURN jsonb_build_object('report_id', v_report_id, 'review_id', v_review.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_booking_review_response(p_review_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.booking_reviews%ROWTYPE;
  v_body text := btrim(coalesce(p_body, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF public.current_contractor_profile_id() IS NULL THEN
    RAISE EXCEPTION 'only the contractor on this job can post a public response' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_review
  FROM public.booking_reviews
  WHERE id = p_review_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.current_contractor_profile_id() IS DISTINCT FROM v_review.contractor_profile_id THEN
    RAISE EXCEPTION 'only the contractor on this job can post a public response' USING ERRCODE = '42501';
  END IF;
  IF v_review.reviewer_role IS DISTINCT FROM 'CUSTOMER' THEN
    RAISE EXCEPTION 'a public response can only be added to the customer''s review' USING ERRCODE = '22023';
  END IF;
  IF v_review.contractor_response IS NOT NULL THEN
    RAISE EXCEPTION 'a public response is already posted' USING ERRCODE = '23505';
  END IF;
  IF char_length(v_body) < 20 OR char_length(v_body) > 500 THEN
    RAISE EXCEPTION 'a public response must be 20 to 500 characters' USING ERRCODE = '22023';
  END IF;
  IF public.text_contains_contact_info(v_body) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message() USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('ppp.rpc', 'submit_booking_review_response', true);
  UPDATE public.booking_reviews
  SET contractor_response = v_body,
      contractor_response_at = now()
  WHERE id = v_review.id
    AND contractor_response IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'a public response is already posted' USING ERRCODE = '23505';
  END IF;

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking_review.response_posted',
    'booking_reviews',
    v_review.id,
    jsonb_build_object('length', char_length(v_body))
  );

  RETURN jsonb_build_object('review_id', v_review.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_moderation_step_up()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- PR #110 migration 20261019000001 owns assert_admin_sensitive_step_up().
  -- No-op until that function exists. When it exists, it is itself a no-op
  -- while admin_mfa_required is 0. The same body is created by the platform-review
  -- pending migration, so whichever file applies last leaves this helper in place.
  IF to_regprocedure('public.assert_admin_sensitive_step_up()') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'SELECT public.assert_admin_sensitive_step_up()';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_moderation_step_up() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.admin_moderation_step_up() IS
  'Calls assert_admin_sensitive_step_up() when that function exists. No-op otherwise, so this migration can apply before or after PR #110.';

CREATE OR REPLACE FUNCTION public.admin_hide_booking_review(p_review_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.booking_reviews%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public.admin_moderation_step_up();
  IF char_length(v_reason) < 20 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'a moderation reason must be 20 to 500 characters' USING ERRCODE = '22023';
  END IF;
  IF public.booking_review_moderation_reason_is_rating_only(v_reason) THEN
    RAISE EXCEPTION 'a review cannot be hidden only because of its rating' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_review
  FROM public.booking_reviews
  WHERE id = p_review_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_review.hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'this review is already hidden' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('ppp.rpc', 'admin_hide_booking_review', true);
  UPDATE public.booking_reviews
  SET hidden_at = now(),
      hidden_by = auth.uid(),
      hidden_reason = v_reason
  WHERE id = v_review.id
    AND hidden_at IS NULL;

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking_review.hidden',
    'booking_reviews',
    v_review.id,
    jsonb_build_object(
      'reason', v_reason,
      'rating', v_review.rating,
      'reviewer_role', v_review.reviewer_role
    )
  );

  RETURN jsonb_build_object('review_id', v_review.id, 'hidden', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_booking_review(p_review_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.booking_reviews%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public.admin_moderation_step_up();
  IF char_length(v_reason) < 20 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'a moderation reason must be 20 to 500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_review
  FROM public.booking_reviews
  WHERE id = p_review_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_review.hidden_at IS NULL THEN
    RAISE EXCEPTION 'this review is not hidden' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('ppp.rpc', 'admin_restore_booking_review', true);
  UPDATE public.booking_reviews
  SET hidden_at = NULL,
      hidden_by = NULL,
      hidden_reason = NULL
  WHERE id = v_review.id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking_review.restored',
    'booking_reviews',
    v_review.id,
    jsonb_build_object('reason', v_reason, 'rating', v_review.rating)
  );

  RETURN jsonb_build_object('review_id', v_review.id, 'hidden', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_hide_booking_review_response(p_review_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.booking_reviews%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public.admin_moderation_step_up();
  IF char_length(v_reason) < 20 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'a moderation reason must be 20 to 500 characters' USING ERRCODE = '22023';
  END IF;
  IF public.booking_review_moderation_reason_is_rating_only(v_reason) THEN
    RAISE EXCEPTION 'a review cannot be hidden only because of its rating' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_review
  FROM public.booking_reviews
  WHERE id = p_review_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_review.contractor_response IS NULL THEN
    RAISE EXCEPTION 'this review has no public response' USING ERRCODE = '22023';
  END IF;
  IF v_review.contractor_response_hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'this response is already hidden' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('ppp.rpc', 'admin_hide_booking_review_response', true);
  UPDATE public.booking_reviews
  SET contractor_response_hidden_at = now(),
      contractor_response_hidden_reason = v_reason
  WHERE id = v_review.id
    AND contractor_response_hidden_at IS NULL;

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking_review.response_hidden',
    'booking_reviews',
    v_review.id,
    jsonb_build_object('reason', v_reason, 'rating', v_review.rating)
  );

  RETURN jsonb_build_object('review_id', v_review.id, 'response_hidden', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_booking_reviews()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(item ORDER BY item ->> 'created_at' DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', r.id,
        'booking_id', r.booking_id,
        'reviewer_role', r.reviewer_role,
        'rating', r.rating,
        'body', r.body,
        'created_at', r.created_at,
        'hidden_at', r.hidden_at,
        'hidden_reason', r.hidden_reason,
        'contractor_response', r.contractor_response,
        'contractor_response_at', r.contractor_response_at,
        'contractor_response_hidden_at', r.contractor_response_hidden_at,
        'contractor_response_hidden_reason', r.contractor_response_hidden_reason,
        'reports', coalesce((
          SELECT jsonb_agg(jsonb_build_object('reason', c.reason, 'created_at', c.created_at) ORDER BY c.created_at)
          FROM public.content_reports c
          WHERE c.target_type = 'booking_review'
            AND c.target_id = r.id
        ), '[]'::jsonb)
      ) AS item
      FROM public.booking_reviews r
    ) listed
  ), '[]'::jsonb);
END;
$$;

-- Same listing rules as 20261012000003, plus hidden rows excluded.
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
  AND r.hidden_at IS NULL
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'))
GROUP BY r.contractor_profile_id;

-- Same redaction as 20261013000004. contractor_response is appended.
-- A hidden review drops out. A hidden response stays off the public row.
CREATE OR REPLACE VIEW public.contractor_public_reviews
WITH (security_invoker = false)
AS
SELECT
  r.id,
  r.contractor_profile_id,
  r.rating,
  public.public_review_body(r.body, cp.business_name, p.first_name, p.last_name) AS body,
  CASE
    WHEN r.contractor_response_hidden_at IS NOT NULL THEN NULL
    WHEN r.contractor_response IS NULL OR btrim(r.contractor_response) = '' THEN NULL
    WHEN public.text_contains_contact_info(r.contractor_response) THEN NULL
    ELSE public.public_review_body(r.contractor_response, cp.business_name, p.first_name, p.last_name)
  END AS contractor_response
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND r.hidden_at IS NULL
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

COMMENT ON VIEW public.contractor_public_reviews IS
  'Verified customer reviews that are not hidden. Contact text and this contractor''s business or personal name are replaced with a generic line. A hidden contractor response is omitted.';

DROP FUNCTION IF EXISTS public.list_public_directory_reviews(uuid);

CREATE FUNCTION public.list_public_directory_reviews(p_id uuid)
RETURNS TABLE (
  id uuid,
  rating smallint,
  body text,
  contractor_response text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.rating, r.body, r.contractor_response
  FROM public.contractor_public_reviews r
  WHERE r.contractor_profile_id = p_id
    AND public.contractor_is_directory_listed(p_id)
  ORDER BY r.id;
$$;

COMMENT ON FUNCTION public.list_public_directory_reviews(uuid) IS
  'Verified visible PPP review bodies and a contractor response when one is public. No customer identity and no business name.';

REVOKE ALL ON FUNCTION public.booking_review_moderation_reason_is_rating_only(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_booking_review(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_booking_review_response(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_hide_booking_review(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_restore_booking_review(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_hide_booking_review_response(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_booking_reviews() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_public_directory_reviews(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.report_booking_review(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_booking_review_response(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hide_booking_review(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_booking_review(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hide_booking_review_response(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_booking_reviews() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_directory_reviews(uuid) TO anon, authenticated;

GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;
GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;
