import { json, optionsResponse } from "../_shared/cors.ts";
import { restRpc, userIdFromRequest } from "../_shared/supabase.ts";
import { connectionPriceId, requireTestSecret, sessionLinePriceId, stripeGet } from "../_shared/stripeTest.ts";

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
        contact_unlocked: false,
        reason: "success URL is not a trusted Stripe TEST session",
        payments_live: false,
        charges_live: false,
      });
    }

    const secret = requireTestSecret(Deno.env.get("STRIPE_SECRET_KEY") ?? "");
    const session = await stripeGet(secret, `checkout/sessions/${sessionId}?expand[]=line_items`);
    const metadata = (session.metadata ?? {}) as Record<string, string>;
    if (metadata.ppp_kind !== "connection_fee") {
      return json({ error: "session is not a Connection Fee checkout", paid: false, contact_unlocked: false }, 403);
    }

    const context = await restRpc("connection_checkout_context", {
      p_stripe_checkout_session_id: sessionId,
    });
    if (context.error) return json({ error: context.error, paid: false, contact_unlocked: false }, 400);
    const row = (context.data ?? {}) as {
      connection_id?: string;
      project_id?: string;
      contractor_profile_id?: string;
      contractor_user_id?: string;
    };
    if (row.contractor_user_id !== userId) {
      return json({ error: "session does not belong to this contractor", paid: false, contact_unlocked: false }, 403);
    }
    if (metadata.connection_id && metadata.connection_id !== row.connection_id) {
      return json({ error: "mismatched metadata", paid: false, contact_unlocked: false }, 400);
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

    const fulfilled = await restRpc("fulfill_connection_fee_checkout", {
      p_stripe_checkout_session_id: sessionId,
      p_processor_event_id: `reconcile:${sessionId}`,
      p_amount_cents: Number(session.amount_total ?? 0),
      p_currency: String(session.currency ?? ""),
      p_price_id: sessionLinePriceId(session) ?? connectionPriceId(),
      p_payment_status: String(session.payment_status ?? ""),
      p_livemode: Boolean(session.livemode),
      p_connection_id: row.connection_id,
      p_project_id: row.project_id,
      p_contractor_profile_id: row.contractor_profile_id,
    });
    if (fulfilled.error) return json({ error: fulfilled.error, paid: false, contact_unlocked: false }, 400);
    const result = (fulfilled.data ?? {}) as Record<string, unknown>;
    return json({
      ...result,
      paid: result.paid === true,
      contact_unlocked: result.contact_unlocked === true,
      payments_live: false,
      charges_live: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "reconcile failed";
    const status = message === "not signed in" ? 401 : 400;
    return json({ error: message, paid: false, contact_unlocked: false, payments_live: false, charges_live: false }, status);
  }
});
