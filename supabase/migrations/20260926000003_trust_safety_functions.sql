-- Trust & safety RPCs: two-sided reviews, rating suspension, disputes, deletion.
-- Does not enable Stripe. Does not change payments_live / charges_live / signup_fee_enabled / stripe_test_mode.

CREATE OR REPLACE FUNCTION public.rating_suspension_min_reviews()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(
    1,
    coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'rating_suspension_min_reviews'), 3)
  );
$$;

CREATE OR REPLACE FUNCTION public.account_may_start_new_marketplace_work(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.account_status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_caller_can_start_marketplace_work()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  IF public.is_admin() THEN
    RETURN;
  END IF;
  IF NOT public.account_may_start_new_marketplace_work(auth.uid()) THEN
    RAISE EXCEPTION 'this account cannot start new marketplace work';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_new_marketplace_participation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status IS DISTINCT FROM 'DRAFT') THEN
      PERFORM public.assert_caller_can_start_marketplace_work();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'opportunities' THEN
    IF TG_OP = 'UPDATE' AND NEW.status = 'ACCEPTED' AND OLD.status IS DISTINCT FROM 'ACCEPTED' THEN
      PERFORM public.assert_caller_can_start_marketplace_work();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'estimates' THEN
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'DRAFT'
       AND NEW.status IN ('SENT', 'SUBMITTED') THEN
      PERFORM public.assert_caller_can_start_marketplace_work();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'bookings' AND TG_OP = 'INSERT' THEN
    PERFORM public.assert_caller_can_start_marketplace_work();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_enforce_new_participation ON public.projects;
CREATE TRIGGER projects_enforce_new_participation
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_new_marketplace_participation();

DROP TRIGGER IF EXISTS opportunities_enforce_new_participation ON public.opportunities;
CREATE TRIGGER opportunities_enforce_new_participation
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_new_marketplace_participation();

DROP TRIGGER IF EXISTS estimates_enforce_new_participation ON public.estimates;
CREATE TRIGGER estimates_enforce_new_participation
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_new_marketplace_participation();

DROP TRIGGER IF EXISTS bookings_enforce_new_participation ON public.bookings;
CREATE TRIGGER bookings_enforce_new_participation
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_new_marketplace_participation();

