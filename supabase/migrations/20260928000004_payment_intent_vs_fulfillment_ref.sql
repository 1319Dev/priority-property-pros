-- Separate Stripe PaymentIntent ids from fulfillment-source markers.
-- Do NOT apply to production bersftkjpbzpgtahbqwd.
--
-- stripe_payment_intent_id stores only real pi_... values.
-- processor_event_id / fulfillment_reference store webhook evt_... or reconcile:cs_test_...
-- Historical non-pi_ values are copied to fulfillment_reference then cleared; real pi_ rows are untouched.

ALTER TABLE public.connection_checkout_sessions
  ADD COLUMN IF NOT EXISTS fulfillment_reference text;

CREATE OR REPLACE FUNCTION public.normalized_stripe_payment_intent_id(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN left(btrim(p_value), 3) = 'pi_'
         AND position(':' in p_value) = 0
         AND char_length(btrim(p_value)) > 5
      THEN btrim(p_value)
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.normalized_stripe_payment_intent_id(text) IS
  'Returns a Stripe PaymentIntent id (pi_...) or NULL. Rejects fulfillment markers such as reconcile:cs_test_...';

UPDATE public.connection_checkout_sessions
SET fulfillment_reference = stripe_payment_intent_id
WHERE fulfillment_reference IS NULL
  AND stripe_payment_intent_id IS NOT NULL
  AND public.normalized_stripe_payment_intent_id(stripe_payment_intent_id) IS NULL;

UPDATE public.connection_checkout_sessions
SET stripe_payment_intent_id = NULL
WHERE stripe_payment_intent_id IS NOT NULL
  AND public.normalized_stripe_payment_intent_id(stripe_payment_intent_id) IS NULL;

ALTER TABLE public.connection_checkout_sessions
  DROP CONSTRAINT IF EXISTS connection_checkout_pi_prefix;

ALTER TABLE public.connection_checkout_sessions
  ADD CONSTRAINT connection_checkout_pi_prefix
  CHECK (stripe_payment_intent_id IS NULL OR left(stripe_payment_intent_id, 3) = 'pi_');

DROP FUNCTION IF EXISTS public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fulfill_connection_fee_checkout(
  p_stripe_checkout_session_id text,
  p_processor_event_id text,
  p_amount_cents integer,
  p_currency text,
  p_price_id text,
  p_payment_status text,
  p_livemode boolean,
  p_connection_id uuid,
  p_project_id uuid,
  p_contractor_profile_id uuid,
  p_stripe_payment_intent_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn public.project_connections;
  access public.booking_contact_access;
  sess public.connection_checkout_sessions;
  event_row jsonb;
  grant_row jsonb;
  unlocked boolean;
  intent_id text;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('fulfill_connection_fee_checkout');

  IF NOT public.connection_fee_checkout_enabled() THEN
    RAISE EXCEPTION 'connection fee checkout is disabled';
  END IF;
  IF coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'stripe_test_mode'), 1) <> 1 THEN
    RAISE EXCEPTION 'stripe_test_mode must stay 1';
  END IF;
  IF p_livemode IS TRUE THEN
    RAISE EXCEPTION 'live Stripe sessions are forbidden';
  END IF;
  IF left(p_stripe_checkout_session_id, 8) IS DISTINCT FROM 'cs_test_' THEN
    RAISE EXCEPTION 'only Stripe TEST checkout sessions are allowed';
  END IF;
  IF p_amount_cents IS DISTINCT FROM 499 THEN
    RAISE EXCEPTION 'connection fee is server-authoritative and must be 499 cents';
  END IF;
  IF lower(coalesce(p_currency, '')) IS DISTINCT FROM 'usd' THEN
    RAISE EXCEPTION 'connection fee currency must be usd';
  END IF;
  IF p_price_id IS DISTINCT FROM public.stripe_connection_price_id() THEN
    RAISE EXCEPTION 'wrong connection Price ID';
  END IF;
  IF p_payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'unpaid';
  END IF;

  intent_id := public.normalized_stripe_payment_intent_id(p_stripe_payment_intent_id);

  -- Fulfillment source stays on processor_event_id / fulfillment_reference, never in the PI column.
  event_row := public.record_connection_checkout_event(
    p_processor_event_id,
    'fulfill',
    p_stripe_checkout_session_id,
    jsonb_build_object('connection_id', p_connection_id, 'amount_cents', 499)
  );

  SELECT * INTO conn FROM public.project_connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection not found';
  END IF;
  IF conn.project_id IS DISTINCT FROM p_project_id
     OR conn.contractor_profile_id IS DISTINCT FROM p_contractor_profile_id THEN
    RAISE EXCEPTION 'mismatched metadata';
  END IF;

  SELECT * INTO access
  FROM public.booking_contact_access
  WHERE connection_id = conn.id
  FOR UPDATE;

  SELECT * INTO sess
  FROM public.connection_checkout_sessions
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
  FOR UPDATE;

  IF conn.status IN ('PAID', 'COMPLETED') THEN
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET
        status = 'CONSUMED',
        payment_status = 'paid',
        consumed_at = coalesce(consumed_at, now()),
        fulfilled_at = coalesce(fulfilled_at, now()),
        stripe_payment_intent_id = coalesce(
          public.normalized_stripe_payment_intent_id(stripe_payment_intent_id),
          intent_id
        ),
        fulfillment_reference = coalesce(
          nullif(btrim(fulfillment_reference), ''),
          nullif(btrim(p_processor_event_id), '')
        )
      WHERE id = sess.id;
    END IF;
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', coalesce(access.status IN ('UNLOCKED', 'ADMIN_OVERRIDE') AND access.revoked_at IS NULL, false),
      'paid', true,
      'idempotent', true,
      'duplicate_event', (event_row->>'duplicate')::boolean,
      'payments_live', false,
      'charges_live', false
    );
  END IF;

  IF conn.status IS DISTINCT FROM 'RESERVED'
     OR (conn.reserved_until IS NOT NULL AND conn.reserved_until < now())
     OR NOT EXISTS (SELECT 1 FROM public.connection_slots WHERE connection_id = conn.id) THEN
    UPDATE public.project_connections
    SET needs_refund = true, refund_reason = 'paid_but_reservation_not_active', updated_at = now()
    WHERE id = conn.id;
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET status = 'NEEDS_REFUND', needs_refund = true, refund_reason = 'paid_but_reservation_not_active', payment_status = 'paid'
      WHERE id = sess.id;
    END IF;
    PERFORM public.write_connection_event(
      conn.id,
      'connection.needs_refund',
      jsonb_build_object('reason', 'paid_but_reservation_not_active', 'checkout_session_id', p_stripe_checkout_session_id)
    );
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', false,
      'paid', false,
      'needs_refund', true,
      'reason', 'paid_but_reservation_not_active',
      'payments_live', false,
      'charges_live', false
    );
  END IF;

  -- Grant the #14 entitlement FIRST, then mark the purchase PAID.
  grant_row := public.grant_booking_contact_access_from_connection_fee(conn.id, 'connection_fee_payment');
  IF coalesce((grant_row->>'contact_unlocked')::boolean, false) IS NOT TRUE THEN
    UPDATE public.project_connections
    SET needs_refund = true, refund_reason = 'paid_but_entitlement_failed', updated_at = now()
    WHERE id = conn.id;
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET status = 'NEEDS_REFUND', needs_refund = true, refund_reason = 'paid_but_entitlement_failed', payment_status = 'paid'
      WHERE id = sess.id;
    END IF;
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', false,
      'paid', false,
      'needs_refund', true,
      'reason', 'paid_but_entitlement_failed',
      'payments_live', false,
      'charges_live', false
    );
  END IF;

  UPDATE public.project_connections
  SET
    status = 'PAID',
    paid_at = now(),
    completed_at = now(),
    needs_refund = false,
    stripe_checkout_session_id = p_stripe_checkout_session_id,
    updated_at = now()
  WHERE id = conn.id
  RETURNING * INTO conn;

  IF sess.id IS NOT NULL THEN
    UPDATE public.connection_checkout_sessions
    SET
      status = 'CONSUMED',
      payment_status = 'paid',
      stripe_payment_intent_id = coalesce(
        public.normalized_stripe_payment_intent_id(stripe_payment_intent_id),
        intent_id
      ),
      fulfillment_reference = coalesce(
        nullif(btrim(fulfillment_reference), ''),
        nullif(btrim(p_processor_event_id), '')
      ),
      consumed_at = now(),
      fulfilled_at = now()
    WHERE id = sess.id;
  END IF;

  PERFORM public.write_connection_event(
    conn.id,
    'connection.paid',
    jsonb_build_object('fee_cents', 499, 'contact_unlocked', true, 'checkout_session_id', p_stripe_checkout_session_id)
  );

  SELECT status IN ('UNLOCKED', 'ADMIN_OVERRIDE') AND revoked_at IS NULL INTO unlocked
  FROM public.booking_contact_access
  WHERE connection_id = conn.id;

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'status', conn.status,
    'contact_unlocked', coalesce(unlocked, false),
    'paid', true,
    'idempotent', false,
    'duplicate_event', (event_row->>'duplicate')::boolean,
    'payments_live', false,
    'charges_live', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.normalized_stripe_payment_intent_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid, text) IS
  'Service-role only. Unlocks #14 booking_contact_access after Stripe TEST verification of Price ID + 499 USD. stripe_payment_intent_id stores pi_... only. processor_event_id / fulfillment_reference hold webhook or reconcile source. Never trust success URLs.';

COMMENT ON COLUMN public.connection_checkout_sessions.stripe_payment_intent_id IS
  'Stripe PaymentIntent id (pi_...) when Stripe provided one. Never a reconcile: or webhook: fulfillment marker.';

COMMENT ON COLUMN public.connection_checkout_sessions.fulfillment_reference IS
  'Fulfillment source such as Stripe event id (evt_...) or reconcile:cs_test_.... Separate from stripe_payment_intent_id.';
