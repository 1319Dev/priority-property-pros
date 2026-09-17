-- Phase 4B RLS and grants. Deny-by-default. No client writes on financial tables.
-- Webhook / Stripe mutation RPCs are service_role only.

ALTER TABLE public.contractor_stripe_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY contractor_stripe_accounts_select_own
  ON public.contractor_stripe_accounts FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY payment_schedules_select_participants
  ON public.payment_schedules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.contractor_profile_id = public.current_contractor_profile_id() OR public.is_admin())
    )
  );

CREATE POLICY payment_schedule_items_select_participants
  ON public.payment_schedule_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.contractor_profile_id = public.current_contractor_profile_id() OR public.is_admin())
    )
  );

CREATE POLICY payments_select_participants
  ON public.payments FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.contractor_profile_id = public.current_contractor_profile_id() OR public.is_admin())
    )
  );

CREATE POLICY ledger_entries_select_participants
  ON public.ledger_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.contractor_profile_id = public.current_contractor_profile_id() OR public.is_admin())
    )
  );

CREATE POLICY contractor_transfers_select_own
  ON public.contractor_transfers FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY refunds_select_participants
  ON public.refunds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.contractor_profile_id = public.current_contractor_profile_id() OR public.is_admin())
    )
  );

CREATE POLICY stripe_disputes_select_participants
  ON public.stripe_disputes FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.contractor_profile_id = public.current_contractor_profile_id())
    )
  );

CREATE POLICY booking_cancellations_select_participants
  ON public.booking_cancellations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.contractor_profile_id = public.current_contractor_profile_id() OR public.is_admin())
    )
  );

CREATE POLICY stripe_events_select_admin
  ON public.stripe_events FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.contractor_stripe_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payment_schedules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payment_schedule_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.stripe_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ledger_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.contractor_transfers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.refunds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.stripe_disputes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.booking_cancellations FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.contractor_stripe_accounts TO authenticated;
GRANT SELECT ON TABLE public.payment_schedules TO authenticated;
GRANT SELECT ON TABLE public.payment_schedule_items TO authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;
GRANT SELECT ON TABLE public.ledger_entries TO authenticated;
GRANT SELECT ON TABLE public.contractor_transfers TO authenticated;
GRANT SELECT ON TABLE public.refunds TO authenticated;
GRANT SELECT ON TABLE public.stripe_disputes TO authenticated;
GRANT SELECT ON TABLE public.booking_cancellations TO authenticated;
GRANT SELECT ON TABLE public.stripe_events TO authenticated;

-- Internal / trigger helpers: no client execute
REVOKE ALL ON FUNCTION public.require_stripe_server_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_financial_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_ledger_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_live_payment_flags() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.append_ledger_entry(uuid, public.ledger_entry_type, integer, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reopen_project_after_abandoned_booking(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_change_order_schedule_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deposit_cents_for_amount(integer) FROM PUBLIC, anon;

-- Server-only Stripe RPCs
REVOKE ALL ON FUNCTION public.claim_stripe_event(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_payment_intent(uuid, uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_payment_intent_update(text, text, text, text, integer, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_booking_from_payment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_contractor_stripe_account(uuid, text, boolean, boolean, boolean, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_refund(uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_dispute(text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_transfer_update(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eligible_transfers_for_payout(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_payment_intent(uuid, uuid, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_intent_update(text, text, text, text, integer, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_booking_from_payment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_contractor_stripe_account(uuid, text, boolean, boolean, boolean, boolean, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_refund(uuid, uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_dispute(text, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_transfer_update(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.eligible_transfers_for_payout(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.append_ledger_entry(uuid, public.ledger_entry_type, integer, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, uuid, text) TO service_role;

-- Signed-in RPCs
REVOKE ALL ON FUNCTION public.ensure_payment_schedule(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_guidance_for_amount(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stripe_test_mode() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_milestone_complete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_milestone(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_booking_cancellation(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.booking_payment_overview(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_payment_schedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_guidance_for_amount(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_test_mode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_milestone_complete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_milestone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_booking_cancellation(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_payment_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_cents_for_amount(integer) TO authenticated;

COMMENT ON FUNCTION public.confirm_booking_from_payment(uuid) IS
  'Server-only real confirmation path after a verified Stripe webhook. confirm_booking_for_testing remains ADMIN test-only and is not this path.';
COMMENT ON FUNCTION public.claim_stripe_event(text, text, jsonb) IS
  'Idempotency insert for Stripe event ids. Returns false on replay.';
COMMENT ON TABLE public.ledger_entries IS
  'Append-only PPP ledger. Corrections are new rows. Integer cents. Traceable to booking, schedule item, PI/charge, parties, fee snapshot, CO, refund, dispute, transfer.';
