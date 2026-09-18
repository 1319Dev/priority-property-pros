-- Connection Fee TEST Checkout ($4.99 / 499 cents).
-- Additive. Does NOT apply itself to production.
-- Does NOT flip payments_live, charges_live, or signup_fee_enabled.
-- stripe_test_mode stays 1. connection_fee_checkout_enabled defaults to 0.
-- Job-payment / Connect / payouts stay OFF. Do not reuse legacy Edge Functions.

INSERT INTO public.platform_settings (key, value_int, description)
VALUES
  (
    'connection_fee_checkout_enabled',
    0,
    '1 = staging-safe Connection Fee Stripe TEST Checkout. Independent of payments_live / charges_live / signup_fee_enabled. Keep 0 in production.'
  ),
  (
    'connection_reservation_ttl_seconds',
    1800,
    'RESERVED_PENDING_PAYMENT TTL. Abandoned Checkout releases the max-3 slot.'
  )
ON CONFLICT (key) DO NOTHING;

-- Never enable job-payment flags here.
UPDATE public.platform_settings
SET description = coalesce(description, '') || ' Connection Fee TEST Checkout does not flip this flag.'
WHERE key IN ('payments_live', 'charges_live', 'signup_fee_enabled')
  AND value_int = 0
  AND description NOT LIKE '%Connection Fee TEST Checkout%';

CREATE OR REPLACE FUNCTION public.connection_fee_checkout_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'connection_fee_checkout_enabled'), 0) <> 0;
$$;

CREATE OR REPLACE FUNCTION public.stripe_connection_price_id()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'price_1UH1RsPYJQAIQDv721IhjKS0';
$$;

CREATE OR REPLACE FUNCTION public.stripe_activation_price_id()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- Config compatibility only. Activation checkout is owned by parked PR #12.
  SELECT 'price_1UH1SePYJQAIQDv7nrMo32Xp';
$$;

CREATE OR REPLACE FUNCTION public.connection_reservation_ttl_seconds()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'connection_reservation_ttl_seconds'), 1800);
$$;

CREATE OR REPLACE FUNCTION public.require_service_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
END;
$$;

ALTER TABLE public.project_connections
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz,
  ADD COLUMN IF NOT EXISTS needs_refund boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

ALTER TABLE public.project_connections
  DROP CONSTRAINT IF EXISTS project_connections_pair;

CREATE UNIQUE INDEX IF NOT EXISTS project_connections_active_pair_idx
  ON public.project_connections (project_id, contractor_profile_id)
  WHERE status IN ('INITIATED', 'RESERVED', 'PAYMENT_DISABLED', 'PAID', 'COMPLETED');

CREATE TABLE IF NOT EXISTS public.connection_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.project_connections (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  stripe_checkout_session_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text,
  price_id text NOT NULL DEFAULT 'price_1UH1RsPYJQAIQDv721IhjKS0',
  amount_cents integer NOT NULL DEFAULT 499,
  currency text NOT NULL DEFAULT 'usd',
  livemode boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'OPEN',
  payment_status text,
  consumed_at timestamptz,
  fulfilled_at timestamptz,
  needs_refund boolean NOT NULL DEFAULT false,
  refund_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_checkout_amount_check CHECK (amount_cents = 499),
  CONSTRAINT connection_checkout_currency_check CHECK (currency = 'usd'),
  CONSTRAINT connection_checkout_price_check CHECK (price_id = 'price_1UH1RsPYJQAIQDv721IhjKS0'),
  CONSTRAINT connection_checkout_test_only CHECK (livemode = false),
  CONSTRAINT connection_checkout_status_check CHECK (
    status IN ('OPEN', 'PAID', 'EXPIRED', 'FAILED', 'CONSUMED', 'NEEDS_REFUND')
  )
);

CREATE TRIGGER connection_checkout_sessions_set_updated_at
  BEFORE UPDATE ON public.connection_checkout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.connection_checkout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_event_id text NOT NULL UNIQUE,
  checkout_session_id uuid REFERENCES public.connection_checkout_sessions (id) ON DELETE SET NULL,
  stripe_checkout_session_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.connection_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_checkout_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY connection_checkout_sessions_select_own
  ON public.connection_checkout_sessions FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.customer_id = auth.uid()
    )
  );

