const PLACEHOLDER_PK = "pk_test_your_publishable_key";

export function getStripePublishableKey(): string {
  return (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim();
}

/** Publishable keys are public. Live keys are rejected so the Vite client cannot enable live mode. */
export function isStripeTestPublishableKey(key: string): boolean {
  const value = key.trim();
  if (!value || value.includes(PLACEHOLDER_PK)) return false;
  if (value.startsWith("pk_live_")) return false;
  if (value.startsWith("sk_")) return false;
  if (value.startsWith("whsec_")) return false;
  return value.startsWith("pk_test_") && value.length > 16;
}

export function isStripeClientConfigured(): boolean {
  return isStripeTestPublishableKey(getStripePublishableKey());
}

export function assertStripeSecretIsTestMode(secretKey: string): void {
  const value = secretKey.trim();
  if (!value.startsWith("sk_test_")) {
    throw new Error("Stripe live keys are forbidden. Phase 4B accepts only sk_test_ secrets.");
  }
}

export function assertStripeWebhookSecretName(name: string): void {
  if (name !== "STRIPE_WEBHOOK_SECRET") {
    throw new Error("Webhook signing secret must be the Edge Function secret STRIPE_WEBHOOK_SECRET.");
  }
}

export const STRIPE_SERVER_SECRET_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

export const STRIPE_PUBLIC_ENV_NAMES = ["VITE_STRIPE_PUBLISHABLE_KEY"] as const;
