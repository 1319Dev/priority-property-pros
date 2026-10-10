-- Read-only admin command center aggregates.
-- Additive. Does not change fees, Stripe, webhooks, RLS on existing tables,
-- matching, hiring, contact unlock, portfolio rules, or admin_mfa_required.
-- Does not seed admin_account_flags. Proposed seed SQL is in the PR description.
--
-- Metric definitions (America/Chicago where a clock is involved):
--   homeowners: profiles.account_type CUSTOMER and account_status <> DELETED.
--   contractors: contractor_profiles joined to a CONTRACTOR profile that is not DELETED.
--   active_approved_contractors: approval_status APPROVED and profile account_status ACTIVE.
--   awaiting_approval: contractor approval_status PENDING.
--   identity_review_required: contractor_profiles.identity_review_required.
--   projects_posted: projects.posted_at IS NOT NULL (drafts excluded).
--   projects_open: status in POSTED, MATCHING, CONTRACTORS_RESPONDING, ESTIMATES_AVAILABLE.
--   awaiting_estimates: open projects in POSTED, MATCHING, or CONTRACTORS_RESPONDING
--     with no estimate in SUBMITTED, REVISED, SENT, VIEWED, or ACCEPTED.
--   marked_hired: a booking in CONFIRMED or IN_PROGRESS with both hired timestamps set.
--   completed: bookings.status COMPLETED.
--   revenue: signup_fee_charges UNION connection_checkout_sessions
--     where livemode and status in (PAID, CONSUMED). Amount is amount_cents.
--     Recognized at fulfilled_at, else updated_at. Gross only.
--     This never reads estimates.fee_cents or contractor_fee_bps.
--   revenue this month: recognized_at >= the current America/Chicago month.
--   pending_photo_approvals: contractor_portfolio.privacy_state REVIEW_REQUIRED.
--   platform_reviews_pending: platform_reviews.status PENDING.
--   content_reports_30d: content_reports.created_at in the last 30 days.
--     There is no status column, so this is reports received, not open reports.
--   disputed_bookings: bookings.status DISPUTED.
--   support_tickets: unavailable. No support table exists.
--   revenue_net_cents: unavailable. Processor fees and refunds are not stored.
--   card_declines: unavailable. Checkout retries inside the Stripe session.
--
-- p_include_test false hides profiles flagged TEST in admin_account_flags.
-- Projects, estimates, bookings, and fee rows inherit that flag through
-- customer_id or contractor_profiles.profile_id. OWNER and INTERNAL are not excluded.

CREATE TABLE public.admin_account_flags (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  flag text NOT NULL,
  note text,
  set_by uuid REFERENCES public.profiles (id),
  set_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_account_flags_flag_check CHECK (flag IN ('TEST', 'OWNER', 'INTERNAL')),
  CONSTRAINT admin_account_flags_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);

COMMENT ON TABLE public.admin_account_flags IS
  'Admin-only label for command-center counts. TEST is excluded from aggregates unless p_include_test. OWNER is not excluded. No client write policy; changes go through admin_set_account_flag.';

ALTER TABLE public.admin_account_flags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_account_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_account_flags TO authenticated;

CREATE POLICY admin_account_flags_select_admin
  ON public.admin_account_flags
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS profiles_account_type_created_idx
  ON public.profiles (account_type, created_at);

CREATE INDEX IF NOT EXISTS bookings_status_completed_idx
  ON public.bookings (status, completed_at);

CREATE INDEX IF NOT EXISTS connection_checkout_sessions_status_fulfilled_idx
  ON public.connection_checkout_sessions (status, fulfilled_at);

CREATE INDEX IF NOT EXISTS signup_fee_charges_status_fulfilled_idx
  ON public.signup_fee_charges (status, fulfilled_at);

CREATE INDEX IF NOT EXISTS content_reports_created_idx
  ON public.content_reports (created_at);

-- contractor_profiles_approval_status_idx already exists. Do not recreate it.

CREATE OR REPLACE FUNCTION public.admin_account_is_excluded(p_profile_id uuid, p_include_test boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT NOT coalesce(p_include_test, false)
    AND p_profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_account_flags f
      WHERE f.profile_id = p_profile_id
        AND f.flag = 'TEST'
    );
$fn$;