CREATE POLICY connection_checkout_events_select_admin
  ON public.connection_checkout_events FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.connection_checkout_sessions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.connection_checkout_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.connection_checkout_sessions TO authenticated;
GRANT SELECT ON TABLE public.connection_checkout_events TO authenticated;

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

CREATE TRIGGER connection_checkout_sessions_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.connection_checkout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_connection_checkout_session_row();

CREATE OR REPLACE FUNCTION public.protect_connection_checkout_event_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('record_connection_checkout_event')
     OR public.ppp_rpc_is('fulfill_connection_fee_checkout')
     OR public.ppp_rpc_is('expire_connection_checkout_session') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'connection checkout events cannot be written from the client';
END;
$$;

CREATE TRIGGER connection_checkout_events_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.connection_checkout_events
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_connection_checkout_event_row();

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

CREATE OR REPLACE FUNCTION public.protect_connection_contact_access_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('request_project_connection')
     OR public.ppp_rpc_is('admin_grant_connection_contact_access')
     OR public.ppp_rpc_is('admin_revoke_connection_contact_access')
     OR public.ppp_rpc_is('grant_connection_contact_access_from_fee')
     OR public.ppp_rpc_is('finalize_project_connection_payment')
     OR public.ppp_rpc_is('reserve_connection_checkout')
     OR public.ppp_rpc_is('fulfill_connection_fee_checkout') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'connection contact access cannot be written from the client';
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

