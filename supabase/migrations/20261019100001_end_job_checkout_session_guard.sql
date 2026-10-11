-- Stop contractor_end_job from writing connection checkout sessions.
-- The #88 guard let that RPC marker pass protect_connection_checkout_session_row,
-- so any write while the marker was set (including amount, price, and payment
-- status) was accepted. End-job still completes a PAID connection, still
-- completes a hired PAID connection without touching the booking, and still
-- cancels an unpaid occupying row. An OPEN session on that unpaid row is
-- expired by expire_open_connection_checkout_sessions, whose marker can change
-- only status OPEN -> EXPIRED and updated_at.
--
-- Does not change fee_cents (499), the $9.99 activation fee, price IDs, or
-- fulfillment. Does not grant contact. Does not mark a connection PAID.
--
-- Version 20261019100001 is after every migration on open PRs as of 2026-10-11:
-- 20261018000001, 20261017000002, 20261017000001, 20261016000004,
-- 20261016000003, 20261016000002, 20261015120000, 20261014000001.
-- This file does not replace protect_project_connection_row, so the account
-- deletion PR's purge_account_owned_rows allow-list is left intact.
-- Prod protect_connection_checkout_session_row was read on 2026-10-11 and
-- matched the allow-list in 20261015000002, including contractor_end_job.
-- Replaces existing function protect_connection_checkout_session_row; must be diffed against prod before apply.
-- Replaces existing function contractor_end_job; must be diffed against prod before apply.
-- Creates function expire_open_connection_checkout_sessions.

