-- Customer project lifecycle.
-- Posted projects are cancelled, never hard-deleted.
-- Non-material edits (including unchanged answers) do not invalidate estimates.
-- select_estimate refuses cancelled projects and contractors who are not approved.
-- Cancelling a project, or rejecting a contractor, closes that contractor's open offers and estimates.
-- Estimates can be drafted and submitted only for the caller's own accepted opportunity.
-- Does not change fees, Stripe, checkout, webhooks, or payment flags.

CREATE OR REPLACE FUNCTION public.normalize_city(p_city text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(
    initcap(
      regexp_replace(
        regexp_replace(
          regexp_replace(btrim(coalesce(p_city, '')), '\s+', ' ', 'g'),
          '\s+,', ',',
          'g'
        ),
        ',+$',
        ''
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_us_state(p_state text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  raw text := btrim(coalesce(p_state, ''));
  key text;
  mapped text;
BEGIN
  IF raw = '' THEN
    RETURN NULL;
  END IF;
  key := lower(regexp_replace(raw, '[^a-zA-Z]', '', 'g'));
  mapped := CASE key
    WHEN 'al' THEN 'AL' WHEN 'alabama' THEN 'AL'
    WHEN 'ak' THEN 'AK' WHEN 'alaska' THEN 'AK'
    WHEN 'az' THEN 'AZ' WHEN 'arizona' THEN 'AZ'
    WHEN 'ar' THEN 'AR' WHEN 'arkansas' THEN 'AR'
    WHEN 'ca' THEN 'CA' WHEN 'california' THEN 'CA'
    WHEN 'co' THEN 'CO' WHEN 'colorado' THEN 'CO'
    WHEN 'ct' THEN 'CT' WHEN 'connecticut' THEN 'CT'
    WHEN 'de' THEN 'DE' WHEN 'delaware' THEN 'DE'
    WHEN 'dc' THEN 'DC' WHEN 'districtofcolumbia' THEN 'DC'
    WHEN 'fl' THEN 'FL' WHEN 'florida' THEN 'FL'
    WHEN 'ga' THEN 'GA' WHEN 'georgia' THEN 'GA'
    WHEN 'hi' THEN 'HI' WHEN 'hawaii' THEN 'HI'
    WHEN 'id' THEN 'ID' WHEN 'idaho' THEN 'ID'
    WHEN 'il' THEN 'IL' WHEN 'illinois' THEN 'IL'
    WHEN 'in' THEN 'IN' WHEN 'indiana' THEN 'IN'
    WHEN 'ia' THEN 'IA' WHEN 'iowa' THEN 'IA'
    WHEN 'ks' THEN 'KS' WHEN 'kansas' THEN 'KS'
    WHEN 'ky' THEN 'KY' WHEN 'kentucky' THEN 'KY'
    WHEN 'la' THEN 'LA' WHEN 'louisiana' THEN 'LA'
    WHEN 'me' THEN 'ME' WHEN 'maine' THEN 'ME'
    WHEN 'md' THEN 'MD' WHEN 'maryland' THEN 'MD'
    WHEN 'ma' THEN 'MA' WHEN 'massachusetts' THEN 'MA'
    WHEN 'mi' THEN 'MI' WHEN 'michigan' THEN 'MI'
    WHEN 'mn' THEN 'MN' WHEN 'minnesota' THEN 'MN'
    WHEN 'ms' THEN 'MS' WHEN 'mississippi' THEN 'MS'
    WHEN 'mo' THEN 'MO' WHEN 'missouri' THEN 'MO'
    WHEN 'mt' THEN 'MT' WHEN 'montana' THEN 'MT'
    WHEN 'ne' THEN 'NE' WHEN 'nebraska' THEN 'NE'
    WHEN 'nv' THEN 'NV' WHEN 'nevada' THEN 'NV'
    WHEN 'nh' THEN 'NH' WHEN 'newhampshire' THEN 'NH'
    WHEN 'nj' THEN 'NJ' WHEN 'newjersey' THEN 'NJ'
    WHEN 'nm' THEN 'NM' WHEN 'newmexico' THEN 'NM'
    WHEN 'ny' THEN 'NY' WHEN 'newyork' THEN 'NY'
    WHEN 'nc' THEN 'NC' WHEN 'northcarolina' THEN 'NC'
    WHEN 'nd' THEN 'ND' WHEN 'northdakota' THEN 'ND'
    WHEN 'oh' THEN 'OH' WHEN 'ohio' THEN 'OH'
    WHEN 'ok' THEN 'OK' WHEN 'oklahoma' THEN 'OK'
    WHEN 'or' THEN 'OR' WHEN 'oregon' THEN 'OR'
    WHEN 'pa' THEN 'PA' WHEN 'pennsylvania' THEN 'PA'
    WHEN 'ri' THEN 'RI' WHEN 'rhodeisland' THEN 'RI'
    WHEN 'sc' THEN 'SC' WHEN 'southcarolina' THEN 'SC'
    WHEN 'sd' THEN 'SD' WHEN 'southdakota' THEN 'SD'
    WHEN 'tn' THEN 'TN' WHEN 'tennessee' THEN 'TN'
    WHEN 'tx' THEN 'TX' WHEN 'texas' THEN 'TX'
    WHEN 'ut' THEN 'UT' WHEN 'utah' THEN 'UT'
    WHEN 'vt' THEN 'VT' WHEN 'vermont' THEN 'VT'
    WHEN 'va' THEN 'VA' WHEN 'virginia' THEN 'VA'
    WHEN 'wa' THEN 'WA' WHEN 'washington' THEN 'WA'
    WHEN 'wv' THEN 'WV' WHEN 'westvirginia' THEN 'WV'
    WHEN 'wi' THEN 'WI' WHEN 'wisconsin' THEN 'WI'
    WHEN 'wy' THEN 'WY' WHEN 'wyoming' THEN 'WY'
    ELSE NULL
  END;
  IF mapped IS NOT NULL THEN
    RETURN mapped;
  END IF;
  IF key ~ '^[a-z]{2}$' THEN
    RETURN upper(key);
  END IF;
  RETURN initcap(raw);
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_city(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_us_state(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_city(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_us_state(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.contractor_can_draft_estimate(
  p_opportunity_id uuid,
  p_project_id uuid,
  p_contractor_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.id = p_opportunity_id
      AND o.project_id = p_project_id
      AND o.contractor_profile_id = p_contractor_profile_id
      AND o.status = 'ACCEPTED'
  );
$$;

REVOKE ALL ON FUNCTION public.contractor_can_draft_estimate(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_can_draft_estimate(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS estimates_insert_own_draft ON public.estimates;
CREATE POLICY estimates_insert_own_draft
  ON public.estimates FOR INSERT TO authenticated
  WITH CHECK (
    contractor_profile_id = public.current_contractor_profile_id()
    AND status = 'DRAFT'
    AND public.signup_fee_is_satisfied(auth.uid())
    AND public.contractor_can_draft_estimate(opportunity_id, project_id, contractor_profile_id)
  );

CREATE OR REPLACE FUNCTION public.refresh_open_project_status(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF proj.status <> 'CONTRACTORS_RESPONDING' THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.project_id = proj.id
      AND o.status IN ('AVAILABLE', 'ACCEPTED')
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.estimates e
    WHERE e.project_id = proj.id
      AND e.status IN ('SUBMITTED', 'SENT', 'REVISED', 'VIEWED', 'ACCEPTED')
  ) THEN
    RETURN;
  END IF;
  UPDATE public.projects
  SET status = 'MATCHING'
  WHERE id = proj.id
    AND status = 'CONTRACTORS_RESPONDING';
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_open_project_status(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.close_open_contractor_work(p_contractor_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.opportunities
  SET status = 'CLOSED'
  WHERE contractor_profile_id = p_contractor_profile_id
    AND status IN ('AVAILABLE', 'ACCEPTED');

  UPDATE public.estimates
  SET status = 'WITHDRAWN', withdrawn_at = coalesce(withdrawn_at, now())
  WHERE contractor_profile_id = p_contractor_profile_id
    AND status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED');
END;
$$;

REVOKE ALL ON FUNCTION public.close_open_contractor_work(uuid) FROM PUBLIC, anon, authenticated;

-- Withdrawing estimates while cancelling a project or rejecting a contractor
-- must not fail when that contractor has not paid the signup fee.
CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF public.ppp_rpc_is('cancel_customer_project')
     OR public.ppp_rpc_is('admin_reject_contractor') THEN
    RETURN NEW;
  END IF;

  SELECT profile_id INTO v_profile_id
  FROM public.contractor_profiles
  WHERE id = NEW.contractor_profile_id;
  PERFORM public.assert_signup_fee_paid(v_profile_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_signup_fee_on_estimates() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.select_estimate(p_project_id uuid, p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  est public.estimates;
  v_repeat boolean;
  v_kind public.fee_schedule_kind;
  v_schedule uuid;
  preview jsonb;
  ttl integer;
  bid uuid;
  other_row public.estimates;
  v_account public.account_type;
BEGIN
  PERFORM public.ppp_set_rpc('select_estimate');
  PERFORM public.expire_stale_pending_bookings();

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Lock the project first so two tabs cannot create two winners.
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not the project owner';
  END IF;
  IF proj.status = 'CANCELLED' OR proj.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'cancelled projects cannot accept an estimate';
  END IF;

  SELECT account_type INTO v_account FROM public.profiles WHERE id = auth.uid();
  IF v_account IS DISTINCT FROM 'CUSTOMER' THEN
    RAISE EXCEPTION 'only the customer can hire an estimate';
  END IF;

  -- Idempotent retry of the same winner. A different estimate is a conflict.
  IF proj.status = 'CONTRACTOR_SELECTED' THEN
    IF proj.selected_estimate_id IS NOT DISTINCT FROM p_estimate_id THEN
      RETURN jsonb_build_object(
        'project_id', p_project_id,
        'estimate_id', p_estimate_id,
        'booking_id', proj.selected_booking_id,
        'status', 'CONTRACTOR_SELECTED',
        'booking_status', 'PENDING',
        'idempotent', true,
        'charges_live', false,
        'payments_live', false,
        'message', 'Booking started. The customer pays the contractor directly for the work.'
      );
    END IF;
    RAISE EXCEPTION 'a contractor is already selected';
  END IF;

  -- Lock every estimate on the project before deciding the winner.
  PERFORM 1 FROM public.estimates WHERE project_id = p_project_id FOR UPDATE;

  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id;
  IF NOT FOUND OR est.project_id <> p_project_id THEN
    RAISE EXCEPTION 'estimate not found on this project';
  END IF;
  IF est.contractor_profile_id IS NOT DISTINCT FROM public.current_contractor_profile_id() THEN
    RAISE EXCEPTION 'contractors cannot accept their own estimate';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.contractor_profiles cp
    JOIN public.profiles pr ON pr.id = cp.profile_id
    WHERE cp.id = est.contractor_profile_id
      AND cp.approval_status = 'APPROVED'
      AND pr.account_status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'only an approved contractor can be selected';
  END IF;
  IF est.status NOT IN ('SUBMITTED', 'SENT', 'REVISED', 'VIEWED') THEN
    RAISE EXCEPTION 'only submitted estimates can be selected';
  END IF;

  UPDATE public.estimates
  SET status = 'ACCEPTED', accepted_at = now(), decline_reason = NULL
  WHERE id = est.id;

  PERFORM public.write_estimate_event(est.id, 'estimate.accepted', jsonb_build_object('status', 'ACCEPTED'));
  PERFORM public.enqueue_notification(
    public.contractor_owner_profile_id(est.contractor_profile_id),
    'estimate.accepted',
    'The customer selected your estimate.',
    'The customer selected your estimate.',
    'estimates',
    est.id,
    jsonb_build_object('project_id', est.project_id)
  );

  FOR other_row IN
    SELECT * FROM public.estimates
    WHERE project_id = p_project_id
      AND id <> est.id
      AND status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED')
  LOOP
    UPDATE public.estimates
    SET
      status = 'DECLINED',
      declined_at = now(),
      decline_reason = 'ANOTHER_ESTIMATE_ACCEPTED'
    WHERE id = other_row.id;
    PERFORM public.write_estimate_event(
      other_row.id,
      'estimate.not_selected',
      jsonb_build_object('reason', 'ANOTHER_ESTIMATE_ACCEPTED')
    );
    IF other_row.status <> 'DRAFT' THEN
      PERFORM public.enqueue_notification(
        public.contractor_owner_profile_id(other_row.contractor_profile_id),
        'estimate.not_selected',
        'The customer selected another pro for this project.',
        'The customer selected another pro for this project.',
        'estimates',
        other_row.id,
        jsonb_build_object('project_id', p_project_id, 'reason', 'ANOTHER_ESTIMATE_ACCEPTED')
      );
    END IF;
  END LOOP;

  UPDATE public.opportunities
  SET status = CASE
    WHEN contractor_profile_id = est.contractor_profile_id THEN status
    ELSE 'CLOSED'
  END
  WHERE project_id = p_project_id
    AND status IN ('AVAILABLE', 'ACCEPTED');

  v_repeat := public.pair_has_completed_booking(proj.customer_id, est.contractor_profile_id);
  v_kind := CASE WHEN v_repeat THEN 'REPEAT'::public.fee_schedule_kind ELSE 'ORIGINAL'::public.fee_schedule_kind END;
  v_schedule := public.current_fee_schedule_id(v_kind);
  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'no active fee schedule';
  END IF;
  preview := public.compute_fee(est.total_cents, v_schedule);
  ttl := coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'booking_pending_ttl_hours'),
    168
  );

  INSERT INTO public.bookings (
    project_id,
    estimate_id,
    customer_id,
    contractor_profile_id,
    status,
    amount_cents,
    approved_delta_cents,
    billable_amount_cents,
    is_repeat,
    fee_kind,
    fee_schedule_id,
    fee_schedule_version,
    fee_cents,
    contractor_earnings_cents,
    customer_amount_cents,
    fee_locked,
    payments_live,
    charges_live,
    expires_at
  ) VALUES (
    p_project_id,
    est.id,
    proj.customer_id,
    est.contractor_profile_id,
    'PENDING',
    est.total_cents,
    0,
    est.total_cents,
    v_repeat,
    v_kind,
    v_schedule,
    (preview->>'version')::integer,
    (preview->>'fee_cents')::integer,
    (preview->>'contractor_earnings_cents')::integer,
    est.total_cents,
    false,
    false,
    false,
    now() + make_interval(hours => ttl)
  )
  RETURNING id INTO bid;

  UPDATE public.projects
  SET
    status = 'CONTRACTOR_SELECTED',
    selected_estimate_id = est.id,
    selected_contractor_profile_id = est.contractor_profile_id,
    selected_booking_id = bid,
    selected_at = now()
  WHERE id = p_project_id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'estimate.selected',
    'projects',
    p_project_id,
    jsonb_build_object(
      'estimate_id', est.id,
      'booking_id', bid,
      'booking_status', 'PENDING',
      'contractor_profile_id', est.contractor_profile_id,
      'is_repeat', v_repeat,
      'charges_live', false,
      'payments_live', false
    )
  );
  PERFORM public.write_booking_event(
    bid,
    'booking.created',
    jsonb_build_object('status', 'PENDING', 'is_repeat', v_repeat, 'preview', preview)
  );

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'estimate_id', est.id,
    'booking_id', bid,
    'status', 'CONTRACTOR_SELECTED',
    'booking_status', 'PENDING',
    'is_repeat', v_repeat,
    'fee_kind', v_kind,
    'fee_preview', preview,
    'charges_live', false,
    'payments_live', false,
    'message', 'Booking started. The customer pays the contractor directly for the work.'
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.submit_estimate(p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  est public.estimates;
  item_count integer;
  next_status public.estimate_status;
  proj public.projects;
  was_first boolean;
  item public.estimate_items;
BEGIN
  PERFORM public.ppp_set_rpc('submit_estimate');

  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate not found';
  END IF;
  IF est.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your estimate';
  END IF;
  IF est.status NOT IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED') THEN
    RAISE EXCEPTION 'estimate cannot be submitted from status %', est.status;
  END IF;
  IF public.text_contains_contact_info(est.notes) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;

  IF NOT public.contractor_can_draft_estimate(est.opportunity_id, est.project_id, est.contractor_profile_id) THEN
    RAISE EXCEPTION 'only an accepted opportunity on this project for this contractor may submit estimates';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = est.project_id
      AND (p.status = 'CANCELLED' OR p.cancelled_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'cancelled projects cannot receive estimates';
  END IF;

  SELECT count(*) INTO item_count FROM public.estimate_items WHERE estimate_id = est.id;
  IF item_count < 1 THEN
    RAISE EXCEPTION 'add at least one line item';
  END IF;

  FOR item IN SELECT * FROM public.estimate_items WHERE estimate_id = est.id LOOP
    IF public.text_contains_contact_info(item.label) THEN
      RAISE EXCEPTION '%', public.contact_info_blocked_message();
    END IF;
  END LOOP;

  PERFORM public.recompute_estimate_totals(est.id);
  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id;

  IF est.total_cents <= 0
     OR est.total_cents <> est.subtotal_cents
     OR est.fee_cents <> public.fee_cents_from_total(est.total_cents, est.fee_bps)
     OR est.contractor_earnings_cents <> est.total_cents - est.fee_cents THEN
    RAISE EXCEPTION 'estimate totals failed validation';
  END IF;

  was_first := est.status = 'DRAFT';
  next_status := CASE WHEN est.status = 'DRAFT' THEN 'SENT' ELSE 'REVISED' END;

  UPDATE public.estimates
  SET status = next_status, submitted_at = now()
  WHERE id = est.id;

  UPDATE public.projects
  SET status = 'ESTIMATES_AVAILABLE'
  WHERE id = est.project_id
    AND status IN ('MATCHING', 'CONTRACTORS_RESPONDING', 'ESTIMATES_AVAILABLE');

  SELECT * INTO proj FROM public.projects WHERE id = est.project_id;

  PERFORM public.write_estimate_event(
    est.id,
    CASE WHEN was_first THEN 'estimate.submitted' ELSE 'estimate.revised' END,
    jsonb_build_object('status', next_status, 'total_cents', est.total_cents)
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'estimate.submitted',
    'estimates',
    est.id,
    jsonb_build_object(
      'total_cents', est.total_cents,
      'fee_cents', est.fee_cents,
      'status', next_status,
      'charges_live', false
    )
  );

  IF was_first THEN
    PERFORM public.enqueue_notification(
      proj.customer_id,
      'estimate.received',
      'New estimate received',
      'A pro sent an estimate on your project.',
      'estimates',
      est.id,
      jsonb_build_object('project_id', est.project_id, 'estimate_id', est.id)
    );
  ELSE
    PERFORM public.enqueue_notification(
      proj.customer_id,
      'estimate.updated',
      'Estimate updated',
      'A contractor updated an estimate on your project.',
      'estimates',
      est.id,
      jsonb_build_object('project_id', est.project_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'estimate_id', est.id,
    'status', next_status,
    'total_cents', est.total_cents,
    'fee_cents', est.fee_cents,
    'contractor_earnings_cents', est.contractor_earnings_cents,
    'charges_live', false
  );
END;
$$;



CREATE OR REPLACE FUNCTION public.update_customer_project(p_project_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.projects;
  v_material boolean := false;
  v_category_change boolean := false;
  v_confirm boolean := coalesce((p_patch ->> 'confirm_material')::boolean, false);
  v_answer jsonb;
  v_city text;
  v_state text;
BEGIN
  PERFORM public.ppp_set_rpc('update_customer_project');
  SELECT * INTO p FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;
  IF p.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the project owner';
  END IF;
  IF p.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled projects cannot be edited';
  END IF;
  IF public.project_protected_booking_exists(p.id) THEN
    RAISE EXCEPTION 'confirmed jobs cannot be edited here — use a change order';
  END IF;
  IF p.status = 'CONTRACTOR_SELECTED' THEN
    RAISE EXCEPTION 'a contractor is already selected — cancel the pending booking before changing job details';
  END IF;

  IF p_patch ? 'category_id' AND nullif(p_patch ->> 'category_id', '') IS DISTINCT FROM p.category_id::text THEN
    v_material := true;
    v_category_change := true;
  END IF;
  IF p_patch ? 'description' AND coalesce(p_patch ->> 'description', '') IS DISTINCT FROM coalesce(p.description, '') THEN
    v_material := true;
  END IF;
  IF p_patch ? 'city' AND public.normalize_city(p_patch ->> 'city') IS DISTINCT FROM public.normalize_city(p.city) THEN
    v_material := true;
  END IF;
  IF p_patch ? 'state' AND public.normalize_us_state(p_patch ->> 'state') IS DISTINCT FROM public.normalize_us_state(p.state) THEN
    v_material := true;
  END IF;
  IF p_patch ? 'zip_code' AND public.normalize_zip(p_patch ->> 'zip_code') IS DISTINCT FROM public.normalize_zip(p.zip_code) THEN
    v_material := true;
  END IF;
  IF p_patch ? 'answers' AND jsonb_typeof(p_patch -> 'answers') = 'array' THEN
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_patch -> 'answers') AS elem(value)
      WHERE coalesce(
        (
          SELECT a.answer_text
          FROM public.project_answers a
          WHERE a.project_id = p.id
            AND (elem.value ->> 'question_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND a.question_id = (elem.value ->> 'question_id')::uuid
        ),
        ''
      ) IS DISTINCT FROM coalesce(elem.value ->> 'answer_text', '')
    ) THEN
      v_material := true;
    END IF;
  END IF;

  IF v_category_change AND p.status <> 'DRAFT' AND public.project_has_participation(p.id) THEN
    RAISE EXCEPTION 'the service type cannot change after contractors have already priced this job';
  END IF;

  IF p.status <> 'DRAFT' AND v_material AND public.project_has_participation(p.id) AND NOT v_confirm THEN
    RETURN jsonb_build_object(
      'needs_confirmation', true,
      'kind', 'material',
      'message', 'This changes the job contractors already priced. Existing estimates will be marked out of date and those pros will need to send a new estimate.'
    );
  END IF;

  v_city := CASE WHEN p_patch ? 'city' THEN public.normalize_city(p_patch ->> 'city') ELSE p.city END;
  v_state := CASE WHEN p_patch ? 'state' THEN public.normalize_us_state(p_patch ->> 'state') ELSE p.state END;

  UPDATE public.projects
  SET
    title = CASE WHEN p_patch ? 'title' THEN coalesce(p_patch ->> 'title', '') ELSE title END,
    description = CASE WHEN p_patch ? 'description' THEN coalesce(p_patch ->> 'description', '') ELSE description END,
    category_id = CASE
      WHEN p_patch ? 'category_id' THEN nullif(p_patch ->> 'category_id', '')::uuid
      ELSE category_id
    END,
    city = v_city,
    state = v_state,
    zip_code = CASE WHEN p_patch ? 'zip_code' THEN public.normalize_zip(p_patch ->> 'zip_code') ELSE zip_code END,
    timing = CASE
      WHEN p_patch ? 'timing' THEN nullif(p_patch ->> 'timing', '')::public.timing_preference
      ELSE timing
    END,
    preferred_date = CASE
      WHEN p_patch ? 'preferred_date' THEN nullif(p_patch ->> 'preferred_date', '')::date
      ELSE preferred_date
    END,
    budget_min_cents = CASE
      WHEN p_patch ? 'budget_min_cents' THEN nullif(p_patch ->> 'budget_min_cents', '')::integer
      ELSE budget_min_cents
    END,
    budget_max_cents = CASE
      WHEN p_patch ? 'budget_max_cents' THEN nullif(p_patch ->> 'budget_max_cents', '')::integer
      ELSE budget_max_cents
    END
  WHERE id = p.id;

  IF p_patch ? 'street_line1' OR p_patch ? 'street_line2' THEN
    INSERT INTO public.project_private_locations (project_id, street_line1, street_line2)
    VALUES (
      p.id,
      CASE WHEN p_patch ? 'street_line1' THEN nullif(btrim(p_patch ->> 'street_line1'), '') ELSE NULL END,
      CASE WHEN p_patch ? 'street_line2' THEN nullif(btrim(p_patch ->> 'street_line2'), '') ELSE NULL END
    )
    ON CONFLICT (project_id) DO UPDATE
    SET
      street_line1 = CASE
        WHEN p_patch ? 'street_line1' THEN nullif(btrim(p_patch ->> 'street_line1'), '')
        ELSE public.project_private_locations.street_line1
      END,
      street_line2 = CASE
        WHEN p_patch ? 'street_line2' THEN nullif(btrim(p_patch ->> 'street_line2'), '')
        ELSE public.project_private_locations.street_line2
      END;
  END IF;

  IF jsonb_typeof(p_patch -> 'answers') = 'array' THEN
    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_patch -> 'answers')
    LOOP
      IF (v_answer ->> 'question_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        INSERT INTO public.project_answers (project_id, question_id, answer_text)
        VALUES (
          p.id,
          (v_answer ->> 'question_id')::uuid,
          nullif(v_answer ->> 'answer_text', '')
        )
        ON CONFLICT (project_id, question_id) DO UPDATE
        SET answer_text = excluded.answer_text;
      END IF;
    END LOOP;
  END IF;

  IF p.status <> 'DRAFT' AND v_material AND public.project_has_participation(p.id) THEN
    PERFORM public.apply_material_scope_change(p.id, 'details');
    PERFORM public.write_audit_log(
      auth.uid(),
      'project.updated',
      'project',
      p.id,
      jsonb_build_object('material', true, 'status', p.status, 'estimates_invalidated', true)
    );
    RETURN jsonb_build_object(
      'project_id', p.id,
      'material', true,
      'estimates_invalidated', true,
      'ok', true
    );
  ELSIF p.status <> 'DRAFT' THEN
    PERFORM public.insert_project_notice(
      p.id,
      'CUSTOMER',
      'PROJECT_UPDATED',
      'Project updated',
      'Your project details were saved.'
    );
  END IF;

  PERFORM public.write_audit_log(
    auth.uid(),
    'project.updated',
    'project',
    p.id,
    jsonb_build_object('material', v_material, 'status', p.status)
  );

  RETURN jsonb_build_object(
    'project_id', p.id,
    'material', v_material,
    'estimates_invalidated', false,
    'ok', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_customer_project(p_project_id uuid, p_confirm boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.projects;
  v_action text;
  b public.bookings;
BEGIN
  PERFORM public.ppp_set_rpc('cancel_customer_project');
  SELECT * INTO p FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;
  IF p.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the project owner';
  END IF;
  IF public.project_protected_booking_exists(p.id) THEN
    RAISE EXCEPTION 'confirmed or in-progress jobs cannot be cancelled';
  END IF;
  IF p.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'this project is already cancelled';
  END IF;

  -- A posted project is a real job. Never hard-delete it. Only an unposted DRAFT
  -- with no marketplace activity can be removed.
  IF p.status = 'DRAFT' AND p.posted_at IS NULL
     AND NOT public.project_has_participation(p.id)
     AND public.project_opportunity_count(p.id) = 0
     AND NOT EXISTS (SELECT 1 FROM public.bookings bk WHERE bk.project_id = p.id)
  THEN
    v_action := 'delete';
  ELSE
    v_action := 'cancel';
  END IF;

  IF NOT coalesce(p_confirm, false) THEN
    RETURN jsonb_build_object(
      'needs_confirmation', true,
      'action', v_action,
      'project_id', p.id
    );
  END IF;

  IF v_action = 'delete' THEN
    DELETE FROM public.projects WHERE id = p.id AND status = 'DRAFT' AND posted_at IS NULL;
    PERFORM public.write_audit_log(auth.uid(), 'project.deleted', 'project', p.id, jsonb_build_object('status', p.status));
    RETURN jsonb_build_object('ok', true, 'action', 'deleted', 'project_id', p.id);
  END IF;

  FOR b IN
    SELECT * FROM public.bookings
    WHERE project_id = p.id
      AND status IN ('PENDING', 'AWAITING_PAYMENT')
    FOR UPDATE
  LOOP
    IF b.customer_hired_at IS NOT NULL AND b.contractor_hired_at IS NOT NULL THEN
      RAISE EXCEPTION 'a hired booking cannot be cancelled with the project';
    END IF;
    UPDATE public.bookings
    SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'customer_cancelled_project'
    WHERE id = b.id;
    PERFORM public.write_booking_event(b.id, 'booking.cancelled', jsonb_build_object('reason', 'customer_cancelled_project'));
  END LOOP;

  UPDATE public.estimates
  SET status = 'WITHDRAWN', withdrawn_at = coalesce(withdrawn_at, now())
  WHERE project_id = p.id
    AND status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED', 'ACCEPTED');

  UPDATE public.opportunities
  SET status = 'CLOSED'
  WHERE project_id = p.id
    AND status IN ('AVAILABLE', 'ACCEPTED');

  UPDATE public.projects
  SET
    status = 'CANCELLED',
    cancelled_at = now(),
    cancel_reason = CASE
      WHEN p.status = 'CONTRACTOR_SELECTED' THEN 'customer_cancelled_after_selection'
      WHEN public.project_has_participation(p.id) THEN 'customer_cancelled_with_participation'
      ELSE 'customer_withdrew'
    END
  WHERE id = p.id;

  PERFORM public.insert_project_notice(
    p.id,
    'BOTH',
    'PROJECT_CANCELLED',
    'Project cancelled',
    'This project was cancelled. It stays in the customer history and is no longer open.'
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'project.cancelled',
    'project',
    p.id,
    jsonb_build_object('from_status', p.status, 'relationship_created', false)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'cancelled',
    'project_id', p.id,
    'relationship_created', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pass_opportunity(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opp public.opportunities;
  backfilled integer := 0;
BEGIN
  PERFORM public.ppp_set_rpc('pass_opportunity');

  SELECT * INTO opp FROM public.opportunities WHERE id = p_opportunity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity not found';
  END IF;
  IF opp.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your opportunity';
  END IF;

  PERFORM 1 FROM public.projects WHERE id = opp.project_id FOR UPDATE;

  SELECT * INTO opp FROM public.opportunities WHERE id = p_opportunity_id;
  IF opp.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'opportunity is not available';
  END IF;
  IF opp.expires_at IS NOT NULL AND opp.expires_at < now() THEN
    UPDATE public.opportunities
    SET status = 'EXPIRED'
    WHERE id = opp.id AND status = 'AVAILABLE';
    RAISE EXCEPTION 'opportunity has expired';
  END IF;

  UPDATE public.opportunities
  SET status = 'PASSED', responded_at = now()
  WHERE id = opp.id;

  backfilled := public.fill_project_opportunity_offers(opp.project_id);
  PERFORM public.refresh_open_project_status(opp.project_id);

  PERFORM public.write_audit_log(
    auth.uid(),
    'opportunity.passed',
    'opportunities',
    opp.id,
    jsonb_build_object(
      'project_id', opp.project_id,
      'backfilled', backfilled
    )
  );

  RETURN jsonb_build_object(
    'opportunity_id', opp.id,
    'status', 'PASSED',
    'backfilled', backfilled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_contractor(p_contractor_profile_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cp public.contractor_profiles;
  p public.profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM public.ppp_set_rpc('admin_reject_contractor');
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can reject a contractor';
  END IF;

  SELECT * INTO cp FROM public.contractor_profiles WHERE id = p_contractor_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contractor profile not found'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = cp.profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF p.account_type <> 'CONTRACTOR' THEN
    RAISE EXCEPTION 'not a contractor profile';
  END IF;

  UPDATE public.contractor_profiles
  SET
    approval_status = 'REJECTED',
    rejected_at = now(),
    rejected_by = auth.uid(),
    rejection_reason = v_reason
  WHERE id = cp.id;

  PERFORM public.close_open_contractor_work(cp.id);

  PERFORM public.write_audit_log(
    auth.uid(),
    'contractor.rejected',
    'contractor_profiles',
    cp.id,
    jsonb_build_object(
      'profile_id', p.id,
      'previous_approval_status', cp.approval_status,
      'reason', v_reason,
      'deleted', false,
      'open_work_closed', true
    )
  );

  RETURN public.contractor_approval_item(cp.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_estimate_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SQL editor / service_role may repair rows. JWT admins still cannot forge VIEWED/ACCEPTED.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
     OR NEW.contractor_profile_id IS DISTINCT FROM OLD.contractor_profile_id THEN
    RAISE EXCEPTION 'estimate ownership cannot change';
  END IF;

  IF NEW.notes IS DISTINCT FROM OLD.notes AND public.text_contains_contact_info(NEW.notes) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      public.ppp_rpc_is('submit_estimate')
      OR public.ppp_rpc_is('withdraw_estimate')
      OR public.ppp_rpc_is('select_estimate')
      OR public.ppp_rpc_is('mark_estimate_viewed')
      OR public.ppp_rpc_is('decline_estimate')
      OR public.ppp_rpc_is('update_customer_project')
      OR public.ppp_rpc_is('cancel_customer_project')
      OR public.ppp_rpc_is('cancel_pending_booking')
      OR public.ppp_rpc_is('admin_reject_contractor')
    ) THEN
      RAISE EXCEPTION 'estimate status can only change through submit, withdraw, select, view, decline, or owner scope/cancel RPCs';
    END IF;
    IF OLD.status = 'VIEWED' AND NEW.status IN ('SENT', 'SUBMITTED') THEN
      RAISE EXCEPTION 'estimate status cannot regress from VIEWED to SENT';
    END IF;
    IF NEW.status = 'ACCEPTED'
       AND NOT public.ppp_rpc_is('select_estimate') THEN
      RAISE EXCEPTION 'contractors cannot self-set ACCEPTED';
    END IF;
  END IF;

  IF (
    NEW.first_viewed_at IS DISTINCT FROM OLD.first_viewed_at
    OR NEW.last_viewed_at IS DISTINCT FROM OLD.last_viewed_at
    OR NEW.view_count IS DISTINCT FROM OLD.view_count
  ) AND NOT public.ppp_rpc_is('mark_estimate_viewed') THEN
    RAISE EXCEPTION 'estimate view timestamps are server-authoritative';
  END IF;

  IF OLD.first_viewed_at IS NOT NULL
     AND NEW.first_viewed_at IS DISTINCT FROM OLD.first_viewed_at THEN
    RAISE EXCEPTION 'first_viewed_at is immutable once set';
  END IF;

  IF (
    NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.declined_at IS DISTINCT FROM OLD.declined_at
    OR NEW.decline_reason IS DISTINCT FROM OLD.decline_reason
  ) AND NOT (
    public.ppp_rpc_is('select_estimate')
    OR public.ppp_rpc_is('decline_estimate')
  ) THEN
    RAISE EXCEPTION 'estimate decision timestamps are server-authoritative';
  END IF;

  IF (
    NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
    OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
    OR NEW.fee_cents IS DISTINCT FROM OLD.fee_cents
    OR NEW.fee_bps IS DISTINCT FROM OLD.fee_bps
    OR NEW.contractor_earnings_cents IS DISTINCT FROM OLD.contractor_earnings_cents
  ) AND NOT (
    public.ppp_rpc_is('recompute_estimate_totals')
    OR public.ppp_rpc_is('submit_estimate')
  ) THEN
    RAISE EXCEPTION 'estimate money columns are computed in the database';
  END IF;

  RETURN NEW;
END;
$$;



CREATE OR REPLACE FUNCTION public.notify_project_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.project_message_threads;
  v_owner uuid;
  v_contractor_user uuid;
  v_recipient uuid;
  v_title text;
BEGIN
  SELECT * INTO v_thread FROM public.project_message_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.project_message_threads
  SET updated_at = now()
  WHERE id = v_thread.id;

  SELECT p.customer_id, p.title INTO v_owner, v_title
  FROM public.projects p
  WHERE p.id = v_thread.project_id;
  v_contractor_user := public.contractor_owner_profile_id(v_thread.contractor_profile_id);

  IF NEW.sender_profile_id = v_owner THEN
    v_recipient := v_contractor_user;
  ELSIF NEW.sender_profile_id = v_contractor_user THEN
    v_recipient := v_owner;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_profile_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.ppp_set_rpc('notify_project_message');
  PERFORM public.enqueue_notification(
    v_recipient,
    'message.received',
    'New message',
    'New message about ' || coalesce(nullif(btrim(v_title), ''), 'your project') || '.',
    'project_message_threads',
    v_thread.id,
    jsonb_build_object(
      'thread_id', v_thread.id,
      'project_id', v_thread.project_id,
      'contractor_profile_id', v_thread.contractor_profile_id
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_project_message() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hire_again_contractors()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  months integer;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  months := public.relationship_protection_months();
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      r.id AS relationship_id,
      r.contractor_profile_id,
      cp.business_name,
      cp.primary_trade,
      r.introduced_at,
      r.last_completed_at,
      r.last_completed_booking_id,
      r.protected_until,
      r.protected_until > now() AS currently_protected,
      months AS protection_months,
      false AS charges_live,
      false AS payments_live
    FROM public.customer_contractor_relationships r
    JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
    WHERE r.customer_id = auth.uid()
      AND r.status = 'ACTIVE'
      AND r.last_completed_booking_id IS NOT NULL
    ORDER BY r.last_completed_at DESC NULLS LAST
  ) x;
  RETURN result;
END;
$$;

-- Idempotent data repair. Does not touch payments, fees, or connection 9106a50b.
-- Closes live estimates from rejected contractors (includes 5466be8a on project 6443d3e4).
-- Mark the same RPC admin rejection uses so the contractor signup-fee trigger
-- cannot abort this cleanup when that contractor has not paid.
SELECT public.ppp_set_rpc('admin_reject_contractor');

UPDATE public.estimates e
SET status = 'WITHDRAWN', withdrawn_at = coalesce(e.withdrawn_at, now())
FROM public.contractor_profiles cp
WHERE e.contractor_profile_id = cp.id
  AND cp.approval_status = 'REJECTED'
  AND e.status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED');

SELECT public.ppp_set_rpc('');

UPDATE public.opportunities o
SET status = 'CLOSED'
FROM public.contractor_profiles cp
WHERE o.contractor_profile_id = cp.id
  AND cp.approval_status = 'REJECTED'
  AND o.status IN ('AVAILABLE', 'ACCEPTED');

-- Projects left in CONTRACTORS_RESPONDING after every offer passed (includes 19a04c54).
UPDATE public.projects p
SET status = 'MATCHING'
WHERE p.status = 'CONTRACTORS_RESPONDING'
  AND NOT EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.project_id = p.id AND o.status IN ('AVAILABLE', 'ACCEPTED')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.estimates e
    WHERE e.project_id = p.id
      AND e.status IN ('SUBMITTED', 'SENT', 'REVISED', 'VIEWED', 'ACCEPTED')
  );

UPDATE public.projects
SET
  city = public.normalize_city(city),
  state = public.normalize_us_state(state)
WHERE (city IS NOT NULL OR state IS NOT NULL)
  AND (
    city IS DISTINCT FROM public.normalize_city(city)
    OR state IS DISTINCT FROM public.normalize_us_state(state)
  );