CREATE OR REPLACE FUNCTION public.expire_stale_connection_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  rec public.project_connections;
BEGIN
  PERFORM public.ppp_set_rpc('expire_stale_connection_reservations');
  FOR rec IN
    SELECT *
    FROM public.project_connections
    WHERE status = 'RESERVED'
      AND reserved_until IS NOT NULL
      AND reserved_until < now()
    FOR UPDATE
  LOOP
    DELETE FROM public.connection_slots WHERE connection_id = rec.id;
    UPDATE public.project_connections
    SET
      status = 'EXPIRED',
      reservation_slot = NULL,
      updated_at = now()
    WHERE id = rec.id;
    PERFORM public.write_connection_event(
      rec.id,
      'connection.reservation.expired',
      jsonb_build_object('project_id', rec.project_id, 'released', true)
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_connection_occupancy(p_project_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.connection_slots s
  JOIN public.project_connections c ON c.id = s.connection_id
  WHERE s.project_id = p_project_id
    AND (
      c.status IN ('PAID', 'COMPLETED', 'PAYMENT_DISABLED')
      OR (
        c.status = 'RESERVED'
        AND (c.reserved_until IS NULL OR c.reserved_until > now())
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.project_connection_availability(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  occupied integer;
  completed integer;
  remaining integer;
BEGIN
  PERFORM public.expire_stale_connection_reservations();
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  occupied := public.project_connection_occupancy(p_project_id);
  completed := public.project_connection_completed_count(p_project_id);
  remaining := GREATEST(0, 3 - occupied);
  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'max', 3,
    'occupied', occupied,
    'remaining', remaining,
    'completed', completed,
    'accepting_connections', proj.accepting_connections,
    'full', occupied >= 3 OR proj.accepting_connections = false,
    'fee_cents', public.connection_fee_cents(),
    'checkout_enabled', public.connection_fee_checkout_enabled(),
    'payments_live', false,
    'charges_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.connection_fee_checkout_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'enabled', public.connection_fee_checkout_enabled(),
    'fee_cents', 499,
    'currency', 'usd',
    'stripe_test_mode', coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'stripe_test_mode'), 1) = 1,
    'payments_live', false,
    'charges_live', false,
    'signup_fee_enabled', coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'signup_fee_enabled'), 0) <> 0,
    'price_id', NULL
  );
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

  INSERT INTO public.connection_contact_access (
    connection_id, status, grant_source
  ) VALUES (
    conn.id, 'LOCKED', 'SYSTEM'
  )
  ON CONFLICT (connection_id) DO NOTHING;

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
  IF coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'stripe_test_mode'), 1) <> 1 THEN
    RAISE EXCEPTION 'stripe_test_mode must stay 1';
  END IF;
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.project_id = p_project_id
      AND o.contractor_profile_id = contractor_id
      AND o.status = 'ACCEPTED'
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

  INSERT INTO public.connection_contact_access (
    connection_id, status, grant_source
  ) VALUES (
    conn.id, 'LOCKED', 'SYSTEM'
  )
  ON CONFLICT (connection_id) DO UPDATE
    SET status = CASE
      WHEN connection_contact_access.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
        THEN connection_contact_access.status
      ELSE 'LOCKED'
    END;

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
    'charges_live', false,
    'price_id', public.stripe_connection_price_id()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_connection_checkout_session(
  p_connection_id uuid,
  p_stripe_checkout_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn public.project_connections;
  sess public.connection_checkout_sessions;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('attach_connection_checkout_session');

  IF p_stripe_checkout_session_id IS NULL OR left(p_stripe_checkout_session_id, 8) IS DISTINCT FROM 'cs_test_' THEN
    RAISE EXCEPTION 'only Stripe TEST checkout sessions are allowed';
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
    public.stripe_connection_price_id(),
    499,
    'usd',
    false,
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

CREATE OR REPLACE FUNCTION public.record_connection_checkout_event(
  p_processor_event_id text,
  p_event_type text,
  p_stripe_checkout_session_id text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing uuid;
  sid uuid;
BEGIN
  PERFORM public.require_service_role();
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('record_connection_checkout_event');
  END IF;

  SELECT id INTO existing
  FROM public.connection_checkout_events
  WHERE processor_event_id = p_processor_event_id;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'event_id', existing);
  END IF;

  SELECT id INTO sid
  FROM public.connection_checkout_sessions
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id;

  INSERT INTO public.connection_checkout_events (
    processor_event_id, checkout_session_id, stripe_checkout_session_id, event_type, payload
  ) VALUES (
    p_processor_event_id,
    sid,
    p_stripe_checkout_session_id,
    p_event_type,
    coalesce(p_payload, '{}'::jsonb)
      - 'phone' - 'email' - 'street' - 'customer_email' - 'customer_details'
  )
  RETURNING id INTO existing;

  RETURN jsonb_build_object('duplicate', false, 'event_id', existing);
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
  p_contractor_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn public.project_connections;
  access public.connection_contact_access;
  sess public.connection_checkout_sessions;
  event_row jsonb;
  unlocked boolean;
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

  SELECT * INTO access FROM public.connection_contact_access WHERE connection_id = conn.id FOR UPDATE;
  SELECT * INTO sess
  FROM public.connection_checkout_sessions
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
  FOR UPDATE;

  IF access.status IN ('UNLOCKED', 'ADMIN_OVERRIDE') AND conn.status IN ('PAID', 'COMPLETED') THEN
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET status = 'CONSUMED', payment_status = 'paid', consumed_at = coalesce(consumed_at, now()), fulfilled_at = coalesce(fulfilled_at, now())
      WHERE id = sess.id;
    END IF;
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', true,
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

  UPDATE public.connection_contact_access
  SET
    status = 'UNLOCKED',
    granted_at = now(),
    grant_reason = 'connection_fee_payment',
    grant_source = 'CONNECTION_FEE_PAYMENT',
    revoked_at = NULL,
    updated_at = now()
  WHERE connection_id = conn.id;

  IF sess.id IS NOT NULL THEN
    UPDATE public.connection_checkout_sessions
    SET
      status = 'CONSUMED',
      payment_status = 'paid',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_processor_event_id),
      consumed_at = now(),
      fulfilled_at = now()
    WHERE id = sess.id;
  END IF;

  PERFORM public.write_connection_event(
    conn.id,
    'connection.paid',
    jsonb_build_object('fee_cents', 499, 'contact_unlocked', true, 'checkout_session_id', p_stripe_checkout_session_id)
  );

  SELECT status IN ('UNLOCKED', 'ADMIN_OVERRIDE') INTO unlocked
  FROM public.connection_contact_access
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

