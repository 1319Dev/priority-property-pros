-- Exact rollback for 20261015000003_change_order_validation.sql.
-- Restores propose_change_order to the 20261008023700 body (status cast, no amount bounds).
-- Drops the description check, the approval-total trigger, and the cap setting.
-- Does not touch the $0 APPROVED row.
-- Does not replace respond_change_order or recompute_booking_money.

DROP TRIGGER IF EXISTS change_orders_guard_approval_total ON public.change_orders;
DROP FUNCTION IF EXISTS public.guard_change_order_approval_total();

ALTER TABLE public.change_orders DROP CONSTRAINT IF EXISTS change_orders_description_max;

DELETE FROM public.platform_settings WHERE key = 'change_order_max_abs_cents';

CREATE OR REPLACE FUNCTION public.propose_change_order(p_booking_id uuid, p_description text, p_amount_delta_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE b public.bookings; v_role text; oid uuid;
BEGIN
  PERFORM public.ppp_set_rpc('propose_change_order');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN RAISE EXCEPTION 'change orders are only allowed on confirmed or in-progress bookings'; END IF;
  IF b.customer_id = auth.uid() THEN v_role := 'CUSTOMER';
  ELSIF b.contractor_profile_id = public.current_contractor_profile_id() THEN v_role := 'CONTRACTOR';
  ELSIF public.is_admin() THEN v_role := 'ADMIN';
  ELSE RAISE EXCEPTION 'not a booking participant'; END IF;
  IF p_amount_delta_cents IS NULL THEN RAISE EXCEPTION 'amount_delta_cents is required'; END IF;
  IF length(btrim(coalesce(p_description, ''))) < 3 THEN RAISE EXCEPTION 'describe the change'; END IF;
  INSERT INTO public.change_orders (booking_id, created_by, created_by_role, description, amount_delta_cents, status, customer_approved_at, customer_approved_by, contractor_acked_at, contractor_acked_by)
  VALUES (b.id, auth.uid(), v_role, btrim(p_description), p_amount_delta_cents,
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
