-- $9.99 account activation / signup-fee Stripe Checkout.
-- Additive. Does NOT apply itself to production.
-- Does NOT flip payments_live, charges_live, signup_fee_enabled,
-- connection_fee_checkout_enabled, or stripe_test_mode.
-- Signup fee is not the Connection Fee and never grants #14 contact.

CREATE TYPE public.signup_fee_status AS ENUM ('UNPAID', 'PAID', 'NOT_REQUIRED');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_fee_status public.signup_fee_status NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS signup_fee_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS signup_fee_charge_id uuid;

-- Grandfather every profile that already exists. New CUSTOMER/CONTRACTOR rows
-- keep UNPAID (set explicitly by handle_new_user). VERIFIER/ADMIN are NOT_REQUIRED.
UPDATE public.profiles
SET signup_fee_status = 'NOT_REQUIRED'
WHERE signup_fee_status = 'UNPAID';

COMMENT ON COLUMN public.profiles.signup_fee_status IS
  'Isolated $9.99 account activation. Independent of email verification, account_status, contractor approval, membership, job payments, and #14 contact. Existing profiles at migration time are NOT_REQUIRED.';

INSERT INTO public.platform_settings (key, value_int, description)
VALUES (
  'signup_fee_cents',
  999,
  'One-time account activation fee in cents. Must remain 999 ($9.99). Isolated from the $4.99 Connection Fee and job payments.'
)
ON CONFLICT (key) DO NOTHING;

UPDATE public.platform_settings
SET description = '0 = $9.99 account activation Checkout is not live. Edge Functions exist; owner enables later. Independent of payments_live / charges_live / connection_fee_checkout_enabled.'
WHERE key = 'signup_fee_enabled'
  AND coalesce(value_int, 0) = 0;

