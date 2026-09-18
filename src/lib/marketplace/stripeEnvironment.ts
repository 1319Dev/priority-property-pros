/**
 * Explicit Stripe TEST/LIVE environment control for Connection Fee checkout.
 * Safety is NOT inferred from whichever key happens to be installed.
 * `platform_settings.stripe_test_mode`: 1 = TEST, 0 = LIVE.
 * `connection_fee_checkout_enabled` remains the customer-facing kill switch.
 */

export const CONNECTION_FEE_AMOUNT_CENTS = 499;
export const CONNECTION_FEE_CURRENCY = "usd";
export const CONNECTION_PRICE_TYPE = "one_time";

/** Known Stripe TEST catalog Price ID. Never a LIVE fallback. Never sent by the client. */
export const STRIPE_TEST_CONNECTION_PRICE_ID = "price_1UH1RsPYJQAIQDv721IhjKS0";

/** Config-only $9.99 activation Price ID. Must not be used for Connection Fee. */
export const STRIPE_ACTIVATION_PRICE_ID = "price_1UH1SePYJQAIQDv7nrMo32Xp";

export type StripeEnvironmentMode = "test" | "live";

export type StripePriceLike = {
  id?: string | null;
  object?: string | null;
  livemode?: boolean | null;
  currency?: string | null;
  unit_amount?: number | null;
  type?: string | null;
  active?: boolean | null;
};

export function stripeTestModeFromSetting(value: unknown): boolean {
  if (value === false || value === 0 || value === "0") return false;
  return true;
}

export function stripeModeFromTestFlag(testMode: boolean): StripeEnvironmentMode {
  return testMode ? "test" : "live";
}

export function requireStripeSecretForMode(secret: string, testMode: boolean): string {
  const value = secret.trim();
  if (testMode) {
    if (!value.startsWith("sk_test_") || value.length < 16) {
      throw new Error("stripe_test_mode=1 requires a Stripe TEST secret (sk_test_). Live keys are forbidden.");
    }
  } else if (!value.startsWith("sk_live_") || value.length < 16) {
    throw new Error("stripe_test_mode=0 requires a Stripe LIVE secret (sk_live_). Test keys are forbidden.");
  }
  return value;
}

/** TEST-only wrapper. Prefer requireStripeSecretForMode with the DB flag. */
export function requireTestStripeSecret(secret: string): string {
  return requireStripeSecretForMode(secret, true);
}

export function requireWebhookSecret(secret: string): string {
  const value = secret.trim();
  if (!value.startsWith("whsec_") || value.length < 16) {
    throw new Error("STRIPE_WEBHOOK_SECRET is missing or not a webhook secret");
  }
  return value;
}

export function requireConnectionPriceId(envPriceId: string | null | undefined): string {
  const value = (envPriceId ?? "").trim();
  if (!value.startsWith("price_") || value.length < 8) {
    throw new Error("STRIPE_CONNECTION_PRICE_ID is required");
  }
  if (value === STRIPE_ACTIVATION_PRICE_ID) {
    throw new Error("activation Price ID must not be used for Connection Fee");
  }
  return value;
}

/** Client-supplied Price IDs are ignored. Env is required; no hardcoded TEST fallback. */
export function serverConnectionPriceId(clientPriceId?: string | null, envPriceId?: string | null): string {
  void clientPriceId;
  return requireConnectionPriceId(envPriceId);
}

export function checkoutSessionPrefix(testMode: boolean): "cs_test_" | "cs_live_" {
  return testMode ? "cs_test_" : "cs_live_";
}

export function checkoutSessionIdMatchesMode(sessionId: string, testMode: boolean): boolean {
  const id = sessionId.trim();
  return id.startsWith(checkoutSessionPrefix(testMode)) && id.length > 8;
}

export function livemodeMatchesStripeTestMode(livemode: boolean | null | undefined, testMode: boolean): boolean {
  if (testMode) return livemode !== true;
  return livemode === true;
}

export function livemodeMismatchReason(livemode: boolean | null | undefined, testMode: boolean): string | null {
  if (livemodeMatchesStripeTestMode(livemode, testMode)) return null;
  return testMode ? "live_mode_forbidden" : "test_mode_forbidden";
}

export function assertConnectionPriceMatchesMode(
  price: StripePriceLike | null | undefined,
  input: { expectedPriceId: string; testMode: boolean },
): { ok: true } | { ok: false; reason: string } {
  const expected = (input.expectedPriceId ?? "").trim();
  if (!expected.startsWith("price_")) return { ok: false, reason: "missing_price_id" };
  if (!price || !price.id) return { ok: false, reason: "missing_price_id" };
  if (price.id !== expected) return { ok: false, reason: "wrong_price_id" };
  if (price.id === STRIPE_ACTIVATION_PRICE_ID) return { ok: false, reason: "wrong_price_id" };
  if (!livemodeMatchesStripeTestMode(Boolean(price.livemode), input.testMode)) {
    return { ok: false, reason: "price_livemode_mismatch" };
  }
  if ((price.currency ?? "").toLowerCase() !== CONNECTION_FEE_CURRENCY) {
    return { ok: false, reason: "wrong_currency" };
  }
  if (price.unit_amount !== CONNECTION_FEE_AMOUNT_CENTS) {
    return { ok: false, reason: "wrong_amount" };
  }
  if (price.type && price.type !== CONNECTION_PRICE_TYPE) {
    return { ok: false, reason: "wrong_price_type" };
  }
  return { ok: true };
}

export function assertConnectionPriceOrThrow(
  price: StripePriceLike | null | undefined,
  input: { expectedPriceId: string; testMode: boolean },
): void {
  const result = assertConnectionPriceMatchesMode(price, input);
  if (result.ok) return;
  if (result.reason === "missing_price_id") throw new Error("STRIPE_CONNECTION_PRICE_ID is required");
  if (result.reason === "wrong_price_id") throw new Error("wrong connection Price ID");
  if (result.reason === "wrong_currency") throw new Error("connection fee currency must be usd");
  if (result.reason === "wrong_amount") throw new Error("connection fee is server-authoritative and must be 499 cents");
  if (result.reason === "wrong_price_type") throw new Error("connection Price must be a one_time Price");
  throw new Error("Stripe Price livemode does not match stripe_test_mode");
}
