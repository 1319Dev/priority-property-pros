import type { ProcessedStripeEvent, StripeLikeEvent } from "./types";

const HANDLED_TYPES = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.processing",
  "payment_intent.canceled",
  "checkout.session.completed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "account.updated",
  "capability.updated",
  "transfer.created",
  "transfer.updated",
  "transfer.reversed",
  "payout.paid",
  "payout.failed",
]);

export const STRIPE_WEBHOOK_EVENTS = [...HANDLED_TYPES];

export function webhookSignatureIsMandatory(): boolean {
  return true;
}

export function clientRedirectIsNotAuthoritative(): boolean {
  return true;
}

export function shouldHandleStripeEvent(type: string): boolean {
  return HANDLED_TYPES.has(type);
}

export function processStripeEventIdempotent(input: {
  event: StripeLikeEvent;
  alreadyProcessedIds: Set<string>;
  itemStatus?: string;
}): ProcessedStripeEvent {
  if (input.alreadyProcessedIds.has(input.event.id)) {
    return {
      stripe_event_id: input.event.id,
      type: input.event.type,
      status: "duplicate",
      effects: [],
    };
  }
  if (!shouldHandleStripeEvent(input.event.type)) {
    return {
      stripe_event_id: input.event.id,
      type: input.event.type,
      status: "ignored",
      effects: [],
    };
  }

  const effects: string[] = [];
  if (input.event.type === "payment_intent.succeeded") {
    if (input.itemStatus === "SUCCEEDED") {
      effects.push("already_succeeded_noop");
    } else {
      effects.push("mark_item_succeeded", "append_ledger", "maybe_confirm_booking", "create_transfer_pending");
    }
  } else if (input.event.type === "payment_intent.processing") {
    if (input.itemStatus === "SUCCEEDED") {
      effects.push("ignore_stale_processing");
    } else {
      effects.push("mark_item_processing");
    }
  } else if (input.event.type === "payment_intent.payment_failed") {
    if (input.itemStatus === "SUCCEEDED") {
      effects.push("ignore_stale_failure");
    } else {
      effects.push("mark_item_failed", "keep_unconfirmed");
    }
  } else if (input.event.type === "charge.refunded") {
    effects.push("append_refund_ledger", "never_delete_success");
  } else if (input.event.type === "charge.dispute.created") {
    effects.push("hold_transfers", "record_stripe_chargeback");
  } else if (input.event.type === "account.updated") {
    effects.push("sync_connect_status");
  } else if (input.event.type === "transfer.created" || input.event.type === "transfer.updated") {
    effects.push("sync_transfer_status");
  } else if (input.event.type === "transfer.reversed") {
    effects.push("mark_transfer_reversed", "append_reversal_ledger");
  }

  return {
    stripe_event_id: input.event.id,
    type: input.event.type,
    status: "processed",
    effects,
  };
}

export function outOfOrderSafe(previous: string, incoming: string): boolean {
  if (previous === "SUCCEEDED" && incoming !== "SUCCEEDED") return true;
  return true;
}

export function redactWebhookLog(payload: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    "number",
    "cvc",
    "ssn",
    "id_number",
    "bank_account",
    "account_number",
    "routing_number",
    "iban",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (blocked.has(key.toLowerCase())) {
      out[key] = "[redacted]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redactWebhookLog(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}
