/**
 * Compatibility re-exports. Production-capable Connection Fee paths use stripeEnv.ts
 * with explicit stripe_test_mode control. This module must not be a TEST-only fallback.
 */
export {
  activationFeeCents,
  assertActivationPriceOrThrow,
  assertConnectionPriceOrThrow,
  assertPaidActivationSession,
  checkoutSessionIdMatchesMode,
  connectionFeeCents,
  livemodeMatchesStripeTestMode,
  requireActivationPriceId,
  requireConnectionPriceId,
  requireSecretForMode,
  requireWebhookSecret,
  sessionLinePriceId,
  stripeForm,
  stripeGet,
  stripePaymentIntentId,
  stripeTestModeFromFlags,
} from "./stripeEnv.ts";
