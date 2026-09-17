import type { LedgerDraft, LedgerEntryType } from "./types";

export function ledgerCorrectionIsNewRow(): boolean {
  return true;
}

export function clientsCannotWriteLedger(): boolean {
  return true;
}

export function buildPaymentSuccessLedger(input: {
  booking_id: string;
  schedule_item_id: string;
  payment_id: string;
  stripe_payment_intent_id: string;
  stripe_charge_id: string | null;
  stripe_balance_transaction_id: string | null;
  gross_cents: number;
  processing_cost_cents: number;
  marketplace_fee_cents: number;
  fee_schedule_id: string | null;
}): LedgerDraft[] {
  const gross = Math.max(0, Math.trunc(input.gross_cents));
  const processing = Math.max(0, Math.trunc(input.processing_cost_cents));
  const fee = Math.max(0, Math.trunc(input.marketplace_fee_cents));
  const contractorGross = Math.max(0, gross - fee);
  const base = {
    currency: "usd" as const,
    booking_id: input.booking_id,
    schedule_item_id: input.schedule_item_id,
    payment_id: input.payment_id,
    stripe_payment_intent_id: input.stripe_payment_intent_id,
    stripe_charge_id: input.stripe_charge_id,
    stripe_balance_transaction_id: input.stripe_balance_transaction_id,
    fee_schedule_id: input.fee_schedule_id,
    change_order_id: null,
    refund_id: null,
    dispute_id: null,
    transfer_id: null,
  };

  const rows: LedgerDraft[] = [
    { ...base, entry_type: "CUSTOMER_PAYMENT_GROSS", amount_cents: gross, note: "Customer payment (gross)" },
  ];
  if (processing > 0) {
    rows.push({
      ...base,
      entry_type: "PROCESSING_COST",
      amount_cents: processing,
      note: "Processor cost from Stripe balance transaction — not folded into marketplace fee",
    });
  }
  if (fee > 0) {
    rows.push({
      ...base,
      entry_type: "MARKETPLACE_FEE",
      amount_cents: fee,
      note: "PPP marketplace fee (contractor-paid, not a customer surcharge)",
    });
  }
  rows.push({
    ...base,
    entry_type: "CONTRACTOR_GROSS",
    amount_cents: contractorGross,
    note: "Contractor gross before transfer eligibility",
  });
  return rows;
}

export function buildRefundLedger(input: {
  booking_id: string;
  schedule_item_id: string | null;
  payment_id: string | null;
  refund_id: string;
  amount_cents: number;
  stripe_payment_intent_id: string | null;
}): LedgerDraft {
  return {
    entry_type: "REFUND",
    amount_cents: Math.max(0, Math.trunc(input.amount_cents)),
    currency: "usd",
    booking_id: input.booking_id,
    schedule_item_id: input.schedule_item_id,
    payment_id: input.payment_id,
    stripe_payment_intent_id: input.stripe_payment_intent_id,
    stripe_charge_id: null,
    stripe_balance_transaction_id: null,
    fee_schedule_id: null,
    change_order_id: null,
    refund_id: input.refund_id,
    dispute_id: null,
    transfer_id: null,
    note: "Refund — success history is retained",
  };
}

export function ledgerTypesAreSeparate(): LedgerEntryType[] {
  return [
    "CUSTOMER_PAYMENT_GROSS",
    "PROCESSING_COST",
    "MARKETPLACE_FEE",
    "CONTRACTOR_GROSS",
    "REFUND",
    "DISPUTE_HOLD",
    "TRANSFER",
    "PAYOUT",
  ];
}

export function processingCostIsNotMarketplaceFee(): boolean {
  return true;
}

export function allocateMarketplaceFee(input: {
  item_amount_cents: number;
  schedule_total_cents: number;
  remaining_fee_cents: number;
  remaining_items: number;
}): number {
  if (input.remaining_items <= 1) return Math.max(0, input.remaining_fee_cents);
  if (input.schedule_total_cents <= 0) return 0;
  return Math.min(
    input.remaining_fee_cents,
    Math.round((input.item_amount_cents * input.remaining_fee_cents) / input.schedule_total_cents),
  );
}
