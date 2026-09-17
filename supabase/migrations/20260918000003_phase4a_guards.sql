-- Phase 4A helpers, expiry, fee lock, and mutation guards.

CREATE OR REPLACE FUNCTION public.write_booking_event(
  p_booking_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.booking_events (booking_id, actor_id, event_type, payload)
  VALUES (p_booking_id, auth.uid(), p_event_type, coalesce(p_payload, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.is_booking_customer(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.customer_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_booking_contractor(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.contractor_profile_id = public.current_contractor_profile_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.booking_is_confirmed_for_contractor(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.project_id = p_project_id
      AND b.contractor_profile_id = public.current_contractor_profile_id()
      AND b.status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED')
  );
$$;

CREATE OR REPLACE FUNCTION public.contractor_has_booking_on_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.project_id = p_project_id
      AND b.contractor_profile_id = public.current_contractor_profile_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.pair_has_completed_booking(
  p_customer_id uuid,
  p_contractor_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.customer_id = p_customer_id
      AND b.contractor_profile_id = p_contractor_profile_id
      AND b.status = 'COMPLETED'
  );
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_pending_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('expire_stale_pending_bookings');
  END IF;
  UPDATE public.bookings
  SET
    status = 'CANCELLED',
    cancelled_at = now(),
    cancel_reason = coalesce(cancel_reason, 'expired_pending')
  WHERE status IN ('PENDING', 'AWAITING_PAYMENT')
    AND expires_at IS NOT NULL
    AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_fee_basis_cents(p_booking_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(
    0,
    b.amount_cents + coalesce((
      SELECT sum(co.amount_delta_cents)
      FROM public.change_orders co
      WHERE co.booking_id = b.id
        AND co.status = 'APPROVED'
        AND co.amount_delta_cents > 0
    ), 0)
  )
  FROM public.bookings b
  WHERE b.id = p_booking_id;
$$;

CREATE OR REPLACE FUNCTION public.recompute_booking_money(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  v_billable integer;
  v_basis integer;
  preview jsonb;
  v_schedule uuid;
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('recompute_booking_fees');
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  SELECT coalesce(sum(amount_delta_cents), 0) INTO v_billable
  FROM public.change_orders
  WHERE booking_id = p_booking_id AND status = 'APPROVED';
  v_billable := greatest(0, b.amount_cents + v_billable);
  v_basis := public.booking_fee_basis_cents(p_booking_id);

  IF b.fee_locked AND b.fee_brackets_snapshot IS NOT NULL THEN
    preview := public.compute_fee_from_snapshot(
      v_basis,
      b.fee_brackets_snapshot,
      b.min_fee_cents_snapshot,
      b.max_fee_cents_snapshot
    );
  ELSE
    v_schedule := coalesce(b.fee_schedule_id, public.current_fee_schedule_id(b.fee_kind));
    preview := public.compute_fee(v_basis, v_schedule);
  END IF;

  UPDATE public.bookings
  SET
    approved_delta_cents = v_billable - b.amount_cents,
    billable_amount_cents = v_billable,
    fee_cents = (preview->>'fee_cents')::integer,
    contractor_earnings_cents = greatest(0, v_billable - (preview->>'fee_cents')::integer),
    customer_amount_cents = v_billable
  WHERE id = p_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_booking_fee(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  v_schedule uuid;
  preview jsonb;
  v_basis integer;
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('recompute_booking_fees');
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  v_basis := public.booking_fee_basis_cents(p_booking_id);
  v_schedule := public.current_fee_schedule_id(b.fee_kind);
  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'no active fee schedule for %', b.fee_kind;
  END IF;
  preview := public.compute_fee(v_basis, v_schedule);

  UPDATE public.bookings
  SET
    fee_schedule_id = v_schedule,
    fee_schedule_version = (preview->>'version')::integer,
    fee_brackets_snapshot = preview->'brackets_snapshot',
    min_fee_cents_snapshot = (preview->>'min_fee_cents')::integer,
    max_fee_cents_snapshot = (preview->>'max_fee_cents')::integer,
    fee_cents = (preview->>'fee_cents')::integer,
    customer_amount_cents = greatest(0, amount_cents + approved_delta_cents),
    contractor_earnings_cents = greatest(
      0,
      greatest(0, amount_cents + approved_delta_cents) - (preview->>'fee_cents')::integer
    ),
    billable_amount_cents = greatest(0, amount_cents + approved_delta_cents),
    fee_locked = true,
    fee_locked_at = now(),
    payments_live = false,
    charges_live = false
  WHERE id = p_booking_id;

  RETURN preview;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_relationship_on_confirm(p_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  rid uuid;
  months integer;
BEGIN
  SELECT * INTO STRICT b FROM public.bookings WHERE id = p_booking_id;
  months := public.relationship_protection_months();

  INSERT INTO public.customer_contractor_relationships (
    customer_id,
    contractor_profile_id,
    originating_project_id,
    originating_booking_id,
    introduced_at,
    status,
    protected_until
  ) VALUES (
    b.customer_id,
    b.contractor_profile_id,
    b.project_id,
    b.id,
    now(),
    'ACTIVE',
    now() + make_interval(months => months)
  )
  ON CONFLICT (customer_id, contractor_profile_id) DO NOTHING
  RETURNING id INTO rid;

  IF rid IS NULL THEN
    SELECT id INTO rid
    FROM public.customer_contractor_relationships
    WHERE customer_id = b.customer_id
      AND contractor_profile_id = b.contractor_profile_id;
  END IF;

  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_booking_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'bookings cannot be inserted from the client';
    END IF;
    NEW.payments_live := false;
    NEW.charges_live := false;
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'booking rows cannot be changed from the client';
  END IF;

  NEW.payments_live := false;
  NEW.charges_live := false;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_protect_row
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_booking_row();

CREATE OR REPLACE FUNCTION public.protect_relationship_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'relationships cannot be written from the client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER relationships_protect_row
  BEFORE INSERT OR UPDATE ON public.customer_contractor_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_relationship_row();

CREATE OR REPLACE FUNCTION public.protect_change_order_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'change orders cannot be written from the client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER change_orders_protect_row
  BEFORE INSERT OR UPDATE ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_change_order_row();

CREATE OR REPLACE FUNCTION public.protect_review_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'reviews cannot be deleted from the client';
    END IF;
    RETURN OLD;
  END IF;
  IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'reviews cannot be written from the client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_reviews_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.booking_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_review_row();

CREATE OR REPLACE FUNCTION public.protect_fee_schedule_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'fee schedules cannot be changed from the client';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fee_schedules_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.fee_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_fee_schedule_row();

CREATE TRIGGER fee_schedule_brackets_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.fee_schedule_brackets
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_fee_schedule_row();

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