COMMENT ON FUNCTION public.admin_account_is_excluded(uuid, boolean) IS
  'Internal. True when a profile is flagged TEST and the caller did not ask to include test data. Not granted to clients.';

REVOKE ALL ON FUNCTION public.admin_account_is_excluded(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_require()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.admin_require() IS
  'Internal gate. Raises 42501 unless public.is_admin() (which honors admin_mfa_required). Not granted to clients.';

REVOKE ALL ON FUNCTION public.admin_require() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_account_flag(
  p_profile_id uuid,
  p_flag text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_flag text := upper(btrim(coalesce(p_flag, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM public.admin_require();

  IF p_profile_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_flag NOT IN ('TEST', 'OWNER', 'INTERNAL') THEN
    RAISE EXCEPTION 'flag must be TEST, OWNER, or INTERNAL' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'note is too long' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_account_flags (profile_id, flag, note, set_by, set_at)
  VALUES (p_profile_id, v_flag, v_note, auth.uid(), now())
  ON CONFLICT (profile_id) DO UPDATE
    SET flag = EXCLUDED.flag,
        note = EXCLUDED.note,
        set_by = EXCLUDED.set_by,
        set_at = now();

  PERFORM public.write_audit_log(
    auth.uid(),
    'admin.account_flag_set',
    'profile',
    p_profile_id,
    jsonb_build_object('flag', v_flag, 'note', v_note)
  );

  RETURN jsonb_build_object('profile_id', p_profile_id, 'flag', v_flag);
END;
$fn$;

COMMENT ON FUNCTION public.admin_set_account_flag(uuid, text, text) IS
  'Admin-only upsert of a TEST, OWNER, or INTERNAL flag. Writes audit_logs. Does not change the profile row.';

REVOKE ALL ON FUNCTION public.admin_set_account_flag(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_account_flag(uuid, text, text) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.admin_needs_attention(p_include_test boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_include boolean := coalesce(p_include_test, false);
  v_items jsonb := '[]'::jsonb;
  v_count bigint;
  v_mfa text := 'unavailable';
BEGIN
  PERFORM public.admin_require();

  SELECT count(*) INTO v_count
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE cp.approval_status::text = 'PENDING'
    AND p.account_status::text <> 'DELETED'
    AND NOT public.admin_account_is_excluded(p.id, v_include);
  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'contractors_pending', 'count', v_count, 'severity', 'high',
      'link', '/app/admin/approvals', 'note', 'Contractor applications waiting for a decision'
    ));
  END IF;

  SELECT count(*) INTO v_count
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE cp.identity_review_required IS TRUE
    AND p.account_status::text <> 'DELETED'
    AND NOT public.admin_account_is_excluded(p.id, v_include);
  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'identity_review', 'count', v_count, 'severity', 'medium',
      'link', '/app/admin/approvals', 'note', 'Approved contractors flagged for identity re-verification'
    ));
  END IF;

  SELECT count(*) INTO v_count
  FROM public.contractor_portfolio item
  JOIN public.contractor_profiles cp ON cp.id = item.contractor_profile_id
  WHERE item.privacy_state::text = 'REVIEW_REQUIRED'
    AND NOT public.admin_account_is_excluded(cp.profile_id, v_include);
  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'photos_pending', 'count', v_count, 'severity', 'medium',
      'link', '/app/admin/approvals', 'note', 'Portfolio photos in REVIEW_REQUIRED'
    ));
  END IF;

  SELECT count(*) INTO v_count
  FROM public.platform_reviews r
  WHERE r.status::text = 'PENDING'
    AND NOT public.admin_account_is_excluded(r.user_id, v_include);
  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'platform_reviews_pending', 'count', v_count, 'severity', 'medium',
      'link', '/app/admin/reviews', 'note', 'Platform reviews waiting for approve or reject'
    ));
  END IF;

  SELECT count(*) INTO v_count
  FROM public.content_reports r
  WHERE r.created_at >= now() - interval '30 days'
    AND NOT public.admin_account_is_excluded(r.reporter_id, v_include);
  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'content_reports_30d', 'count', v_count, 'severity', 'medium',
      'link', NULL, 'note', 'Reports received in the last 30 days. There is no resolve status yet, and no admin screen for them'
    ));
  END IF;

  SELECT count(*) INTO v_count
  FROM public.bookings b
  WHERE b.status::text = 'DISPUTED'
    AND NOT public.admin_account_is_excluded(b.customer_id, v_include)
    AND NOT EXISTS (
      SELECT 1 FROM public.contractor_profiles cp
      WHERE cp.id = b.contractor_profile_id
        AND public.admin_account_is_excluded(cp.profile_id, v_include)
    );
  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'disputed_bookings', 'count', v_count, 'severity', 'high',
      'link', NULL, 'note', 'Bookings marked DISPUTED. There is no dispute desk yet'
    ));
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT c.profile_id AS subject_id
    FROM public.signup_fee_charges c
    WHERE c.livemode IS TRUE AND c.needs_refund IS TRUE
    UNION ALL
    SELECT cp.profile_id
    FROM public.connection_checkout_sessions s
    JOIN public.contractor_profiles cp ON cp.id = s.contractor_profile_id
    WHERE s.livemode IS TRUE AND s.needs_refund IS TRUE
  ) rows
  WHERE NOT public.admin_account_is_excluded(rows.subject_id, v_include);
  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'checkouts_needs_refund', 'count', v_count, 'severity', 'high',
      'link', NULL, 'note', 'Livemode checkouts flagged needs_refund. This screen does not call Stripe'
    ));
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT c.profile_id AS subject_id
    FROM public.signup_fee_charges c
    WHERE c.livemode IS TRUE AND c.status = 'OPEN' AND c.created_at < now() - interval '24 hours'
    UNION ALL
    SELECT cp.profile_id
    FROM public.connection_checkout_sessions s
    JOIN public.contractor_profiles cp ON cp.id = s.contractor_profile_id
    WHERE s.livemode IS TRUE AND s.status = 'OPEN' AND s.created_at < now() - interval '24 hours'
  ) rows
  WHERE NOT public.admin_account_is_excluded(rows.subject_id, v_include);
  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'checkouts_stuck', 'count', v_count, 'severity', 'medium',
      'link', NULL, 'note', 'Livemode checkouts still OPEN after 24 hours'
    ));
  END IF;

  SELECT count(*) INTO v_count
  FROM public.projects pr
  WHERE pr.posted_at IS NOT NULL
    AND pr.posted_at < now() - interval '7 days'
    AND pr.status::text IN ('POSTED', 'MATCHING', 'CONTRACTORS_RESPONDING')
    AND NOT public.admin_account_is_excluded(pr.customer_id, v_include)
    AND NOT EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.project_id = pr.id
        AND e.status::text IN ('SUBMITTED', 'REVISED', 'SENT', 'VIEWED', 'ACCEPTED')
    );
  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'projects_waiting', 'count', v_count, 'severity', 'medium',
      'link', NULL, 'note', 'Projects posted more than 7 days ago with no estimate yet'
    ));
  END IF;

  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM auth.mfa_factors f
      WHERE f.user_id = auth.uid()
        AND f.status = 'verified'
    ) THEN
      v_mfa := 'enrolled';
    ELSE
      v_mfa := 'missing';
    END IF;
  END IF;

  IF v_mfa = 'missing' THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'admin_mfa_missing', 'count', 1, 'severity', 'medium',
      'link', '/app/admin/security',
      'note', 'Two-factor is not enrolled on this admin account. Enforcement stays off until you turn it on'
    ));
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'include_test', v_include,
    'mfa', v_mfa,
    'items', v_items
  );
