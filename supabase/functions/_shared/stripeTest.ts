const SIGNUP_FEE_CENTS = 999;

export function requireTestSecret(secret: string): string {
  const value = secret.trim();
  if (!value.startsWith("sk_test_") || value.length < 16) {
    throw new Error("Signup fee accepts only Stripe TEST secrets (sk_test_). Live keys are forbidden.");
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
    throw new Error(typeof data.error === "object" && data.error && "message" in (data.error as object)
      ? String((data.error as { message?: string }).message)
      : "Stripe request failed");
  }
  return data;
}

export async function stripeGet(secret: string, path: string): Promise<Record<string, unknown>> {
  const key = requireTestSecret(secret);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error("Stripe request failed");
  }
  return data;
}

export function signupFeeAmount(): number {
  return SIGNUP_FEE_CENTS;
}
