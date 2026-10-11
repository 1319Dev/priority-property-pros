-- Restores the live function bodies from 2026-10-11, before the audit calls.
-- Apply this before dropping anything else. It does not delete audit rows.
-- Does not change payments, fees, Stripe, or platform_settings.

CREATE OR REPLACE FUNCTION public.propose_change_order(p_booking_id uuid, p_description text, p_amount_delta_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
  v_role text;
  oid uuid;
  v_cap integer;
  v_total bigint;
  v_description text;
BEGIN
  PERFORM public.ppp_set_rpc('propose_change_order');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN RAISE EXCEPTION 'change orders are only allowed on confirmed or in-progress bookings'; END IF;
  IF b.customer_id = auth.uid() THEN v_role := 'CUSTOMER';
  ELSIF b.contractor_profile_id = public.current_contractor_profile_id() THEN v_role := 'CONTRACTOR';
  ELSIF public.is_admin() THEN v_role := 'ADMIN';
  ELSE RAISE EXCEPTION 'not a booking participant'; END IF;

  -- integer parameter: fractional cents never reach this body.
  IF p_amount_delta_cents IS NULL THEN RAISE EXCEPTION 'amount_delta_cents is required'; END IF;
  IF p_amount_delta_cents = 0 THEN RAISE EXCEPTION 'change order amount must not be zero'; END IF;

  v_cap := (
    SELECT s.value_int
    FROM public.platform_settings s
    WHERE s.key = 'change_order_max_abs_cents'
  );
  IF v_cap IS NULL OR v_cap <= 0 THEN
    v_cap := 10000000;
  END IF;
  -- bigint compare so a large cap cannot overflow integer negation.
  IF p_amount_delta_cents::bigint > v_cap::bigint
     OR p_amount_delta_cents::bigint < -v_cap::bigint THEN
    RAISE EXCEPTION 'change order amount is outside the allowed range';
  END IF;

  v_total := coalesce(b.billable_amount_cents, b.amount_cents, 0)::bigint;
  IF (v_total + p_amount_delta_cents::bigint) < 0 THEN
    RAISE EXCEPTION 'a decrease cannot exceed the current job total';
  END IF;

  v_description := btrim(coalesce(p_description, ''));
  IF length(v_description) < 3 THEN RAISE EXCEPTION 'describe the change'; END IF;
  IF char_length(v_description) > 1000 THEN RAISE EXCEPTION 'change order description is too long'; END IF;

  INSERT INTO public.change_orders (booking_id, created_by, created_by_role, description, amount_delta_cents, status, customer_approved_at, customer_approved_by, contractor_acked_at, contractor_acked_by)
  VALUES (b.id, auth.uid(), v_role, v_description, p_amount_delta_cents,
    (CASE WHEN v_role = 'CUSTOMER' THEN 'CUSTOMER_APPROVED' ELSE 'PROPOSED' END)::public.change_order_status,
    CASE WHEN v_role = 'CUSTOMER' THEN now() ELSE NULL END,
    CASE WHEN v_role = 'CUSTOMER' THEN auth.uid() ELSE NULL END,
    CASE WHEN v_role = 'CONTRACTOR' THEN now() ELSE NULL END,
    CASE WHEN v_role = 'CONTRACTOR' THEN auth.uid() ELSE NULL END)
  RETURNING id INTO oid;
  PERFORM public.write_booking_event(b.id, 'change_order.proposed', jsonb_build_object('change_order_id', oid, 'amount_delta_cents', p_amount_delta_cents, 'role', v_role));
  RETURN jsonb_build_object('change_order_id', oid, 'status', CASE WHEN v_role = 'CUSTOMER' THEN 'CUSTOMER_APPROVED' ELSE 'PROPOSED' END, 'unilateral_increase', false);
END;
$function$

CREATE OR REPLACE FUNCTION public.respond_change_order(p_change_order_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    PERFORM public.add_change_order_schedule_item(co.id);
    PERFORM public.write_booking_event(
      b.id,
      'change_order.approved',
      jsonb_build_object('change_order_id', co.id, 'amount_delta_cents', co.amount_delta_cents)
    );
    RETURN jsonb_build_object('change_order_id', co.id, 'status', 'APPROVED');
  END IF;

  RETURN jsonb_build_object('change_order_id', co.id, 'status', co.status);
END;
$function$

CREATE OR REPLACE FUNCTION public.start_booking(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
BEGIN
  PERFORM public.ppp_set_rpc('start_booking');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND b.customer_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a booking participant';
  END IF;
  IF b.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'booking cannot start from %', b.status;
  END IF;
  -- Starting work does not lock a fee or collect a job payment, even if payments_live is on.
  PERFORM public.ensure_relationship_on_confirm(b.id);
  UPDATE public.bookings SET status = 'IN_PROGRESS', started_at = coalesce(started_at, now()) WHERE id = b.id;
  PERFORM public.write_booking_event(b.id, 'booking.started', jsonb_build_object('charges_live', false, 'payments_live', false));
  RETURN jsonb_build_object('booking_id', b.id, 'status', 'IN_PROGRESS', 'charges_live', false, 'payments_live', false);
END;
$function$

CREATE OR REPLACE FUNCTION public.complete_booking(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Completion records the finished job. It does not lock a booking fee or change fee columns.
  PERFORM public.ensure_relationship_on_confirm(b.id);

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

  PERFORM public.write_booking_event(
    b.id,
    'booking.completed',
    jsonb_build_object('charges_live', false, 'payments_live', public.payments_live(), 'fee_locked', false)
  );
  RETURN jsonb_build_object('booking_id', b.id, 'status', 'COMPLETED', 'charges_live', false, 'payments_live', false);
END;
$function$

CREATE OR REPLACE FUNCTION public.submit_booking_review(p_booking_id uuid, p_rating integer, p_body text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
  rid uuid;
  v_reviewer_role text;
  is_customer boolean;
  is_contractor boolean;
BEGIN
  PERFORM public.ppp_set_rpc('submit_booking_review');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  is_customer := b.customer_id IS NOT DISTINCT FROM auth.uid();
  is_contractor := b.contractor_profile_id IS NOT DISTINCT FROM public.current_contractor_profile_id();

  IF NOT is_customer AND NOT is_contractor THEN
    RAISE EXCEPTION 'only booking participants can review after mutual hire';
  END IF;
  IF b.status IN ('CANCELLED', 'DISPUTED') THEN
    RAISE EXCEPTION 'reviews require mutual hired confirmation';
  END IF;
  IF b.customer_hired_at IS NULL OR b.contractor_hired_at IS NULL THEN
    RAISE EXCEPTION 'reviews require mutual hired confirmation';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'rating must be 1 through 5';
  END IF;

  v_reviewer_role := CASE WHEN is_customer THEN 'CUSTOMER' ELSE 'CONTRACTOR' END;

  IF EXISTS (
    SELECT 1
    FROM public.booking_reviews r
    WHERE r.booking_id = b.id
      AND r.reviewer_role = v_reviewer_role
  ) THEN
    RAISE EXCEPTION 'you already reviewed this booking';
  END IF;

  INSERT INTO public.booking_reviews (
    booking_id, customer_id, contractor_profile_id, rating, body, is_verified, reviewer_role
  ) VALUES (
    b.id,
    b.customer_id,
    b.contractor_profile_id,
    p_rating,
    nullif(btrim(coalesce(p_body, '')), ''),
    true,
    v_reviewer_role
  )
  RETURNING id INTO rid;

  PERFORM public.write_booking_event(
    b.id,
    'review.submitted',
    jsonb_build_object('review_id', rid, 'rating', p_rating, 'reviewer_role', v_reviewer_role)
  );
  RETURN jsonb_build_object(
    'review_id', rid,
    'verified', true,
    'reviewer_role', v_reviewer_role,
    'mutually_hired', true
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.block_contractor_for_customer(p_contractor_profile_id uuid, p_booking_id uuid DEFAULT NULL::uuid, p_estimate_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_except uuid;
  v_estimate_project uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  IF p_contractor_profile_id IS NULL THEN
    RAISE EXCEPTION 'contractor is required';
  END IF;
  IF p_booking_id IS NULL AND p_estimate_id IS NULL THEN
    RAISE EXCEPTION 'a booking or estimate is required';
  END IF;

  IF p_booking_id IS NOT NULL THEN
    SELECT b.project_id INTO v_except
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.customer_id = auth.uid()
      AND b.contractor_profile_id = p_contractor_profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'booking not found';
    END IF;
  END IF;

  IF p_estimate_id IS NOT NULL THEN
    SELECT e.project_id INTO v_estimate_project
    FROM public.estimates e
    JOIN public.projects p ON p.id = e.project_id
    WHERE e.id = p_estimate_id
      AND e.contractor_profile_id = p_contractor_profile_id
      AND p.customer_id = auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'estimate not found';
    END IF;
    IF v_except IS NULL THEN
      v_except := v_estimate_project;
    END IF;
  END IF;

  INSERT INTO public.customer_contractor_blocks (
    customer_profile_id,
    contractor_profile_id,
    reason,
    source_booking_id
  ) VALUES (
    auth.uid(),
    p_contractor_profile_id,
    'CUSTOMER_REQUEST',
    p_booking_id
  )
  ON CONFLICT (customer_profile_id, contractor_profile_id) DO NOTHING;

  PERFORM public.close_blocked_contractor_open_offers(
    auth.uid(),
    p_contractor_profile_id,
    v_except
  );

  RETURN jsonb_build_object(
    'blocked', true,
    'contractor_profile_id', p_contractor_profile_id
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.unblock_contractor_for_customer(p_contractor_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  removed integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;

  DELETE FROM public.customer_contractor_blocks b
  WHERE b.customer_profile_id = auth.uid()
    AND b.contractor_profile_id = p_contractor_profile_id;

  GET DIAGNOSTICS removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'blocked', false,
    'removed', removed > 0,
    'contractor_profile_id', p_contractor_profile_id
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.apply_customer_low_rating_block()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  IF NEW.reviewer_role IS DISTINCT FROM 'CUSTOMER' OR NEW.rating IS NULL OR NEW.rating > 3 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customer_contractor_blocks (
    customer_profile_id,
    contractor_profile_id,
    reason,
    source_review_id,
    source_booking_id
  ) VALUES (
    NEW.customer_id,
    NEW.contractor_profile_id,
    'LOW_RATING',
    NEW.id,
    NEW.booking_id
  )
  ON CONFLICT (customer_profile_id, contractor_profile_id) DO NOTHING;

  SELECT b.project_id INTO v_project_id
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;

  PERFORM public.close_blocked_contractor_open_offers(
    NEW.customer_id,
    NEW.contractor_profile_id,
    v_project_id
  );

  RETURN NEW;
END;
$function$
