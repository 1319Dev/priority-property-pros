-- Phase 4B remaining RPCs: Connect, milestones, COs, refunds, disputes, transfers, cancellations.

CREATE OR REPLACE FUNCTION public.sync_contractor_stripe_account(
  p_contractor_profile_id uuid,
  p_stripe_account_id text,
  p_details_submitted boolean,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_disabled boolean DEFAULT false,
  p_disabled_reason text DEFAULT NULL,
  p_transfers_capability text DEFAULT 'unrequested'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.connect_account_status;
  rid uuid;
BEGIN
  PERFORM public.require_stripe_server_role();
  PERFORM public.ppp_set_rpc('sync_contractor_stripe_account');
  IF p_disabled THEN
    v_status := 'DISABLED';
  ELSIF p_payouts_enabled AND p_charges_enabled AND coalesce(p_transfers_capability, '') = 'active' THEN
    v_status := 'READY';
  ELSIF coalesce(p_details_submitted, false) THEN
    v_status := 'RESTRICTED';
  ELSE
    v_status := 'ONBOARDING';
  END IF;

  INSERT INTO public.contractor_stripe_accounts (
    contractor_profile_id, stripe_account_id, status, details_submitted,
    charges_enabled, payouts_enabled, disabled_reason, stripe_mode
  ) VALUES (
    p_contractor_profile_id, p_stripe_account_id, v_status, coalesce(p_details_submitted, false),
    coalesce(p_charges_enabled, false), coalesce(p_payouts_enabled, false), p_disabled_reason, 'test'
  )
  ON CONFLICT (contractor_profile_id) DO UPDATE
    SET
      stripe_account_id = EXCLUDED.stripe_account_id,
      status = EXCLUDED.status,
      details_submitted = EXCLUDED.details_submitted,
      charges_enabled = EXCLUDED.charges_enabled,
      payouts_enabled = EXCLUDED.payouts_enabled,
      disabled_reason = EXCLUDED.disabled_reason
  RETURNING id INTO rid;

  RETURN jsonb_build_object(
    'id', rid,
    'status', v_status,
    'can_receive_transfers', v_status = 'READY',
    'stripe_mode', 'test'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_milestone_complete(p_schedule_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.payment_schedule_items;
  b public.bookings;
BEGIN
  PERFORM public.ppp_set_rpc('mark_milestone_complete');
  SELECT * INTO item FROM public.payment_schedule_items WHERE id = p_schedule_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule item not found'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = item.booking_id FOR UPDATE;
  IF b.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the booked contractor';
  END IF;
  IF item.kind <> 'MILESTONE' THEN
    RAISE EXCEPTION 'not a milestone item';
  END IF;
  IF item.status IN ('SUCCEEDED', 'CANCELLED', 'REFUNDED') THEN
    RAISE EXCEPTION 'milestone is not open';
  END IF;
  UPDATE public.payment_schedule_items
  SET contractor_completed_at = now(), contractor_completed_by = auth.uid()
  WHERE id = item.id;
  PERFORM public.write_booking_event(b.id, 'milestone.completed', jsonb_build_object('schedule_item_id', item.id));
  RETURN jsonb_build_object('schedule_item_id', item.id, 'awaiting_customer_approval', item.requires_customer_approval);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_milestone(p_schedule_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.payment_schedule_items;
  b public.bookings;
BEGIN
  PERFORM public.ppp_set_rpc('approve_milestone');
  SELECT * INTO item FROM public.payment_schedule_items WHERE id = p_schedule_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule item not found'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = item.booking_id FOR UPDATE;
  IF b.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'only the customer can approve this milestone';
  END IF;
  IF item.kind <> 'MILESTONE' THEN RAISE EXCEPTION 'not a milestone item'; END IF;
  IF item.contractor_completed_at IS NULL THEN
    RAISE EXCEPTION 'contractor has not marked this milestone complete';
  END IF;
  UPDATE public.payment_schedule_items
  SET
    customer_approved_at = now(),
    customer_approved_by = auth.uid(),
    status = CASE WHEN status IN ('SCHEDULED') THEN 'DUE' ELSE status END,
    due_now = true
  WHERE id = item.id;
  PERFORM public.write_booking_event(b.id, 'milestone.approved', jsonb_build_object('schedule_item_id', item.id, 'approved_by', auth.uid()));
  RETURN jsonb_build_object('schedule_item_id', item.id, 'status', 'DUE', 'self_approved_by_contractor', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_change_order_schedule_item(p_change_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  co public.change_orders;
  sid uuid;
  seq integer;
  iid uuid;
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('add_change_order_schedule_item');
  END IF;
  SELECT * INTO co FROM public.change_orders WHERE id = p_change_order_id;
  IF NOT FOUND OR co.status <> 'APPROVED' OR co.amount_delta_cents <= 0 THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_schedule_items WHERE change_order_id = co.id) THEN
    SELECT id INTO iid FROM public.payment_schedule_items WHERE change_order_id = co.id;
    RETURN iid;
  END IF;
  SELECT id INTO sid FROM public.payment_schedules WHERE booking_id = co.booking_id;
  IF sid IS NULL THEN
    sid := public.ensure_payment_schedule(co.booking_id);
  END IF;
  SELECT coalesce(max(sequence), 0) + 1 INTO seq FROM public.payment_schedule_items WHERE schedule_id = sid;
  INSERT INTO public.payment_schedule_items (
    schedule_id, booking_id, kind, sequence, amount_cents, description, status, due_now, due_condition, change_order_id
  ) VALUES (
    sid, co.booking_id, 'APPROVED_CHANGE_ORDER', seq, co.amount_delta_cents, 'Approved change order', 'DUE', true, 'after_approval', co.id
  )
  RETURNING id INTO iid;
  UPDATE public.payment_schedules
  SET total_cents = (
    SELECT coalesce(sum(amount_cents), 0) FROM public.payment_schedule_items WHERE schedule_id = sid
  )
  WHERE id = sid;
  RETURN iid;
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
$$;

CREATE OR REPLACE FUNCTION public.record_refund(
  p_booking_id uuid,
  p_payment_id uuid,
  p_amount_cents integer,
  p_stripe_refund_id text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payments;
  rid uuid;
BEGIN
  PERFORM public.require_stripe_server_role();
  PERFORM public.ppp_set_rpc('record_refund');
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR pay.booking_id <> p_booking_id THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents > pay.amount_cents THEN
    RAISE EXCEPTION 'invalid refund amount';
  END IF;
  INSERT INTO public.refunds (booking_id, payment_id, schedule_item_id, amount_cents, status, stripe_refund_id, reason, created_by)
  VALUES (p_booking_id, pay.id, pay.schedule_item_id, p_amount_cents, 'SUCCEEDED', p_stripe_refund_id, p_reason, NULL)
  ON CONFLICT (stripe_refund_id) DO NOTHING
  RETURNING id INTO rid;
  IF rid IS NULL THEN
    SELECT id INTO rid FROM public.refunds WHERE stripe_refund_id = p_stripe_refund_id;
    RETURN jsonb_build_object('refund_id', rid, 'duplicate', true);
  END IF;
  PERFORM public.append_ledger_entry(p_booking_id, 'REFUND', p_amount_cents, pay.schedule_item_id, pay.id, pay.stripe_payment_intent_id, pay.stripe_charge_id, NULL, NULL, NULL, rid, NULL, NULL, 'Refund — success history retained');
  UPDATE public.payment_schedule_items
  SET status = CASE WHEN p_amount_cents >= amount_cents THEN 'REFUNDED'::public.payment_schedule_item_status ELSE 'PARTIALLY_REFUNDED'::public.payment_schedule_item_status END
  WHERE id = pay.schedule_item_id;
  PERFORM public.write_booking_event(p_booking_id, 'payment.refunded', jsonb_build_object('refund_id', rid, 'amount_cents', p_amount_cents));
  RETURN jsonb_build_object('refund_id', rid, 'deleted_success_history', false, 'payments_live', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_dispute(
  p_stripe_dispute_id text,
  p_stripe_payment_intent_id text,
  p_status text,
  p_amount_cents integer,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payments;
  did uuid;
  v_status public.stripe_dispute_status;
BEGIN
  PERFORM public.require_stripe_server_role();
  PERFORM public.ppp_set_rpc('apply_stripe_dispute');
  SELECT * INTO pay FROM public.payments WHERE stripe_payment_intent_id = p_stripe_payment_intent_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;
  v_status := CASE
    WHEN p_status IN ('won') THEN 'WON'::public.stripe_dispute_status
    WHEN p_status IN ('lost') THEN 'LOST'::public.stripe_dispute_status
    WHEN p_status IN ('warning_closed', 'charge_refunded') THEN 'CLOSED'::public.stripe_dispute_status
    WHEN p_status IN ('under_review') THEN 'UNDER_REVIEW'::public.stripe_dispute_status
    ELSE 'NEEDS_RESPONSE'::public.stripe_dispute_status
  END;
  INSERT INTO public.stripe_disputes (
    booking_id, payment_id, kind, status, stripe_dispute_id, amount_cents, reason
  ) VALUES (
    pay.booking_id, pay.id, 'STRIPE_CHARGEBACK', v_status, p_stripe_dispute_id, coalesce(p_amount_cents, 0), p_reason
  )
  ON CONFLICT (stripe_dispute_id) DO UPDATE
    SET status = EXCLUDED.status, amount_cents = EXCLUDED.amount_cents
  RETURNING id INTO did;

  IF v_status IN ('NEEDS_RESPONSE', 'UNDER_REVIEW', 'HELD') THEN
    UPDATE public.contractor_transfers
    SET status = 'HELD', held_reason = 'stripe_chargeback'
    WHERE booking_id = pay.booking_id
      AND status IN ('PENDING', 'ELIGIBLE', 'TRANSFER_PENDING');
    PERFORM public.append_ledger_entry(pay.booking_id, 'DISPUTE_HOLD', coalesce(p_amount_cents, 0), pay.schedule_item_id, pay.id, p_stripe_payment_intent_id, pay.stripe_charge_id, NULL, NULL, NULL, NULL, did, NULL, 'Stripe chargeback hold');
    UPDATE public.bookings SET status = 'DISPUTED', disputed_at = coalesce(disputed_at, now())
    WHERE id = pay.booking_id AND status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED');
  END IF;

  PERFORM public.write_booking_event(pay.booking_id, 'stripe.dispute', jsonb_build_object('dispute_id', did, 'kind', 'STRIPE_CHARGEBACK', 'status', v_status));
  RETURN jsonb_build_object('dispute_id', did, 'kind', 'STRIPE_CHARGEBACK', 'held', v_status IN ('NEEDS_RESPONSE', 'UNDER_REVIEW', 'HELD'));
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_transfer_update(
  p_transfer_id uuid,
  p_stripe_transfer_id text,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.contractor_transfers;
  v_status public.contractor_transfer_status;
BEGIN
  PERFORM public.require_stripe_server_role();
  PERFORM public.ppp_set_rpc('apply_transfer_update');
  SELECT * INTO t FROM public.contractor_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF t.stripe_transfer_id IS NOT NULL AND t.stripe_transfer_id IS DISTINCT FROM p_stripe_transfer_id AND p_stripe_transfer_id IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate transfer prevented';
  END IF;
  v_status := CASE
    WHEN p_status IN ('paid', 'transferred') THEN 'TRANSFERRED'::public.contractor_transfer_status
    WHEN p_status IN ('pending', 'in_transit') THEN 'TRANSFER_PENDING'::public.contractor_transfer_status
    WHEN p_status IN ('failed') THEN 'FAILED'::public.contractor_transfer_status
    WHEN p_status IN ('reversed', 'canceled') THEN 'REVERSED'::public.contractor_transfer_status
    ELSE t.status
  END;
  UPDATE public.contractor_transfers
  SET
    status = v_status,
    stripe_transfer_id = coalesce(p_stripe_transfer_id, stripe_transfer_id),
    transferred_at = CASE WHEN v_status = 'TRANSFERRED' THEN coalesce(transferred_at, now()) ELSE transferred_at END
  WHERE id = t.id;
  IF v_status = 'TRANSFERRED' AND t.status IS DISTINCT FROM 'TRANSFERRED' THEN
    PERFORM public.append_ledger_entry(t.booking_id, 'TRANSFER', t.amount_cents, t.schedule_item_id, t.payment_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, t.id, 'Transfer to connected account');
  END IF;
  IF v_status = 'REVERSED' THEN
    PERFORM public.append_ledger_entry(t.booking_id, 'TRANSFER_REVERSAL', t.amount_cents, t.schedule_item_id, t.payment_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, t.id, 'Transfer reversed');
  END IF;
  RETURN jsonb_build_object('transfer_id', t.id, 'status', v_status, 'duplicate_prevented', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.eligible_transfers_for_payout(p_contractor_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acct public.contractor_stripe_accounts;
  result jsonb;
BEGIN
  PERFORM public.require_stripe_server_role();
  SELECT * INTO acct FROM public.contractor_stripe_accounts WHERE contractor_profile_id = p_contractor_profile_id;
  IF acct.status IS DISTINCT FROM 'READY' THEN
    RETURN jsonb_build_object('ready', false, 'transfers', '[]'::jsonb);
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO result
  FROM public.contractor_transfers t
  WHERE t.contractor_profile_id = p_contractor_profile_id
    AND t.status = 'ELIGIBLE'
    AND t.stripe_transfer_id IS NULL;
  RETURN jsonb_build_object('ready', true, 'stripe_account_id', acct.stripe_account_id, 'transfers', result);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_booking_cancellation(
  p_booking_id uuid,
  p_reason text DEFAULT NULL,
  p_mutual boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  v_role text;
  v_cat public.cancellation_category;
  v_has_pay boolean;
  v_has_ms boolean;
  cid uuid;
BEGIN
  PERFORM public.ppp_set_rpc('request_booking_cancellation');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.customer_id = auth.uid() THEN
    v_role := 'CUSTOMER';
  ELSIF b.contractor_profile_id = public.current_contractor_profile_id() THEN
    v_role := 'CONTRACTOR';
  ELSIF public.is_admin() THEN
    v_role := 'ADMIN';
  ELSE
    RAISE EXCEPTION 'not a booking participant';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.payment_schedule_items i WHERE i.booking_id = b.id AND i.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED')) INTO v_has_pay;
  SELECT EXISTS (SELECT 1 FROM public.payment_schedule_items i WHERE i.booking_id = b.id AND i.kind = 'MILESTONE' AND i.status = 'SUCCEEDED') INTO v_has_ms;

  IF coalesce(p_mutual, false) THEN
    v_cat := 'MUTUAL';
  ELSIF v_role = 'CONTRACTOR' THEN
    v_cat := 'CONTRACTOR_CANCELLED';
  ELSIF NOT v_has_pay THEN
    v_cat := 'BEFORE_PAYMENT';
  ELSIF v_has_ms THEN
    v_cat := 'AFTER_MILESTONE_PAYMENT';
  ELSIF b.status IN ('IN_PROGRESS', 'COMPLETED') THEN
    v_cat := 'AFTER_WORK_STARTED';
  ELSIF v_role = 'CUSTOMER' THEN
    v_cat := 'CUSTOMER_CANCELLED';
  ELSE
    v_cat := 'AFTER_DEPOSIT_BEFORE_WORK';
  END IF;

  INSERT INTO public.booking_cancellations (
    booking_id, category, initiator, reason, refund_decision, payment_state, created_by
  ) VALUES (
    b.id,
    v_cat,
    CASE WHEN coalesce(p_mutual, false) THEN 'MUTUAL' ELSE v_role END,
    p_reason,
    CASE WHEN v_cat = 'BEFORE_PAYMENT' THEN 'NONE'::public.refund_decision ELSE 'PENDING_REVIEW'::public.refund_decision END,
    b.status::text,
    auth.uid()
  )
  RETURNING id INTO cid;

  IF v_cat = 'BEFORE_PAYMENT' AND b.status IN ('PENDING', 'AWAITING_PAYMENT') THEN
    RETURN public.cancel_pending_booking(b.id) || jsonb_build_object('cancellation_id', cid);
  END IF;

  PERFORM public.write_booking_event(
    b.id,
    'booking.cancellation_requested',
    jsonb_build_object('cancellation_id', cid, 'category', v_cat, 'auto_refund', v_cat = 'BEFORE_PAYMENT')
  );
  RETURN jsonb_build_object(
    'cancellation_id', cid,
    'category', v_cat,
    'refund_decision', CASE WHEN v_cat = 'BEFORE_PAYMENT' THEN 'NONE' ELSE 'PENDING_REVIEW' END,
    'auto_decided_post_work', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_payment_overview(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  sched public.payment_schedules;
  items jsonb;
  transfers jsonb;
  ledger jsonb;
  acct public.contractor_stripe_accounts;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF NOT (
    public.is_admin()
    OR b.customer_id = auth.uid()
    OR b.contractor_profile_id = public.current_contractor_profile_id()
  ) THEN
    RAISE EXCEPTION 'not a booking participant';
  END IF;
  SELECT * INTO sched FROM public.payment_schedules WHERE booking_id = b.id;
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.sequence), '[]'::jsonb)
  INTO items
  FROM public.payment_schedule_items i
  WHERE i.booking_id = b.id;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
  INTO transfers
  FROM public.contractor_transfers t
  WHERE t.booking_id = b.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'entry_type', e.entry_type, 'amount_cents', e.amount_cents, 'created_at', e.created_at, 'note', e.note
  ) ORDER BY e.created_at), '[]'::jsonb)
  INTO ledger
  FROM public.ledger_entries e
  WHERE e.booking_id = b.id;
  SELECT * INTO acct FROM public.contractor_stripe_accounts WHERE contractor_profile_id = b.contractor_profile_id;
  RETURN jsonb_build_object(
    'booking_id', b.id,
    'booking_status', b.status,
    'guidance', sched.guidance,
    'items', items,
    'transfers', transfers,
    'ledger', ledger,
    'connect_status', acct.status,
    'can_receive_transfers', acct.status = 'READY',
    'amount_due_now_cents', coalesce((SELECT sum(amount_cents) FROM public.payment_schedule_items WHERE booking_id = b.id AND due_now AND status IN ('DUE', 'PENDING', 'FAILED', 'PROCESSING')), 0),
    'charges_live', false,
    'payments_live', false,
    'stripe_mode', 'test',
    'marketplace_fee_cents', b.fee_cents,
    'contractor_earnings_cents', b.contractor_earnings_cents,
    'fee_locked', b.fee_locked
  );
END;
$$;
