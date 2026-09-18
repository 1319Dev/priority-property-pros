/**
 * Compatibility re-exports. Production-capable Connection Fee paths use stripeEnv.ts
 * with explicit stripe_test_mode control. This module must not be a TEST-only fallback.
 */
export {
  assertConnectionPriceOrThrow,
  checkoutSessionIdMatchesMode,
  connectionFeeCents,
  livemodeMatchesStripeTestMode,
  requireConnectionPriceId,
  requireSecretForMode,
  requireWebhookSecret,
  sessionLinePriceId,
  stripeForm,
  stripeGet,
  stripePaymentIntentId,
  stripeTestModeFromFlags,
} from "./stripeEnv.ts";
