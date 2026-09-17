import Stripe from "https://esm.sh/stripe@17.4.0?target=denonext";

export function requireTestSecret(): string {
  const key = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
  if (!key.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a test-mode sk_test_ secret. Live keys are forbidden.");
  }
  return key;
}

export function stripeClient(): Stripe {
  return new Stripe(requireTestSecret(), {
    apiVersion: "2024-11-20.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function webhookSecret(): string {
  const secret = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").trim();
  if (!secret.startsWith("whsec_")) {
    throw new Error("STRIPE_WEBHOOK_SECRET is missing or not a webhook signing secret.");
  }
  return secret;
}

export function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const blocked = new Set(["number", "cvc", "ssn", "id_number", "account_number", "routing_number", "iban"]);
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = blocked.has(k.toLowerCase()) ? "[redacted]" : redact(v);
  }
  return out;
}
