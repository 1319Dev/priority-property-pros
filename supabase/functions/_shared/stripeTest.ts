const CONNECTION_FEE_CENTS = 499;
const CONNECTION_PRICE_ID = "price_1UH1RsPYJQAIQDv721IhjKS0";

export function connectionFeeCents(): number {
  return CONNECTION_FEE_CENTS;
}

export function connectionPriceId(): string {
  return CONNECTION_PRICE_ID;
}

export function requireTestSecret(secret: string): string {
  const value = secret.trim();
  if (!value.startsWith("sk_test_") || value.length < 16) {
    throw new Error("Connection Fee checkout accepts only Stripe TEST secrets (sk_test_). Live keys are forbidden.");
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

export async function stripeForm(secret: string, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const key = requireTestSecret(secret);
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
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
  const key = requireTestSecret(secret);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error("Stripe request failed");
  return data;
}

export function sessionLinePriceId(session: Record<string, unknown>): string | null {
  const lineItems = session.line_items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  return lineItems?.data?.[0]?.price?.id ?? null;
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
