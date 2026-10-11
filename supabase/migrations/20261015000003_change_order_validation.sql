-- Server-side change-order amount checks.
-- propose_change_order accepted 0, huge negatives, and integer-max deltas.
-- This replaces the 20261008023700 body and adds validation only.
-- It does not replace respond_change_order. Prod's respond_change_order calls
-- add_change_order_schedule_item, which the repo copy does not. Decline already
-- works through respond_change_order(..., false).
-- Fee math (recompute_booking_money, booking_fee_basis_cents) is unchanged.
--
-- The existing $0 APPROVED row is not updated:
--   change_orders 3030365c… on booking 8ef8f18e… (PPP-1004), "Materials increase".
-- New CHECKs are NOT VALID so that row is not scanned and is not rewritten.
-- A later UPDATE of that row will fail change_orders_amount_nonzero until the
-- row is corrected or the constraint is dropped.
--
-- Replaces existing function propose_change_order; must be diffed against prod before apply.

INSERT INTO public.platform_settings (key, value_int, description)
VALUES (
  'change_order_max_abs_cents',
  10000000,
  'Maximum absolute change-order amount in cents. 10000000 = $100,000. A missing, null, or non-positive value falls back to 10000000 inside propose_change_order. Does not change fee math.'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.change_orders
  ADD CONSTRAINT change_orders_amount_nonzero
  CHECK (amount_delta_cents <> 0) NOT VALID;

ALTER TABLE public.change_orders
  ADD CONSTRAINT change_orders_description_max
  CHECK (char_length(description) <= 1000) NOT VALID;

CREATE OR REPLACE FUNCTION public.propose_change_order(p_booking_id uuid, p_description text, p_amount_delta_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
  v_role text;
  oid uuid;
  v_cap integer;
  v_total bigint;
  v_description text;
BEGIN
  PERFORM public.ppp_set_rpc('propose_change_order');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN RAISE EXCEPTION 'change orders are only allowed on confirmed or in-progress bookings'; END IF;
  IF b.customer_id = auth.uid() THEN v_role := 'CUSTOMER';
  ELSIF b.contractor_profile_id = public.current_contractor_profile_id() THEN v_role := 'CONTRACTOR';
  ELSIF public.is_admin() THEN v_role := 'ADMIN';
  ELSE RAISE EXCEPTION 'not a booking participant'; END IF;

  -- integer parameter: fractional cents never reach this body.
  IF p_amount_delta_cents IS NULL THEN RAISE EXCEPTION 'amount_delta_cents is required'; END IF;
  IF p_amount_delta_cents = 0 THEN RAISE EXCEPTION 'change order amount must not be zero'; END IF;

  v_cap := (
    SELECT s.value_int
    FROM public.platform_settings s
    WHERE s.key = 'change_order_max_abs_cents'
  );
  IF v_cap IS NULL OR v_cap <= 0 THEN
    v_cap := 10000000;
  END IF;
  -- bigint compare so a large cap cannot overflow integer negation.
  IF p_amount_delta_cents::bigint > v_cap::bigint
     OR p_amount_delta_cents::bigint < -v_cap::bigint THEN
    RAISE EXCEPTION 'change order amount is outside the allowed range';
  END IF;

  v_total := coalesce(b.billable_amount_cents, b.amount_cents, 0)::bigint;
  IF (v_total + p_amount_delta_cents::bigint) < 0 THEN
    RAISE EXCEPTION 'a decrease cannot exceed the current job total';
  END IF;

  v_description := btrim(coalesce(p_description, ''));
  IF length(v_description) < 3 THEN RAISE EXCEPTION 'describe the change'; END IF;
  IF char_length(v_description) > 1000 THEN RAISE EXCEPTION 'change order description is too long'; END IF;

  INSERT INTO public.change_orders (booking_id, created_by, created_by_role, description, amount_delta_cents, status, customer_approved_at, customer_approved_by, contractor_acked_at, contractor_acked_by)
  VALUES (b.id, auth.uid(), v_role, v_description, p_amount_delta_cents,
    (CASE WHEN v_role = 'CUSTOMER' THEN 'CUSTOMER_APPROVED' ELSE 'PROPOSED' END)::public.change_order_status,
    CASE WHEN v_role = 'CUSTOMER' THEN now() ELSE NULL END,
    CASE WHEN v_role = 'CUSTOMER' THEN auth.uid() ELSE NULL END,
    CASE WHEN v_role = 'CONTRACTOR' THEN now() ELSE NULL END,
    CASE WHEN v_role = 'CONTRACTOR' THEN auth.uid() ELSE NULL END)
  RETURNING id INTO oid;
  PERFORM public.write_booking_event(b.id, 'change_order.proposed', jsonb_build_object('change_order_id', oid, 'amount_delta_cents', p_amount_delta_cents, 'role', v_role));
  RETURN jsonb_build_object('change_order_id', oid, 'status', CASE WHEN v_role = 'CUSTOMER' THEN 'CUSTOMER_APPROVED' ELSE 'PROPOSED' END, 'unilateral_increase', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.propose_change_order(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_change_order(uuid, text, integer) TO authenticated;

COMMENT ON FUNCTION public.propose_change_order(uuid, text, integer) IS
  'Propose a change order. Rejects a zero delta, a decrease below the current billable total (amount_cents when billable is null), and an absolute delta above platform_settings.change_order_max_abs_cents (default $100,000). Does not change fee math. Does not update existing rows.';
