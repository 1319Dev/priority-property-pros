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
-- No table check rejects a zero amount. Even NOT VALID, that check would
-- reject every later UPDATE of the legacy row, including the account-deletion
-- purge nulling created_by. propose_change_order already rejects a new $0 delta.
-- The description length check is NOT VALID. That row's description is short,
-- so an update of it still passes.
--
-- Approval-time decreases are re-checked by guard_change_order_approval_total,
-- a BEFORE UPDATE trigger. respond_change_order is not replaced: the live
-- function calls add_change_order_schedule_item, which this repo does not have.
--
-- Replaces existing function propose_change_order; must be diffed against prod before apply.
-- Does not replace respond_change_order.

INSERT INTO public.platform_settings (key, value_int, description)
VALUES (
  'change_order_max_abs_cents',
  10000000,
  'Maximum absolute change-order amount in cents. 10000000 = $100,000. A missing, null, or non-positive value falls back to 10000000 inside propose_change_order. Does not change fee math.'
)
ON CONFLICT (key) DO NOTHING;

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

-- Re-check a decrease when a change order becomes APPROVED. Several pending
-- decreases can each fit the current total alone. The second approval must
-- not take the job below $0. Reaching exactly $0 is allowed.
-- Already-APPROVED rows (including the legacy $0 row) are not re-checked,
-- so nulling created_by does not fail.
-- Does not replace respond_change_order and does not change fee math.
CREATE OR REPLACE FUNCTION public.guard_change_order_approval_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount bigint;
  v_approved bigint;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'APPROVED'::public.change_order_status
     OR OLD.status = 'APPROVED'::public.change_order_status THEN
    RETURN NEW;
  END IF;
  IF NEW.amount_delta_cents IS NULL OR NEW.amount_delta_cents >= 0 THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(b.amount_cents, 0)::bigint
  INTO v_amount
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;

  SELECT coalesce(sum(co.amount_delta_cents), 0)::bigint
  INTO v_approved
  FROM public.change_orders co
  WHERE co.booking_id = NEW.booking_id
    AND co.status = 'APPROVED'
    AND co.id IS DISTINCT FROM NEW.id;

  IF coalesce(v_amount, 0) + coalesce(v_approved, 0) + NEW.amount_delta_cents::bigint < 0 THEN
    RAISE EXCEPTION $err$A decrease can't be larger than the current job total.$err$;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS change_orders_guard_approval_total ON public.change_orders;
CREATE TRIGGER change_orders_guard_approval_total
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_change_order_approval_total();

REVOKE ALL ON FUNCTION public.guard_change_order_approval_total() FROM PUBLIC, anon, authenticated;
