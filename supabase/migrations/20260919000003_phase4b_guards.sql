-- Phase 4B mutation guards, schedule builder, abandon/reopen helpers.

CREATE OR REPLACE FUNCTION public.require_stripe_server_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'stripe financial RPCs are server-only';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_financial_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'financial rows cannot be deleted from the client';
    END IF;
    RETURN OLD;
  END IF;
  IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'financial rows cannot be written from the client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_ledger_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ledger entries are immutable; corrections are new rows';
  END IF;
  IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ledger entries cannot be inserted from the client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contractor_stripe_accounts_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.contractor_stripe_accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_row();

CREATE TRIGGER payment_schedules_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.payment_schedules
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_row();

CREATE TRIGGER payment_schedule_items_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.payment_schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_row();

CREATE TRIGGER payments_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_row();

CREATE TRIGGER stripe_events_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.stripe_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_row();

CREATE TRIGGER ledger_entries_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.protect_ledger_row();

CREATE TRIGGER contractor_transfers_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.contractor_transfers
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_row();

CREATE TRIGGER refunds_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_row();

CREATE TRIGGER stripe_disputes_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.stripe_disputes
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_row();

CREATE TRIGGER booking_cancellations_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.booking_cancellations
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_row();

CREATE OR REPLACE FUNCTION public.append_ledger_entry(
  p_booking_id uuid,
  p_entry_type public.ledger_entry_type,
  p_amount_cents integer,
  p_schedule_item_id uuid DEFAULT NULL,
  p_payment_id uuid DEFAULT NULL,
  p_stripe_payment_intent_id text DEFAULT NULL,
  p_stripe_charge_id text DEFAULT NULL,
  p_stripe_balance_transaction_id text DEFAULT NULL,
  p_fee_schedule_id uuid DEFAULT NULL,
  p_change_order_id uuid DEFAULT NULL,
  p_refund_id uuid DEFAULT NULL,
  p_dispute_id uuid DEFAULT NULL,
  p_transfer_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lid uuid;
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('append_ledger_entry');
  END IF;
  INSERT INTO public.ledger_entries (
    booking_id, entry_type, amount_cents, schedule_item_id, payment_id,
    stripe_payment_intent_id, stripe_charge_id, stripe_balance_transaction_id,
    fee_schedule_id, change_order_id, refund_id, dispute_id, transfer_id, actor_id, note
  ) VALUES (
    p_booking_id, p_entry_type, greatest(coalesce(p_amount_cents, 0), 0), p_schedule_item_id, p_payment_id,
    p_stripe_payment_intent_id, p_stripe_charge_id, p_stripe_balance_transaction_id,
    p_fee_schedule_id, p_change_order_id, p_refund_id, p_dispute_id, p_transfer_id, auth.uid(), p_note
  )
  RETURNING id INTO lid;
  RETURN lid;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_guidance_for_amount(p_amount_cents integer)
RETURNS public.payment_guidance_band
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full integer;
  v_miles integer;
  v_amount integer := greatest(coalesce(p_amount_cents, 0), 0);
BEGIN
  v_full := coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'deposit_full_pay_max_cents'), 100000);
  v_miles := coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'structured_milestones_min_cents'), 500000);
  IF v_amount < v_full THEN
    RETURN 'FULL_PAY_ALLOWED';
  END IF;
  IF v_amount < v_miles THEN
    RETURN 'DEPOSIT_PLUS_REMAINING';
  END IF;
  RETURN 'MILESTONES_PREFERRED';
END;
$$;

CREATE OR REPLACE FUNCTION public.deposit_cents_for_amount(p_amount_cents integer)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount integer := greatest(coalesce(p_amount_cents, 0), 0);
  v_bps integer;
  v_max_bps integer;
  v_raw integer;
