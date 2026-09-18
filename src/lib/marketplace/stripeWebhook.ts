/** Stripe webhook signature helpers. No secrets in this module. */

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseStripeSignatureHeader(header: string): { timestamp: string; signature: string } | null {
  const parts = Object.fromEntries(
    header.split(",").map((item) => {
      const [k, v] = item.split("=");
      return [k.trim(), v];
    }),
  );
  if (!parts.t || !parts.v1) return null;
  return { timestamp: parts.t, signature: parts.v1 };
}

export function stripeSignatureAgeOk(timestamp: string, nowMs = Date.now(), maxAgeSec = 300): boolean {
  const age = Math.abs(nowMs / 1000 - Number(timestamp));
  return Number.isFinite(age) && age <= maxAgeSec;
}

export async function computeStripeSignatureHex(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  return [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyStripeSignature(rawBody: string, header: string, secret: string, nowMs = Date.now()): Promise<boolean> {
  if (!secret.startsWith("whsec_")) return false;
  const parsed = parseStripeSignatureHeader(header);
  if (!parsed) return false;
  if (!stripeSignatureAgeOk(parsed.timestamp, nowMs)) return false;
  const hex = await computeStripeSignatureHex(secret, parsed.timestamp, rawBody);
  return timingSafeEqual(hex, parsed.signature);
}
