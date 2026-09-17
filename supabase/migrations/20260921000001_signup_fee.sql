-- Isolated $9.99 account signup/activation fee.
-- Does NOT enable job payments, Stripe Connect, or contractor auto-approval.
-- payments_live and charges_live stay 0. stripe_test_mode is 1.

CREATE TYPE public.signup_fee_status AS ENUM ('UNPAID', 'PAID', 'NOT_REQUIRED');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_fee_status public.signup_fee_status NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS signup_fee_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS signup_fee_charge_id uuid;

UPDATE public.profiles
SET signup_fee_status = 'NOT_REQUIRED'
WHERE account_type IN ('VERIFIER', 'ADMIN')
  AND signup_fee_status = 'UNPAID';

COMMENT ON COLUMN public.profiles.signup_fee_status IS
  'Independent of email verification, account_status, contractor approval, membership, and job payments.';

INSERT INTO public.platform_settings (key, value_int, description)
VALUES
  (
    'signup_fee_cents',
    999,
    'One-time account signup/activation fee in cents. Must remain 999 ($9.99). Isolated from job payments.'
  ),
  (
    'signup_fee_enabled',
    1,
    'Collect the isolated signup fee. Does not enable payments_live or charges_live.'
  ),
  (
    'stripe_test_mode',
    1,
    'HARD STOP: signup-fee Stripe must stay TEST mode (1). Live job charges stay off.'
  )
ON CONFLICT (key) DO NOTHING;

-- Isolation: never flip job-payment gates from this migration.
UPDATE public.platform_settings
SET value_int = 0
WHERE key IN ('payments_live', 'charges_live')
  AND coalesce(value_int, 0) <> 0;

UPDATE public.platform_settings
SET value_int = 1
WHERE key = 'stripe_test_mode'
  AND coalesce(value_int, 1) <> 1;

UPDATE public.platform_settings
SET value_int = 999
WHERE key = 'signup_fee_cents'
  AND coalesce(value_int, 999) <> 999;

CREATE TABLE IF NOT EXISTS public.signup_fee_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents = 999),
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAID', 'CANCELED', 'FAILED')),
  processor_checkout_id text UNIQUE,
  processor_charge_id text UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS signup_fee_charges_one_paid
  ON public.signup_fee_charges (profile_id)
  WHERE status = 'PAID';

CREATE INDEX IF NOT EXISTS signup_fee_charges_profile_idx
  ON public.signup_fee_charges (profile_id);

COMMENT ON TABLE public.signup_fee_charges IS
  'Isolated signup-fee ledger. Not a job payment table. No Connect transfers.';

CREATE TABLE IF NOT EXISTS public.signup_fee_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_event_id text NOT NULL UNIQUE,
  profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'signup_fee',
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.signup_fee_events IS
  'Idempotency log for signup-fee processor events only.';

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

-- No client INSERT/UPDATE/DELETE policies. Service role bypasses RLS.

REVOKE ALL ON TABLE public.signup_fee_charges FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.signup_fee_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.signup_fee_charges TO authenticated;

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

CREATE OR REPLACE FUNCTION public.signup_fee_isolation_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'signup_fee_cents', coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'signup_fee_cents'), 999),
    'signup_fee_enabled', coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'signup_fee_enabled'), 0),
    'stripe_test_mode', coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'stripe_test_mode'), 0),
    'payments_live', coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'payments_live'), 0),
    'charges_live', coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'charges_live'), 0),
    'job_payments_enabled', false,
    'connect_payouts_enabled', false
  );
$$;

