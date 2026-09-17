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
    const paymentId = String(body.payment_id ?? "");
    const amountCents = Number(body.amount_cents ?? 0);
    const reason = typeof body.reason === "string" ? body.reason : "requested_by_admin";
    if (!paymentId || !Number.isFinite(amountCents) || amountCents <= 0) {
      return json({ error: "payment_id and amount_cents are required" }, 400);
    }

    const { data: payment } = await svc
      .from("payments")
      .select("id, booking_id, amount_cents, stripe_payment_intent_id, status")
      .eq("id", paymentId)
      .maybeSingle();
    if (!payment?.stripe_payment_intent_id) return json({ error: "payment not found" }, 404);

    const stripe = stripeClient();
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent_id,
      amount: amountCents,
      reason: "requested_by_customer",
      metadata: { booking_id: payment.booking_id, ppp_reason: reason, ppp_stripe_mode: "test" },
    });

    const recorded = await svc.rpc("record_refund", {
      p_booking_id: payment.booking_id,
      p_payment_id: payment.id,
      p_amount_cents: refund.amount,
      p_stripe_refund_id: refund.id,
      p_reason: reason,
    });
    if (recorded.error) return json({ error: recorded.error.message }, 400);

    return json({
      refund: recorded.data,
      charges_live: false,
      payments_live: false,
      deleted_success_history: false,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "refund failed" }, 400);
  }
});
