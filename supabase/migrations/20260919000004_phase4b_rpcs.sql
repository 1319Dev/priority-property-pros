-- Phase 4B RPCs: schedules, webhook application, confirm-from-payment,
-- milestones, refunds/disputes/cancellations, Connect sync, transfers.
-- SECURITY DEFINER always checks auth.uid() / is_admin() / server-only as appropriate.
-- confirm_booking_for_testing remains ADMIN-only and is NOT the real payment path.

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

  PERFORM public.ensure_payment_schedule(bid);

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
    'message', 'Stripe TEST MODE checkout can collect the required payment. Client redirects do not confirm the booking.'
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
  reopen jsonb;
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
  UPDATE public.payment_schedule_items
  SET status = 'CANCELLED'
  WHERE booking_id = b.id
    AND status IN ('SCHEDULED', 'DUE', 'PENDING', 'FAILED');
  INSERT INTO public.booking_cancellations (
    booking_id, category, initiator, reason, refund_decision, payment_state, created_by
  ) VALUES (
    b.id, 'BEFORE_PAYMENT', 'CUSTOMER', 'customer_cancelled', 'NONE', b.status::text, auth.uid()
  );
  PERFORM public.ppp_set_rpc('abandon_pending_booking');
  reopen := public.reopen_project_after_abandoned_booking(b.id);
  PERFORM public.write_booking_event(b.id, 'booking.cancelled', jsonb_build_object('reason', 'customer_cancelled', 'reopen', reopen));
  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', 'CANCELLED',
    'relationship_created', false,
    'charges_live', false,
    'payments_live', false,
    'reopen', reopen
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_pending_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  n integer := 0;
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('expire_stale_pending_bookings');
  END IF;
  FOR rec IN
    SELECT id
    FROM public.bookings
    WHERE status IN ('PENDING', 'AWAITING_PAYMENT')
      AND expires_at IS NOT NULL
      AND expires_at < now()
    FOR UPDATE
  LOOP
    UPDATE public.bookings
    SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = coalesce(cancel_reason, 'expired_pending')
    WHERE id = rec.id;
    UPDATE public.payment_schedule_items
    SET status = 'CANCELLED'
    WHERE booking_id = rec.id
      AND status IN ('SCHEDULED', 'DUE', 'PENDING', 'FAILED');
    INSERT INTO public.booking_cancellations (
      booking_id, category, initiator, reason, refund_decision, payment_state, created_by
    ) VALUES (
      rec.id, 'BEFORE_PAYMENT', 'SYSTEM', 'expired_pending', 'NONE', 'EXPIRED', NULL
    );
    PERFORM public.ppp_set_rpc('abandon_pending_booking');
    PERFORM public.reopen_project_after_abandoned_booking(rec.id);
    PERFORM public.ppp_set_rpc('expire_stale_pending_bookings');
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_booking_from_payment(p_booking_id uuid)
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
  PERFORM public.require_stripe_server_role();
  PERFORM public.ppp_set_rpc('confirm_booking_from_payment');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED') THEN
    RETURN jsonb_build_object('booking_id', b.id, 'status', b.status, 'already_confirmed', true, 'payments_live', false, 'charges_live', false);
  END IF;
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
    'booking.confirmed_from_payment',
    jsonb_build_object('relationship_id', rid, 'fee', preview, 'payments_live', false, 'source', 'stripe_webhook')
  );
  PERFORM public.write_audit_log(
    NULL,
    'booking.confirmed_from_payment',
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
    'testing_only', false,
    'source', 'stripe_webhook'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  p_stripe_event_id text,
  p_event_type text,
  p_payload_summary jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_stripe_server_role();
  PERFORM public.ppp_set_rpc('claim_stripe_event');
  INSERT INTO public.stripe_events (stripe_event_id, event_type, payload_summary, status)
  VALUES (p_stripe_event_id, p_event_type, coalesce(p_payload_summary, '{}'::jsonb), 'processed');
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_payment_intent(
  p_booking_id uuid,
  p_schedule_item_id uuid,
  p_amount_cents integer,
  p_stripe_payment_intent_id text,
  p_stripe_checkout_session_id text DEFAULT NULL,
  p_payment_method_kind text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  item public.payment_schedule_items;
  v_kind public.payment_method_kind;
  pid uuid;
BEGIN
  PERFORM public.require_stripe_server_role();
  PERFORM public.ppp_set_rpc('register_payment_intent');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  SELECT * INTO item FROM public.payment_schedule_items WHERE id = p_schedule_item_id FOR UPDATE;
  IF NOT FOUND OR item.booking_id <> b.id THEN RAISE EXCEPTION 'schedule item not found'; END IF;
  IF item.amount_cents <> p_amount_cents THEN
    RAISE EXCEPTION 'amount does not match schedule item';
  END IF;
  IF item.status IN ('SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED') THEN
    RAISE EXCEPTION 'schedule item is not payable';
  END IF;
  BEGIN
    IF p_payment_method_kind IS NOT NULL THEN
      v_kind := p_payment_method_kind::public.payment_method_kind;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    v_kind := NULL;
  END;

  INSERT INTO public.payments (
    booking_id, schedule_item_id, customer_id, amount_cents, status,
    payment_method_kind, stripe_payment_intent_id, stripe_checkout_session_id, stripe_mode
  ) VALUES (
    b.id, item.id, b.customer_id, item.amount_cents, 'PENDING',
    v_kind, p_stripe_payment_intent_id, p_stripe_checkout_session_id, 'test'
  )
  ON CONFLICT (stripe_payment_intent_id) DO UPDATE
    SET stripe_checkout_session_id = coalesce(EXCLUDED.stripe_checkout_session_id, public.payments.stripe_checkout_session_id)
  RETURNING id INTO pid;

  UPDATE public.payment_schedule_items
  SET
    status = 'PENDING',
    stripe_payment_intent_id = p_stripe_payment_intent_id,
    stripe_checkout_session_id = coalesce(p_stripe_checkout_session_id, stripe_checkout_session_id),
    payment_method_kind = coalesce(v_kind, payment_method_kind)
  WHERE id = item.id;

  IF b.status = 'PENDING' THEN
    UPDATE public.bookings SET status = 'AWAITING_PAYMENT' WHERE id = b.id;
    PERFORM public.write_booking_event(b.id, 'booking.awaiting_payment', jsonb_build_object('payment_id', pid));
  END IF;

  RETURN jsonb_build_object(
    'payment_id', pid,
    'booking_status', (SELECT status FROM public.bookings WHERE id = b.id),
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_payment_intent_update(
  p_stripe_payment_intent_id text,
  p_status text,
  p_stripe_charge_id text DEFAULT NULL,
  p_stripe_balance_transaction_id text DEFAULT NULL,
  p_processing_cost_cents integer DEFAULT 0,
  p_payment_method_kind text DEFAULT NULL,
  p_confirms_booking boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payments;
  item public.payment_schedule_items;
  b public.bookings;
  v_fee integer := 0;
  v_contractor integer := 0;
  v_transfer uuid;
  v_kind public.payment_method_kind;
  confirm_result jsonb := NULL;
BEGIN
  PERFORM public.require_stripe_server_role();
  PERFORM public.ppp_set_rpc('apply_payment_intent_update');
  SELECT * INTO pay FROM public.payments WHERE stripe_payment_intent_id = p_stripe_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_registered');
  END IF;
  SELECT * INTO item FROM public.payment_schedule_items WHERE id = pay.schedule_item_id FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id = pay.booking_id FOR UPDATE;

  BEGIN
    IF p_payment_method_kind IS NOT NULL THEN
      v_kind := p_payment_method_kind::public.payment_method_kind;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    v_kind := pay.payment_method_kind;
  END;

  IF p_status = 'processing' THEN
    IF item.status = 'SUCCEEDED' THEN
      RETURN jsonb_build_object('ok', true, 'ignored', 'already_succeeded');
    END IF;
    UPDATE public.payment_schedule_items SET status = 'PROCESSING' WHERE id = item.id;
    UPDATE public.payments SET status = 'PROCESSING', payment_method_kind = coalesce(v_kind, payment_method_kind) WHERE id = pay.id;
    RETURN jsonb_build_object('ok', true, 'status', 'PROCESSING');
  END IF;

  IF p_status IN ('failed', 'canceled') THEN
    IF item.status = 'SUCCEEDED' THEN
      RETURN jsonb_build_object('ok', true, 'ignored', 'already_succeeded');
    END IF;
    UPDATE public.payment_schedule_items SET status = 'FAILED', failed_at = now() WHERE id = item.id;
    UPDATE public.payments SET status = 'FAILED' WHERE id = pay.id;
    PERFORM public.write_booking_event(b.id, 'payment.failed', jsonb_build_object('payment_intent', p_stripe_payment_intent_id));
    RETURN jsonb_build_object('ok', true, 'status', 'FAILED', 'booking_confirmed', false, 'contact_unlocked', false);
  END IF;

  IF p_status <> 'succeeded' THEN
    RETURN jsonb_build_object('ok', true, 'ignored', p_status);
  END IF;

  IF item.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'booking_id', b.id);
  END IF;

  UPDATE public.payments
  SET
    status = 'SUCCEEDED',
    stripe_charge_id = coalesce(p_stripe_charge_id, stripe_charge_id),
    stripe_balance_transaction_id = coalesce(p_stripe_balance_transaction_id, stripe_balance_transaction_id),
    processing_cost_cents = greatest(coalesce(p_processing_cost_cents, 0), 0),
    payment_method_kind = coalesce(v_kind, payment_method_kind)
  WHERE id = pay.id;

  UPDATE public.payment_schedule_items
  SET
    status = 'SUCCEEDED',
    paid_at = now(),
    stripe_charge_id = coalesce(p_stripe_charge_id, stripe_charge_id),
    payment_method_kind = coalesce(v_kind, payment_method_kind)
  WHERE id = item.id;

  IF b.fee_locked THEN
    v_fee := round((item.amount_cents::numeric * b.fee_cents) / greatest(b.billable_amount_cents, 1))::integer;
  ELSE
    v_fee := round((item.amount_cents::numeric * b.fee_cents) / greatest(b.amount_cents, 1))::integer;
  END IF;
  v_contractor := greatest(0, item.amount_cents - v_fee);

  PERFORM public.append_ledger_entry(b.id, 'CUSTOMER_PAYMENT_GROSS', item.amount_cents, item.id, pay.id, p_stripe_payment_intent_id, p_stripe_charge_id, p_stripe_balance_transaction_id, b.fee_schedule_id, NULL, NULL, NULL, NULL, 'Customer payment (gross)');
  IF coalesce(p_processing_cost_cents, 0) > 0 THEN
    PERFORM public.append_ledger_entry(b.id, 'PROCESSING_COST', p_processing_cost_cents, item.id, pay.id, p_stripe_payment_intent_id, p_stripe_charge_id, p_stripe_balance_transaction_id, NULL, NULL, NULL, NULL, NULL, 'Processor cost from Stripe balance transaction');
  END IF;
  IF v_fee > 0 THEN
    PERFORM public.append_ledger_entry(b.id, 'MARKETPLACE_FEE', v_fee, item.id, pay.id, p_stripe_payment_intent_id, p_stripe_charge_id, NULL, b.fee_schedule_id, NULL, NULL, NULL, NULL, 'PPP marketplace fee (contractor-paid)');
  END IF;
  PERFORM public.append_ledger_entry(b.id, 'CONTRACTOR_GROSS', v_contractor, item.id, pay.id, p_stripe_payment_intent_id, p_stripe_charge_id, NULL, b.fee_schedule_id, NULL, NULL, NULL, NULL, 'Contractor gross before transfer eligibility');

  IF p_confirms_booking OR item.due_now OR item.kind IN ('BOOKING_DEPOSIT', 'FINAL_PAYMENT') AND item.sequence = 1 THEN
    confirm_result := public.confirm_booking_from_payment(b.id);
    SELECT * INTO b FROM public.bookings WHERE id = b.id;
  END IF;

  INSERT INTO public.contractor_transfers (
    booking_id, contractor_profile_id, schedule_item_id, payment_id, amount_cents, status, stripe_mode
  ) VALUES (
    b.id, b.contractor_profile_id, item.id, pay.id, v_contractor,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.stripe_disputes d WHERE d.booking_id = b.id AND d.status IN ('NEEDS_RESPONSE', 'UNDER_REVIEW', 'HELD')) THEN 'HELD'::public.contractor_transfer_status
      WHEN b.status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
           AND (item.kind <> 'MILESTONE' OR item.customer_approved_at IS NOT NULL)
        THEN 'ELIGIBLE'::public.contractor_transfer_status
      ELSE 'PENDING'::public.contractor_transfer_status
    END,
    'test'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_transfer;

  IF v_transfer IS NOT NULL AND (SELECT status FROM public.contractor_transfers WHERE id = v_transfer) = 'ELIGIBLE' THEN
    UPDATE public.contractor_transfers SET eligible_at = now() WHERE id = v_transfer;
  END IF;

  PERFORM public.write_booking_event(
    b.id,
    'payment.succeeded',
    jsonb_build_object('payment_id', pay.id, 'schedule_item_id', item.id, 'transfer_id', v_transfer)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'SUCCEEDED',
    'booking_id', b.id,
    'booking_status', b.status,
    'confirmed', b.status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED'),
    'contact_unlocked', b.status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED'),
    'payments_live', false,
    'charges_live', false,
    'confirm', confirm_result
  );
END;
$$;
