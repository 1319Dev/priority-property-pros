-- Restores the previous admin_dashboard_summary body, including the old support sentence.
-- Does not touch payment rows.

CREATE OR REPLACE FUNCTION public.admin_dashboard_summary(p_include_test boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_include boolean := coalesce(p_include_test, false);
  v_month timestamp := date_trunc('month', now() AT TIME ZONE 'America/Chicago');
  v_homeowners bigint;
  v_contractors bigint;
  v_active_approved bigint;
  v_awaiting bigint;
  v_reverify bigint;
  v_posted bigint;
  v_open bigint;
  v_awaiting_estimates bigint;
  v_hired bigint;
  v_completed bigint;
  v_photos bigint;
  v_reviews bigint;
  v_reports bigint;
  v_disputes bigint;
  v_checkouts_completed bigint;
  v_checkouts_expired bigint;
  v_checkouts_open bigint;
  v_revenue bigint;
  v_revenue_month bigint;
BEGIN
  PERFORM public.admin_require();

  SELECT count(*) INTO v_homeowners
  FROM public.profiles p
  WHERE p.account_type::text = 'CUSTOMER'
    AND p.account_status::text <> 'DELETED'
    AND NOT public.admin_account_is_excluded(p.id, v_include);

  SELECT count(*) INTO v_contractors
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE p.account_type::text = 'CONTRACTOR'
    AND p.account_status::text <> 'DELETED'
    AND NOT public.admin_account_is_excluded(p.id, v_include);

  SELECT count(*) INTO v_active_approved
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE cp.approval_status::text = 'APPROVED'
    AND p.account_status::text = 'ACTIVE'
    AND NOT public.admin_account_is_excluded(p.id, v_include);

  SELECT count(*) INTO v_awaiting
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE cp.approval_status::text = 'PENDING'
    AND p.account_status::text <> 'DELETED'
    AND NOT public.admin_account_is_excluded(p.id, v_include);

  SELECT count(*) INTO v_reverify
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE cp.identity_review_required IS TRUE
    AND p.account_status::text <> 'DELETED'
    AND NOT public.admin_account_is_excluded(p.id, v_include);

  SELECT count(*) INTO v_posted
  FROM public.projects pr
  WHERE pr.posted_at IS NOT NULL
    AND NOT public.admin_account_is_excluded(pr.customer_id, v_include);

  SELECT count(*) INTO v_open
  FROM public.projects pr
  WHERE pr.status::text IN ('POSTED', 'MATCHING', 'CONTRACTORS_RESPONDING', 'ESTIMATES_AVAILABLE')
    AND NOT public.admin_account_is_excluded(pr.customer_id, v_include);

  SELECT count(*) INTO v_awaiting_estimates
  FROM public.projects pr
  WHERE pr.status::text IN ('POSTED', 'MATCHING', 'CONTRACTORS_RESPONDING')
    AND NOT public.admin_account_is_excluded(pr.customer_id, v_include)
    AND NOT EXISTS (
      SELECT 1
      FROM public.estimates e
      WHERE e.project_id = pr.id
        AND e.status::text IN ('SUBMITTED', 'REVISED', 'SENT', 'VIEWED', 'ACCEPTED')
    );

  SELECT count(*) INTO v_hired
  FROM public.bookings b
  WHERE b.status::text IN ('CONFIRMED', 'IN_PROGRESS')
    AND b.customer_hired_at IS NOT NULL
    AND b.contractor_hired_at IS NOT NULL
    AND NOT public.admin_account_is_excluded(b.customer_id, v_include)
    AND NOT EXISTS (
      SELECT 1
      FROM public.contractor_profiles cp
      WHERE cp.id = b.contractor_profile_id
        AND public.admin_account_is_excluded(cp.profile_id, v_include)
    );

  SELECT count(*) INTO v_completed
  FROM public.bookings b
  WHERE b.status::text = 'COMPLETED'
    AND NOT public.admin_account_is_excluded(b.customer_id, v_include)
    AND NOT EXISTS (
      SELECT 1
      FROM public.contractor_profiles cp
      WHERE cp.id = b.contractor_profile_id
        AND public.admin_account_is_excluded(cp.profile_id, v_include)
    );

  SELECT count(*) INTO v_photos
  FROM public.contractor_portfolio item
  JOIN public.contractor_profiles cp ON cp.id = item.contractor_profile_id
  WHERE item.privacy_state::text = 'REVIEW_REQUIRED'
    AND NOT public.admin_account_is_excluded(cp.profile_id, v_include);

  SELECT count(*) INTO v_reviews
  FROM public.platform_reviews r
  WHERE r.status::text = 'PENDING'
    AND NOT public.admin_account_is_excluded(r.user_id, v_include);

  SELECT count(*) INTO v_reports
  FROM public.content_reports r
  WHERE r.created_at >= now() - interval '30 days'
    AND NOT public.admin_account_is_excluded(r.reporter_id, v_include);

  SELECT count(*) INTO v_disputes
  FROM public.bookings b
  WHERE b.status::text = 'DISPUTED'
    AND NOT public.admin_account_is_excluded(b.customer_id, v_include)
    AND NOT EXISTS (
      SELECT 1
      FROM public.contractor_profiles cp
      WHERE cp.id = b.contractor_profile_id
        AND public.admin_account_is_excluded(cp.profile_id, v_include)
    );

  WITH fee_rows AS (
    SELECT c.amount_cents, coalesce(c.fulfilled_at, c.updated_at) AS recognized_at
    FROM public.signup_fee_charges c
    WHERE c.livemode IS TRUE
      AND c.status IN ('PAID', 'CONSUMED')
      AND NOT public.admin_account_is_excluded(c.profile_id, v_include)
    UNION ALL
    SELECT s.amount_cents, coalesce(s.fulfilled_at, s.updated_at)
    FROM public.connection_checkout_sessions s
    JOIN public.contractor_profiles cp ON cp.id = s.contractor_profile_id
    WHERE s.livemode IS TRUE
      AND s.status IN ('PAID', 'CONSUMED')
      AND NOT public.admin_account_is_excluded(cp.profile_id, v_include)
  )
  SELECT
    coalesce(sum(amount_cents), 0),
    coalesce(sum(amount_cents) FILTER (
      WHERE (recognized_at AT TIME ZONE 'America/Chicago') >= v_month
    ), 0)
  INTO v_revenue, v_revenue_month
  FROM fee_rows;

  SELECT
    count(*) FILTER (WHERE status IN ('PAID', 'CONSUMED')),
    count(*) FILTER (WHERE status = 'EXPIRED'),
    count(*) FILTER (WHERE status = 'OPEN')
  INTO v_checkouts_completed, v_checkouts_expired, v_checkouts_open
  FROM (
    SELECT c.status
    FROM public.signup_fee_charges c
    WHERE c.livemode IS TRUE
      AND NOT public.admin_account_is_excluded(c.profile_id, v_include)
    UNION ALL
    SELECT s.status
    FROM public.connection_checkout_sessions s
    JOIN public.contractor_profiles cp ON cp.id = s.contractor_profile_id
    WHERE s.livemode IS TRUE
      AND NOT public.admin_account_is_excluded(cp.profile_id, v_include)
  ) checkouts;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'include_test', v_include,
    'timezone', 'America/Chicago',
    'revenue_note', 'Gross activation and Connect fees only, before Stripe fees. Net revenue is not stored.',
    'metrics', jsonb_build_object(
      'homeowners', jsonb_build_object('value', v_homeowners, 'status', 'available', 'definition', 'profiles where account_type is CUSTOMER and account_status is not DELETED'),
      'contractors', jsonb_build_object('value', v_contractors, 'status', 'available', 'definition', 'contractor_profiles joined to a CONTRACTOR profile whose account_status is not DELETED'),
      'active_approved_contractors', jsonb_build_object('value', v_active_approved, 'status', 'available', 'definition', 'approval_status APPROVED and the profile account_status is ACTIVE'),
      'awaiting_approval', jsonb_build_object('value', v_awaiting, 'status', 'available', 'definition', 'contractor approval_status PENDING and the profile is not DELETED'),
      'identity_review_required', jsonb_build_object('value', v_reverify, 'status', 'available', 'definition', 'contractor_profiles.identity_review_required is true and the profile is not DELETED'),
      'projects_posted', jsonb_build_object('value', v_posted, 'status', 'available', 'definition', 'projects.posted_at is not null. Drafts are excluded'),
      'projects_open', jsonb_build_object('value', v_open, 'status', 'available', 'definition', 'projects.status in POSTED, MATCHING, CONTRACTORS_RESPONDING, ESTIMATES_AVAILABLE'),
      'awaiting_estimates', jsonb_build_object('value', v_awaiting_estimates, 'status', 'available', 'definition', 'open projects in POSTED, MATCHING, or CONTRACTORS_RESPONDING with no estimate in SUBMITTED, REVISED, SENT, VIEWED, or ACCEPTED'),
      'marked_hired', jsonb_build_object('value', v_hired, 'status', 'available', 'definition', 'bookings in CONFIRMED or IN_PROGRESS with both customer_hired_at and contractor_hired_at set'),
      'completed', jsonb_build_object('value', v_completed, 'status', 'available', 'definition', 'bookings.status COMPLETED'),
      'revenue_lifetime_cents', jsonb_build_object('value', v_revenue, 'status', 'available', 'definition', 'sum of amount_cents from livemode signup_fee_charges and connection_checkout_sessions in PAID or CONSUMED. Recognized at fulfilled_at, otherwise updated_at. Gross, before Stripe fees. Does not include estimates.fee_cents or contractor_fee_bps'),
      'revenue_month_cents', jsonb_build_object('value', v_revenue_month, 'status', 'available', 'definition', 'the same gross revenue whose recognized time falls in the current America/Chicago month'),
      'revenue_net_cents', jsonb_build_object('value', NULL, 'status', 'unavailable', 'definition', 'Stripe processor fees, refunds, and chargebacks are not stored'),
      'pending_photo_approvals', jsonb_build_object('value', v_photos, 'status', 'available', 'definition', 'contractor_portfolio.privacy_state REVIEW_REQUIRED'),
      'platform_reviews_pending', jsonb_build_object('value', v_reviews, 'status', 'available', 'definition', 'platform_reviews.status PENDING'),
      'content_reports_30d', jsonb_build_object('value', v_reports, 'status', 'available', 'definition', 'content_reports created in the last 30 days. The table has no status, so this is reports received, not an open queue'),
      'disputed_bookings', jsonb_build_object('value', v_disputes, 'status', 'available', 'definition', 'bookings.status DISPUTED'),
      'checkouts_completed', jsonb_build_object('value', v_checkouts_completed, 'status', 'available', 'definition', 'livemode activation and Connect checkouts in PAID or CONSUMED'),
      'checkouts_expired', jsonb_build_object('value', v_checkouts_expired, 'status', 'available', 'definition', 'livemode activation and Connect checkouts in EXPIRED. This is an abandoned Checkout, not a recorded card decline'),
      'checkouts_open', jsonb_build_object('value', v_checkouts_open, 'status', 'available', 'definition', 'livemode activation and Connect checkouts still OPEN'),
      'support_tickets', jsonb_build_object('value', NULL, 'status', 'unavailable', 'definition', 'No support_tickets table. Support today is email to prioritypropertypros@gmail.com'),
      'card_declines', jsonb_build_object('value', NULL, 'status', 'unavailable', 'definition', 'Card declines are not recorded. Stripe Checkout retries inside the session')
    )
  );
END;
$fn$;

COMMENT ON FUNCTION public.admin_dashboard_summary(boolean) IS
  'Admin-only read of command-center cards. SECURITY DEFINER, search_path public, gated by is_admin(). Gross fee cents only. Support tickets and net revenue are null/unavailable. Test-flagged profiles are excluded unless p_include_test.';

REVOKE ALL ON FUNCTION public.admin_dashboard_summary(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_summary(boolean) TO authenticated;
