import { json, optionsResponse } from "../_shared/cors.ts";
import { stripeClient } from "../_shared/stripe.ts";
import { serviceClient, userFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const user = await userFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const refreshUrl = String(body.refresh_url ?? "");
    const returnUrl = String(body.return_url ?? "");
    if (!refreshUrl || !returnUrl) return json({ error: "refresh_url and return_url are required" }, 400);

    const svc = serviceClient();
    const { data: contractor, error } = await svc
      .from("contractor_profiles")
      .select("id, profile_id, business_name")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (error || !contractor) return json({ error: "contractor profile not found" }, 404);

    const { data: existing } = await svc
      .from("contractor_stripe_accounts")
      .select("stripe_account_id, status")
      .eq("contractor_profile_id", contractor.id)
      .maybeSingle();

    const stripe = stripeClient();
    let accountId = existing?.stripe_account_id as string | undefined;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: contractor.business_name || "Priority Property Pros contractor",
          product_description: "Local home-services contractor on Priority Property Pros",
        },
        metadata: {
          contractor_profile_id: contractor.id,
          ppp_stripe_mode: "test",
        },
      });
      accountId = account.id;
    }

    const account = await stripe.accounts.retrieve(accountId);
    await svc.rpc("sync_contractor_stripe_account", {
      p_contractor_profile_id: contractor.id,
      p_stripe_account_id: accountId,
      p_details_submitted: Boolean(account.details_submitted),
      p_charges_enabled: Boolean(account.charges_enabled),
      p_payouts_enabled: Boolean(account.payouts_enabled),
      p_disabled: Boolean(account.requirements?.disabled_reason),
      p_disabled_reason: account.requirements?.disabled_reason ?? null,
      p_transfers_capability: account.capabilities?.transfers ?? "unrequested",
    });

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return json({
      url: link.url,
      stripe_account_id: accountId,
      charges_live: false,
      payments_live: false,
      stripe_mode: "test",
      model: "express",
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "could not start payout onboarding" }, 400);
  }
});
