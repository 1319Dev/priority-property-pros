import { json, optionsResponse } from "../_shared/cors.ts";
import { stripeClient } from "../_shared/stripe.ts";
import { isAdmin, serviceClient, userFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const user = await userFromRequest(req);
    const svc = serviceClient();
    if (!(await isAdmin(svc, user.id))) return json({ error: "admin only" }, 403);

    const body = await req.json();
    const transferId = String(body.transfer_id ?? "");
    if (!transferId) return json({ error: "transfer_id is required" }, 400);

    const { data: transfer } = await svc
      .from("contractor_transfers")
      .select("id, booking_id, contractor_profile_id, amount_cents, status, stripe_transfer_id")
      .eq("id", transferId)
      .maybeSingle();
    if (!transfer) return json({ error: "transfer not found" }, 404);
    if (transfer.stripe_transfer_id) return json({ error: "duplicate transfer prevented" }, 409);
    if (transfer.status !== "ELIGIBLE") return json({ error: "transfer is not eligible" }, 400);

    const { data: acct } = await svc
      .from("contractor_stripe_accounts")
      .select("stripe_account_id, status")
      .eq("contractor_profile_id", transfer.contractor_profile_id)
      .maybeSingle();
    if (!acct || acct.status !== "READY") {
      return json({ error: "connected account is not READY for transfers" }, 400);
    }

    await svc.rpc("apply_transfer_update", {
      p_transfer_id: transfer.id,
      p_stripe_transfer_id: null,
      p_status: "pending",
    });

    const stripe = stripeClient();
    const created = await stripe.transfers.create({
      amount: transfer.amount_cents,
      currency: "usd",
      destination: acct.stripe_account_id,
      metadata: {
        booking_id: transfer.booking_id,
        transfer_id: transfer.id,
        ppp_stripe_mode: "test",
      },
    });

    const updated = await svc.rpc("apply_transfer_update", {
      p_transfer_id: transfer.id,
      p_stripe_transfer_id: created.id,
      p_status: "transferred",
    });
    if (updated.error) return json({ error: updated.error.message }, 400);

    return json({
      transfer: updated.data,
      stripe_transfer_id: created.id,
      charges_live: false,
      payments_live: false,
      instant_payout: false,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "transfer failed" }, 400);
  }
});
