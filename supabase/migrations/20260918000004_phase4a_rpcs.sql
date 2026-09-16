-- Phase 4A booking RPCs. SECURITY DEFINER always checks auth.uid() / is_admin().
-- Production confirmation is admin/test-only until payments_live.

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
BEGIN
  PERFORM public.ppp_set_rpc('select_estimate');
  PERFORM public.expire_stale_pending_bookings();

  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the project owner';
  END IF;
  IF proj.status = 'CONTRACTOR_SELECTED' THEN
    RAISE EXCEPTION 'a contractor is already selected';
  END IF;

  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id FOR UPDATE;
  IF NOT FOUND OR est.project_id <> p_project_id THEN
    RAISE EXCEPTION 'estimate not found on this project';
  END IF;
  IF est.status NOT IN ('SUBMITTED', 'REVISED') THEN
    RAISE EXCEPTION 'only submitted estimates can be selected';
  END IF;

  UPDATE public.estimates
  SET status = 'ACCEPTED'
  WHERE id = est.id;

  UPDATE public.estimates
  SET status = 'DECLINED'
  WHERE project_id = p_project_id
    AND id <> est.id
    AND status IN ('DRAFT', 'SUBMITTED', 'REVISED');

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
    'message', 'Payment coming soon — booking cannot be confirmed in production yet'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_booking_awaiting_payment(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
BEGIN
  PERFORM public.ppp_set_rpc('mark_booking_awaiting_payment');
  PERFORM public.expire_stale_pending_bookings();
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the booking customer';
  END IF;
  IF b.status <> 'PENDING' THEN
    RAISE EXCEPTION 'booking cannot move to awaiting payment from %', b.status;
  END IF;
  UPDATE public.bookings SET status = 'AWAITING_PAYMENT' WHERE id = b.id;
  PERFORM public.write_booking_event(b.id, 'booking.awaiting_payment', '{}'::jsonb);
  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', 'AWAITING_PAYMENT',
    'charges_live', false,
    'payments_live', false,
    'message', 'Payment coming soon — booking cannot be confirmed in production yet'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_pending_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
BEGIN
  PERFORM public.ppp_set_rpc('cancel_pending_booking');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the booking customer';
  END IF;
  IF b.status NOT IN ('PENDING', 'AWAITING_PAYMENT') THEN
    RAISE EXCEPTION 'only pending bookings can be cancelled here';
  END IF;
  UPDATE public.bookings
  SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'customer_cancelled'
  WHERE id = b.id;
  PERFORM public.write_booking_event(b.id, 'booking.cancelled', jsonb_build_object('reason', 'customer_cancelled'));
  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', 'CANCELLED',
    'relationship_created', false,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_booking_for_testing(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  preview jsonb;
  rid uuid;
BEGIN
  PERFORM public.ppp_set_rpc('confirm_booking_for_testing');
  PERFORM public.expire_stale_pending_bookings();
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can confirm a booking until payments are live';
  END IF;
  IF public.payments_live() THEN
    RAISE EXCEPTION 'payments_live is true; do not use the testing confirmation path';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.status NOT IN ('PENDING', 'AWAITING_PAYMENT') THEN
    RAISE EXCEPTION 'booking cannot be confirmed from %', b.status;
  END IF;

  preview := public.lock_booking_fee(b.id);
  UPDATE public.bookings
  SET status = 'CONFIRMED', confirmed_at = now()
  WHERE id = b.id;
  rid := public.ensure_relationship_on_confirm(b.id);
  PERFORM public.write_booking_event(
    b.id,
    'booking.confirmed_for_testing',
    jsonb_build_object('relationship_id', rid, 'fee', preview, 'payments_live', false)
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'booking.confirmed_for_testing',
    'bookings',
    b.id,
    jsonb_build_object('relationship_id', rid, 'charges_live', false, 'payments_live', false)
  );

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', 'CONFIRMED',
    'relationship_id', rid,
    'fee', preview,
    'charges_live', false,
    'payments_live', false,
    'testing_only', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
BEGIN
  PERFORM public.ppp_set_rpc('start_booking');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the booked contractor';
  END IF;
  IF b.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'booking cannot start from %', b.status;
  END IF;
  UPDATE public.bookings SET status = 'IN_PROGRESS', started_at = now() WHERE id = b.id;
  PERFORM public.write_booking_event(b.id, 'booking.started', '{}'::jsonb);
  RETURN jsonb_build_object('booking_id', b.id, 'status', 'IN_PROGRESS', 'charges_live', false, 'payments_live', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  months integer;
BEGIN
  PERFORM public.ppp_set_rpc('complete_booking');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.customer_id IS DISTINCT FROM auth.uid()
     AND b.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a booking participant';
  END IF;
  IF b.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'booking cannot complete from %', b.status;
  END IF;

  UPDATE public.bookings SET status = 'COMPLETED', completed_at = now() WHERE id = b.id;
  months := public.relationship_protection_months();
  UPDATE public.customer_contractor_relationships
  SET
    last_completed_booking_id = b.id,
    last_completed_at = now(),
    protected_until = now() + make_interval(months => months)
  WHERE customer_id = b.customer_id
    AND contractor_profile_id = b.contractor_profile_id
    AND status = 'ACTIVE';

  PERFORM public.write_booking_event(b.id, 'booking.completed', '{}'::jsonb);
  RETURN jsonb_build_object('booking_id', b.id, 'status', 'COMPLETED', 'charges_live', false, 'payments_live', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.dispute_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
BEGIN
  PERFORM public.ppp_set_rpc('dispute_booking');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.customer_id IS DISTINCT FROM auth.uid()
     AND b.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a booking participant';
  END IF;
  IF b.status NOT IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED') THEN
    RAISE EXCEPTION 'booking cannot be disputed from %', b.status;
  END IF;
  UPDATE public.bookings SET status = 'DISPUTED', disputed_at = now() WHERE id = b.id;
  PERFORM public.write_booking_event(b.id, 'booking.disputed', '{}'::jsonb);
  RETURN jsonb_build_object('booking_id', b.id, 'status', 'DISPUTED', 'charges_live', false, 'payments_live', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_change_order(
  p_booking_id uuid,
  p_description text,
  p_amount_delta_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  v_role text;
  oid uuid;
BEGIN
  PERFORM public.ppp_set_rpc('propose_change_order');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'change orders are only allowed on confirmed or in-progress bookings';
  END IF;

  IF b.customer_id = auth.uid() THEN
    v_role := 'CUSTOMER';
  ELSIF b.contractor_profile_id = public.current_contractor_profile_id() THEN
    v_role := 'CONTRACTOR';
  ELSIF public.is_admin() THEN
    v_role := 'ADMIN';
  ELSE
    RAISE EXCEPTION 'not a booking participant';
  END IF;

  IF p_amount_delta_cents IS NULL THEN
    RAISE EXCEPTION 'amount_delta_cents is required';
  END IF;
  IF length(btrim(coalesce(p_description, ''))) < 3 THEN
    RAISE EXCEPTION 'describe the change';
  END IF;

  INSERT INTO public.change_orders (
    booking_id,
    created_by,
    created_by_role,
    description,
    amount_delta_cents,
    status,
    customer_approved_at,
    customer_approved_by,
    contractor_acked_at,
    contractor_acked_by
  ) VALUES (
    b.id,
    auth.uid(),
    v_role,
    btrim(p_description),
    p_amount_delta_cents,
    CASE WHEN v_role = 'CUSTOMER' THEN 'CUSTOMER_APPROVED' ELSE 'PROPOSED' END,
    CASE WHEN v_role = 'CUSTOMER' THEN now() ELSE NULL END,
    CASE WHEN v_role = 'CUSTOMER' THEN auth.uid() ELSE NULL END,
    CASE WHEN v_role = 'CONTRACTOR' THEN now() ELSE NULL END,
    CASE WHEN v_role = 'CONTRACTOR' THEN auth.uid() ELSE NULL END
  )
  RETURNING id INTO oid;

  PERFORM public.write_booking_event(
    b.id,
    'change_order.proposed',
    jsonb_build_object('change_order_id', oid, 'amount_delta_cents', p_amount_delta_cents, 'role', v_role)
  );

  RETURN jsonb_build_object(
    'change_order_id', oid,
    'status', CASE WHEN v_role = 'CUSTOMER' THEN 'CUSTOMER_APPROVED' ELSE 'PROPOSED' END,
    'unilateral_increase', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_change_order(p_change_order_id uuid, p_approve boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  co public.change_orders;
  b public.bookings;
  v_is_customer boolean;
  v_is_contractor boolean;
BEGIN
  PERFORM public.ppp_set_rpc('respond_change_order');
  SELECT * INTO co FROM public.change_orders WHERE id = p_change_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'change order not found'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = co.booking_id FOR UPDATE;
  IF b.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'booking is not open for change orders';
  END IF;
  IF co.status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'change order is already closed';
  END IF;

  v_is_customer := b.customer_id = auth.uid();
  v_is_contractor := b.contractor_profile_id = public.current_contractor_profile_id();
  IF NOT v_is_customer AND NOT v_is_contractor AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a booking participant';
  END IF;

  IF NOT coalesce(p_approve, false) THEN
    UPDATE public.change_orders
    SET status = 'REJECTED', decided_at = now()
    WHERE id = co.id;
    PERFORM public.write_booking_event(b.id, 'change_order.rejected', jsonb_build_object('change_order_id', co.id));
    RETURN jsonb_build_object('change_order_id', co.id, 'status', 'REJECTED');
  END IF;

  IF v_is_customer OR public.is_admin() THEN
    UPDATE public.change_orders
    SET customer_approved_at = coalesce(customer_approved_at, now()),
        customer_approved_by = coalesce(customer_approved_by, auth.uid()),
        status = 'CUSTOMER_APPROVED'
    WHERE id = co.id;
  END IF;
  IF v_is_contractor OR public.is_admin() THEN
    UPDATE public.change_orders
    SET contractor_acked_at = coalesce(contractor_acked_at, now()),
        contractor_acked_by = coalesce(contractor_acked_by, auth.uid())
    WHERE id = co.id;
  END IF;

  SELECT * INTO co FROM public.change_orders WHERE id = p_change_order_id;
  IF co.customer_approved_at IS NOT NULL AND co.contractor_acked_at IS NOT NULL THEN
    UPDATE public.change_orders
    SET status = 'APPROVED', decided_at = now()
    WHERE id = co.id;
    PERFORM public.recompute_booking_money(b.id);
    PERFORM public.write_booking_event(
      b.id,
      'change_order.approved',
      jsonb_build_object('change_order_id', co.id, 'amount_delta_cents', co.amount_delta_cents)
    );
    RETURN jsonb_build_object('change_order_id', co.id, 'status', 'APPROVED');
  END IF;

  RETURN jsonb_build_object('change_order_id', co.id, 'status', co.status);
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
  rid uuid;
BEGIN
  PERFORM public.ppp_set_rpc('submit_booking_review');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.customer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only the customer can review this booking';
  END IF;
  IF b.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'reviews require a completed booking';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'rating must be 1 through 5';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_reviews r WHERE r.booking_id = b.id) THEN
    RAISE EXCEPTION 'this booking already has a review';
  END IF;

  INSERT INTO public.booking_reviews (
    booking_id, customer_id, contractor_profile_id, rating, body, is_verified
  ) VALUES (
    b.id, b.customer_id, b.contractor_profile_id, p_rating, nullif(btrim(coalesce(p_body, '')), ''), true
  )
  RETURNING id INTO rid;

  PERFORM public.write_booking_event(b.id, 'review.submitted', jsonb_build_object('review_id', rid, 'rating', p_rating));
  RETURN jsonb_build_object('review_id', rid, 'verified', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_job_contact(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  loc public.project_private_locations;
  cust public.profiles;
  unlocked boolean;
BEGIN
  PERFORM public.expire_stale_pending_bookings();
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  unlocked := b.status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED');
  IF NOT (
    public.is_admin()
    OR b.customer_id = auth.uid()
    OR (unlocked AND b.contractor_profile_id = public.current_contractor_profile_id())
  ) THEN
    RAISE EXCEPTION 'contact is locked until the booking is confirmed';
  END IF;

  SELECT * INTO loc FROM public.project_private_locations WHERE project_id = b.project_id;
  SELECT * INTO cust FROM public.profiles WHERE id = b.customer_id;

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'unlocked', true,
    'street_line1', loc.street_line1,
    'street_line2', loc.street_line2,
    'lat', loc.lat,
    'lng', loc.lng,
    'city', (SELECT city FROM public.projects WHERE id = b.project_id),
    'state', (SELECT state FROM public.projects WHERE id = b.project_id),
    'zip_code', (SELECT zip_code FROM public.projects WHERE id = b.project_id),
    'phone', cust.phone,
    'email', cust.email,
    'first_name', cust.first_name,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

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
      r.introduced_at,
      r.last_completed_at,
      r.last_completed_booking_id,
      r.protected_until,
      r.protected_until > now() AS currently_protected,
      months AS protection_months,
      true AS repeat_pricing,
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
