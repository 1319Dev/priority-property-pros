/** Stripe webhook signature helpers. No secrets in this module. */

export {
  computeStripeSignatureHex,
  parseStripeSignatureHeader,
  stripeSignatureAgeOk,
  timingSafeEqual,
  verifyStripeSignature,
} from "../../../supabase/functions/_shared/webhook.ts";
