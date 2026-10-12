-- Make the database price-id helpers match the Stripe mode in platform_settings.
-- Before: both helpers always returned the Stripe TEST catalog IDs, even with
-- stripe_test_mode = 0. Every live checkout row uses different (LIVE) IDs, so the
-- database cross-checks ("do not use the activation price for the Connection Fee"
-- and the reverse) compared against the wrong IDs and never fired in live mode.
--
-- After: stripe_test_mode = 1 returns the same TEST IDs as before. stripe_test_mode = 0
-- returns the LIVE IDs that production checkouts already use.
-- Garrett must confirm both LIVE IDs in the Stripe Dashboard (Product catalog) before this
-- is applied: activation $9.99 one-time ends in IOaCKU, Connection Fee $4.99 one-time ends in p5oGc3.
--
-- Does not change fees (999 / 499 cents), currency, Stripe secrets, Edge Functions,
-- existing checkout rows, refunds, or payments_live / charges_live.
-- Callers: register_signup_fee_checkout, attach_connection_checkout_session,
-- fulfill_signup_fee_checkout, fulfill_connection_fee_checkout (all plpgsql, unchanged).
-- Volatility changes from IMMUTABLE to STABLE because the result now reads platform_settings.

CREATE OR REPLACE FUNCTION public.stripe_activation_price_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.stripe_test_mode_enabled() THEN 'price_1UH1SePYJQAIQDv7nrMo32Xp'
    ELSE 'price_1UKMzVRxtqly5rEZpQIOaCKU'
  END;
$$;

CREATE OR REPLACE FUNCTION public.stripe_connection_price_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.stripe_test_mode_enabled() THEN 'price_1UH1RsPYJQAIQDv721IhjKS0'
    ELSE 'price_1UKN0FRxtqly5rEZwvp5oGc3'
  END;
$$;

COMMENT ON FUNCTION public.stripe_activation_price_id() IS
  'Stripe Price ID for the $9.99 account activation fee. TEST catalog ID when stripe_test_mode = 1, LIVE ID when 0. Edge Functions still validate against STRIPE_ACTIVATION_PRICE_ID and Stripe.';
COMMENT ON FUNCTION public.stripe_connection_price_id() IS
  'Stripe Price ID for the $4.99 Connection Fee. TEST catalog ID when stripe_test_mode = 1, LIVE ID when 0. Edge Functions still validate against STRIPE_CONNECTION_PRICE_ID and Stripe.';
