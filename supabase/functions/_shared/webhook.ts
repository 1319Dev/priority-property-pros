export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length, 1);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** Every `v1` value. Stripe sends more than one while a webhook secret is rotating. */
export function parseStripeSignatureHeader(header: string): { timestamp: string; signatures: string[] } | null {
  let timestamp = "";
  const signatures: string[] = [];
  for (const item of header.split(",")) {
    const eq = item.indexOf("=");
    if (eq <= 0) continue;
    const key = item.slice(0, eq).trim();
    const value = item.slice(eq + 1).trim();
    if (!value) continue;
    if (key === "t") timestamp = value;
    else if (key === "v1") signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return null;
  return { timestamp, signatures };
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

export async function verifyStripeSignature(
  rawBody: string,
  header: string,
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!secret.startsWith("whsec_")) return false;
  const parsed = parseStripeSignatureHeader(header);
  if (!parsed) return false;
  if (!stripeSignatureAgeOk(parsed.timestamp, nowMs)) return false;
  const expected = await computeStripeSignatureHex(secret, parsed.timestamp, rawBody);
  let matched = 0;
  for (const signature of parsed.signatures) {
    matched |= timingSafeEqual(expected, signature) ? 1 : 0;
  }
  return matched === 1;
}
