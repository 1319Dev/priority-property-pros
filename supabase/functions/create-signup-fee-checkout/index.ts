import { json, optionsResponse } from "../_shared/cors.ts";
import { requireTestSecret, signupFeeAmount, stripeForm } from "../_shared/stripeTest.ts";
import { restRpc, userIdFromRequest } from "../_shared/supabase.ts";

async function profileSignupState(userId: string): Promise<{
  signup_fee_status: string;
  account_type: string;
} | null> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${userId}&select=signup_fee_status,account_type`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const rows = (await res.json()) as Array<{ signup_fee_status: string; account_type: string }>;
  return rows[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const userId = await userIdFromRequest(req);
    const body = (await req.json()) as { success_url?: string; cancel_url?: string };
    const successUrl = String(body.success_url ?? "");
    const cancelUrl = String(body.cancel_url ?? "");
    if (!successUrl || !cancelUrl) return json({ error: "success_url and cancel_url are required" }, 400);

    const flags = await restRpc("signup_fee_isolation_flags", {});
    if (flags.error) return json({ error: flags.error }, 500);
    const snapshot = flags.data as {
      signup_fee_cents?: number;
      stripe_test_mode?: number;
    };
    if (snapshot.signup_fee_cents !== 999) return json({ error: "signup_fee_cents must be 999" }, 500);
    if (snapshot.stripe_test_mode !== 1) return json({ error: "stripe_test_mode must be 1" }, 500);

    const profile = await profileSignupState(userId);
    if (!profile) return json({ error: "profile not found" }, 404);
    if (profile.signup_fee_status === "PAID" || profile.signup_fee_status === "NOT_REQUIRED") {
      return json({
        already_paid: true,
        payments_live: false,
        charges_live: false,
        connect_payouts_enabled: false,
      });
    }
    if (profile.account_type !== "CUSTOMER" && profile.account_type !== "CONTRACTOR") {
      return json({ error: "signup fee is only for CUSTOMER and CONTRACTOR" }, 400);
    }

    const secret = requireTestSecret(Deno.env.get("STRIPE_SECRET_KEY") ?? "");
    const amount = String(signupFeeAmount());
    const session = await stripeForm(secret, "checkout/sessions", {
      mode: "payment",
      "payment_method_types[0]": "card",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": amount,
      "line_items[0][price_data][product_data][name]": "Priority Property Pros account signup",
      "line_items[0][price_data][product_data][description]":
        "$9.99 one-time account signup/activation. Not a job payment. Does not approve contractors.",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      "metadata[ppp_kind]": "signup_fee",
      "metadata[profile_id]": userId,
      "metadata[amount_cents]": amount,
      "metadata[payments_live]": "0",
      "metadata[charges_live]": "0",
      "metadata[connect]": "0",
      "payment_intent_data[metadata][ppp_kind]": "signup_fee",
      "payment_intent_data[metadata][profile_id]": userId,
      "payment_intent_data[metadata][amount_cents]": amount,
    });

    const checkoutId = String(session.id ?? "");
    if (!checkoutId) return json({ error: "no checkout id" }, 500);

    const registered = await restRpc("register_signup_fee_checkout", {
      p_profile_id: userId,
      p_amount_cents: 999,
      p_checkout_id: checkoutId,
    });
    if (registered.error) return json({ error: registered.error, payments_live: false, charges_live: false }, 400);

    return json({
      checkout_url: session.url,
      checkout_id: checkoutId,
      amount_cents: 999,
      payments_live: false,
      charges_live: false,
      connect_payouts_enabled: false,
      stripe_test_mode: true,
      job_payments_enabled: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "signup fee checkout failed";
    return json({ error: message, payments_live: false, charges_live: false }, 400);
  }
});
