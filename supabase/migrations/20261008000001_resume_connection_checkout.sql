-- Resume an unpaid PAYMENT_DISABLED connection into $4.99 checkout when
-- connection_fee_checkout_enabled is already on. Does NOT flip payments_live,
-- charges_live, signup_fee_enabled, or connection_fee_checkout_enabled.
-- Does NOT change the 499 cent fee, Stripe Price, webhooks, or payment rows.
-- Does NOT grant #14 contact. PAYMENT_DISABLED remains only when checkout is off.

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
    IF existing.status IN ('PAID', 'COMPLETED') THEN
      RAISE EXCEPTION 'duplicate connection';
    END IF;
    -- Unpaid payments-off request. Checkout is on, so resume this same slot.
    -- Do not grant contact. Fee stays 499. payments_live and charges_live stay false.
    IF existing.status = 'PAYMENT_DISABLED' THEN
      UPDATE public.project_connections
      SET
        status = 'RESERVED',
        fee_cents = 499,
        reserved_at = now(),
        reserved_until = now() + ttl,
        needs_refund = false,
        refund_reason = NULL,
        stripe_checkout_session_id = NULL,
        payments_live = false,
        charges_live = false,
        updated_at = now()
      WHERE id = existing.id
      RETURNING * INTO conn;

      IF NOT EXISTS (
        SELECT 1 FROM public.connection_slots WHERE connection_id = conn.id
      ) THEN
        RAISE EXCEPTION 'connections full';
      END IF;

      PERFORM public.write_connection_event(
        conn.id,
        'connection.reserved',
        jsonb_build_object(
          'project_id', p_project_id,
          'slot', conn.reservation_slot,
          'fee_cents', 499,
          'status', 'RESERVED',
          'resumed_from', 'PAYMENT_DISABLED',
          'contact_unlocked', false
        )
      );

      RETURN jsonb_build_object(
        'connection_id', conn.id,
        'status', conn.status,
        'fee_cents', 499,
        'reservation_slot', conn.reservation_slot,
        'reserved_until', conn.reserved_until,
        'contact_unlocked', false,
        'paid', false,
        'idempotent', false,
        'payments_live', false,
        'charges_live', false
      );
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
        'message', 'Connection requested. $4.99 checkout is temporarily unavailable. Contact stays locked until a verified $4.99 payment. Clicking Connect does not unlock contact.'
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
    'message', 'Connection requested. $4.99 checkout is temporarily unavailable. Contact stays locked until a verified $4.99 payment. Clicking Connect does not unlock contact.'
  );
END;
$$;
