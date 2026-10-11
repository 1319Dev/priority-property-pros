-- Rollback for 20261015000002_contractor_end_job_prod_guards.sql
-- Restores the guard bodies from before 20260930000001 (that migration was not
-- applied in prod) and the opportunity-queue contractor_end_job without the
-- extra ppp_set_rpc after expire_stale_connection_reservations.
-- Diff these against a saved prod definition before applying. Do not drop
-- prod-only RPC names. Does not change fee_cents or payment rows.
--
-- Replaces existing function protect_project_connection_row; must be diffed against prod before apply.
-- Replaces existing function protect_connection_slot_row; must be diffed against prod before apply.
-- Replaces existing function protect_connection_checkout_session_row; must be diffed against prod before apply.
-- Replaces existing function guard_project_connection_money; must be diffed against prod before apply.
-- Replaces existing function contractor_end_job; must be diffed against prod before apply.

CREATE OR REPLACE FUNCTION public.protect_project_connection_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('request_project_connection')
     OR public.ppp_rpc_is('stop_new_project_connections')
     OR public.ppp_rpc_is('admin_grant_connection_contact_access')
     OR public.ppp_rpc_is('admin_revoke_connection_contact_access')
     OR public.ppp_rpc_is('finalize_project_connection_payment')
     OR public.ppp_rpc_is('grant_booking_contact_access_from_connection_fee')
     OR public.ppp_rpc_is('grant_connection_contact_access_from_fee')
     OR public.ppp_rpc_is('reserve_connection_checkout')
     OR public.ppp_rpc_is('attach_connection_checkout_session')
     OR public.ppp_rpc_is('fulfill_connection_fee_checkout')
     OR public.ppp_rpc_is('expire_stale_connection_reservations')
     OR public.ppp_rpc_is('expire_connection_checkout_session')
     OR public.ppp_rpc_is('flag_connection_checkout_needs_refund') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'project connections cannot be written from the client';
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_connection_slot_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('request_project_connection')
     OR public.ppp_rpc_is('reserve_connection_checkout')
     OR public.ppp_rpc_is('expire_stale_connection_reservations')
     OR public.ppp_rpc_is('expire_connection_checkout_session')
     OR public.ppp_rpc_is('fulfill_connection_fee_checkout') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'connection slots cannot be written from the client';
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_connection_checkout_session_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION public.guard_project_connection_money()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fee_cents IS DISTINCT FROM 499 THEN
    RAISE EXCEPTION 'connection fee is server-authoritative and must be 499 cents';
  END IF;
  IF NEW.status IN ('PAID', 'COMPLETED')
     AND NOT (
       public.ppp_rpc_is('finalize_project_connection_payment')
       OR public.ppp_rpc_is('grant_connection_contact_access_from_fee')
       OR public.ppp_rpc_is('fulfill_connection_fee_checkout')
     ) THEN
    RAISE EXCEPTION 'connection cannot be marked paid from the client';
  END IF;
  IF NEW.payments_live IS DISTINCT FROM false OR NEW.charges_live IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'connection payments_live and charges_live must stay false';
  END IF;
  RETURN NEW;
END;
$$;

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
    UPDATE public.connection_checkout_sessions
    SET status = 'EXPIRED', updated_at = now()
    WHERE connection_id = conn.id
      AND status = 'OPEN';
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