CREATE OR REPLACE FUNCTION public.protect_connection_checkout_session_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- End-job may expire an OPEN session only through this dedicated marker.
  -- contractor_end_job itself is not allowed to insert, update, or delete a session.
  IF public.ppp_rpc_is('expire_open_connection_checkout_sessions') THEN
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'OPEN'
       AND NEW.status = 'EXPIRED'
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.connection_id IS NOT DISTINCT FROM OLD.connection_id
       AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
       AND NEW.contractor_profile_id IS NOT DISTINCT FROM OLD.contractor_profile_id
       AND NEW.stripe_checkout_session_id IS NOT DISTINCT FROM OLD.stripe_checkout_session_id
       AND NEW.stripe_payment_intent_id IS NOT DISTINCT FROM OLD.stripe_payment_intent_id
       AND NEW.price_id IS NOT DISTINCT FROM OLD.price_id
       AND NEW.amount_cents IS NOT DISTINCT FROM OLD.amount_cents
       AND NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.livemode IS NOT DISTINCT FROM OLD.livemode
       AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status
       AND NEW.consumed_at IS NOT DISTINCT FROM OLD.consumed_at
       AND NEW.fulfilled_at IS NOT DISTINCT FROM OLD.fulfilled_at
       AND NEW.needs_refund IS NOT DISTINCT FROM OLD.needs_refund
       AND NEW.refund_reason IS NOT DISTINCT FROM OLD.refund_reason
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
       AND NEW.fulfillment_reference IS NOT DISTINCT FROM OLD.fulfillment_reference
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'connection checkout sessions cannot be written from the client';
  END IF;

  IF public.ppp_rpc_is('attach_connection_checkout_session')
     OR public.ppp_rpc_is('fulfill_connection_fee_checkout')
     OR public.ppp_rpc_is('expire_connection_checkout_session')
     OR public.ppp_rpc_is('flag_connection_checkout_needs_refund')
     OR public.ppp_rpc_is('record_connection_checkout_event') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'connection checkout sessions cannot be written from the client';
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_open_connection_checkout_sessions(p_connection_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  PERFORM public.ppp_set_rpc('expire_open_connection_checkout_sessions');
  UPDATE public.connection_checkout_sessions
  SET status = 'EXPIRED', updated_at = now()
  WHERE connection_id = p_connection_id
    AND status = 'OPEN';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_open_connection_checkout_sessions(uuid) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.expire_open_connection_checkout_sessions(uuid) IS
  'Internal. Called by contractor_end_job. Sets only OPEN checkout sessions to EXPIRED. Not granted to clients or service_role.';

CREATE OR REPLACE FUNCTION public.contractor_end_job(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opp public.opportunities;
  proj public.projects;
  contractor_id uuid;
  conn public.project_connections;
  est record;
  active_booking public.bookings;
  connection_status public.project_connection_status;
  opportunity_status public.opportunity_status;
  released_connection_slot boolean := false;
  released_opportunity_slot boolean := false;
  withdrew_estimates integer := 0;
  already_ended boolean := false;
  backfilled integer := 0;
BEGIN
  PERFORM public.ppp_set_rpc('contractor_end_job');
  PERFORM public.expire_stale_connection_reservations();
  -- expire_stale_connection_reservations overwrites ppp.rpc. Restore it before
  -- any connection, slot, or checkout write. The later restore after withdraw_estimate stays.
  PERFORM public.ppp_set_rpc('contractor_end_job');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  contractor_id := public.current_contractor_profile_id();
  IF contractor_id IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'only a contractor can end a job';
  END IF;

  SELECT * INTO opp FROM public.opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity not found';
  END IF;
  IF opp.contractor_profile_id IS DISTINCT FROM contractor_id
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your opportunity';
  END IF;

  SELECT * INTO proj FROM public.projects WHERE id = opp.project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;

  SELECT * INTO conn
  FROM public.project_connections
  WHERE project_id = opp.project_id
    AND contractor_profile_id = opp.contractor_profile_id
    AND status IN ('INITIATED', 'RESERVED', 'PAYMENT_DISABLED', 'PAID', 'COMPLETED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  SELECT * INTO active_booking
  FROM public.bookings
  WHERE project_id = opp.project_id
    AND contractor_profile_id = opp.contractor_profile_id
    AND status IN ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS')
  ORDER BY created_at DESC
  LIMIT 1;

  IF active_booking.id IS NOT NULL AND (conn.id IS NULL OR conn.status IS DISTINCT FROM 'PAID') THEN
    RAISE EXCEPTION 'this job is already in a booking — complete it from Bookings';
  END IF;

  IF opp.status IN ('PASSED', 'EXPIRED', 'CLOSED')
     AND (conn.id IS NULL OR conn.status IN ('CANCELLED', 'COMPLETED', 'EXPIRED', 'FAILED')) THEN
    already_ended := true;
  END IF;

  -- Hired contractor with a paid connection: complete only. Keep hire + #14.
  IF active_booking.id IS NOT NULL AND conn.status = 'PAID' THEN
    UPDATE public.project_connections
    SET status = 'COMPLETED', completed_at = now(), updated_at = now()
    WHERE id = conn.id;
    PERFORM public.write_connection_event(
      conn.id,
      'connection.completed',
      jsonb_build_object('project_id', opp.project_id, 'via', 'contractor_end_job', 'contact_unlocked', false)
    );
    RETURN jsonb_build_object(
      'opportunity_id', opp.id,
      'opportunity_status', opp.status,
      'connection_id', conn.id,
      'connection_status', 'COMPLETED',
      'released_connection_slot', false,
      'released_opportunity_slot', false,
      'withdrew_estimates', 0,
      'contact_unlocked', false,
      'paid', true,
      'already_ended', false,
      'payments_live', false,
      'charges_live', false,
      'backfilled', 0
    );
  END IF;

  IF already_ended THEN
    RETURN jsonb_build_object(
      'opportunity_id', opp.id,
      'opportunity_status', opp.status,
      'connection_id', conn.id,
      'connection_status', conn.status,
      'released_connection_slot', false,
      'released_opportunity_slot', false,
      'withdrew_estimates', 0,
      'contact_unlocked', false,
      'paid', false,
      'already_ended', true,
      'payments_live', false,
      'charges_live', false,
      'backfilled', 0
    );
  END IF;

  IF opp.status NOT IN ('AVAILABLE', 'ACCEPTED') THEN
    RAISE EXCEPTION 'opportunity cannot be ended';
  END IF;

  -- Unpaid occupying rows: cancel and free the max-3 slot. No #14 row is created or granted.
  IF conn.id IS NOT NULL AND conn.status IN ('INITIATED', 'RESERVED', 'PAYMENT_DISABLED') THEN
    -- contractor_end_job is not on the checkout-session guard. Expire OPEN
    -- sessions through a marker that cannot change amount, price, or status
    -- other than OPEN -> EXPIRED, then restore this RPC before the slot write.
    PERFORM public.expire_open_connection_checkout_sessions(conn.id);
    PERFORM public.ppp_set_rpc('contractor_end_job');
    DELETE FROM public.connection_slots WHERE connection_id = conn.id;
    released_connection_slot := true;
    UPDATE public.project_connections
    SET
      status = 'CANCELLED',
      cancelled_at = now(),
      reservation_slot = NULL,
      updated_at = now()
    WHERE id = conn.id;
    connection_status := 'CANCELLED';
    PERFORM public.write_connection_event(
      conn.id,
      'connection.cancelled',
      jsonb_build_object(
        'project_id', opp.project_id,
        'via', 'contractor_end_job',
        'released', true,
        'contact_unlocked', false
      )
    );
  ELSIF conn.id IS NOT NULL AND conn.status = 'PAID' THEN
    UPDATE public.project_connections
    SET status = 'COMPLETED', completed_at = now(), updated_at = now()
    WHERE id = conn.id;
    connection_status := 'COMPLETED';
    PERFORM public.write_connection_event(
      conn.id,
      'connection.completed',
      jsonb_build_object('project_id', opp.project_id, 'via', 'contractor_end_job', 'contact_unlocked', false)
    );
  ELSIF conn.id IS NOT NULL THEN
    connection_status := conn.status;
  END IF;

  -- Withdraw open estimates (history kept). Skip ACCEPTED hire estimates.
  FOR est IN
    SELECT id
    FROM public.estimates
    WHERE opportunity_id = opp.id
      AND contractor_profile_id = opp.contractor_profile_id
      AND status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED')
  LOOP
    PERFORM public.withdraw_estimate(est.id);
    withdrew_estimates := withdrew_estimates + 1;
  END LOOP;
  PERFORM public.ppp_set_rpc('contractor_end_job');

  IF opp.status = 'ACCEPTED' THEN
    DELETE FROM public.opportunity_slots WHERE opportunity_id = opp.id;
    released_opportunity_slot := FOUND;
  END IF;

  opportunity_status := CASE
    WHEN conn.id IS NOT NULL AND connection_status = 'COMPLETED' THEN 'CLOSED'::public.opportunity_status
    ELSE 'PASSED'::public.opportunity_status
  END;

  UPDATE public.opportunities
  SET status = opportunity_status, responded_at = coalesce(responded_at, now())
  WHERE id = opp.id;

  -- Free offer/participate capacity goes to the next ranked unused eligible contractor.
  backfilled := public.fill_project_opportunity_offers(opp.project_id);

  PERFORM public.write_audit_log(
    auth.uid(),
    'opportunity.ended',
    'opportunities',
    opp.id,
    jsonb_build_object(
      'project_id', opp.project_id,
      'opportunity_status', opportunity_status,
      'connection_status', connection_status,
      'released_connection_slot', released_connection_slot,
      'released_opportunity_slot', released_opportunity_slot,
      'backfilled', backfilled,
      'contact_unlocked', false
    )
  );

  RETURN jsonb_build_object(
    'opportunity_id', opp.id,
    'opportunity_status', opportunity_status,
    'connection_id', conn.id,
    'connection_status', connection_status,
    'released_connection_slot', released_connection_slot,
    'released_opportunity_slot', released_opportunity_slot,
    'withdrew_estimates', withdrew_estimates,
    'contact_unlocked', false,
    'paid', connection_status = 'COMPLETED',
    'already_ended', false,
    'payments_live', false,
    'charges_live', false,
    'backfilled', backfilled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_end_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_end_job(uuid) TO authenticated;

COMMENT ON FUNCTION public.contractor_end_job(uuid) IS
  'Contractor soft-end via SECURITY DEFINER. Unpaid occupying rows are cancelled and the slot is freed. PAID becomes COMPLETED only (never PAID from the client). Restores ppp.rpc after expire_stale_connection_reservations. Never grants contact. Never changes the $4.99 fee. Cannot write connection_checkout_sessions; OPEN sessions are expired by expire_open_connection_checkout_sessions.';
