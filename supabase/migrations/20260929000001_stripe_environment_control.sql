-- Explicit Stripe TEST/LIVE environment control for Connection Fee checkout.
-- Does NOT apply itself to production. Does NOT flip flags:
--   stripe_test_mode stays at its current value (default 1 / TEST)
--   connection_fee_checkout_enabled stays 0 unless an owner already set it
--   payments_live / charges_live / signup_fee_enabled stay 0
--
-- Safety is NOT inferred from whichever Stripe key is installed.
-- platform_settings.stripe_test_mode: 1 = TEST, 0 = LIVE.
-- connection_fee_checkout_enabled remains the customer-facing kill switch.

CREATE OR REPLACE FUNCTION public.stripe_test_mode_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'stripe_test_mode'), 1) = 1;
$$;

CREATE OR REPLACE FUNCTION public.assert_connection_stripe_environment(
  p_livemode boolean,
  p_checkout_session_id text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_test boolean;
BEGIN
  IF p_livemode IS NULL THEN
    RAISE EXCEPTION 'livemode is required';
  END IF;
  IF p_checkout_session_id IS NULL OR btrim(p_checkout_session_id) = '' THEN
    RAISE EXCEPTION 'checkout session is required';
  END IF;
  v_test := public.stripe_test_mode_enabled();
  IF v_test THEN
    IF p_livemode IS TRUE THEN
      RAISE EXCEPTION 'live Stripe events are forbidden while stripe_test_mode=1';
    END IF;
    IF left(p_checkout_session_id, 8) IS DISTINCT FROM 'cs_test_' THEN
      RAISE EXCEPTION 'stripe_test_mode=1 requires a Stripe TEST checkout session (cs_test_)';
    END IF;
  ELSE
    IF p_livemode IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'test Stripe events are forbidden while stripe_test_mode=0';
    END IF;
    IF left(p_checkout_session_id, 8) IS DISTINCT FROM 'cs_live_' THEN
      RAISE EXCEPTION 'stripe_test_mode=0 requires a Stripe LIVE checkout session (cs_live_)';
    END IF;
  END IF;
END;
$$;

ALTER TABLE public.connection_checkout_sessions
  DROP CONSTRAINT IF EXISTS connection_checkout_test_only;

ALTER TABLE public.connection_checkout_sessions
  DROP CONSTRAINT IF EXISTS connection_checkout_price_check;

ALTER TABLE public.connection_checkout_sessions
  DROP CONSTRAINT IF EXISTS connection_checkout_price_prefix;

ALTER TABLE public.connection_checkout_sessions
  ADD CONSTRAINT connection_checkout_price_prefix
  CHECK (left(price_id, 6) = 'price_');

COMMENT ON FUNCTION public.stripe_test_mode_enabled() IS
  'True when platform_settings.stripe_test_mode is 1 or missing. Missing defaults to TEST (fail closed toward live keys).';

COMMENT ON FUNCTION public.assert_connection_stripe_environment(boolean, text) IS
  'Fails closed unless event/session livemode and cs_test_/cs_live_ prefix match stripe_test_mode. TEST events cannot fulfill LIVE transactions and vice versa.';

COMMENT ON FUNCTION public.stripe_connection_price_id() IS
  'Known Stripe TEST catalog Connection Fee Price ID. Not a LIVE fallback. Edge Functions require STRIPE_CONNECTION_PRICE_ID and retrieve the Price from Stripe.';

DROP FUNCTION IF EXISTS public.attach_connection_checkout_session(uuid, text);

CREATE OR REPLACE FUNCTION public.attach_connection_checkout_session(
  p_connection_id uuid,
  p_stripe_checkout_session_id text,
  p_price_id text DEFAULT NULL,
  p_livemode boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn public.project_connections;
  sess public.connection_checkout_sessions;
  v_price text;
  v_livemode boolean;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('attach_connection_checkout_session');

  v_livemode := coalesce(p_livemode, NOT public.stripe_test_mode_enabled());
  PERFORM public.assert_connection_stripe_environment(v_livemode, p_stripe_checkout_session_id);

  v_price := nullif(btrim(coalesce(p_price_id, '')), '');
  IF v_price IS NULL OR left(v_price, 6) IS DISTINCT FROM 'price_' THEN
    RAISE EXCEPTION 'STRIPE_CONNECTION_PRICE_ID is required';
  END IF;
  IF v_price IS NOT DISTINCT FROM public.stripe_activation_price_id() THEN
    RAISE EXCEPTION 'activation Price ID must not be used for Connection Fee';
  END IF;

  SELECT * INTO conn FROM public.project_connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection not found';
  END IF;

  INSERT INTO public.connection_checkout_sessions (
    connection_id,
    project_id,
    contractor_profile_id,
    stripe_checkout_session_id,
    price_id,
    amount_cents,
    currency,
    livemode,
    status
  ) VALUES (
    conn.id,
    conn.project_id,
    conn.contractor_profile_id,
    p_stripe_checkout_session_id,
    v_price,
    499,
    'usd',
    v_livemode,
    'OPEN'
  )
  ON CONFLICT (stripe_checkout_session_id) DO UPDATE
    SET updated_at = now()
  RETURNING * INTO sess;

  UPDATE public.project_connections
  SET stripe_checkout_session_id = p_stripe_checkout_session_id, updated_at = now()
  WHERE id = conn.id;

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'checkout_session_id', sess.stripe_checkout_session_id,
    'contact_unlocked', false,
    'paid', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_connection_checkout(
  p_project_id uuid,
  p_auth_user_id uuid,
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
  ttl interval;
  account public.account_status;
  approval public.approval_status;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('reserve_connection_checkout');
  PERFORM public.expire_stale_connection_reservations();

  IF NOT public.connection_fee_checkout_enabled() THEN
    RAISE EXCEPTION 'connection fee checkout is disabled';
  END IF;
  -- Both TEST (stripe_test_mode=1) and LIVE (0) may reserve. Kill switch is connection_fee_checkout_enabled.
  -- Stripe key/Price/livemode matching is enforced at checkout attach, webhook, reconcile, and fulfill.
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT p.account_status INTO account FROM public.profiles p WHERE p.id = p_auth_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;
  IF account IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;

  SELECT cp.id, cp.approval_status
    INTO contractor_id, approval
  FROM public.contractor_profiles cp
  WHERE cp.profile_id = p_auth_user_id
  LIMIT 1;
  IF contractor_id IS NULL THEN
    RAISE EXCEPTION 'only a contractor can request a connection';
  END IF;
  IF approval IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;

  ttl := make_interval(secs => public.connection_reservation_ttl_seconds());

  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id = p_auth_user_id THEN
    RAISE EXCEPTION 'customers do not pay a Connection Fee';
  END IF;
  IF proj.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'project is cancelled';
  END IF;
  IF proj.accepting_connections IS NOT TRUE THEN
    RAISE EXCEPTION 'customer stopped new connections';
  END IF;

  -- FLAT-499: matched opportunity may be AVAILABLE or ACCEPTED (Participate is optional).
  -- Unmatched contractors and PASSED / EXPIRED / CLOSED opportunities cannot reserve.
  IF NOT EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.project_id = p_project_id
      AND o.contractor_profile_id = contractor_id
      AND o.status IN ('AVAILABLE', 'ACCEPTED')
  ) THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;

  SELECT * INTO existing
  FROM public.project_connections
  WHERE project_id = p_project_id
    AND contractor_profile_id = contractor_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF existing.status IN ('PAID', 'COMPLETED', 'PAYMENT_DISABLED') THEN
      RAISE EXCEPTION 'duplicate connection';
    END IF;
    IF existing.status = 'RESERVED'
       AND (existing.reserved_until IS NULL OR existing.reserved_until > now()) THEN
      RETURN jsonb_build_object(
        'connection_id', existing.id,
        'status', existing.status,
        'fee_cents', 499,
        'reservation_slot', existing.reservation_slot,
        'reserved_until', existing.reserved_until,
        'contact_unlocked', false,
        'paid', false,
        'idempotent', true,
        'payments_live', false,
        'charges_live', false
      );
    END IF;
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

  IF existing.id IS NOT NULL AND existing.status IN ('EXPIRED', 'FAILED', 'CANCELLED') THEN
    UPDATE public.project_connections
    SET
      status = 'RESERVED',
      fee_cents = 499,
      reservation_slot = slot,
      reserved_at = now(),
      reserved_until = now() + ttl,
      needs_refund = false,
      refund_reason = NULL,
      stripe_checkout_session_id = NULL,
      updated_at = now()
    WHERE id = existing.id
    RETURNING * INTO conn;
  ELSE
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
        reserved_at,
        reserved_until
      ) VALUES (
        p_project_id,
        contractor_id,
        proj.customer_id,
        'RESERVED',
        499,
        nullif(btrim(coalesce(p_idempotency_key, '')), ''),
        slot,
        false,
        false,
        now(),
        now() + ttl
      )
      RETURNING * INTO conn;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'duplicate connection';
    END;
  END IF;

  BEGIN
    INSERT INTO public.connection_slots (
      project_id, slot_number, connection_id, contractor_profile_id
    ) VALUES (
      p_project_id, slot, conn.id, contractor_id
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'connections full';
  END;

  -- AVAILABLE → RESERVED only. No #14 row until trusted fulfill. Missing = no access.
  PERFORM public.write_connection_event(
    conn.id,
    'connection.reserved',
    jsonb_build_object(
      'project_id', p_project_id,
      'slot', slot,
      'fee_cents', 499,
      'status', 'RESERVED',
      'contact_unlocked', false
    )
  );

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'status', conn.status,
    'fee_cents', 499,
    'reservation_slot', slot,
    'reserved_until', conn.reserved_until,
    'contact_unlocked', false,
    'paid', false,
    'idempotent', false,
    'payments_live', false,
    'charges_live', false
  );
END;
$$;

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
  PERFORM public.assert_connection_stripe_environment(p_livemode, p_stripe_checkout_session_id);
  IF p_amount_cents IS DISTINCT FROM 499 THEN
    RAISE EXCEPTION 'connection fee is server-authoritative and must be 499 cents';
  END IF;
  IF lower(coalesce(p_currency, '')) IS DISTINCT FROM 'usd' THEN
    RAISE EXCEPTION 'connection fee currency must be usd';
  END IF;
  IF p_price_id IS NULL OR left(btrim(p_price_id), 6) IS DISTINCT FROM 'price_' THEN
    RAISE EXCEPTION 'wrong connection Price ID';
  END IF;
  IF btrim(p_price_id) IS NOT DISTINCT FROM public.stripe_activation_price_id() THEN
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

  IF sess.id IS NOT NULL THEN
    IF sess.price_id IS DISTINCT FROM btrim(p_price_id) THEN
      RAISE EXCEPTION 'wrong connection Price ID';
    END IF;
    IF sess.livemode IS DISTINCT FROM p_livemode THEN
      RAISE EXCEPTION 'checkout session livemode does not match stripe_test_mode';
    END IF;
  END IF;

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

REVOKE ALL ON FUNCTION public.stripe_test_mode_enabled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_connection_stripe_environment(boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_connection_checkout_session(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_connection_checkout(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.attach_connection_checkout_session(uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_connection_checkout(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.attach_connection_checkout_session(uuid, text, text, boolean) IS
  'Service-role only. Stores a Stripe Checkout Session whose livemode and cs_test_/cs_live_ prefix match stripe_test_mode. Price ID comes from Edge env after Stripe Price retrieve. Does not grant #14.';

COMMENT ON FUNCTION public.reserve_connection_checkout(uuid, uuid, text) IS
  'Service-role only. Matched contractor with AVAILABLE or ACCEPTED opportunity may reserve. Connection status AVAILABLE → RESERVED (pending payment) with TTL. Max 3 race-safe slots. Client cannot set price. Does not grant #14 contact. Allowed in TEST or LIVE when connection_fee_checkout_enabled=1.';

COMMENT ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid, text) IS
  'Service-role only. Unlocks #14 booking_contact_access after Stripe verification of Price ID + 499 USD whose livemode matches stripe_test_mode. stripe_payment_intent_id stores pi_... only. Never trust success URLs. TEST events cannot fulfill LIVE transactions and vice versa.';
