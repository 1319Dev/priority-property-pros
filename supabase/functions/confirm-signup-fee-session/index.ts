import { json, optionsResponse } from "../_shared/cors.ts";
import { requireTestSecret, stripeGet } from "../_shared/stripeTest.ts";
import { restRpc, userIdFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const userId = await userIdFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as { session_id?: string };
    const sessionId = String(body.session_id ?? "").trim();
    if (!sessionId.startsWith("cs_test_")) {
      return json({
        paid: false,
        reason: "no trusted paid session",
        payments_live: false,
        charges_live: false,
      });
    }

    const secret = requireTestSecret(Deno.env.get("STRIPE_SECRET_KEY") ?? "");
    const session = await stripeGet(secret, `checkout/sessions/${sessionId}`);
    const metadata = (session.metadata ?? {}) as Record<string, string>;
    const paymentStatus = String(session.payment_status ?? "");
    const profileId = String(metadata.profile_id ?? session.client_reference_id ?? "");
    if (profileId !== userId || metadata.ppp_kind !== "signup_fee") {
      return json({ error: "session does not belong to this signup-fee account", paid: false }, 403);
    }
    if (paymentStatus !== "paid") {
      return json({
        paid: false,
        signup_fee_status: "UNPAID",
        payments_live: false,
        charges_live: false,
      });
    }

    const chargeId = typeof session.payment_intent === "string" ? session.payment_intent : null;
    const applied = await restRpc("apply_signup_fee_paid", {
      p_profile_id: userId,
      p_checkout_id: String(session.id ?? sessionId),
      p_processor_charge_id: chargeId,
      p_processor_event_id: `confirm:${sessionId}`,
      p_amount_cents: 999,
    });
    if (applied.error) return json({ error: applied.error, paid: false, payments_live: false, charges_live: false }, 400);
    return json({
      paid: true,
      result: applied.data,
      payments_live: false,
      charges_live: false,
      connect_payouts_enabled: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "confirm failed";
    return json({ error: message, paid: false, payments_live: false, charges_live: false }, 400);
  }
});
