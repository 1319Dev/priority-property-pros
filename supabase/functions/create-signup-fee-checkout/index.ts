import { json, optionsResponse } from "../_shared/cors.ts";
import { allowedOrigin, restRpc, userIdFromRequest } from "../_shared/supabase.ts";
import {
  activationFeeCents,
  assertActivationPriceOrThrow,
  checkoutSessionIdMatchesMode,
  requireActivationPriceId,
  requireSecretForMode,
  stripeForm,
  stripeGet,
  stripeTestModeFromFlags,
} from "../_shared/stripeEnv.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const userId = await userIdFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      origin?: string;
      price_id?: string;
      amount_cents?: number;
      success_url?: string;
      cancel_url?: string;
    };

    if (body.price_id || body.amount_cents != null) {
      return json({ error: "client cannot set price or amount", contact_unlocked: false, paid: false }, 400);
    }

    const origin = String(body.origin ?? Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
    if (!allowedOrigin(origin)) return json({ error: "return origin is not allowed", contact_unlocked: false }, 400);

    const flags = await restRpc("signup_fee_checkout_flags", {});
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
        message: "Account activation checkout is not enabled.",
      });
    }
    if (snapshot.fee_cents !== 999) return json({ error: "fee_cents must be 999", contact_unlocked: false }, 500);
    if (snapshot.payments_live || snapshot.charges_live) {
      return json({ error: "job-payment flags must stay off", contact_unlocked: false }, 500);
    }

    const state = await restRpc("signup_fee_profile_context", { p_auth_user_id: userId });
    if (state.error) return json({ error: state.error, contact_unlocked: false }, 400);
    const profileState = (state.data ?? {}) as {
      status?: string;
      account_type?: string;
      required?: boolean;
    };
    if (profileState.status === "PAID" || profileState.status === "NOT_REQUIRED") {
      return json({
        already_paid: true,
        paid: profileState.status === "PAID",
        contact_unlocked: false,
        payments_live: false,
        charges_live: false,
        connect_payouts_enabled: false,
      });
    }
    if (profileState.account_type !== "CUSTOMER" && profileState.account_type !== "CONTRACTOR") {
      return json({ error: "signup fee is only for CUSTOMER and CONTRACTOR", contact_unlocked: false }, 400);
    }

    const testMode = stripeTestModeFromFlags(snapshot);
    const envPrice = requireActivationPriceId(Deno.env.get("STRIPE_ACTIVATION_PRICE_ID"));
    const connectionId = (Deno.env.get("STRIPE_CONNECTION_PRICE_ID") ?? "").trim();
    if (connectionId && connectionId === envPrice) {
      return json({ error: "connection Price ID must not be used for account activation", contact_unlocked: false }, 500);
    }
    const secret = requireSecretForMode(Deno.env.get("STRIPE_SECRET_KEY") ?? "", testMode);
    const price = await stripeGet(secret, `prices/${envPrice}`);
    assertActivationPriceOrThrow(price, { expectedPriceId: envPrice, testMode });

    const expiresAt = String(Math.floor(Date.now() / 1000) + 1800);
    const session = await stripeForm(secret, "checkout/sessions", {
      mode: "payment",
      "line_items[0][price]": envPrice,
      "line_items[0][quantity]": "1",
      success_url: `${origin}/account/activate?state=return&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/account/activate?state=cancel`,
      client_reference_id: userId,
      expires_at: expiresAt,
      "metadata[ppp_kind]": "signup_fee",
      "metadata[profile_id]": userId,
      "payment_intent_data[metadata][ppp_kind]": "signup_fee",
      "payment_intent_data[metadata][profile_id]": userId,
    });

    const checkoutId = String(session.id ?? "");
    const checkoutUrl = String(session.url ?? "");
    if (!checkoutSessionIdMatchesMode(checkoutId, testMode) || !checkoutUrl) {
      return json({
        error: testMode
          ? "Stripe TEST checkout session was not created"
          : "Stripe LIVE checkout session was not created",
        contact_unlocked: false,
      }, 500);
    }

    const attached = await restRpc("register_signup_fee_checkout", {
      p_profile_id: userId,
      p_stripe_checkout_session_id: checkoutId,
      p_price_id: envPrice,
      p_livemode: !testMode,
    });
    if (attached.error) return json({ error: attached.error, contact_unlocked: false }, 400);

    return json({
      checkout_url: checkoutUrl,
      checkout_id: checkoutId,
      amount_cents: activationFeeCents(),
      currency: "usd",
      contact_unlocked: false,
      paid: false,
      payments_live: false,
      charges_live: false,
      stripe_test_mode: testMode,
      connect_payouts_enabled: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "signup fee checkout failed";
    const status = message === "not signed in" ? 401 : 400;
    return json({ error: message, contact_unlocked: false, paid: false, payments_live: false, charges_live: false }, status);
  }
});
