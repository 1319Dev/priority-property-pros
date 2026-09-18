-- Add CONNECTION_FEE_PAYMENT to the #14 grant-source enum.
-- Separate from the unify migration: PostgreSQL cannot use a newly added enum
-- value in the same transaction on some versions. This value is the only
-- payment-originated grant source for $4.99 Connection Fee unlocks.
-- Does not enable Stripe. Does not change payments_live / charges_live /
-- signup_fee_enabled. Does not apply itself to production.

ALTER TYPE public.contact_grant_source ADD VALUE IF NOT EXISTS 'CONNECTION_FEE_PAYMENT';

COMMENT ON TYPE public.contact_grant_source IS
  'Who granted booking_contact_access. CONNECTION_FEE_PAYMENT is written only by the trusted Connection Fee fulfill path after Stripe TEST verification. JOB_FEE_PAYMENT remains a stub while payments_live/charges_live are off.';
