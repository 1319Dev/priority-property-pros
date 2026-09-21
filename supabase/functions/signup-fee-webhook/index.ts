// Account activation ($9.99) Stripe webhook (JWT verification off).
// Environment is controlled by platform_settings.stripe_test_mode (1=TEST, 0=LIVE).
// Secrets must match that flag. signup_fee_enabled is the customer kill switch.
//   STRIPE_SIGNUP_FEE_WEBHOOK_SECRET = whsec_...   required, signature verification
//   STRIPE_SECRET_KEY                 = sk_test_... when stripe_test_mode=1; sk_live_... when stripe_test_mode=0
//   STRIPE_ACTIVATION_PRICE_ID        required; retrieved and validated (999 USD one_time, livemode matches)
// Does not grant #14 contact. Does not fulfill Connection Fee events.
import { json } from "../_shared/cors.ts";
import { restRpc } from "../_shared/supabase.ts";
import {
  assertPaidActivationSession,
  livemodeMatchesStripeTestMode,
  livemodeMismatchMessage,
  requireActivationPriceId,
  requireSecretForMode,
  requireWebhookSecret,
  stripeGet,
  stripePaymentIntentId,
  stripeTestModeFromFlags,
} from "../_shared/stripeEnv.ts";
import { verifyStripeSignature } from "../_shared/webhook.ts";

function stripeObject(event: { data?: { object?: Record<string, unknown> } }): Record<string, unknown> {
  return event.data?.object ?? {};
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const rawBody = await req.text();
  const header = req.headers.get("Stripe-Signature") ?? "";
  let webhookSecret: string;
  try {
    webhookSecret = requireWebhookSecret(Deno.env.get("STRIPE_SIGNUP_FEE_WEBHOOK_SECRET") ?? "");
  } catch {
    return json({ error: "webhook secret missing" }, 500);
  }
  const ok = await verifyStripeSignature(rawBody, header, webhookSecret);
  if (!ok) return json({ error: "invalid signature", contact_unlocked: false }, 400);

  const event = JSON.parse(rawBody) as {
    id?: string;
    type?: string;
    livemode?: boolean;
    data?: { object?: Record<string, unknown> };
  };

  const flags = await restRpc("signup_fee_checkout_flags", {});
  if (flags.error) return json({ error: flags.error, contact_unlocked: false }, 500);
  const snapshot = (flags.data ?? {}) as { stripe_test_mode?: boolean };
  const testMode = stripeTestModeFromFlags(snapshot);
  if (!livemodeMatchesStripeTestMode(event.livemode, testMode)) {
    return json({ error: livemodeMismatchMessage(testMode), contact_unlocked: false }, 400);
  }

  const type = event.type ?? "";
  const obj = stripeObject(event);
  const metadata = (obj.metadata ?? {}) as Record<string, string>;
  const checkoutId = String(obj.id ?? "");

  if (metadata.ppp_kind && metadata.ppp_kind !== "signup_fee") {
    return json({
      ignored: true,
      reason: "not a signup_fee event",
      contact_unlocked: false,
      payments_live: false,
      charges_live: false,
    });
  }

  const recorded = await restRpc("record_signup_fee_event", {
    p_processor_event_id: event.id ?? `${type}:${checkoutId}`,
    p_event_type: type,
    p_stripe_checkout_session_id: checkoutId || null,
    p_payload: { type, livemode: Boolean(event.livemode) },
  });
  if (recorded.error) return json({ error: recorded.error, contact_unlocked: false }, 400);
  const duplicate = Boolean((recorded.data as { duplicate?: boolean } | null)?.duplicate);

  if (type === "checkout.session.expired" || type === "checkout.session.async_payment_failed") {
    return json({
      ok: true,
      released: true,
      duplicate,
      contact_unlocked: false,
      paid: false,
      payments_live: false,
      charges_live: false,
    });
  }

  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return json({ ignored: true, type, duplicate, contact_unlocked: false, payments_live: false, charges_live: false });
  }

  if (String(obj.payment_status ?? "") !== "paid") {
    return json({
      ok: true,
      paid: false,
      contact_unlocked: false,
      reason: "payment not satisfied yet",
      duplicate,
      payments_live: false,
      charges_live: false,
    });
  }

  const profileId = String(metadata.profile_id ?? obj.client_reference_id ?? "");
  if (!profileId || !checkoutId) {
    return json({ error: "missing profile or checkout id", contact_unlocked: false }, 400);
  }

  const context = await restRpc("signup_fee_checkout_context", {
    p_stripe_checkout_session_id: checkoutId,
  });
  const row = (context.data ?? {}) as { profile_id?: string };
  if (!context.error && row.profile_id && row.profile_id !== profileId) {
    const flagged = await restRpc("flag_signup_checkout_needs_refund", {
      p_stripe_checkout_session_id: checkoutId,
      p_reason: "mismatched_metadata",
    });
    return json({ error: "mismatched metadata", needs_refund: true, result: flagged.data, contact_unlocked: false }, 400);
  }

  const envPrice = requireActivationPriceId(Deno.env.get("STRIPE_ACTIVATION_PRICE_ID"));
  const stripeSecret = requireSecretForMode(Deno.env.get("STRIPE_SECRET_KEY") ?? "", testMode);
  const retrieved = await stripeGet(stripeSecret, `checkout/sessions/${checkoutId}?expand[]=line_items`);
  let validated: { priceId: string; amountCents: number; currency: string };
  try {
    validated = assertPaidActivationSession(retrieved, { expectedPriceId: envPrice, testMode });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid Stripe session";
    const reason = message.includes("Price ID") ? "wrong_price_id"
      : message.includes("999") ? "wrong_amount"
      : message.includes("usd") ? "wrong_currency"
      : "invalid_session";
    const flagged = await restRpc("flag_signup_checkout_needs_refund", {
      p_stripe_checkout_session_id: checkoutId,
      p_reason: reason,
    });
    return json({ error: message, needs_refund: true, result: flagged.data, contact_unlocked: false }, 400);
  }

  const paymentIntentId = stripePaymentIntentId(retrieved.payment_intent) ?? stripePaymentIntentId(obj.payment_intent);
  const fulfilled = await restRpc("fulfill_signup_fee_checkout", {
    p_stripe_checkout_session_id: checkoutId,
    p_processor_event_id: event.id ?? `webhook:${checkoutId}`,
    p_amount_cents: validated.amountCents,
    p_currency: validated.currency,
    p_price_id: validated.priceId,
    p_payment_status: String(obj.payment_status ?? ""),
    p_livemode: Boolean(retrieved.livemode ?? obj.livemode ?? event.livemode),
    p_profile_id: profileId,
    p_stripe_payment_intent_id: paymentIntentId,
  });
  if (fulfilled.error) return json({ error: fulfilled.error, contact_unlocked: false, duplicate }, 400);
  return json({
    ok: true,
    result: fulfilled.data,
    duplicate,
    contact_unlocked: false,
    payments_live: false,
    charges_live: false,
    connect_payouts_enabled: false,
  });
});
