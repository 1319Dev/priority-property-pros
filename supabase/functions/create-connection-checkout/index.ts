import { json, optionsResponse } from "../_shared/cors.ts";
import { allowedOrigin, restRpc, userIdFromRequest } from "../_shared/supabase.ts";
import { connectionFeeCents, connectionPriceId, requireTestSecret, stripeForm } from "../_shared/stripeTest.ts";

function uuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const userId = await userIdFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      project_id?: string;
      opportunity_id?: string;
      origin?: string;
      price_id?: string;
      amount_cents?: number;
      contractor_profile_id?: string;
    };

    if (body.price_id || body.amount_cents != null || body.contractor_profile_id) {
      return json({ error: "client cannot set price, amount, or contractor", contact_unlocked: false }, 400);
    }

    const projectId = String(body.project_id ?? "").trim();
    const opportunityId = String(body.opportunity_id ?? "").trim();
    if (!uuidLike(projectId)) return json({ error: "project is required", contact_unlocked: false }, 400);

    const origin = String(body.origin ?? Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
    if (!allowedOrigin(origin)) return json({ error: "return origin is not allowed", contact_unlocked: false }, 400);

    const flags = await restRpc("connection_fee_checkout_flags", {});
    if (flags.error) return json({ error: flags.error, contact_unlocked: false }, 500);
    const snapshot = flags.data as {
      enabled?: boolean;
      fee_cents?: number;
      stripe_test_mode?: boolean;
      payments_live?: boolean;
      charges_live?: boolean;
    };
    if (snapshot.enabled !== true) {
      return json({
        checkout_disabled: true,
        contact_unlocked: false,
        paid: false,
        payments_live: false,
        charges_live: false,
        message: "Connection Fee checkout is not enabled. Contact stays locked.",
      });
    }
    if (snapshot.fee_cents !== 499) return json({ error: "fee_cents must be 499", contact_unlocked: false }, 500);
    if (snapshot.stripe_test_mode !== true) return json({ error: "stripe_test_mode must be 1", contact_unlocked: false }, 500);
    if (snapshot.payments_live || snapshot.charges_live) {
      return json({ error: "job-payment flags must stay off", contact_unlocked: false }, 500);
    }

    const reserved = await restRpc("reserve_connection_checkout", {
      p_project_id: projectId,
      p_auth_user_id: userId,
    });
    if (reserved.error) return json({ error: reserved.error, contact_unlocked: false, paid: false }, 400);
    const reservation = reserved.data as {
      connection_id?: string;
      reserved_until?: string;
      reservation_slot?: number;
    };
    const connectionId = String(reservation.connection_id ?? "");
    if (!connectionId) return json({ error: "reservation failed", contact_unlocked: false }, 500);

    const envPrice = (Deno.env.get("STRIPE_CONNECTION_PRICE_ID") ?? connectionPriceId()).trim();
    if (envPrice !== connectionPriceId()) {
      return json({ error: "STRIPE_CONNECTION_PRICE_ID does not match the server Price ID", contact_unlocked: false }, 500);
    }
    const activationId = (Deno.env.get("STRIPE_ACTIVATION_PRICE_ID") ?? "").trim();
    if (activationId && activationId === envPrice) {
      return json({ error: "activation Price ID must not be used for Connection Fee", contact_unlocked: false }, 500);
    }

    const secret = requireTestSecret(Deno.env.get("STRIPE_SECRET_KEY") ?? "");
    const successPath = "/app/pro/connections/return";
    const cancelPath = opportunityId && uuidLike(opportunityId)
      ? `/app/pro/opportunities/${opportunityId}`
      : "/app/pro/opportunities";
    const expiresAt = String(Math.floor(Date.now() / 1000) + 1800);

    const session = await stripeForm(secret, "checkout/sessions", {
      mode: "payment",
      "line_items[0][price]": connectionPriceId(),
      "line_items[0][quantity]": "1",
      success_url: `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}`,
      client_reference_id: connectionId,
      expires_at: expiresAt,
      "metadata[ppp_kind]": "connection_fee",
      "metadata[connection_id]": connectionId,
      "metadata[project_id]": projectId,
      "metadata[contractor_user_id]": userId,
      "payment_intent_data[metadata][ppp_kind]": "connection_fee",
      "payment_intent_data[metadata][connection_id]": connectionId,
      "payment_intent_data[metadata][project_id]": projectId,
    });

    const checkoutId = String(session.id ?? "");
    const checkoutUrl = String(session.url ?? "");
    if (!checkoutId.startsWith("cs_test_") || !checkoutUrl) {
      return json({ error: "Stripe TEST checkout session was not created", contact_unlocked: false }, 500);
    }

    const attached = await restRpc("attach_connection_checkout_session", {
      p_connection_id: connectionId,
      p_stripe_checkout_session_id: checkoutId,
    });
    if (attached.error) return json({ error: attached.error, contact_unlocked: false }, 400);

    return json({
      checkout_url: checkoutUrl,
      checkout_id: checkoutId,
      connection_id: connectionId,
      amount_cents: connectionFeeCents(),
      currency: "usd",
      contact_unlocked: false,
      paid: false,
      payments_live: false,
      charges_live: false,
      stripe_test_mode: true,
      reserved_until: reservation.reserved_until ?? null,
      reservation_slot: reservation.reservation_slot ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "connection checkout failed";
    const status = message === "not signed in" ? 401 : 400;
    return json({ error: message, contact_unlocked: false, paid: false, payments_live: false, charges_live: false }, status);
  }
});
