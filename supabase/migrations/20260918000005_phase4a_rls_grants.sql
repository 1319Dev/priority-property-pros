-- Phase 4A RLS, grants, and address unlock: CONFIRMED booking only.

DROP POLICY IF EXISTS project_private_locations_select_protected ON public.project_private_locations;
CREATE POLICY project_private_locations_select_protected
  ON public.project_private_locations FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.booking_is_confirmed_for_contractor(project_id)
  );

ALTER TABLE public.fee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_schedule_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contractor_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY fee_schedules_select_active_or_admin
  ON public.fee_schedules FOR SELECT TO authenticated
  USING (is_active OR public.is_admin());

CREATE POLICY fee_schedule_brackets_select_via_schedule
  ON public.fee_schedule_brackets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fee_schedules s
      WHERE s.id = schedule_id
        AND (s.is_active OR public.is_admin())
    )
  );

CREATE POLICY bookings_select_participants
  ON public.bookings FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY booking_events_select_participants
  ON public.booking_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (
          b.customer_id = auth.uid()
          OR b.contractor_profile_id = public.current_contractor_profile_id()
          OR public.is_admin()
        )
    )
  );

CREATE POLICY relationships_select_parties
  ON public.customer_contractor_relationships FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY change_orders_select_participants
  ON public.change_orders FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (
          b.customer_id = auth.uid()
          OR b.contractor_profile_id = public.current_contractor_profile_id()
          OR public.is_admin()
        )
    )
  );

CREATE POLICY booking_reviews_select_participants
  ON public.booking_reviews FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

REVOKE ALL ON TABLE public.fee_schedules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.fee_schedule_brackets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bookings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.booking_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customer_contractor_relationships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.change_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.booking_reviews FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.fee_schedules TO authenticated;
GRANT SELECT ON TABLE public.fee_schedule_brackets TO authenticated;
GRANT SELECT ON TABLE public.bookings TO authenticated;
GRANT SELECT ON TABLE public.booking_events TO authenticated;
GRANT SELECT ON TABLE public.customer_contractor_relationships TO authenticated;
GRANT SELECT ON TABLE public.change_orders TO authenticated;
GRANT SELECT ON TABLE public.booking_reviews TO authenticated;

REVOKE ALL ON FUNCTION public.write_booking_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_booking_fee(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_booking_money(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_relationship_on_confirm(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_fee_basis_cents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pair_has_completed_booking(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_booking_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_relationship_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_change_order_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_review_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_fee_schedule_row() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.payments_live() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.charges_live() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.relationship_protection_months() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_fee_schedule_id(public.fee_schedule_kind) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_fee(integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preview_marketplace_fee(integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_booking_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_booking_contractor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.booking_is_confirmed_for_contractor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contractor_has_booking_on_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_stale_pending_bookings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_booking_awaiting_payment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_pending_booking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_booking_for_testing(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_booking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_booking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dispute_booking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.propose_change_order(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_change_order(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_booking_review(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.booking_job_contact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hire_again_contractors() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.select_estimate(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.progressive_fee_cents_from_brackets(integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_fee_bounds(integer, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_fee_from_snapshot(integer, jsonb, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.payments_live() TO authenticated;
GRANT EXECUTE ON FUNCTION public.charges_live() TO authenticated;
GRANT EXECUTE ON FUNCTION public.relationship_protection_months() TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_fee(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_marketplace_fee(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_booking_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_booking_contractor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_is_confirmed_for_contractor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contractor_has_booking_on_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_booking_awaiting_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pending_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_for_testing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propose_change_order(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_change_order(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_booking_review(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_job_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hire_again_contractors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_estimate(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.confirm_booking_for_testing(uuid) IS
  'ADMIN-only test path. Production UI must not present this as Pay now succeeded. payments_live and charges_live stay false.';
COMMENT ON FUNCTION public.booking_is_confirmed_for_contractor(uuid) IS
  'Exact street / coordinates unlock. Selection alone is not enough.';
COMMENT ON FUNCTION public.booking_job_contact(uuid) IS
  'RPC-mediated phone/email/street after CONFIRMED. Does not open profiles SELECT.';
