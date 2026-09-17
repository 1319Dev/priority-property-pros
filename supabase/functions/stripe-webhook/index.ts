import { json, optionsResponse } from "../_shared/cors.ts";
import { redact, stripeClient, webhookSecret } from "../_shared/stripe.ts";
import { serviceClient } from "../_shared/supabase.ts";

function methodKind(pmType: string | null | undefined): string | null {
  if (pmType === "card") return "CARD";
  if (pmType === "us_bank_account") return "US_BANK_ACCOUNT";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing Stripe-Signature" }, 400);

  const raw = await req.text();
  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = stripeClient().webhooks.constructEvent(raw, signature, webhookSecret()) as typeof event;
  } catch (err) {
    console.error("webhook signature failed", err instanceof Error ? err.message : "invalid");
    return json({ error: "invalid signature" }, 400);
  }

  const svc = serviceClient();
  const summary = redact({
    id: event.id,
    type: event.type,
    object: (event.data.object as { id?: string }).id ?? null,
  });

  const claimed = await svc.rpc("claim_stripe_event", {
    p_stripe_event_id: event.id,
    p_event_type: event.type,
    p_payload_summary: summary,
  });
  if (claimed.error) {
    console.error("claim_stripe_event", claimed.error.message);
    return json({ error: "claim failed" }, 500);
  }
  if (claimed.data === false) {
    return json({ ok: true, duplicate: true });
  }

  try {
    await dispatch(svc, event);
  } catch (err) {
    console.error("webhook handler failed", event.type, event.id, err instanceof Error ? err.message : "error");
    return json({ error: "handler failed" }, 500);
  }

  return json({ ok: true, type: event.type });
});

