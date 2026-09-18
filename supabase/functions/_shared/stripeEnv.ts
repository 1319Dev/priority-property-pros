const CONNECTION_FEE_CENTS = 499;
const CONNECTION_FEE_CURRENCY = "usd";
const CONNECTION_PRICE_TYPE = "one_time";
const ACTIVATION_PRICE_ID = "price_1UH1SePYJQAIQDv7nrMo32Xp";

export type StripePriceLike = {
  id?: string | null;
  object?: string | null;
  livemode?: boolean | null;
  currency?: string | null;
  unit_amount?: number | null;
  type?: string | null;
};

export function connectionFeeCents(): number {
  return CONNECTION_FEE_CENTS;
}

export function stripeTestModeFromFlags(snapshot: { stripe_test_mode?: boolean } | null | undefined): boolean {
  return snapshot?.stripe_test_mode !== false;
}

export function requireSecretForMode(secret: string, testMode: boolean): string {
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
  if (value === ACTIVATION_PRICE_ID) {
    throw new Error("activation Price ID must not be used for Connection Fee");
  }
  return value;
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

export function livemodeMismatchMessage(testMode: boolean): string {
  return testMode
    ? "live Stripe events are forbidden while stripe_test_mode=1"
    : "test Stripe events are forbidden while stripe_test_mode=0";
}

export function assertConnectionPriceOrThrow(
  price: StripePriceLike | null | undefined,
  input: { expectedPriceId: string; testMode: boolean },
): void {
  const expected = (input.expectedPriceId ?? "").trim();
  if (!expected.startsWith("price_")) {
    throw new Error("STRIPE_CONNECTION_PRICE_ID is required");
  }
  if (!price || !price.id) {
    throw new Error("STRIPE_CONNECTION_PRICE_ID is required");
  }
  if (price.id !== expected || price.id === ACTIVATION_PRICE_ID) {
    throw new Error("wrong connection Price ID");
  }
  if (!livemodeMatchesStripeTestMode(Boolean(price.livemode), input.testMode)) {
    throw new Error("Stripe Price livemode does not match stripe_test_mode");
  }
  if ((price.currency ?? "").toLowerCase() !== CONNECTION_FEE_CURRENCY) {
    throw new Error("connection fee currency must be usd");
  }
  if (price.unit_amount !== CONNECTION_FEE_CENTS) {
    throw new Error("connection fee is server-authoritative and must be 499 cents");
  }
  if (price.type && price.type !== CONNECTION_PRICE_TYPE) {
    throw new Error("connection Price must be a one_time Price");
  }
}

export async function stripeForm(secret: string, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof data.error === "object" && data.error && "message" in (data.error as object)
        ? String((data.error as { message?: string }).message)
        : "Stripe request failed",
    );
  }
  return data;
}

export async function stripeGet(secret: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error("Stripe request failed");
  return data;
}

export function sessionLinePriceId(session: Record<string, unknown>): string | null {
  const lineItems = session.line_items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  return lineItems?.data?.[0]?.price?.id ?? null;
}

export function sessionAmountCents(session: Record<string, unknown>): number {
  return Number(session.amount_total ?? 0);
}

export function sessionCurrency(session: Record<string, unknown>): string {
  return String(session.currency ?? "").toLowerCase();
}

export function assertPaidConnectionSession(
  session: Record<string, unknown>,
  input: { expectedPriceId: string; testMode: boolean },
): { priceId: string; amountCents: number; currency: string } {
  if (!livemodeMatchesStripeTestMode(Boolean(session.livemode), input.testMode)) {
    throw new Error(livemodeMismatchMessage(input.testMode));
  }
  const sessionId = String(session.id ?? "");
  if (!checkoutSessionIdMatchesMode(sessionId, input.testMode)) {
    throw new Error(input.testMode
      ? "stripe_test_mode=1 requires a Stripe TEST checkout session (cs_test_)"
      : "stripe_test_mode=0 requires a Stripe LIVE checkout session (cs_live_)");
  }
  const priceId = sessionLinePriceId(session);
  if (!priceId) throw new Error("STRIPE_CONNECTION_PRICE_ID is required");
  if (priceId !== input.expectedPriceId) throw new Error("wrong connection Price ID");
  const amountCents = sessionAmountCents(session);
  if (amountCents !== CONNECTION_FEE_CENTS) {
    throw new Error("connection fee is server-authoritative and must be 499 cents");
  }
  const currency = sessionCurrency(session);
  if (currency !== CONNECTION_FEE_CURRENCY) {
    throw new Error("connection fee currency must be usd");
  }
  return { priceId, amountCents, currency };
}

/** Store only real Stripe PaymentIntent ids. Never `reconcile:cs_test_...` or other fulfillment markers. */
export function stripePaymentIntentId(value: unknown): string | null {
  if (typeof value === "string") {
    const id = value.trim();
    if (id.startsWith("pi_") && id.length > 5 && !id.includes(":")) return id;
    return null;
  }
  if (value && typeof value === "object" && "id" in value) {
    return stripePaymentIntentId((value as { id?: unknown }).id);
  }
  return null;
}