CREATE OR REPLACE FUNCTION public.expire_connection_checkout_session(
  p_stripe_checkout_session_id text,
  p_processor_event_id text DEFAULT NULL,
  p_reason text DEFAULT 'checkout.session.expired'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.connection_checkout_sessions;
  conn public.project_connections;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('expire_connection_checkout_session');

  IF p_processor_event_id IS NOT NULL THEN
    PERFORM public.record_connection_checkout_event(
      p_processor_event_id, p_reason, p_stripe_checkout_session_id, '{}'::jsonb
    );
  END IF;

  SELECT * INTO sess
  FROM public.connection_checkout_sessions
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'released', false);
  END IF;

  SELECT * INTO conn FROM public.project_connections WHERE id = sess.connection_id FOR UPDATE;
  IF conn.status IN ('PAID', 'COMPLETED') THEN
    RETURN jsonb_build_object('ok', true, 'released', false, 'already_paid', true);
  END IF;

  UPDATE public.connection_checkout_sessions
  SET status = 'EXPIRED', updated_at = now()
  WHERE id = sess.id;

  IF conn.status = 'RESERVED' THEN
    DELETE FROM public.connection_slots WHERE connection_id = conn.id;
    UPDATE public.project_connections
    SET status = 'EXPIRED', reservation_slot = NULL, updated_at = now()
    WHERE id = conn.id;
    PERFORM public.write_connection_event(
      conn.id,
      'connection.reservation.expired',
      jsonb_build_object('reason', p_reason, 'released', true)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'released', true, 'contact_unlocked', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.flag_connection_checkout_needs_refund(
  p_stripe_checkout_session_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('flag_connection_checkout_needs_refund');
  UPDATE public.connection_checkout_sessions
  SET status = 'NEEDS_REFUND', needs_refund = true, refund_reason = p_reason
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id;
  UPDATE public.project_connections c
  SET needs_refund = true, refund_reason = p_reason
  FROM public.connection_checkout_sessions s
  WHERE s.stripe_checkout_session_id = p_stripe_checkout_session_id
    AND s.connection_id = c.id
    AND c.status IS DISTINCT FROM 'PAID'
    AND c.status IS DISTINCT FROM 'COMPLETED';
  RETURN jsonb_build_object('needs_refund', true, 'reason', p_reason, 'contact_unlocked', false);
END;
$$;

REVOKE ALL ON FUNCTION public.require_service_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stripe_connection_price_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stripe_activation_price_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_connection_checkout(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_connection_checkout_session(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_connection_checkout_event(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_connection_checkout_session(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flag_connection_checkout_needs_refund(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_connection_reservations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_connection_checkout_session_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_connection_checkout_event_row() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.connection_fee_checkout_enabled() TO authenticated;
GRANT EXECUTE ON FUNCTION public.connection_fee_checkout_flags() TO authenticated;
GRANT EXECUTE ON FUNCTION public.connection_reservation_ttl_seconds() TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_connection_availability(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_project_connection(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.require_service_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.stripe_connection_price_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.stripe_activation_price_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_connection_checkout(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_connection_checkout_session(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_connection_checkout_event(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_connection_checkout_session(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.flag_connection_checkout_needs_refund(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_connection_reservations() TO service_role;

COMMENT ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid) IS
  'Service-role only. Unlocks connection_contact_access after Stripe TEST verification of Price ID + 499 USD. Never trust success URLs. Does not use payments_live. Does not call job-payment functions.';
CREATE OR REPLACE FUNCTION public.connection_checkout_context(
  p_stripe_checkout_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.connection_checkout_sessions;
  profile_id uuid;
BEGIN
  PERFORM public.require_service_role();
  SELECT * INTO sess
  FROM public.connection_checkout_sessions
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout session not found';
  END IF;
  SELECT cp.profile_id INTO profile_id
  FROM public.contractor_profiles cp
  WHERE cp.id = sess.contractor_profile_id;
  RETURN jsonb_build_object(
    'connection_id', sess.connection_id,
    'project_id', sess.project_id,
    'contractor_profile_id', sess.contractor_profile_id,
    'contractor_user_id', profile_id,
    'status', sess.status,
    'consumed', sess.consumed_at IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.connection_checkout_context(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connection_checkout_context(text) TO service_role;

COMMENT ON FUNCTION public.reserve_connection_checkout(uuid, uuid, text) IS
  'Service-role only. AVAILABLE → RESERVED (pending payment) with TTL. Max 3 race-safe slots. Client cannot set price.';
COMMENT ON COLUMN public.platform_settings.key IS
  'Includes connection_fee_checkout_enabled (independent of payments_live). Production must keep live job-payment flags at 0.';
