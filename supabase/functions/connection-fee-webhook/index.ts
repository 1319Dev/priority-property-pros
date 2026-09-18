import { json } from "../_shared/cors.ts";
import { restRpc } from "../_shared/supabase.ts";
import { connectionPriceId, requireTestSecret, sessionLinePriceId, stripeGet } from "../_shared/stripeTest.ts";
import { verifyStripeSignature } from "../_shared/webhook.ts";

function stripeObject(event: { data?: { object?: Record<string, unknown> } }): Record<string, unknown> {
  return event.data?.object ?? {};
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const rawBody = await req.text();
  const header = req.headers.get("Stripe-Signature") ?? "";
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!secret.startsWith("whsec_")) return json({ error: "webhook secret missing" }, 500);
  const ok = await verifyStripeSignature(rawBody, header, secret);
  if (!ok) return json({ error: "invalid signature", contact_unlocked: false }, 400);

  const event = JSON.parse(rawBody) as {
    id?: string;
    type?: string;
    livemode?: boolean;
    data?: { object?: Record<string, unknown> };
  };
  if (event.livemode) {
    return json({ error: "live Stripe events are forbidden", contact_unlocked: false }, 400);
  }

  const type = event.type ?? "";
  const obj = stripeObject(event);
  const metadata = (obj.metadata ?? {}) as Record<string, string>;
  const checkoutId = String(obj.id ?? "");

  if (metadata.ppp_kind && metadata.ppp_kind !== "connection_fee") {
    return json({ ignored: true, reason: "not a connection_fee event", payments_live: false, charges_live: false });
  }

  const recorded = await restRpc("record_connection_checkout_event", {
    p_processor_event_id: event.id ?? `${type}:${checkoutId}`,
    p_event_type: type,
    p_stripe_checkout_session_id: checkoutId || null,
    p_payload: { type, livemode: false },
  });
  if (recorded.error) return json({ error: recorded.error, contact_unlocked: false }, 400);
  const duplicate = Boolean((recorded.data as { duplicate?: boolean } | null)?.duplicate);

  if (type === "checkout.session.expired" || type === "checkout.session.async_payment_failed") {
    const expired = await restRpc("expire_connection_checkout_session", {
      p_stripe_checkout_session_id: checkoutId,
      p_processor_event_id: `${event.id ?? checkoutId}:expire`,
      p_reason: type,
    });
    if (expired.error) return json({ error: expired.error, contact_unlocked: false }, 400);
    return json({
      ok: true,
      released: true,
      duplicate,
      contact_unlocked: false,
      payments_live: false,
      charges_live: false,
    });
  }

  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return json({ ignored: true, type, duplicate, payments_live: false, charges_live: false });
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

  const context = await restRpc("connection_checkout_context", {
    p_stripe_checkout_session_id: checkoutId,
  });
  if (context.error) return json({ error: context.error, contact_unlocked: false }, 400);
  const row = (context.data ?? {}) as {
    connection_id?: string;
    project_id?: string;
    contractor_profile_id?: string;
  };

  if (metadata.connection_id && metadata.connection_id !== row.connection_id) {
    const flagged = await restRpc("flag_connection_checkout_needs_refund", {
      p_stripe_checkout_session_id: checkoutId,
      p_reason: "mismatched_metadata",
    });
    return json({ error: "mismatched metadata", needs_refund: true, result: flagged.data, contact_unlocked: false }, 400);
  }

  const secret = requireTestSecret(Deno.env.get("STRIPE_SECRET_KEY") ?? "");
  const retrieved = await stripeGet(secret, `checkout/sessions/${checkoutId}?expand[]=line_items`);
  const priceId = sessionLinePriceId(retrieved) ?? sessionLinePriceId(obj);
  if (!priceId || priceId !== connectionPriceId()) {
    const flagged = await restRpc("flag_connection_checkout_needs_refund", {
      p_stripe_checkout_session_id: checkoutId,
      p_reason: "wrong_price_id",
    });
    return json({ error: "wrong Price ID", needs_refund: true, result: flagged.data, contact_unlocked: false }, 400);
  }
  const fulfilled = await restRpc("fulfill_connection_fee_checkout", {
    p_stripe_checkout_session_id: checkoutId,
    p_processor_event_id: event.id ?? `webhook:${checkoutId}`,
    p_amount_cents: Number(retrieved.amount_total ?? obj.amount_total ?? 0),
    p_currency: String(retrieved.currency ?? obj.currency ?? ""),
    p_price_id: priceId,
    p_payment_status: String(obj.payment_status ?? ""),
    p_livemode: Boolean(obj.livemode),
    p_connection_id: row.connection_id,
    p_project_id: row.project_id,
    p_contractor_profile_id: row.contractor_profile_id,
  });
  if (fulfilled.error) return json({ error: fulfilled.error, contact_unlocked: false, duplicate }, 400);
  return json({
    ok: true,
    result: fulfilled.data,
    duplicate,
    payments_live: false,
    charges_live: false,
    connect_payouts_enabled: false,
  });
});