CREATE OR REPLACE FUNCTION public.write_account_lifecycle(
  p_profile_id uuid,
  p_from public.account_status,
  p_to public.account_status,
  p_reason public.account_restriction_reason,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eid uuid;
BEGIN
  INSERT INTO public.account_lifecycle_events (
    profile_id, actor_id, from_status, to_status, reason, payload
  ) VALUES (
    p_profile_id, auth.uid(), p_from, p_to, p_reason, coalesce(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO eid;
  RETURN eid;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_profile_rating(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_sum integer := 0;
  v_avg numeric := NULL;
BEGIN
  SELECT count(*)::integer, coalesce(sum(r.rating), 0)::integer
  INTO v_count, v_sum
  FROM public.booking_reviews r
  JOIN public.bookings b ON b.id = r.booking_id
  WHERE r.reviewee_profile_id = p_profile_id
    AND r.is_verified = true
    AND r.included_in_rating = true
    AND r.reviewer_id <> r.reviewee_profile_id
    AND b.status = 'COMPLETED';

  IF v_count > 0 THEN
    v_avg := (v_sum::numeric / v_count::numeric);
  END IF;

  INSERT INTO public.profile_rating_stats (profile_id, eligible_count, rating_sum, rating_average, updated_at)
  VALUES (p_profile_id, v_count, v_sum, v_avg, now())
  ON CONFLICT (profile_id) DO UPDATE
    SET eligible_count = excluded.eligible_count,
        rating_sum = excluded.rating_sum,
        rating_average = excluded.rating_average,
        updated_at = now();

  RETURN jsonb_build_object(
    'profile_id', p_profile_id,
    'eligible_count', v_count,
    'rating_sum', v_sum,
    'rating_average', v_avg
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_rating_suspension_if_needed(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap jsonb;
  v_count integer;
  v_avg numeric;
  p public.profiles;
  v_min integer;
BEGIN
  PERFORM public.ppp_set_rpc('apply_rating_suspension');
  snap := public.recompute_profile_rating(p_profile_id);
  v_count := (snap->>'eligible_count')::integer;
  v_avg := (snap->>'rating_average')::numeric;
  v_min := public.rating_suspension_min_reviews();

  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  -- Unrounded average. Exactly 4.00 does not suspend. Need at least the configured count.
  IF v_avg IS NOT NULL AND v_count >= v_min AND v_avg < 4 THEN
    IF p.account_status = 'ACTIVE' THEN
      UPDATE public.profiles
      SET
        previous_account_status = p.account_status,
        account_status = 'SUSPENDED',
        restriction_reason = 'RATING_SUSPENSION',
        restriction_at = now(),
        restriction_notified_at = now()
      WHERE id = p.id;

      PERFORM public.write_account_lifecycle(
        p.id, p.account_status, 'SUSPENDED', 'RATING_SUSPENSION', snap
      );
      PERFORM public.write_audit_log(
        p.id,
        'account.rating_suspended',
        'profiles',
        p.id,
        snap || jsonb_build_object('min_reviews', v_min)
      );
      PERFORM public.enqueue_notification(
        p.id,
        'account.rating_suspended',
        'Your account is suspended because of ratings.',
        'Your eligible completed-job rating is below 4.00 after enough reviews. You can view history and file an appeal from Disputes. You cannot start new marketplace work.',
        'profiles',
        p.id,
        jsonb_build_object('reason', 'RATING_SUSPENSION')
      );
    END IF;
    RETURN snap || jsonb_build_object('suspended', true, 'reason', 'RATING_SUSPENSION');
  END IF;

  RETURN snap || jsonb_build_object('suspended', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.maybe_clear_rating_suspension(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap jsonb;
  v_count integer;
  v_avg numeric;
  p public.profiles;
  v_min integer;
BEGIN
  PERFORM public.ppp_set_rpc('apply_rating_suspension');
  snap := public.recompute_profile_rating(p_profile_id);
  v_count := (snap->>'eligible_count')::integer;
  v_avg := (snap->>'rating_average')::numeric;
  v_min := public.rating_suspension_min_reviews();
  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id FOR UPDATE;

  IF p.account_status = 'SUSPENDED'
     AND p.restriction_reason = 'RATING_SUSPENSION'
     AND (v_avg IS NULL OR v_count < v_min OR v_avg >= 4) THEN
    UPDATE public.profiles
    SET
      account_status = coalesce(p.previous_account_status, 'ACTIVE'),
      restriction_reason = NULL,
      restriction_at = NULL,
      previous_account_status = NULL
    WHERE id = p.id;
    PERFORM public.write_account_lifecycle(
      p.id, 'SUSPENDED', coalesce(p.previous_account_status, 'ACTIVE'), NULL, snap
    );
    PERFORM public.write_audit_log(auth.uid(), 'account.rating_reinstated', 'profiles', p.id, snap);
    PERFORM public.enqueue_notification(
      p.id,
      'account.rating_reinstated',
      'Your rating suspension was lifted.',
      'Your eligible rating no longer meets the automatic suspension rule. You may use the marketplace again.',
      'profiles',
      p.id,
      '{}'::jsonb
    );
    RETURN snap || jsonb_build_object('reinstated', true);
  END IF;

  RETURN snap || jsonb_build_object('reinstated', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_booking_review(
  p_booking_id uuid,
  p_rating integer,
  p_body text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  v_owner uuid;
  v_role public.review_side;
  v_reviewee uuid;
  rid uuid;
  v_body text;
BEGIN
  PERFORM public.ppp_set_rpc('submit_booking_review');
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in to leave a review';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'reviews require a completed booking';
  END IF;

  SELECT profile_id INTO v_owner
  FROM public.contractor_profiles
  WHERE id = b.contractor_profile_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'reviews require a completed job relationship';
  END IF;
  IF b.customer_id = v_owner THEN
    RAISE EXCEPTION 'you cannot review yourself';
  END IF;

  IF auth.uid() = b.customer_id THEN
    v_role := 'CUSTOMER';
    v_reviewee := v_owner;
  ELSIF auth.uid() = v_owner THEN
    v_role := 'CONTRACTOR';
    v_reviewee := b.customer_id;
  ELSE
    RAISE EXCEPTION 'only the job''s homeowner or hired pro can review';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'rating must be 1 through 5';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_reviews r
    WHERE r.booking_id = b.id AND r.reviewer_role = v_role
  ) THEN
    RAISE EXCEPTION 'this side already reviewed this job';
  END IF;

  v_body := nullif(btrim(coalesce(p_body, '')), '');
  IF v_body IS NOT NULL AND public.text_contains_contact_info(v_body) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;

  INSERT INTO public.booking_reviews (
    booking_id, customer_id, contractor_profile_id,
    reviewer_id, reviewer_role, reviewee_profile_id,
    rating, body, is_verified, included_in_rating
  ) VALUES (
    b.id, b.customer_id, b.contractor_profile_id,
    auth.uid(), v_role, v_reviewee,
    p_rating, v_body, true, true
  )
  RETURNING id INTO rid;

  PERFORM public.write_booking_event(
    b.id,
    'review.submitted',
    jsonb_build_object('review_id', rid, 'rating', p_rating, 'reviewer_role', v_role)
  );
  PERFORM public.apply_rating_suspension_if_needed(v_reviewee);
  RETURN jsonb_build_object('review_id', rid, 'verified', true, 'reviewer_role', v_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_trust_dispute(
  p_category public.trust_dispute_category,
  p_explanation text,
  p_disputed_review_id uuid DEFAULT NULL,
  p_evidence_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.account_status;
  v_review public.booking_reviews;
  v_target uuid;
  v_booking uuid;
  did uuid;
BEGIN
  PERFORM public.ppp_set_rpc('create_trust_dispute');
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in to file a dispute';
  END IF;
  SELECT account_status INTO v_status FROM public.profiles WHERE id = auth.uid();
  IF v_status NOT IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'DELETION_REQUESTED') THEN
    RAISE EXCEPTION 'this account cannot file a dispute';
  END IF;
  IF length(btrim(coalesce(p_explanation, ''))) < 12 THEN
    RAISE EXCEPTION 'explain the issue in at least 12 characters';
  END IF;
  IF p_category IN ('FRAUDULENT_REVIEW', 'INACCURATE_REVIEW') THEN
    IF p_disputed_review_id IS NULL THEN
      RAISE EXCEPTION 'include the review you are disputing';
    END IF;
    SELECT * INTO v_review FROM public.booking_reviews WHERE id = p_disputed_review_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'review not found';
    END IF;
    IF v_review.reviewee_profile_id IS DISTINCT FROM auth.uid()
       AND v_review.reviewer_id IS DISTINCT FROM auth.uid()
       AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'you can only dispute a review from a job you were on';
    END IF;
    v_target := v_review.reviewee_profile_id;
    v_booking := v_review.booking_id;
  ELSE
    v_target := auth.uid();
  END IF;

  IF p_evidence_path IS NOT NULL AND p_evidence_path <> '' THEN
    IF split_part(p_evidence_path, '/', 1) IS DISTINCT FROM auth.uid()::text THEN
      RAISE EXCEPTION 'evidence must be stored in your own folder';
    END IF;
  END IF;

  INSERT INTO public.trust_disputes (
    filer_id, category, explanation, disputed_review_id, evidence_path,
    target_profile_id, booking_id, status
  ) VALUES (
    auth.uid(), p_category, btrim(p_explanation), p_disputed_review_id,
    nullif(p_evidence_path, ''), v_target, v_booking, 'OPEN'
  )
  RETURNING id INTO did;

  INSERT INTO public.trust_dispute_events (dispute_id, actor_id, event_type, payload)
  VALUES (did, auth.uid(), 'dispute.opened', jsonb_build_object('category', p_category));
  PERFORM public.write_audit_log(auth.uid(), 'trust_dispute.opened', 'trust_disputes', did, jsonb_build_object('category', p_category));
  RETURN jsonb_build_object('dispute_id', did, 'status', 'OPEN');
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_trust_disputes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC)
    FROM public.trust_disputes d
    WHERE d.filer_id = auth.uid()
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_trust_dispute(p_dispute_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.trust_disputes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  SELECT * INTO d FROM public.trust_disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispute not found';
  END IF;
  IF d.filer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your dispute';
  END IF;
  RETURN to_jsonb(d);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_admin_trust_disputes(p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC)
    FROM public.trust_disputes d
    WHERE p_status IS NULL OR d.status::text = p_status
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_trust_dispute(p_dispute_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.trust_disputes;
  ev jsonb;
  rev jsonb;
  booking jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  SELECT * INTO d FROM public.trust_disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispute not found';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at), '[]'::jsonb)
  INTO ev
  FROM public.trust_dispute_events e
  WHERE e.dispute_id = d.id;
  IF d.disputed_review_id IS NOT NULL THEN
    SELECT to_jsonb(r) INTO rev FROM public.booking_reviews r WHERE r.id = d.disputed_review_id;
  END IF;
  IF d.booking_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', b.id,
      'status', b.status,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id,
      'project_id', b.project_id
    )
    INTO booking
    FROM public.bookings b
    WHERE b.id = d.booking_id;
  END IF;
  RETURN jsonb_build_object(
    'dispute', to_jsonb(d),
    'events', ev,
    'review', rev,
    'booking', booking
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_trust_dispute(
  p_dispute_id uuid,
  p_resolution text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.trust_disputes;
  v_status public.trust_dispute_status;
  v_review public.booking_reviews;
BEGIN
  PERFORM public.ppp_set_rpc('admin_resolve_trust_dispute');
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  SELECT * INTO d FROM public.trust_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispute not found';
  END IF;
  IF auth.uid() = d.filer_id THEN
    RAISE EXCEPTION 'you cannot resolve your own dispute';
  END IF;
  IF d.target_profile_id IS NOT NULL AND auth.uid() = d.target_profile_id THEN
    RAISE EXCEPTION 'you cannot approve or unsuspend yourself';
  END IF;
  IF d.status NOT IN ('OPEN', 'UNDER_REVIEW') THEN
    RAISE EXCEPTION 'dispute is already resolved';
  END IF;

  IF p_resolution = 'UPHOLD' THEN
    v_status := 'RESOLVED_UPHELD';
  ELSIF p_resolution = 'REMOVE_FROM_RATING' THEN
    v_status := 'RESOLVED_REMOVED';
  ELSIF p_resolution = 'REINSTATE' THEN
    v_status := 'RESOLVED_ADJUSTED';
  ELSIF p_resolution = 'CLOSE' THEN
    v_status := 'CLOSED';
  ELSE
    RAISE EXCEPTION 'unknown resolution';
  END IF;

  IF p_resolution IN ('REMOVE_FROM_RATING', 'REINSTATE') AND d.disputed_review_id IS NOT NULL THEN
    UPDATE public.booking_reviews
    SET
      included_in_rating = false,
      excluded_at = now(),
      excluded_by = auth.uid(),
      excluded_reason = coalesce(nullif(btrim(p_note), ''), p_resolution)
    WHERE id = d.disputed_review_id
    RETURNING * INTO v_review;
    IF v_review.reviewee_profile_id IS NOT NULL THEN
      PERFORM public.maybe_clear_rating_suspension(v_review.reviewee_profile_id);
    END IF;
  END IF;

  IF p_resolution = 'REINSTATE' AND d.target_profile_id IS NOT NULL THEN
    IF auth.uid() = d.target_profile_id THEN
      RAISE EXCEPTION 'you cannot unsuspend yourself';
    END IF;
    UPDATE public.profiles
    SET
      account_status = 'ACTIVE',
      restriction_reason = NULL,
      restriction_at = NULL,
      previous_account_status = NULL
    WHERE id = d.target_profile_id
      AND account_status = 'SUSPENDED';
    PERFORM public.write_account_lifecycle(d.target_profile_id, 'SUSPENDED', 'ACTIVE', NULL, jsonb_build_object('dispute_id', d.id));
    PERFORM public.write_audit_log(auth.uid(), 'account.admin_reinstated', 'profiles', d.target_profile_id, jsonb_build_object('dispute_id', d.id));
  END IF;

  UPDATE public.trust_disputes
  SET
    status = v_status,
    resolved_at = now(),
    resolved_by = auth.uid(),
    resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  WHERE id = d.id;

  INSERT INTO public.trust_dispute_events (dispute_id, actor_id, event_type, payload)
  VALUES (
    d.id,
    auth.uid(),
    'dispute.resolved',
    jsonb_build_object('resolution', p_resolution, 'status', v_status)
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'trust_dispute.resolved',
    'trust_disputes',
    d.id,
    jsonb_build_object('resolution', p_resolution, 'status', v_status)
  );
  PERFORM public.enqueue_notification(
    d.filer_id,
    'dispute.resolved',
    'Your dispute was reviewed.',
    'An admin updated your dispute. Open Disputes to see the outcome.',
    'trust_disputes',
    d.id,
    jsonb_build_object('status', v_status)
  );
  RETURN jsonb_build_object('dispute_id', d.id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_account_deletion(p_confirm_phrase text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
BEGIN
  PERFORM public.ppp_set_rpc('request_account_deletion');
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  IF btrim(coalesce(p_confirm_phrase, '')) <> 'DELETE' THEN
    RAISE EXCEPTION 'Type DELETE to confirm you want to close this account.';
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  IF p.account_status IN ('DELETED', 'DELETED_ANONYMIZED') THEN
    RAISE EXCEPTION 'this account is already closed';
  END IF;

  UPDATE public.profiles
  SET
    previous_account_status = p.account_status,
    account_status = 'DELETION_REQUESTED',
    restriction_reason = 'DELETION_REQUEST',
    restriction_at = now(),
    deletion_requested_at = now(),
    first_name = 'Deleted',
    last_name = 'User',
    phone = NULL,
    avatar_url = NULL,
    email = 'deleted+' || p.id::text || '@invalid.invalid',
    anonymized_at = now()
  WHERE id = p.id;

  UPDATE public.profiles
  SET account_status = 'DELETED_ANONYMIZED'
  WHERE id = p.id;

  UPDATE public.contractor_profiles
  SET
    business_name = 'Deleted business',
    website_url = NULL,
    license_number = NULL,
    insurance_carrier = NULL,
    bio = NULL,
    headline = NULL,
    accepting_work = false
  WHERE profile_id = p.id;

  PERFORM public.write_account_lifecycle(p.id, p.account_status, 'DELETION_REQUESTED', 'DELETION_REQUEST', '{}'::jsonb);
  PERFORM public.write_account_lifecycle(p.id, 'DELETION_REQUESTED', 'DELETED_ANONYMIZED', 'DELETION_REQUEST', '{}'::jsonb);
  PERFORM public.write_audit_log(p.id, 'account.deletion_requested', 'profiles', p.id, '{}'::jsonb);
  RETURN jsonb_build_object('status', 'DELETED_ANONYMIZED', 'directory_removed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_public_fee_schedule()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'original', (
      SELECT jsonb_build_object(
        'kind', s.kind,
        'version', s.version,
        'min_fee_cents', s.min_fee_cents,
        'max_fee_cents', s.max_fee_cents,
        'brackets', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'min_amount_cents', b.min_amount_cents,
              'max_amount_cents', b.max_amount_cents,
              'rate_bps', b.rate_bps,
              'sort_order', b.sort_order
            )
            ORDER BY b.sort_order
          )
          FROM public.fee_schedule_brackets b
          WHERE b.schedule_id = s.id
        ), '[]'::jsonb)
      )
      FROM public.fee_schedules s
      WHERE s.kind = 'ORIGINAL' AND s.is_active
      ORDER BY s.version DESC
      LIMIT 1
    ),
    'repeat', (
      SELECT jsonb_build_object(
        'kind', s.kind,
        'version', s.version,
        'min_fee_cents', s.min_fee_cents,
        'max_fee_cents', s.max_fee_cents,
        'brackets', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'min_amount_cents', b.min_amount_cents,
              'max_amount_cents', b.max_amount_cents,
              'rate_bps', b.rate_bps,
              'sort_order', b.sort_order
            )
            ORDER BY b.sort_order
          )
          FROM public.fee_schedule_brackets b
          WHERE b.schedule_id = s.id
        ), '[]'::jsonb)
      )
      FROM public.fee_schedules s
      WHERE s.kind = 'REPEAT' AND s.is_active
      ORDER BY s.version DESC
      LIMIT 1
    ),
    'payments_live', false,
    'charges_live', false
  );
$$;

CREATE OR REPLACE FUNCTION public.my_rating_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  PERFORM public.ppp_set_rpc('my_rating_stats');
  PERFORM public.recompute_profile_rating(auth.uid());
  RETURN coalesce((
    SELECT to_jsonb(s) FROM public.profile_rating_stats s WHERE s.profile_id = auth.uid()
  ), jsonb_build_object('profile_id', auth.uid(), 'eligible_count', 0, 'rating_sum', 0, 'rating_average', null));
END;
$$;
