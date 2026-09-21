import { json, optionsResponse } from "../_shared/cors.ts";
import { restRpc, userIdFromRequest } from "../_shared/supabase.ts";
import {
  assertPaidActivationSession,
  checkoutSessionIdMatchesMode,
  requireActivationPriceId,
  requireSecretForMode,
  stripeGet,
  stripePaymentIntentId,
  stripeTestModeFromFlags,
} from "../_shared/stripeEnv.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const userId = await userIdFromRequest(req);
    const flags = await restRpc("signup_fee_checkout_flags", {});
    if (flags.error) return json({ error: flags.error, paid: false, contact_unlocked: false }, 500);
    const snapshot = (flags.data ?? {}) as { stripe_test_mode?: boolean };
    const testMode = stripeTestModeFromFlags(snapshot);

    const body = (await req.json().catch(() => ({}))) as { session_id?: string };
    const sessionId = String(body.session_id ?? "").trim();
    if (!checkoutSessionIdMatchesMode(sessionId, testMode)) {
      return json({
        paid: false,
        contact_unlocked: false,
        reason: "success URL is not a trusted Stripe session",
        payments_live: false,
        charges_live: false,
      });
    }

    const envPrice = requireActivationPriceId(Deno.env.get("STRIPE_ACTIVATION_PRICE_ID"));
    const stripeSecret = requireSecretForMode(Deno.env.get("STRIPE_SECRET_KEY") ?? "", testMode);
    const session = await stripeGet(stripeSecret, `checkout/sessions/${sessionId}?expand[]=line_items`);
    const metadata = (session.metadata ?? {}) as Record<string, string>;
    if (metadata.ppp_kind !== "signup_fee") {
      return json({ error: "session is not an account activation checkout", paid: false, contact_unlocked: false }, 403);
    }
    if (metadata.profile_id && metadata.profile_id !== userId) {
      return json({ error: "session does not belong to this account", paid: false, contact_unlocked: false }, 403);
    }
    if (String(session.client_reference_id ?? "") && String(session.client_reference_id) !== userId) {
      return json({ error: "session does not belong to this account", paid: false, contact_unlocked: false }, 403);
    }

    if (String(session.payment_status ?? "") !== "paid") {
      return json({
        paid: false,
        contact_unlocked: false,
        reason: "unpaid",
        payments_live: false,
        charges_live: false,
      });
    }

    const validated = assertPaidActivationSession(session, { expectedPriceId: envPrice, testMode });
    const fulfilled = await restRpc("fulfill_signup_fee_checkout", {
      p_stripe_checkout_session_id: sessionId,
      p_processor_event_id: `reconcile:${sessionId}`,
      p_amount_cents: validated.amountCents,
      p_currency: validated.currency,
      p_price_id: validated.priceId,
      p_payment_status: String(session.payment_status ?? ""),
      p_livemode: Boolean(session.livemode),
      p_profile_id: userId,
      p_stripe_payment_intent_id: stripePaymentIntentId(session.payment_intent),
    });
    if (fulfilled.error) return json({ error: fulfilled.error, paid: false, contact_unlocked: false }, 400);
    const result = (fulfilled.data ?? {}) as Record<string, unknown>;
    return json({
      ...result,
      paid: result.paid === true,
      contact_unlocked: false,
      payments_live: false,
      charges_live: false,
      connect_payouts_enabled: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "reconcile failed";
    const status = message === "not signed in" ? 401 : 400;
    return json({ error: message, paid: false, contact_unlocked: false, payments_live: false, charges_live: false }, status);
  }
});