CREATE TABLE IF NOT EXISTS public.signup_fee_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  stripe_checkout_session_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text,
  fulfillment_reference text,
  price_id text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 999,
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
  CONSTRAINT signup_checkout_amount_check CHECK (amount_cents = 999),
  CONSTRAINT signup_checkout_currency_check CHECK (currency = 'usd'),
  CONSTRAINT signup_checkout_price_prefix CHECK (left(price_id, 6) = 'price_'),
  CONSTRAINT signup_checkout_status_check CHECK (
    status IN ('OPEN', 'PAID', 'EXPIRED', 'FAILED', 'CONSUMED', 'CANCELED', 'NEEDS_REFUND')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS signup_fee_charges_one_paid
  ON public.signup_fee_charges (profile_id)
  WHERE status IN ('PAID', 'CONSUMED');

CREATE INDEX IF NOT EXISTS signup_fee_charges_profile_idx
  ON public.signup_fee_charges (profile_id);

COMMENT ON TABLE public.signup_fee_charges IS
  'Isolated $9.99 account activation ledger. Not a Connection Fee table. Never grants #14 booking_contact_access. No Connect transfers.';

CREATE TABLE IF NOT EXISTS public.signup_fee_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_event_id text NOT NULL UNIQUE,
  charge_id uuid REFERENCES public.signup_fee_charges (id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  stripe_checkout_session_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.signup_fee_events IS
  'Idempotency log for signup/activation processor events only. Separate from connection_checkout_events.';

CREATE TRIGGER signup_fee_charges_set_updated_at
  BEFORE UPDATE ON public.signup_fee_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.signup_fee_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_fee_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY signup_fee_charges_select_own_or_admin
  ON public.signup_fee_charges
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY signup_fee_events_select_admin
  ON public.signup_fee_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.signup_fee_charges FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.signup_fee_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.signup_fee_charges TO authenticated;
GRANT SELECT ON TABLE public.signup_fee_events TO authenticated;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_signup_fee_charge_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_signup_fee_charge_id_fkey
  FOREIGN KEY (signup_fee_charge_id) REFERENCES public.signup_fee_charges (id);

CREATE OR REPLACE FUNCTION public.signup_fee_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'signup_fee_enabled'), 0) <> 0;
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_cents()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 999;
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_checkout_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'enabled', public.signup_fee_enabled(),
    'fee_cents', 999,
    'currency', 'usd',
    'stripe_test_mode', public.stripe_test_mode_enabled(),
    'payments_live', false,
    'charges_live', false,
    'connection_fee_checkout_enabled', public.connection_fee_checkout_enabled(),
    'job_payments_enabled', false,
    'connect_payouts_enabled', false,
    'contact_unlocked', false,
    'price_id', NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_is_satisfied(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
BEGIN
  IF NOT public.signup_fee_enabled() THEN
    RETURN true;
  END IF;
  IF p_profile_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') THEN
    RETURN true;
  END IF;
  IF p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR') THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_signup_fee_paid(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.signup_fee_is_satisfied(p_profile_id) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'signup fee required';
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'email cannot be changed from the client';
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    IF NEW.account_type = 'ADMIN' AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'ADMIN cannot be assigned from the client';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'account_type cannot be changed by the account owner';
    END IF;
  END IF;

  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'account_status cannot be changed by the account owner';
  END IF;

  IF (
    NEW.signup_fee_status IS DISTINCT FROM OLD.signup_fee_status
    OR NEW.signup_fee_paid_at IS DISTINCT FROM OLD.signup_fee_paid_at
    OR NEW.signup_fee_charge_id IS DISTINCT FROM OLD.signup_fee_charge_id
  ) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'signup fee fields cannot be changed from the client';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_signup_fee_charge_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('register_signup_fee_checkout')
     OR public.ppp_rpc_is('fulfill_signup_fee_checkout')
     OR public.ppp_rpc_is('record_signup_fee_event')
     OR public.ppp_rpc_is('flag_signup_checkout_needs_refund') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'signup fee charges cannot be written from the client';
END;
$$;

CREATE TRIGGER signup_fee_charges_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.signup_fee_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_signup_fee_charge_row();

CREATE OR REPLACE FUNCTION public.protect_signup_fee_event_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('record_signup_fee_event')
     OR public.ppp_rpc_is('fulfill_signup_fee_checkout') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'signup fee events cannot be written from the client';
END;
$$;

CREATE TRIGGER signup_fee_events_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.signup_fee_events
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_signup_fee_event_row();

CREATE OR REPLACE FUNCTION public.signup_fee_profile_snapshot(p public.profiles)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'amount_cents', 999,
    'currency', 'usd',
    'enabled', public.signup_fee_enabled(),
    'required', public.signup_fee_enabled()
      AND p.account_type IN ('CUSTOMER', 'CONTRACTOR')
      AND p.signup_fee_status IS DISTINCT FROM 'PAID'
      AND p.signup_fee_status IS DISTINCT FROM 'NOT_REQUIRED',
    'status', p.signup_fee_status,
    'paid_at', p.signup_fee_paid_at,
    'account_status', p.account_status,
    'account_type', p.account_type,
    'stripe_test_mode', public.stripe_test_mode_enabled(),
    'payments_live', false,
    'charges_live', false,
    'contact_unlocked', false,
    'job_payments_enabled', false,
    'connect_payouts_enabled', false
  );
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_state_for_me()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  RETURN public.signup_fee_profile_snapshot(p);
END;
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_profile_context(p_auth_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
BEGIN
  PERFORM public.require_service_role();
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_auth_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  RETURN public.signup_fee_profile_snapshot(p);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_signup_fee_event(
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
  pid uuid;
BEGIN
  PERFORM public.require_service_role();
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('record_signup_fee_event');
  END IF;

  SELECT id INTO existing
  FROM public.signup_fee_events
  WHERE processor_event_id = p_processor_event_id;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'event_id', existing);
  END IF;

  SELECT id, profile_id INTO sid, pid
  FROM public.signup_fee_charges
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id;

  INSERT INTO public.signup_fee_events (
    processor_event_id, charge_id, profile_id, stripe_checkout_session_id, event_type, payload
  ) VALUES (
    p_processor_event_id,
    sid,
    pid,
    p_stripe_checkout_session_id,
    p_event_type,
    coalesce(p_payload, '{}'::jsonb)
      - 'phone' - 'email' - 'street' - 'customer_email' - 'customer_details'
  )
  RETURNING id INTO existing;

  RETURN jsonb_build_object('duplicate', false, 'event_id', existing);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_signup_fee_checkout(
  p_profile_id uuid,
  p_stripe_checkout_session_id text,
  p_price_id text,
  p_livemode boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
  sess public.signup_fee_charges;
  v_price text;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('register_signup_fee_checkout');

  IF NOT public.signup_fee_enabled() THEN
    RAISE EXCEPTION 'signup fee checkout is disabled';
  END IF;
  PERFORM public.assert_connection_stripe_environment(p_livemode, p_stripe_checkout_session_id);

  v_price := nullif(btrim(coalesce(p_price_id, '')), '');
  IF v_price IS NULL OR left(v_price, 6) IS DISTINCT FROM 'price_' THEN
    RAISE EXCEPTION 'STRIPE_ACTIVATION_PRICE_ID is required';
  END IF;
  IF v_price IS NOT DISTINCT FROM public.stripe_connection_price_id() THEN
    RAISE EXCEPTION 'connection Price ID must not be used for account activation';
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  IF p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') THEN
    RETURN jsonb_build_object(
      'already_paid', true,
      'charge_id', p.signup_fee_charge_id,
      'signup_fee_status', p.signup_fee_status,
      'contact_unlocked', false,
      'payments_live', false,
      'charges_live', false
    );
  END IF;
  IF p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR') THEN
    RAISE EXCEPTION 'signup fee is only for CUSTOMER and CONTRACTOR';
  END IF;

  INSERT INTO public.signup_fee_charges (
    profile_id,
    stripe_checkout_session_id,
    price_id,
    amount_cents,
    currency,
    livemode,
    status
  ) VALUES (
    p.id,
    p_stripe_checkout_session_id,
    v_price,
    999,
    'usd',
    p_livemode,
    'OPEN'
  )
  ON CONFLICT (stripe_checkout_session_id) DO UPDATE
    SET updated_at = now()
  RETURNING * INTO sess;

  RETURN jsonb_build_object(
    'charge_id', sess.id,
    'checkout_session_id', sess.stripe_checkout_session_id,
    'already_paid', false,
    'contact_unlocked', false,
    'paid', false,
    'payments_live', false,
    'charges_live', false,
    'connect_payouts_enabled', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_checkout_context(
  p_stripe_checkout_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.signup_fee_charges;
BEGIN
  PERFORM public.require_service_role();
  SELECT * INTO sess
  FROM public.signup_fee_charges
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout session not found';
  END IF;
  RETURN jsonb_build_object(
    'charge_id', sess.id,
    'profile_id', sess.profile_id,
    'status', sess.status,
    'price_id', sess.price_id,
    'livemode', sess.livemode,
    'consumed', sess.consumed_at IS NOT NULL,
    'contact_unlocked', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_signup_fee_checkout(
  p_stripe_checkout_session_id text,
  p_processor_event_id text,
  p_amount_cents integer,
  p_currency text,
  p_price_id text,
  p_payment_status text,
  p_livemode boolean,
  p_profile_id uuid,
  p_stripe_payment_intent_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
  sess public.signup_fee_charges;
  event_row jsonb;
  v_approval public.approval_status;
  intent_id text;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('fulfill_signup_fee_checkout');

  IF NOT public.signup_fee_enabled() THEN
    RAISE EXCEPTION 'signup fee checkout is disabled';
  END IF;
  PERFORM public.assert_connection_stripe_environment(p_livemode, p_stripe_checkout_session_id);
  IF p_amount_cents IS DISTINCT FROM 999 THEN
    RAISE EXCEPTION 'signup fee is server-authoritative and must be 999 cents';
  END IF;
  IF lower(coalesce(p_currency, '')) IS DISTINCT FROM 'usd' THEN
    RAISE EXCEPTION 'signup fee currency must be usd';
  END IF;
  IF p_price_id IS NULL OR left(btrim(p_price_id), 6) IS DISTINCT FROM 'price_' THEN
    RAISE EXCEPTION 'wrong activation Price ID';
  END IF;
  IF btrim(p_price_id) IS NOT DISTINCT FROM public.stripe_connection_price_id() THEN
    RAISE EXCEPTION 'connection Price ID must not be used for account activation';
  END IF;
  IF p_payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'unpaid';
  END IF;

  intent_id := public.normalized_stripe_payment_intent_id(p_stripe_payment_intent_id);

  event_row := public.record_signup_fee_event(
    p_processor_event_id,
    'fulfill',
    p_stripe_checkout_session_id,
    jsonb_build_object('profile_id', p_profile_id, 'amount_cents', 999, 'contact_unlocked', false)
  );

  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  SELECT cp.approval_status INTO v_approval
  FROM public.contractor_profiles cp
  WHERE cp.profile_id = p.id;

  SELECT * INTO sess
  FROM public.signup_fee_charges
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
  FOR UPDATE;

  IF sess.id IS NOT NULL THEN
    IF sess.profile_id IS DISTINCT FROM p_profile_id THEN
      RAISE EXCEPTION 'mismatched metadata';
    END IF;
    IF sess.price_id IS DISTINCT FROM btrim(p_price_id) THEN
      RAISE EXCEPTION 'wrong activation Price ID';
    END IF;
    IF sess.livemode IS DISTINCT FROM p_livemode THEN
      RAISE EXCEPTION 'checkout session livemode does not match stripe_test_mode';
    END IF;
  END IF;

  IF p.signup_fee_status = 'PAID' THEN
    IF sess.id IS NOT NULL THEN
      UPDATE public.signup_fee_charges
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
      'ok', true,
      'already_paid', true,
      'signup_fee_status', 'PAID',
      'account_status', p.account_status,
      'approval_status', v_approval,
      'contact_unlocked', false,
      'paid', true,
      'idempotent', true,
      'duplicate_event', (event_row->>'duplicate')::boolean,
      'payments_live', false,
      'charges_live', false,
      'connect_payouts_enabled', false
    );
  END IF;

  IF p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR') THEN
    RAISE EXCEPTION 'signup fee is only for CUSTOMER and CONTRACTOR';
  END IF;

  IF sess.id IS NULL THEN
    INSERT INTO public.signup_fee_charges (
      profile_id,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      fulfillment_reference,
      price_id,
      amount_cents,
      currency,
      livemode,
      status,
      payment_status,
      consumed_at,
      fulfilled_at
    ) VALUES (
      p.id,
      p_stripe_checkout_session_id,
      intent_id,
      nullif(btrim(p_processor_event_id), ''),
      btrim(p_price_id),
      999,
      'usd',
      p_livemode,
      'CONSUMED',
      'paid',
      now(),
      now()
    )
    RETURNING * INTO sess;
  ELSE
    UPDATE public.signup_fee_charges
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
      fulfilled_at = now(),
      needs_refund = false,
      refund_reason = NULL
    WHERE id = sess.id
    RETURNING * INTO sess;
  END IF;

  -- Activation only. Do not touch account_status, contractor approval, or #14 contact.
  UPDATE public.profiles
  SET
    signup_fee_status = 'PAID',
    signup_fee_paid_at = now(),
    signup_fee_charge_id = sess.id
  WHERE id = p.id
  RETURNING * INTO p;

  PERFORM public.write_audit_log(
    p.id,
    'signup_fee.paid',
    'profiles',
    p.id,
    jsonb_build_object(
      'amount_cents', 999,
      'account_status_unchanged', p.account_status,
      'approval_status_unchanged', v_approval,
      'contact_unlocked', false,
      'payments_live', false,
      'charges_live', false
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'already_paid', false,
    'signup_fee_status', 'PAID',
    'account_status', p.account_status,
    'approval_status', v_approval,
    'contact_unlocked', false,
    'paid', true,
    'idempotent', false,
    'duplicate_event', (event_row->>'duplicate')::boolean,
    'payments_live', false,
    'charges_live', false,
    'connect_payouts_enabled', false,
    'job_payments_enabled', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.flag_signup_checkout_needs_refund(
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
  PERFORM public.ppp_set_rpc('flag_signup_checkout_needs_refund');
  UPDATE public.signup_fee_charges
  SET status = 'NEEDS_REFUND', needs_refund = true, refund_reason = p_reason
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
    AND status IS DISTINCT FROM 'CONSUMED'
    AND status IS DISTINCT FROM 'PAID';
  RETURN jsonb_build_object(
    'needs_refund', true,
    'reason', p_reason,
    'contact_unlocked', false,
    'paid', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ppp_set_rpc(p_name text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('ppp.rpc', p_name, true);
  IF public.signup_fee_enabled()
     AND auth.uid() IS NOT NULL
     AND p_name IN (
       'post_project',
       'accept_opportunity',
       'submit_estimate',
       'withdraw_estimate',
       'select_estimate',
       'update_customer_project',
       'mark_booking_awaiting_payment',
       'start_booking',
       'complete_booking',
       'propose_change_order',
       'respond_change_order',
       'submit_booking_review'
     ) THEN
    PERFORM public.assert_signup_fee_paid(auth.uid());
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_projects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_signup_fee_paid(NEW.customer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_require_signup_fee ON public.projects;
CREATE TRIGGER projects_require_signup_fee
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_fee_on_projects();

CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_opportunity_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF NEW.status = 'ACCEPTED' AND OLD.status IS DISTINCT FROM 'ACCEPTED' THEN
    SELECT profile_id INTO v_profile_id
    FROM public.contractor_profiles
    WHERE id = NEW.contractor_profile_id;
    PERFORM public.assert_signup_fee_paid(v_profile_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_require_signup_fee ON public.opportunities;
CREATE TRIGGER opportunities_require_signup_fee
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_fee_on_opportunity_accept();

CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT profile_id INTO v_profile_id
  FROM public.contractor_profiles
  WHERE id = NEW.contractor_profile_id;
  PERFORM public.assert_signup_fee_paid(v_profile_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_require_signup_fee ON public.estimates;
CREATE TRIGGER estimates_require_signup_fee
  BEFORE INSERT OR UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_fee_on_estimates();

CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_project_connections()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT profile_id INTO v_profile_id
  FROM public.contractor_profiles
  WHERE id = NEW.contractor_profile_id;
  PERFORM public.assert_signup_fee_paid(v_profile_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_connections_require_signup_fee ON public.project_connections;
CREATE TRIGGER project_connections_require_signup_fee
  BEFORE INSERT ON public.project_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_fee_on_project_connections();

DROP POLICY IF EXISTS projects_insert_own_draft ON public.projects;
CREATE POLICY projects_insert_own_draft
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND status = 'DRAFT'
    AND public.signup_fee_is_satisfied(auth.uid())
  );

DROP POLICY IF EXISTS estimates_insert_own_draft ON public.estimates;
CREATE POLICY estimates_insert_own_draft
  ON public.estimates FOR INSERT TO authenticated
  WITH CHECK (
    contractor_profile_id = public.current_contractor_profile_id()
    AND status = 'DRAFT'
    AND public.signup_fee_is_satisfied(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_id
        AND o.contractor_profile_id = contractor_profile_id
        AND o.project_id = project_id
        AND o.status = 'ACCEPTED'
    )
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_type public.account_type;
  initial_status public.account_status;
  initial_fee public.signup_fee_status;
  meta jsonb;
BEGIN
  meta := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  safe_type := public.permitted_signup_account_type(meta->>'account_type');

  IF safe_type = 'CUSTOMER' AND NEW.email_confirmed_at IS NOT NULL THEN
    initial_status := 'ACTIVE';
  ELSE
    initial_status := 'PENDING';
  END IF;

  IF safe_type IN ('CUSTOMER', 'CONTRACTOR') THEN
    initial_fee := 'UNPAID';
  ELSE
    initial_fee := 'NOT_REQUIRED';
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    account_type,
    account_status,
    signup_fee_status
  ) VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(meta->>'first_name', ''),
    coalesce(meta->>'last_name', ''),
    nullif(meta->>'phone', ''),
    safe_type,
    initial_status,
    initial_fee
  );

  IF safe_type = 'CONTRACTOR' THEN
    INSERT INTO public.contractor_profiles (
      profile_id,
      business_name,
      primary_trade,
      service_area,
      bio,
      onboarding_status
    ) VALUES (
      NEW.id,
      coalesce(meta->>'business_name', ''),
      nullif(meta->>'primary_trade', ''),
      nullif(meta->>'service_area', ''),
      nullif(meta->>'bio', ''),
      'IN_PROGRESS'
    );
  ELSIF safe_type = 'VERIFIER' THEN
    INSERT INTO public.verifier_profiles (
      profile_id,
      coverage_area,
      bio,
      onboarding_status
    ) VALUES (
      NEW.id,
      coalesce(meta->>'coverage_area', ''),
      nullif(meta->>'bio', ''),
      'IN_PROGRESS'
    );
  END IF;

  IF coalesce(meta->>'accepted_terms', 'false') IN ('true', '1', 'yes') THEN
    INSERT INTO public.agreement_acceptances (agreement_id, profile_id, user_agent)
    SELECT a.id, NEW.id, nullif(meta->>'user_agent', '')
    FROM public.agreements a
    WHERE a.is_current
      AND a.slug IN ('terms-of-use', 'privacy-policy')
    ON CONFLICT (agreement_id, profile_id) DO NOTHING;
  END IF;

  PERFORM public.write_audit_log(
    NEW.id,
    'profile.created',
    'profiles',
    NEW.id,
    jsonb_build_object(
      'account_type', safe_type,
      'requested_account_type', meta->>'account_type',
      'signup_fee_status', initial_fee
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.signup_fee_enabled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_fee_cents() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signup_fee_checkout_flags() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_fee_is_satisfied(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_signup_fee_paid(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.signup_fee_profile_snapshot(public.profiles) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signup_fee_state_for_me() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.signup_fee_profile_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_signup_fee_event(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_signup_fee_checkout(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signup_fee_checkout_context(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fulfill_signup_fee_checkout(text, text, integer, text, text, text, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flag_signup_checkout_needs_refund(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_signup_fee_charge_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_signup_fee_event_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.signup_fee_enabled() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_fee_checkout_flags() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_fee_is_satisfied(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_signup_fee_paid(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_fee_state_for_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.signup_fee_profile_context(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.signup_fee_cents() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_signup_fee_event(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_signup_fee_checkout(uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.signup_fee_checkout_context(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_signup_fee_checkout(text, text, integer, text, text, text, boolean, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.flag_signup_checkout_needs_refund(text, text) TO service_role;

COMMENT ON FUNCTION public.signup_fee_checkout_flags() IS
  'Kill switch snapshot. enabled follows platform_settings.signup_fee_enabled (default off). Never reports payments_live or charges_live as true. Does not grant #14.';

COMMENT ON FUNCTION public.fulfill_signup_fee_checkout(text, text, integer, text, text, text, boolean, uuid, text) IS
  'Service-role only. Marks signup_fee_status PAID after Stripe verification of Price ID + 999 USD whose livemode matches stripe_test_mode. Never grants #14 contact. Never changes account_status or contractor approval. TEST events cannot fulfill LIVE transactions and vice versa.';

COMMENT ON FUNCTION public.stripe_activation_price_id() IS
  'Known Stripe TEST catalog $9.99 activation Price ID. Not a LIVE fallback. Edge Functions require STRIPE_ACTIVATION_PRICE_ID and retrieve the Price from Stripe.';
