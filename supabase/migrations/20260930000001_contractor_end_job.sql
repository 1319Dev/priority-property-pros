-- Contractor UX: single Connect path + End this job.
-- Additive. Does NOT flip payments_live, charges_live, signup_fee_enabled,
-- or connection_fee_checkout_enabled. Does NOT grant #14 contact.

-- Payments-off Connect must match checkout reserve: matched AVAILABLE or ACCEPTED only.
-- PASSED / EXPIRED / CLOSED cannot reconnect after End this job.
CREATE OR REPLACE FUNCTION public.request_project_connection(
  p_project_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  contractor_id uuid;
  existing public.project_connections;
  occupied integer;
  slot integer;
  conn public.project_connections;
  key text;
BEGIN
  PERFORM public.ppp_set_rpc('request_project_connection');

  IF public.connection_fee_checkout_enabled() THEN
    RAISE EXCEPTION 'connection fee checkout is required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  contractor_id := public.current_contractor_profile_id();
  IF contractor_id IS NULL THEN
    RAISE EXCEPTION 'only a contractor can request a connection';
  END IF;

  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id = auth.uid() THEN
    RAISE EXCEPTION 'customers do not pay a Connection Fee';
  END IF;
  IF proj.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'project is cancelled';
  END IF;
  IF proj.accepting_connections IS NOT TRUE THEN
    RAISE EXCEPTION 'customer stopped new connections';
  END IF;

  -- Participate/accept is optional. Matched AVAILABLE or ACCEPTED may Connect.
  -- Unmatched contractors and PASSED / EXPIRED / CLOSED cannot request.
  IF NOT EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.project_id = p_project_id
      AND o.contractor_profile_id = contractor_id
      AND o.status IN ('AVAILABLE', 'ACCEPTED')
  ) THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;

  key := nullif(btrim(coalesce(p_idempotency_key, '')), '');

  IF key IS NOT NULL THEN
    SELECT * INTO existing
    FROM public.project_connections
    WHERE idempotency_key = key;
    IF FOUND THEN
      IF existing.contractor_profile_id IS DISTINCT FROM contractor_id
         OR existing.project_id IS DISTINCT FROM p_project_id THEN
        RAISE EXCEPTION 'idempotency key already used';
      END IF;
      RETURN jsonb_build_object(
        'connection_id', existing.id,
        'status', existing.status,
        'fee_cents', existing.fee_cents,
        'contact_unlocked', false,
        'paid', false,
        'idempotent', true,
        'payments_live', false,
        'charges_live', false,
        'message', 'Connection requested. Online payment setup is coming soon. Clicking Connect does not unlock contact.'
      );
    END IF;
  END IF;

  SELECT * INTO existing
  FROM public.project_connections
  WHERE project_id = p_project_id
    AND contractor_profile_id = contractor_id
    AND status IN ('INITIATED', 'RESERVED', 'PAYMENT_DISABLED', 'PAID', 'COMPLETED');
  IF FOUND THEN
    RAISE EXCEPTION 'duplicate connection';
  END IF;

  occupied := public.project_connection_occupancy(p_project_id);
  IF occupied >= 3 THEN
    RAISE EXCEPTION 'connections full';
  END IF;

  SELECT s INTO slot
  FROM generate_series(1, 3) AS s
  WHERE s NOT IN (
    SELECT slot_number FROM public.connection_slots WHERE project_id = p_project_id
  )
  ORDER BY s
  LIMIT 1;

  IF slot IS NULL THEN
    RAISE EXCEPTION 'connections full';
  END IF;

  BEGIN
    INSERT INTO public.project_connections (
      project_id,
      contractor_profile_id,
      customer_id,
      status,
      fee_cents,
      idempotency_key,
      reservation_slot,
      payments_live,
      charges_live,
      reserved_at
    ) VALUES (
      p_project_id,
      contractor_id,
      proj.customer_id,
      'PAYMENT_DISABLED',
      499,
      key,
      slot,
      false,
      false,
      now()
    )
    RETURNING * INTO conn;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate connection';
  END;

  BEGIN
    INSERT INTO public.connection_slots (
      project_id, slot_number, connection_id, contractor_profile_id
    ) VALUES (
      p_project_id, slot, conn.id, contractor_id
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'connections full';
  END;

  -- Purchase row only. Do NOT insert a #14 entitlement (missing = no access).
  PERFORM public.write_connection_event(
    conn.id,
    'connection.requested',
    jsonb_build_object(
      'project_id', p_project_id,
      'slot', slot,
      'fee_cents', 499,
      'status', 'PAYMENT_DISABLED',
      'contact_unlocked', false
    )
  );

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'status', conn.status,
    'fee_cents', 499,
    'reservation_slot', slot,
    'contact_unlocked', false,
    'paid', false,
    'idempotent', false,
    'payments_live', false,
    'charges_live', false,
    'message', 'Connection requested. Online payment setup is coming soon. Clicking Connect does not unlock contact.'
  );
END;
$$;

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
     OR public.ppp_rpc_is('flag_connection_checkout_needs_refund')
     OR public.ppp_rpc_is('contractor_end_job') THEN
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
     OR public.ppp_rpc_is('fulfill_connection_fee_checkout')
     OR public.ppp_rpc_is('contractor_end_job') THEN
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
     OR public.ppp_rpc_is('record_connection_checkout_event')
     OR public.ppp_rpc_is('contractor_end_job') THEN
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
       OR (
         public.ppp_rpc_is('contractor_end_job')
         AND TG_OP = 'UPDATE'
         AND OLD.status = 'PAID'
         AND NEW.status = 'COMPLETED'
       )
     ) THEN
    RAISE EXCEPTION 'connection cannot be marked paid from the client';
  END IF;
  IF NEW.payments_live IS DISTINCT FROM false OR NEW.charges_live IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'connection payments_live and charges_live must stay false';
  END IF;
  RETURN NEW;
END;
$$;

-- Soft-end a contractor's opportunity / unpaid reservation, or complete a paid connection.
-- Never grants #14. Never flips payment flags. Never hard-deletes purchase history.
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
      'charges_live', false
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
      'charges_live', false
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
    IF proj.status IS DISTINCT FROM 'CONTRACTOR_SELECTED'
       AND proj.status IS DISTINCT FROM 'CANCELLED' THEN
      UPDATE public.opportunities
      SET status = 'AVAILABLE'
      WHERE project_id = opp.project_id
        AND id <> opp.id
        AND status = 'CLOSED'
        AND (expires_at IS NULL OR expires_at > now());
    END IF;
  END IF;

  opportunity_status := CASE
    WHEN conn.id IS NOT NULL AND connection_status = 'COMPLETED' THEN 'CLOSED'::public.opportunity_status
    ELSE 'PASSED'::public.opportunity_status
  END;

  UPDATE public.opportunities
  SET status = opportunity_status, responded_at = coalesce(responded_at, now())
  WHERE id = opp.id;

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
    'charges_live', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_end_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_end_job(uuid) TO authenticated;

COMMENT ON FUNCTION public.contractor_end_job(uuid) IS
  'Contractor soft-end: AVAILABLE/ACCEPTED → PASSED (or CLOSED after paid complete). Unpaid INITIATED/RESERVED/PAYMENT_DISABLED → CANCELLED and connection_slots deleted. PAID → COMPLETED (slot stays occupied). Never grants #14. Never flips payment flags.';

COMMENT ON FUNCTION public.request_project_connection(uuid, text) IS
  'Matched contractor with AVAILABLE or ACCEPTED opportunity may request a PAYMENT_DISABLED connection while checkout is off. Participate is optional. Does not grant #14. Does not flip payment flags.';
