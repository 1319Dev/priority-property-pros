-- When both Hired timestamps are set, move PENDING / AWAITING_PAYMENT to CONFIRMED.
-- Does not lock a booking fee. Does not write fee amounts, payment status, or Stripe fields.
-- bookings_protect_row still forces payments_live and charges_live false on any booking update.
-- That trigger is pre-existing and does not compute a fee.
-- Customer or booked pro can start a CONFIRMED job. Mark complete stays IN_PROGRESS -> COMPLETED.
-- Cancel is refused once both Hired flags are set.

CREATE OR REPLACE FUNCTION public.confirm_booking_hired(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  is_customer boolean;
  is_contractor boolean;
  already boolean := false;
  mutually boolean;
  hired_status text;
BEGIN
  PERFORM public.ppp_set_rpc('confirm_booking_hired');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;
  IF b.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled bookings cannot be marked hired';
  END IF;

  is_customer := b.customer_id IS NOT DISTINCT FROM auth.uid();
  is_contractor := b.contractor_profile_id IS NOT DISTINCT FROM public.current_contractor_profile_id();

  IF NOT is_customer AND NOT is_contractor AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a booking participant';
  END IF;
  IF public.is_admin() AND NOT is_customer AND NOT is_contractor THEN
    RAISE EXCEPTION 'only the homeowner or booked pro can confirm Hired';
  END IF;
  IF is_customer AND is_contractor THEN
    RAISE EXCEPTION 'only the homeowner or booked pro can confirm Hired';
  END IF;

  IF is_customer THEN
    IF b.customer_hired_at IS NOT NULL THEN
      already := true;
    ELSE
      UPDATE public.bookings
      SET customer_hired_at = now()
      WHERE id = b.id
      RETURNING * INTO b;
      PERFORM public.write_booking_event(
        b.id,
        'hire.customer_confirmed',
        jsonb_build_object(
          'customer_hired_at', b.customer_hired_at,
          'contractor_hired_at', b.contractor_hired_at
        )
      );
    END IF;
  ELSIF is_contractor THEN
    IF b.contractor_hired_at IS NOT NULL THEN
      already := true;
    ELSE
      UPDATE public.bookings
      SET contractor_hired_at = now()
      WHERE id = b.id
      RETURNING * INTO b;
      PERFORM public.write_booking_event(
        b.id,
        'hire.contractor_confirmed',
        jsonb_build_object(
          'customer_hired_at', b.customer_hired_at,
          'contractor_hired_at', b.contractor_hired_at
        )
      );
    END IF;
  END IF;

  mutually := b.customer_hired_at IS NOT NULL AND b.contractor_hired_at IS NOT NULL;
  hired_status := CASE
    WHEN mutually THEN 'HIRED'
    WHEN b.customer_hired_at IS NOT NULL THEN 'WAITING_FOR_PRO'
    WHEN b.contractor_hired_at IS NOT NULL THEN 'WAITING_FOR_HOMEOWNER'
    ELSE 'IDLE'
  END;

  IF mutually AND b.status IN ('PENDING', 'AWAITING_PAYMENT') THEN
    -- Mutual Hired confirms the booking. It does not lock a fee, recompute a fee,
    -- or write payment columns. payments_live / charges_live stay as they are
    -- except the existing booking guard, which forces those flags false.
    UPDATE public.bookings
    SET status = 'CONFIRMED', confirmed_at = coalesce(confirmed_at, now())
    WHERE id = b.id
    RETURNING * INTO b;
    PERFORM public.ensure_relationship_on_confirm(b.id);
    PERFORM public.write_booking_event(
      b.id,
      'booking.confirmed',
      jsonb_build_object(
        'via', 'mutual_hired',
        'fee_locked', false,
        'charges_live', false,
        'payments_live', public.payments_live()
      )
    );
  ELSIF mutually AND b.status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED') THEN
    PERFORM public.ensure_relationship_on_confirm(b.id);
  END IF;

  IF mutually AND NOT already THEN
    PERFORM public.write_booking_event(
      b.id,
      'hire.mutual',
      jsonb_build_object(
        'customer_hired_at', b.customer_hired_at,
        'contractor_hired_at', b.contractor_hired_at
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'customer_hired_at', b.customer_hired_at,
    'contractor_hired_at', b.contractor_hired_at,
    'mutually_hired', mutually,
    'status', hired_status,
    'booking_status', b.status,
    'idempotent', already,
    'charges_live', false,
    'payments_live', false
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
     OR public.ppp_rpc_is('match_project')
     OR public.ppp_rpc_is('select_estimate')
     OR public.ppp_rpc_is('submit_estimate')
     OR public.ppp_rpc_is('accept_opportunity')
     OR public.ppp_rpc_is('update_customer_project')
     OR public.ppp_rpc_is('cancel_customer_project')
     OR public.ppp_rpc_is('delete_customer_project')
     OR public.ppp_rpc_is('cancel_pending_booking')
     OR public.ppp_rpc_is('pass_opportunity')
     OR public.ppp_rpc_is('confirm_booking_hired')
     OR public.is_admin()
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'DRAFT' THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
      RAISE EXCEPTION 'project owner cannot change after create';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.selected_estimate_id IS DISTINCT FROM OLD.selected_estimate_id
       OR NEW.selected_contractor_profile_id IS DISTINCT FROM OLD.selected_contractor_profile_id
       OR NEW.selected_booking_id IS DISTINCT FROM OLD.selected_booking_id
       OR NEW.scope_revision IS DISTINCT FROM OLD.scope_revision
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN
      RAISE EXCEPTION 'posted projects cannot change status, selection, or cancellation from the client';
    END IF;
    IF NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.city IS DISTINCT FROM OLD.city
       OR NEW.state IS DISTINCT FROM OLD.state
       OR NEW.zip_code IS DISTINCT FROM OLD.zip_code THEN
      RAISE EXCEPTION 'material project edits must go through update_customer_project';
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.timing IS DISTINCT FROM OLD.timing
       OR NEW.preferred_date IS DISTINCT FROM OLD.preferred_date
       OR NEW.budget_min_cents IS DISTINCT FROM OLD.budget_min_cents
       OR NEW.budget_max_cents IS DISTINCT FROM OLD.budget_max_cents THEN
      RAISE EXCEPTION 'posted project edits must go through update_customer_project';
    END IF;
  END IF;
  RETURN NEW;
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
  remaining integer;
BEGIN
  PERFORM public.ppp_set_rpc('cancel_pending_booking');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the booking customer';
  END IF;
  IF b.customer_hired_at IS NOT NULL AND b.contractor_hired_at IS NOT NULL THEN
    RAISE EXCEPTION 'this booking is hired and cannot be cancelled here';
  END IF;
  IF b.status NOT IN ('PENDING', 'AWAITING_PAYMENT') THEN
    RAISE EXCEPTION 'only pending bookings can be cancelled here';
  END IF;
  UPDATE public.bookings
  SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'customer_cancelled'
  WHERE id = b.id;
  PERFORM public.write_booking_event(b.id, 'booking.cancelled', jsonb_build_object('reason', 'customer_cancelled'));

  UPDATE public.estimates
  SET status = 'SUBMITTED'
  WHERE id = b.estimate_id AND status = 'ACCEPTED';

  SELECT count(*) INTO remaining
  FROM public.estimates
  WHERE project_id = b.project_id
    AND status IN ('SUBMITTED', 'REVISED');

  UPDATE public.projects
  SET
    status = CASE WHEN remaining > 0 THEN 'ESTIMATES_AVAILABLE'::public.project_status ELSE 'CONTRACTORS_RESPONDING'::public.project_status END,
    selected_estimate_id = NULL,
    selected_contractor_profile_id = NULL,
    selected_booking_id = NULL,
    selected_at = NULL
  WHERE id = b.project_id
    AND status = 'CONTRACTOR_SELECTED';

  PERFORM public.insert_project_notice(
    b.project_id,
    'BOTH',
    'SELECTION_CANCELLED',
    'Selection cancelled',
    'The pending booking was cancelled. Your street address was not shared.'
  );

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', 'CANCELLED',
    'relationship_created', false,
    'charges_live', false,
    'payments_live', false
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
$$;

-- Existing mutually hired bookings (including 8ef8f18e) move to CONFIRMED.
-- Fee columns are not assigned here. Connection 9106a50b is not a booking and is not updated.
UPDATE public.bookings
SET
  status = 'CONFIRMED',
  confirmed_at = coalesce(confirmed_at, now())
WHERE customer_hired_at IS NOT NULL
  AND contractor_hired_at IS NOT NULL
  AND status IN ('PENDING', 'AWAITING_PAYMENT');

DO $$
DECLARE
  rid uuid;
BEGIN
  FOR rid IN
    SELECT id
    FROM public.bookings
    WHERE customer_hired_at IS NOT NULL
      AND contractor_hired_at IS NOT NULL
      AND status = 'CONFIRMED'
  LOOP
    PERFORM public.ensure_relationship_on_confirm(rid);
  END LOOP;
END $$;