async function dispatch(
  svc: ReturnType<typeof serviceClient>,
  event: { id: string; type: string; data: { object: Record<string, unknown> } },
) {
  const obj = event.data.object;
  const stripe = stripeClient();

  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.processing" ||
    event.type === "payment_intent.payment_failed" ||
    event.type === "payment_intent.canceled"
  ) {
    const piId = String(obj.id ?? "");
    const status =
      event.type === "payment_intent.succeeded"
        ? "succeeded"
        : event.type === "payment_intent.processing"
          ? "processing"
          : event.type === "payment_intent.canceled"
            ? "canceled"
            : "failed";
    let chargeId: string | null = typeof obj.latest_charge === "string" ? obj.latest_charge : null;
    let balanceTxn: string | null = null;
    let processing = 0;
    const charges = obj.charges as { data?: Array<{ id?: string; balance_transaction?: string }> } | undefined;
    if (!chargeId && charges?.data?.[0]?.id) chargeId = String(charges.data[0].id);
    if (chargeId && status === "succeeded") {
      try {
        const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
        const bt = charge.balance_transaction;
        if (bt && typeof bt !== "string") {
          processing = bt.fee ?? 0;
          balanceTxn = bt.id;
        } else if (typeof bt === "string") {
          balanceTxn = bt;
        }
      } catch (err) {
        console.error("balance transaction lookup failed", err instanceof Error ? err.message : "error");
      }
    }
    const pm =
      typeof obj.payment_method_types === "object" && Array.isArray(obj.payment_method_types)
        ? methodKind(String(obj.payment_method_types[0] ?? ""))
        : methodKind(typeof obj.payment_method_types === "string" ? obj.payment_method_types : null);
    const dueNow = (obj.metadata as { confirms_booking?: string } | undefined)?.confirms_booking === "true";
    const meta = (obj.metadata ?? {}) as { booking_id?: string; schedule_item_id?: string };
    let applied = await svc.rpc("apply_payment_intent_update", {
      p_stripe_payment_intent_id: piId,
      p_status: status,
      p_stripe_charge_id: chargeId,
      p_stripe_balance_transaction_id: balanceTxn,
      p_processing_cost_cents: processing,
      p_payment_method_kind: pm,
      p_confirms_booking: dueNow,
    });
    if (applied.data && typeof applied.data === "object" && (applied.data as { reason?: string }).reason === "payment_not_registered") {
      if (meta.booking_id && meta.schedule_item_id) {
        const amount = Number(obj.amount ?? 0);
        await svc.rpc("register_payment_intent", {
          p_booking_id: meta.booking_id,
          p_schedule_item_id: meta.schedule_item_id,
          p_amount_cents: amount,
          p_stripe_payment_intent_id: piId,
          p_stripe_checkout_session_id: null,
          p_payment_method_kind: pm,
        });
        applied = await svc.rpc("apply_payment_intent_update", {
          p_stripe_payment_intent_id: piId,
          p_status: status,
          p_stripe_charge_id: chargeId,
          p_stripe_balance_transaction_id: balanceTxn,
          p_processing_cost_cents: processing,
          p_payment_method_kind: pm,
          p_confirms_booking: dueNow,
        });
      }
    }
    if (applied.error) throw new Error(applied.error.message);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const pi = obj.payment_intent;
    const meta = (obj.metadata ?? {}) as { booking_id?: string; schedule_item_id?: string };
    if (typeof pi === "string" && meta.booking_id && meta.schedule_item_id) {
      const registered = await svc.rpc("register_payment_intent", {
        p_booking_id: meta.booking_id,
        p_schedule_item_id: meta.schedule_item_id,
        p_amount_cents: Number(obj.amount_total ?? 0),
        p_stripe_payment_intent_id: pi,
        p_stripe_checkout_session_id: String(obj.id ?? ""),
        p_payment_method_kind: null,
      });
      if (registered.error) throw new Error(registered.error.message);
    }
    return;
  }

  if (event.type === "charge.refunded") {
    const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
    if (!pi) return;
    const { data: payment } = await svc
      .from("payments")
      .select("id, booking_id")
      .eq("stripe_payment_intent_id", pi)
      .maybeSingle();
    if (!payment) return;
    const refunds = (obj.refunds as { data?: Array<{ id?: string; amount?: number }> } | undefined)?.data ?? [];
    const last = refunds[refunds.length - 1];
    if (!last?.id) return;
    const recorded = await svc.rpc("record_refund", {
      p_booking_id: payment.booking_id,
      p_payment_id: payment.id,
      p_amount_cents: Number(last.amount ?? obj.amount_refunded ?? 0),
      p_stripe_refund_id: last.id,
      p_reason: "stripe_charge_refunded",
    });
    if (recorded.error) throw new Error(recorded.error.message);
    return;
  }

  if (event.type.startsWith("charge.dispute.")) {
    const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
    if (!pi) return;
    const applied = await svc.rpc("apply_stripe_dispute", {
      p_stripe_dispute_id: String(obj.id ?? ""),
      p_stripe_payment_intent_id: pi,
      p_status: String(obj.status ?? "needs_response"),
      p_amount_cents: Number(obj.amount ?? 0),
      p_reason: typeof obj.reason === "string" ? obj.reason : null,
    });
    if (applied.error) throw new Error(applied.error.message);
    return;
  }

  if (event.type === "account.updated" || event.type === "capability.updated") {
    const accountId = event.type === "account.updated" ? String(obj.id ?? "") : String(obj.account ?? "");
    if (!accountId) return;
    const { data: row } = await svc
      .from("contractor_stripe_accounts")
      .select("contractor_profile_id")
      .eq("stripe_account_id", accountId)
      .maybeSingle();
    if (!row) return;
    const account = event.type === "account.updated" ? obj : await stripe.accounts.retrieve(accountId);
    const caps = (account as { capabilities?: { transfers?: string } }).capabilities;
    const reqs = (account as { requirements?: { disabled_reason?: string | null } }).requirements;
    await svc.rpc("sync_contractor_stripe_account", {
      p_contractor_profile_id: row.contractor_profile_id,
      p_stripe_account_id: accountId,
      p_details_submitted: Boolean((account as { details_submitted?: boolean }).details_submitted),
      p_charges_enabled: Boolean((account as { charges_enabled?: boolean }).charges_enabled),
      p_payouts_enabled: Boolean((account as { payouts_enabled?: boolean }).payouts_enabled),
      p_disabled: Boolean(reqs?.disabled_reason),
      p_disabled_reason: reqs?.disabled_reason ?? null,
      p_transfers_capability: caps?.transfers ?? "unrequested",
    });
    return;
  }

  if (event.type.startsWith("transfer.")) {
    const stripeTransferId = String(obj.id ?? "");
    const { data: row } = await svc
      .from("contractor_transfers")
      .select("id")
      .eq("stripe_transfer_id", stripeTransferId)
      .maybeSingle();
    if (!row) return;
    const status =
      event.type === "transfer.reversed" ? "reversed" : String(obj.reversed === true ? "reversed" : obj.status ?? "pending");
    await svc.rpc("apply_transfer_update", {
      p_transfer_id: row.id,
      p_stripe_transfer_id: stripeTransferId,
      p_status: status,
    });
  }
}