REVOKE ALL ON FUNCTION public.signup_fee_isolation_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signup_fee_isolation_flags() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.signup_fee_state_for_me()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
  flags jsonb;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  flags := public.signup_fee_isolation_flags();
  RETURN jsonb_build_object(
    'amount_cents', 999,
    'required', p.account_type IN ('CUSTOMER', 'CONTRACTOR')
      AND p.signup_fee_status IS DISTINCT FROM 'PAID'
      AND p.signup_fee_status IS DISTINCT FROM 'NOT_REQUIRED',
    'status', p.signup_fee_status,
    'paid_at', p.signup_fee_paid_at,
    'account_status', p.account_status,
    'account_type', p.account_type,
    'payments_live', coalesce((flags->>'payments_live')::int, 0) <> 0,
    'charges_live', coalesce((flags->>'charges_live')::int, 0) <> 0,
    'stripe_test_mode', coalesce((flags->>'stripe_test_mode')::int, 0) = 1,
    'job_payments_enabled', false,
    'connect_payouts_enabled', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_fee_state_for_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signup_fee_state_for_me() TO authenticated;

CREATE OR REPLACE FUNCTION public.register_signup_fee_checkout(
  p_profile_id uuid,
  p_amount_cents integer,
  p_checkout_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
  charge_id uuid;
  flags jsonb;
BEGIN
  IF p_amount_cents IS DISTINCT FROM 999 THEN
    RAISE EXCEPTION 'signup fee amount must be 999 cents';
  END IF;
  flags := public.signup_fee_isolation_flags();
  IF coalesce((flags->>'stripe_test_mode')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'signup fee collection requires stripe_test_mode = 1';
  END IF;
  IF coalesce((flags->>'signup_fee_cents')::int, 0) <> 999 THEN
    RAISE EXCEPTION 'signup_fee_cents must remain 999';
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  IF p.signup_fee_status = 'PAID' OR p.signup_fee_status = 'NOT_REQUIRED' THEN
    RETURN jsonb_build_object('already_paid', true, 'charge_id', p.signup_fee_charge_id, 'payments_live', false, 'charges_live', false);
  END IF;
  IF p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR') THEN
    RAISE EXCEPTION 'signup fee is only for CUSTOMER and CONTRACTOR';
  END IF;

  INSERT INTO public.signup_fee_charges (profile_id, amount_cents, status, processor_checkout_id)
  VALUES (p_profile_id, 999, 'OPEN', p_checkout_id)
  ON CONFLICT (processor_checkout_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO charge_id;

  RETURN jsonb_build_object(
    'charge_id', charge_id,
    'already_paid', false,
    'payments_live', false,
    'charges_live', false,
    'connect_payouts_enabled', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_signup_fee_checkout(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_signup_fee_checkout(uuid, integer, text) TO service_role;

-- Marks signup fee paid. Does not change account_status, contractor approval,
-- payments_live, charges_live, bookings, or Connect payout fields.
CREATE OR REPLACE FUNCTION public.apply_signup_fee_paid(
  p_profile_id uuid,
  p_checkout_id text,
  p_processor_charge_id text,
  p_processor_event_id text,
  p_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
  v_approval public.approval_status;
  charge_id uuid;
  flags jsonb;
BEGIN
  IF p_amount_cents IS DISTINCT FROM 999 THEN
    RAISE EXCEPTION 'signup fee amount must be 999 cents';
  END IF;
  flags := public.signup_fee_isolation_flags();
  IF coalesce((flags->>'stripe_test_mode')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'signup fee collection requires stripe_test_mode = 1';
  END IF;

  IF p_processor_event_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.signup_fee_events WHERE processor_event_id = p_processor_event_id
  ) THEN
    SELECT * INTO p FROM public.profiles WHERE id = p_profile_id;
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'signup_fee_status', p.signup_fee_status,
      'account_status', p.account_status,
      'payments_live', false,
      'charges_live', false,
      'connect_payouts_enabled', false
    );
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  SELECT cp.approval_status INTO v_approval
  FROM public.contractor_profiles cp
  WHERE cp.profile_id = p.id;

  IF p.signup_fee_status = 'PAID' THEN
    INSERT INTO public.signup_fee_events (processor_event_id, profile_id, payload_summary)
    VALUES (
      coalesce(p_processor_event_id, 'dup-' || gen_random_uuid()::text),
      p.id,
      jsonb_build_object('already_paid', true)
    )
    ON CONFLICT (processor_event_id) DO NOTHING;
    RETURN jsonb_build_object(
      'ok', true,
      'already_paid', true,
      'signup_fee_status', 'PAID',
      'account_status', p.account_status,
      'approval_status', v_approval,
      'payments_live', false,
      'charges_live', false,
      'connect_payouts_enabled', false
    );
  END IF;

  INSERT INTO public.signup_fee_charges (
    profile_id, amount_cents, status, processor_checkout_id, processor_charge_id, paid_at
  )
  VALUES (p.id, 999, 'PAID', p_checkout_id, p_processor_charge_id, now())
  ON CONFLICT (processor_checkout_id) DO UPDATE
    SET status = 'PAID',
        processor_charge_id = coalesce(EXCLUDED.processor_charge_id, public.signup_fee_charges.processor_charge_id),
        paid_at = coalesce(public.signup_fee_charges.paid_at, now())
  RETURNING id INTO charge_id;

  -- Signup fee only. Do not touch account_status or contractor approval.
  UPDATE public.profiles
  SET
    signup_fee_status = 'PAID',
    signup_fee_paid_at = now(),
    signup_fee_charge_id = charge_id
  WHERE id = p.id;

  IF p_processor_event_id IS NOT NULL THEN
    INSERT INTO public.signup_fee_events (processor_event_id, profile_id, payload_summary)
    VALUES (
      p_processor_event_id,
      p.id,
      jsonb_build_object('charge_id', charge_id, 'amount_cents', 999)
    )
    ON CONFLICT (processor_event_id) DO NOTHING;
  END IF;

  PERFORM public.write_audit_log(
    p.id,
    'signup_fee.paid',
    'profiles',
    p.id,
    jsonb_build_object(
      'amount_cents', 999,
      'account_status_unchanged', p.account_status,
      'approval_status_unchanged', v_approval,
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
    'payments_live', false,
    'charges_live', false,
    'connect_payouts_enabled', false,
    'job_payments_enabled', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_signup_fee_paid(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_signup_fee_paid(uuid, text, text, text, integer) TO service_role;
