import { json, optionsResponse } from "../_shared/cors.ts";
import { stripeClient } from "../_shared/stripe.ts";
import { serviceClient, userFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const user = await userFromRequest(req);
    const body = await req.json();
    const bookingId = String(body.booking_id ?? "");
    const scheduleItemId = String(body.schedule_item_id ?? "");
    const successUrl = String(body.success_url ?? "");
    const cancelUrl = String(body.cancel_url ?? "");
    if (!bookingId || !scheduleItemId || !successUrl || !cancelUrl) {
      return json({ error: "booking_id, schedule_item_id, success_url, and cancel_url are required" }, 400);
    }

    const svc = serviceClient();
    const { data: booking, error: bookingError } = await svc
      .from("bookings")
      .select("id, customer_id, status, amount_cents")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError || !booking) return json({ error: "booking not found" }, 404);
    if (booking.customer_id !== user.id) return json({ error: "not the booking customer" }, 403);
    if (!["PENDING", "AWAITING_PAYMENT", "CONFIRMED", "IN_PROGRESS"].includes(booking.status)) {
      return json({ error: "booking is not payable" }, 400);
    }

    const { data: item, error: itemError } = await svc
      .from("payment_schedule_items")
      .select("id, booking_id, amount_cents, description, status, due_now, sequence, kind")
      .eq("id", scheduleItemId)
      .maybeSingle();
    if (itemError || !item || item.booking_id !== bookingId) return json({ error: "schedule item not found" }, 404);
    if (["SUCCEEDED", "CANCELLED", "REFUNDED"].includes(item.status)) {
      return json({ error: "this schedule item is not payable" }, 400);
    }

    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "us_bank_account"],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: item.amount_cents,
            product_data: {
              name: item.description,
              description: "Priority Property Pros test-mode payment. Marketplace fee is paid by the contractor.",
            },
          },
        },
      ],
      payment_intent_data: {
        metadata: {
          booking_id: bookingId,
          schedule_item_id: scheduleItemId,
          confirms_booking: item.due_now || item.sequence === 1 ? "true" : "false",
          ppp_stripe_mode: "test",
        },
      },
      metadata: {
        booking_id: bookingId,
        schedule_item_id: scheduleItemId,
        ppp_stripe_mode: "test",
      },
    });

    const piId = typeof session.payment_intent === "string" ? session.payment_intent : null;
    if (piId) {
      const registered = await svc.rpc("register_payment_intent", {
        p_booking_id: bookingId,
        p_schedule_item_id: scheduleItemId,
        p_amount_cents: item.amount_cents,
        p_stripe_payment_intent_id: piId,
        p_stripe_checkout_session_id: session.id,
        p_payment_method_kind: null,
      });
      if (registered.error) return json({ error: registered.error.message }, 400);
    }

    return json({
      checkout_url: session.url,
      checkout_session_id: session.id,
      payment_intent_id: piId,
      amount_cents: item.amount_cents,
      charges_live: false,
      payments_live: false,
      stripe_mode: "test",
      message: "Returning from Stripe does not confirm this booking. Confirmation happens only after a verified webhook.",
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "could not start payment" }, 400);
  }
});
