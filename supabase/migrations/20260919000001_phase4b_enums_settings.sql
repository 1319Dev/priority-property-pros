-- Phase 4B: enums and configurable deposit/milestone guidance.
-- Additive. Does NOT change Phase 4A fee_schedules / brackets / mins / maxes.
-- payments_live and charges_live stay 0.

CREATE TYPE public.connect_account_status AS ENUM (
  'NOT_STARTED',
  'ONBOARDING',
  'RESTRICTED',
  'READY',
  'DISABLED'
);

CREATE TYPE public.payment_schedule_item_kind AS ENUM (
  'BOOKING_DEPOSIT',
  'MILESTONE',
  'FINAL_PAYMENT',
  'APPROVED_CHANGE_ORDER'
);

CREATE TYPE public.payment_schedule_item_status AS ENUM (
  'SCHEDULED',
  'DUE',
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED'
);

CREATE TYPE public.payment_method_kind AS ENUM ('CARD', 'US_BANK_ACCOUNT');

CREATE TYPE public.payment_guidance_band AS ENUM (
  'FULL_PAY_ALLOWED',
  'DEPOSIT_PLUS_REMAINING',
  'MILESTONES_PREFERRED'
);

CREATE TYPE public.ledger_entry_type AS ENUM (
  'CUSTOMER_PAYMENT_GROSS',
  'PROCESSING_COST',
  'MARKETPLACE_FEE',
  'CONTRACTOR_GROSS',
  'REFUND',
  'DISPUTE_HOLD',
  'DISPUTE_RELEASE',
  'DISPUTE_LOSS',
  'TRANSFER',
  'TRANSFER_REVERSAL',
  'PAYOUT',
  'ADJUSTMENT'
);

CREATE TYPE public.contractor_transfer_status AS ENUM (
  'PENDING',
  'ELIGIBLE',
  'TRANSFER_PENDING',
  'TRANSFERRED',
  'HELD',
  'REVERSED',
  'FAILED'
);

CREATE TYPE public.cancellation_category AS ENUM (
  'BEFORE_PAYMENT',
  'AFTER_DEPOSIT_BEFORE_WORK',
  'AFTER_WORK_STARTED',
  'AFTER_MILESTONE_PAYMENT',
  'CONTRACTOR_CANCELLED',
  'CUSTOMER_CANCELLED',
  'MUTUAL'
);

CREATE TYPE public.refund_decision AS ENUM (
  'PENDING_REVIEW',
  'NONE',
  'FULL',
  'PARTIAL',
  'DENIED'
);

CREATE TYPE public.dispute_kind AS ENUM ('STRIPE_CHARGEBACK', 'PPP_PROJECT');

CREATE TYPE public.stripe_dispute_status AS ENUM (
  'NEEDS_RESPONSE',
  'UNDER_REVIEW',
  'WON',
  'LOST',
  'CLOSED',
  'HELD'
);

INSERT INTO public.platform_settings (key, value_int, description)
VALUES
  (
    'deposit_full_pay_max_cents',
    100000,
    'Jobs strictly under this amount may confirm with full payment. Server-configurable.'
  ),
  (
    'structured_milestones_min_cents',
    500000,
    'Jobs at or above this amount prefer a deposit + milestone + final schedule. Server-configurable.'
  ),
  (
    'default_deposit_bps',
    2500,
    'Default deposit guidance in basis points (2500 = 25%). Not hard-law.'
  ),
  (
    'max_deposit_bps',
    2500,
    'Maximum deposit guidance in basis points. Server-configurable for future jurisdiction/category variance.'
  ),
  (
    'stripe_test_mode',
    1,
    '1 = Stripe TEST MODE only. Live mode keys are rejected by Edge Functions.'
  )
ON CONFLICT (key) DO NOTHING;

-- Do not flip Phase 4A flags. Re-assert 0 in case a row exists.
UPDATE public.platform_settings
SET value_int = 0
WHERE key IN ('payments_live', 'charges_live')
  AND value_int IS DISTINCT FROM 0;

CREATE OR REPLACE FUNCTION public.protect_live_payment_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.key IN ('payments_live', 'charges_live') THEN
      RAISE EXCEPTION 'payments_live and charges_live cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.key IN ('payments_live', 'charges_live')
     AND coalesce(NEW.value_int, 0) <> 0
     AND coalesce(current_setting('ppp.allow_live_payments', true), '') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'payments_live and charges_live must stay 0 until a live-mode launch migration';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_settings_protect_live_flags ON public.platform_settings;
CREATE TRIGGER platform_settings_protect_live_flags
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_live_payment_flags();

CREATE OR REPLACE FUNCTION public.stripe_test_mode()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'stripe_test_mode'), 1) <> 0;
$$;

COMMENT ON FUNCTION public.protect_live_payment_flags() IS
  'Phase 4B hard flag: payments_live=0 and charges_live=0. Live Stripe is not enabled.';