END;
$fn$;

COMMENT ON FUNCTION public.admin_needs_attention(boolean) IS
  'Admin-only attention list. Reads auth.mfa_factors for auth.uid() only. Omits zero counts. Links only where an admin screen exists. Support tickets are not invented.';

REVOKE ALL ON FUNCTION public.admin_needs_attention(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_needs_attention(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_recent_activity(
  p_limit integer DEFAULT 25,
  p_cursor text DEFAULT NULL,
  p_include_test boolean DEFAULT false
)
RETURNS TABLE (
  occurred_at timestamptz,
  kind text,
  label text,
  job_reference text,
  subject_label text,
  owner_activity boolean,
  cursor text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_include boolean := coalesce(p_include_test, false);
  v_before timestamptz;
  v_kind text;
  v_id uuid;
BEGIN
  PERFORM public.admin_require();

  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    BEGIN
      v_before := (split_part(p_cursor, '|', 1) || ' UTC')::timestamptz;
      v_kind := split_part(p_cursor, '|', 2);
      v_id := split_part(p_cursor, '|', 3)::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION 'invalid cursor' USING ERRCODE = '22023';
    END;
    IF v_kind IS NULL OR v_kind = '' OR v_id IS NULL THEN
      RAISE EXCEPTION 'invalid cursor' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN QUERY
  WITH events AS (
    SELECT
      a.created_at AS occurred_at,
      a.action AS kind,
      CASE a.action
        WHEN 'profile.created' THEN 'Account created'
        WHEN 'contractor.approved' THEN 'Contractor approved'
        WHEN 'contractor.approved_via_sql' THEN 'Contractor approved'
        WHEN 'contractor.rejected' THEN 'Contractor rejected'
        WHEN 'contractor.info_requested' THEN 'More information requested'
        WHEN 'admin.promoted_via_sql' THEN 'Admin access granted'
        WHEN 'opportunity.accepted' THEN 'Opportunity accepted'
        WHEN 'opportunity.ended' THEN 'Opportunity ended'
        WHEN 'project.posted' THEN 'Project posted'
        WHEN 'project.deleted' THEN 'Project deleted'
        WHEN 'estimate.submitted' THEN 'Estimate submitted'
        WHEN 'estimate.revised' THEN 'Estimate revised'
        WHEN 'estimate.selected' THEN 'Estimate selected'
        WHEN 'signup_fee.paid' THEN 'Activation fee paid'
        WHEN 'contact.shared' THEN 'Contact shared'
        WHEN 'booking.contact_access.granted' THEN 'Contact access granted'
        WHEN 'booking.contact_access.revoked' THEN 'Contact access revoked'
        WHEN 'content.report' THEN 'Content report filed'
        WHEN 'portfolio.privacy_set' THEN 'Portfolio photo reviewed'
        WHEN 'admin.account_flag_set' THEN 'Account flag updated'
        ELSE NULL
      END AS label,
      CASE
        WHEN a.entity_type IN ('project', 'projects') THEN (
          SELECT pr.reference_number FROM public.projects pr WHERE pr.id = a.entity_id
        )
        WHEN a.entity_type IN ('booking', 'bookings') THEN (
          SELECT pr.reference_number
          FROM public.bookings b
          JOIN public.projects pr ON pr.id = b.project_id
          WHERE b.id = a.entity_id
        )
        WHEN a.entity_type IN ('estimate', 'estimates') THEN (
          SELECT pr.reference_number
          FROM public.estimates e
          JOIN public.projects pr ON pr.id = e.project_id
          WHERE e.id = a.entity_id
        )
        ELSE NULL
      END AS reference_number,
      a.actor_id AS subject_id,
      a.id AS source_id,
      public.admin_account_is_excluded(a.actor_id, v_include) AS excluded
    FROM public.audit_logs a
    WHERE a.action IN (
      'profile.created', 'contractor.approved', 'contractor.approved_via_sql', 'contractor.rejected',
      'contractor.info_requested', 'admin.promoted_via_sql', 'opportunity.accepted', 'opportunity.ended',
      'project.posted', 'project.deleted', 'estimate.submitted', 'estimate.revised', 'estimate.selected',
      'signup_fee.paid', 'contact.shared', 'booking.contact_access.granted', 'booking.contact_access.revoked',
      'content.report', 'portfolio.privacy_set', 'admin.account_flag_set'
    )

    UNION ALL

    SELECT
      coalesce(s.fulfilled_at, s.updated_at),
      'connection_fee.paid',
      'Connect fee paid',
      (SELECT pr.reference_number FROM public.projects pr WHERE pr.id = s.project_id),
      cp.profile_id,
      s.id,
      public.admin_account_is_excluded(cp.profile_id, v_include)
    FROM public.connection_checkout_sessions s
    JOIN public.contractor_profiles cp ON cp.id = s.contractor_profile_id
    WHERE s.livemode IS TRUE
      AND s.status IN ('PAID', 'CONSUMED')
      AND coalesce(s.fulfilled_at, s.updated_at) IS NOT NULL

    UNION ALL

    SELECT
      greatest(b.customer_hired_at, b.contractor_hired_at),
      'booking.hired',
      'Marked hired',
      (SELECT pr.reference_number FROM public.projects pr WHERE pr.id = b.project_id),
      b.customer_id,
      b.id,
      public.admin_account_is_excluded(b.customer_id, v_include)
        OR EXISTS (
          SELECT 1 FROM public.contractor_profiles cp
          WHERE cp.id = b.contractor_profile_id
            AND public.admin_account_is_excluded(cp.profile_id, v_include)
        )
    FROM public.bookings b
    WHERE b.customer_hired_at IS NOT NULL
      AND b.contractor_hired_at IS NOT NULL
      AND b.status::text <> 'CANCELLED'

    UNION ALL

    SELECT
      b.completed_at,
      'booking.completed',
      'Job completed',
      (SELECT pr.reference_number FROM public.projects pr WHERE pr.id = b.project_id),
      b.customer_id,
      b.id,
      public.admin_account_is_excluded(b.customer_id, v_include)
        OR EXISTS (
          SELECT 1 FROM public.contractor_profiles cp
          WHERE cp.id = b.contractor_profile_id
            AND public.admin_account_is_excluded(cp.profile_id, v_include)
        )
    FROM public.bookings b
    WHERE b.status::text = 'COMPLETED'
      AND b.completed_at IS NOT NULL
  ),
  visible AS (
    SELECT
      e.occurred_at,
      e.kind,
      e.label,
      CASE WHEN e.reference_number IS NULL THEN NULL ELSE 'PPP-' || e.reference_number::text END AS job_reference,
      coalesce(
        (
          SELECT NULLIF(btrim(cp.business_name), '')
          FROM public.contractor_profiles cp
          WHERE cp.profile_id = e.subject_id
          ORDER BY cp.created_at
          LIMIT 1
        ),
        (
          SELECT NULLIF(btrim(p.first_name), '')
          FROM public.profiles p
          WHERE p.id = e.subject_id
        ),
        'Member'
      ) AS subject_label,
      EXISTS (
        SELECT 1
        FROM public.admin_account_flags f
        WHERE f.profile_id = e.subject_id
          AND f.flag = 'OWNER'
      ) AS owner_activity,
      e.source_id
    FROM events e
    WHERE e.label IS NOT NULL
      AND e.occurred_at IS NOT NULL
      AND NOT e.excluded
      AND (
        v_before IS NULL
        OR (e.occurred_at, e.kind, e.source_id) < (v_before, v_kind, v_id)
      )
  )
  SELECT
    v.occurred_at,
    v.kind,
    v.label,
    v.job_reference,
    v.subject_label,
    v.owner_activity,
    to_char(v.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')
      || '|' || v.kind || '|' || v.source_id::text
  FROM visible v
  ORDER BY v.occurred_at DESC, v.kind DESC, v.source_id DESC
  LIMIT v_limit;
END;
$fn$;

COMMENT ON FUNCTION public.admin_recent_activity(integer, text, boolean) IS
  'Admin-only keyset activity feed. Allow-listed audit actions plus Connect payments and hire/complete timestamps. Returns a label, PPP job reference, business name or first name, and an owner badge. Never returns email, phone, address, or raw metadata.';

REVOKE ALL ON FUNCTION public.admin_recent_activity(integer, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recent_activity(integer, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard_trends(
  p_granularity text,
  p_from date,
  p_to date,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_granularity text := lower(btrim(coalesce(p_granularity, '')));
  v_include boolean := coalesce(p_include_test, false);
  v_step interval;
  v_buckets jsonb;
BEGIN
  PERFORM public.admin_require();

  IF v_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'granularity must be day, week, or month' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR (p_to - p_from) > 366 THEN
    RAISE EXCEPTION 'range must be at most 366 days' USING ERRCODE = '22023';
  END IF;

  v_step := CASE v_granularity
    WHEN 'day' THEN interval '1 day'
    WHEN 'week' THEN interval '1 week'
    ELSE interval '1 month'
  END;

  WITH buckets AS (
    SELECT gs::date AS bucket_start
    FROM generate_series(
      date_trunc(v_granularity, p_from::timestamp),
      date_trunc(v_granularity, p_to::timestamp),
      v_step
    ) AS gs
  ),
  revenue AS (
    SELECT
      date_trunc(v_granularity, ((coalesce(c.fulfilled_at, c.updated_at) AT TIME ZONE 'America/Chicago'))::timestamp)::date AS bucket_start,
      sum(c.amount_cents)::bigint AS cents
    FROM public.signup_fee_charges c
    WHERE c.livemode IS TRUE
      AND c.status IN ('PAID', 'CONSUMED')
      AND NOT public.admin_account_is_excluded(c.profile_id, v_include)
      AND (coalesce(c.fulfilled_at, c.updated_at) AT TIME ZONE 'America/Chicago')::date BETWEEN p_from AND p_to
    GROUP BY 1
    UNION ALL
    SELECT
      date_trunc(v_granularity, ((coalesce(s.fulfilled_at, s.updated_at) AT TIME ZONE 'America/Chicago'))::timestamp)::date,
      sum(s.amount_cents)::bigint
    FROM public.connection_checkout_sessions s
    JOIN public.contractor_profiles cp ON cp.id = s.contractor_profile_id
    WHERE s.livemode IS TRUE
      AND s.status IN ('PAID', 'CONSUMED')
      AND NOT public.admin_account_is_excluded(cp.profile_id, v_include)
      AND (coalesce(s.fulfilled_at, s.updated_at) AT TIME ZONE 'America/Chicago')::date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  signups AS (
    SELECT
      date_trunc(v_granularity, ((p.created_at AT TIME ZONE 'America/Chicago'))::timestamp)::date AS bucket_start,
      count(*) FILTER (WHERE p.account_type::text = 'CUSTOMER') AS customers,
      count(*) FILTER (WHERE p.account_type::text = 'CONTRACTOR') AS contractors
    FROM public.profiles p
    WHERE NOT public.admin_account_is_excluded(p.id, v_include)
      AND (p.created_at AT TIME ZONE 'America/Chicago')::date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  posted AS (
    SELECT
      date_trunc(v_granularity, ((pr.posted_at AT TIME ZONE 'America/Chicago'))::timestamp)::date AS bucket_start,
      count(*) AS n
    FROM public.projects pr
    WHERE pr.posted_at IS NOT NULL
      AND NOT public.admin_account_is_excluded(pr.customer_id, v_include)
      AND (pr.posted_at AT TIME ZONE 'America/Chicago')::date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  hires AS (
    SELECT
      date_trunc(
        v_granularity,
        ((greatest(b.customer_hired_at, b.contractor_hired_at) AT TIME ZONE 'America/Chicago'))::timestamp
      )::date AS bucket_start,
      count(*) AS n
    FROM public.bookings b
    WHERE b.customer_hired_at IS NOT NULL
      AND b.contractor_hired_at IS NOT NULL
      AND b.status::text <> 'CANCELLED'
      AND NOT public.admin_account_is_excluded(b.customer_id, v_include)
      AND NOT EXISTS (
        SELECT 1 FROM public.contractor_profiles cp
        WHERE cp.id = b.contractor_profile_id
          AND public.admin_account_is_excluded(cp.profile_id, v_include)
      )
      AND (greatest(b.customer_hired_at, b.contractor_hired_at) AT TIME ZONE 'America/Chicago')::date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  completions AS (
    SELECT
      date_trunc(v_granularity, ((b.completed_at AT TIME ZONE 'America/Chicago'))::timestamp)::date AS bucket_start,
      count(*) AS n
    FROM public.bookings b
    WHERE b.status::text = 'COMPLETED'
      AND b.completed_at IS NOT NULL
      AND NOT public.admin_account_is_excluded(b.customer_id, v_include)
      AND NOT EXISTS (
        SELECT 1 FROM public.contractor_profiles cp
        WHERE cp.id = b.contractor_profile_id
          AND public.admin_account_is_excluded(cp.profile_id, v_include)
      )
      AND (b.completed_at AT TIME ZONE 'America/Chicago')::date BETWEEN p_from AND p_to
    GROUP BY 1
  ),
  checkouts AS (
    SELECT
      date_trunc(v_granularity, ((c.created_at AT TIME ZONE 'America/Chicago'))::timestamp)::date AS bucket_start,
      count(*) FILTER (WHERE c.status IN ('PAID', 'CONSUMED')) AS completed,
      count(*) FILTER (WHERE c.status = 'EXPIRED') AS expired
    FROM public.signup_fee_charges c
    WHERE c.livemode IS TRUE
      AND NOT public.admin_account_is_excluded(c.profile_id, v_include)
      AND (c.created_at AT TIME ZONE 'America/Chicago')::date BETWEEN p_from AND p_to
    GROUP BY 1
    UNION ALL
    SELECT
      date_trunc(v_granularity, ((s.created_at AT TIME ZONE 'America/Chicago'))::timestamp)::date,
      count(*) FILTER (WHERE s.status IN ('PAID', 'CONSUMED')),
      count(*) FILTER (WHERE s.status = 'EXPIRED')
    FROM public.connection_checkout_sessions s
    JOIN public.contractor_profiles cp ON cp.id = s.contractor_profile_id
    WHERE s.livemode IS TRUE
      AND NOT public.admin_account_is_excluded(cp.profile_id, v_include)
      AND (s.created_at AT TIME ZONE 'America/Chicago')::date BETWEEN p_from AND p_to
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.start), '[]'::jsonb)
  INTO v_buckets
  FROM (
    SELECT
      b.bucket_start AS start,
      coalesce((SELECT sum(r.cents) FROM revenue r WHERE r.bucket_start = b.bucket_start), 0) AS revenue_cents,
      coalesce((SELECT s.customers FROM signups s WHERE s.bucket_start = b.bucket_start), 0) AS signups_customer,
      coalesce((SELECT s.contractors FROM signups s WHERE s.bucket_start = b.bucket_start), 0) AS signups_contractor,
      (
        SELECT count(*)
        FROM public.profiles p
        WHERE p.account_type::text = 'CUSTOMER'
          AND NOT public.admin_account_is_excluded(p.id, v_include)
          AND (p.created_at AT TIME ZONE 'America/Chicago')::date <= least(
            p_to,
            CASE v_granularity
              WHEN 'day' THEN b.bucket_start
              WHEN 'week' THEN (b.bucket_start + 6)
              ELSE ((b.bucket_start + interval '1 month')::date - 1)
            END
          )
      ) AS homeowners_cumulative,
      (
        SELECT count(*)
        FROM public.profiles p
        WHERE p.account_type::text = 'CONTRACTOR'
          AND NOT public.admin_account_is_excluded(p.id, v_include)
          AND (p.created_at AT TIME ZONE 'America/Chicago')::date <= least(
            p_to,
            CASE v_granularity
              WHEN 'day' THEN b.bucket_start
              WHEN 'week' THEN (b.bucket_start + 6)
              ELSE ((b.bucket_start + interval '1 month')::date - 1)
            END
          )
      ) AS contractors_cumulative,
      coalesce((SELECT n FROM posted p WHERE p.bucket_start = b.bucket_start), 0) AS projects_posted,
      coalesce((SELECT n FROM hires h WHERE h.bucket_start = b.bucket_start), 0) AS hires,
      coalesce((SELECT n FROM completions c WHERE c.bucket_start = b.bucket_start), 0) AS completions,
      coalesce((SELECT sum(c.completed) FROM checkouts c WHERE c.bucket_start = b.bucket_start), 0) AS checkouts_completed,
      coalesce((SELECT sum(c.expired) FROM checkouts c WHERE c.bucket_start = b.bucket_start), 0) AS checkouts_expired
    FROM buckets b
  ) x;

  IF jsonb_array_length(v_buckets) > 400 THEN
    RAISE EXCEPTION 'too many buckets' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'granularity', v_granularity,
    'from', p_from,
    'to', p_to,
    'timezone', 'America/Chicago',
    'week_starts', 'Monday',
    'revenue_note', 'Gross cents from livemode activation and Connect fees in PAID or CONSUMED. Not estimates.fee_cents and not contractor_fee_bps.',
    'checkout_note', 'Checkouts completed versus expired. Completed is PAID or CONSUMED. Expired is an abandoned Checkout. Card declines are not recorded.',
    'card_declines', jsonb_build_object(
      'value', NULL,
      'status', 'unavailable',
      'definition', 'Card declines are not recorded. Stripe Checkout retries inside the session'
    ),
    'buckets', v_buckets
  );
END;
$fn$;

COMMENT ON FUNCTION public.admin_dashboard_trends(text, date, date, boolean) IS
  'Admin-only America/Chicago trends for day, week, or month. Range capped at 366 days. Cumulative signup series include history before p_from. Card declines are null/unavailable.';

REVOKE ALL ON FUNCTION public.admin_dashboard_trends(text, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_trends(text, date, date, boolean) TO authenticated;