BEGIN
  IF v_amount <= 0 THEN RETURN 0; END IF;
  v_bps := coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'default_deposit_bps'), 2500);
  v_max_bps := coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'max_deposit_bps'), 2500);
  v_bps := least(v_bps, v_max_bps);
  v_raw := round((v_amount::numeric * v_bps) / 10000.0)::integer;
  RETURN least(v_amount - 1, greatest(1, v_raw));
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_payment_schedule(p_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  sid uuid;
  v_guidance public.payment_guidance_band;
  v_deposit integer;
  v_remainder integer;
  v_milestone integer;
  v_final integer;
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('ensure_payment_schedule');
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF auth.uid() IS NOT NULL
     AND b.customer_id IS DISTINCT FROM auth.uid()
     AND b.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a booking participant';
  END IF;

  SELECT id INTO sid FROM public.payment_schedules WHERE booking_id = b.id;
  IF sid IS NOT NULL THEN RETURN sid; END IF;

  v_guidance := public.payment_guidance_for_amount(b.amount_cents);
  INSERT INTO public.payment_schedules (booking_id, guidance, total_cents)
  VALUES (b.id, v_guidance, b.amount_cents)
  RETURNING id INTO sid;

  IF b.amount_cents <= 0 THEN
    RETURN sid;
  ELSIF v_guidance = 'FULL_PAY_ALLOWED' THEN
    INSERT INTO public.payment_schedule_items (
      schedule_id, booking_id, kind, sequence, amount_cents, description, status, due_now, due_condition
    ) VALUES (
      sid, b.id, 'FINAL_PAYMENT', 1, b.amount_cents, 'Full payment to confirm booking', 'DUE', true, 'due_now_to_confirm'
    );
  ELSIF v_guidance = 'DEPOSIT_PLUS_REMAINING' THEN
    v_deposit := public.deposit_cents_for_amount(b.amount_cents);
    INSERT INTO public.payment_schedule_items (
      schedule_id, booking_id, kind, sequence, amount_cents, description, status, due_now, due_condition
    ) VALUES
      (sid, b.id, 'BOOKING_DEPOSIT', 1, v_deposit, 'Booking deposit to confirm', 'DUE', true, 'due_now_to_confirm'),
      (sid, b.id, 'FINAL_PAYMENT', 2, b.amount_cents - v_deposit, 'Remaining balance', 'SCHEDULED', false, 'after_work_or_completion');
  ELSE
    v_deposit := public.deposit_cents_for_amount(b.amount_cents);
    v_remainder := b.amount_cents - v_deposit;
    v_milestone := v_remainder / 2;
    v_final := v_remainder - v_milestone;
    INSERT INTO public.payment_schedule_items (
      schedule_id, booking_id, kind, sequence, amount_cents, description, status, due_now, due_condition, requires_customer_approval
    ) VALUES
      (sid, b.id, 'BOOKING_DEPOSIT', 1, v_deposit, 'Booking deposit to confirm', 'DUE', true, 'due_now_to_confirm', false),
      (sid, b.id, 'MILESTONE', 2, v_milestone, 'Milestone after approved progress', 'SCHEDULED', false, 'contractor_complete_then_customer_approval', true),
      (sid, b.id, 'FINAL_PAYMENT', 3, v_final, 'Final payment', 'SCHEDULED', false, 'after_prior_items', false);
  END IF;

  RETURN sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_project_after_abandoned_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  v_has_estimates boolean;
  v_has_opps boolean;
  v_status public.project_status;
  v_valid boolean;
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('abandon_pending_booking');
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  SELECT (est.valid_until IS NULL OR est.valid_until > now())
  INTO v_valid
  FROM public.estimates est
  WHERE est.id = b.estimate_id;

  UPDATE public.estimates
  SET status = CASE
    WHEN coalesce(v_valid, true) AND status = 'ACCEPTED' THEN 'SUBMITTED'
    WHEN status = 'ACCEPTED' THEN 'DECLINED'
    ELSE status
  END
  WHERE id = b.estimate_id;

  SELECT EXISTS (
    SELECT 1 FROM public.estimates e
    WHERE e.project_id = b.project_id
      AND e.status IN ('SUBMITTED', 'REVISED')
      AND (e.valid_until IS NULL OR e.valid_until > now())
  ) INTO v_has_estimates;

  SELECT EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.project_id = b.project_id AND o.status = 'ACCEPTED'
  ) INTO v_has_opps;

  v_status := CASE
    WHEN v_has_estimates THEN 'ESTIMATES_AVAILABLE'::public.project_status
    WHEN v_has_opps THEN 'CONTRACTORS_RESPONDING'::public.project_status
    ELSE 'MATCHING'::public.project_status
  END;

  UPDATE public.projects
  SET
    status = v_status,
    selected_estimate_id = NULL,
    selected_contractor_profile_id = NULL,
    selected_booking_id = NULL,
    selected_at = NULL
  WHERE id = b.project_id;

  RETURN jsonb_build_object(
    'project_id', b.project_id,
    'project_status', v_status,
    'reopened_expired_estimates', false,
    'relationship_created', false,
    'contact_unlocked', false,
    'fee_owed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_posted_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('post_project')
     OR public.ppp_rpc_is('select_estimate')
     OR public.ppp_rpc_is('submit_estimate')
     OR public.ppp_rpc_is('accept_opportunity')
     OR public.ppp_rpc_is('abandon_pending_booking')
     OR public.ppp_rpc_is('expire_stale_pending_bookings')
     OR public.ppp_rpc_is('confirm_booking_from_payment')
     OR public.is_admin()
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'DRAFT' THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
      RAISE EXCEPTION 'project owner cannot change after create';
    END IF;
    IF NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.selected_estimate_id IS DISTINCT FROM OLD.selected_estimate_id
       OR NEW.selected_contractor_profile_id IS DISTINCT FROM OLD.selected_contractor_profile_id
       OR NEW.selected_booking_id IS DISTINCT FROM OLD.selected_booking_id THEN
      RAISE EXCEPTION 'posted projects cannot change category, status, or selection from the client';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_estimate_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
     OR NEW.contractor_profile_id IS DISTINCT FROM OLD.contractor_profile_id THEN
    RAISE EXCEPTION 'estimate ownership cannot change';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      public.ppp_rpc_is('submit_estimate')
      OR public.ppp_rpc_is('withdraw_estimate')
      OR public.ppp_rpc_is('select_estimate')
      OR public.ppp_rpc_is('abandon_pending_booking')
      OR public.ppp_rpc_is('expire_stale_pending_bookings')
    ) THEN
      RAISE EXCEPTION 'estimate status can only change through submit, withdraw, or select';
    END IF;
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
