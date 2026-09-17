import { json } from "../_shared/cors.ts";
import { restRpc } from "../_shared/supabase.ts";

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function verifyStripeSignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(",").map((item) => {
      const [k, v] = item.split("=");
      return [k.trim(), v];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const hex = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, signature);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const rawBody = await req.text();
  const header = req.headers.get("Stripe-Signature") ?? "";
  const secret = Deno.env.get("STRIPE_SIGNUP_FEE_WEBHOOK_SECRET") ?? "";
  if (!secret.startsWith("whsec_")) return json({ error: "webhook secret missing" }, 500);
  const ok = await verifyStripeSignature(rawBody, header, secret);
  if (!ok) return json({ error: "invalid signature" }, 400);

  const event = JSON.parse(rawBody) as {
    id?: string;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  const type = event.type ?? "";
  const obj = event.data?.object ?? {};
  const metadata = (obj.metadata ?? {}) as Record<string, string>;
  if (metadata.ppp_kind !== "signup_fee") {
    return json({ ignored: true, reason: "not a signup_fee event", payments_live: false, charges_live: false });
  }

  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return json({ ignored: true, type, payments_live: false, charges_live: false });
  }

  const profileId = String(metadata.profile_id ?? obj.client_reference_id ?? "");
  const checkoutId = String(obj.id ?? "");
  const chargeId = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
  if (!profileId || !checkoutId) return json({ error: "missing profile or checkout id" }, 400);

  const applied = await restRpc("apply_signup_fee_paid", {
    p_profile_id: profileId,
    p_checkout_id: checkoutId,
    p_processor_charge_id: chargeId,
    p_processor_event_id: event.id ?? null,
    p_amount_cents: 999,
  });
  if (applied.error) return json({ error: applied.error, payments_live: false, charges_live: false }, 400);
  return json({
    ok: true,
    result: applied.data,
    payments_live: false,
    charges_live: false,
    connect_payouts_enabled: false,
  });
});
