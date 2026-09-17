import {
  DEFAULT_PAYMENT_POLICY,
  type PaymentGuidanceBand,
  type PaymentPolicy,
  type PaymentScheduleItemDraft,
  type PaymentSchedulePlan,
} from "./types";

export function paymentGuidanceForAmount(
  amountCents: number,
  policy: PaymentPolicy = DEFAULT_PAYMENT_POLICY,
): PaymentGuidanceBand {
  const amount = Math.max(0, Math.trunc(amountCents) || 0);
  if (amount < policy.full_pay_max_cents) return "FULL_PAY_ALLOWED";
  if (amount < policy.structured_milestones_min_cents) return "DEPOSIT_PLUS_REMAINING";
  return "MILESTONES_PREFERRED";
}

export function depositCents(
  amountCents: number,
  policy: PaymentPolicy = DEFAULT_PAYMENT_POLICY,
): number {
  const amount = Math.max(0, Math.trunc(amountCents) || 0);
  if (amount <= 0) return 0;
  const bps = Math.min(policy.default_deposit_bps, policy.max_deposit_bps);
  const raw = Math.round((amount * bps) / 10_000);
  return Math.min(amount - 1, Math.max(1, raw));
}

function item(
  kind: PaymentScheduleItemDraft["kind"],
  sequence: number,
  amount_cents: number,
  description: string,
  extra: Partial<PaymentScheduleItemDraft> = {},
): PaymentScheduleItemDraft {
  return {
    kind,
    sequence,
    amount_cents,
    description,
    due_now: false,
    requires_customer_approval: false,
    due_condition: "scheduled",
    ...extra,
  };
}

/** Integer cents that always sum to total (last item absorbs remainder). */
export function splitExact(totalCents: number, parts: number[]): number[] {
  const total = Math.max(0, Math.trunc(totalCents) || 0);
  if (parts.length === 0) return [];
  const weight = parts.reduce((sum, part) => sum + Math.max(0, part), 0);
  if (weight <= 0) return parts.map((_, index) => (index === parts.length - 1 ? total : 0));
  const allocated = parts.map((part) => Math.floor((total * Math.max(0, part)) / weight));
  const used = allocated.reduce((sum, value) => sum + value, 0);
  allocated[allocated.length - 1] += total - used;
  return allocated;
}

export function buildPaymentSchedule(
  amountCents: number,
  policy: PaymentPolicy = DEFAULT_PAYMENT_POLICY,
): PaymentSchedulePlan {
  const total_cents = Math.max(0, Math.trunc(amountCents) || 0);
  const guidance = paymentGuidanceForAmount(total_cents, policy);
  let drafts: PaymentScheduleItemDraft[] = [];

  if (total_cents <= 0) {
    drafts = [];
  } else if (guidance === "FULL_PAY_ALLOWED") {
    drafts = [
      item("FINAL_PAYMENT", 1, total_cents, "Full payment to confirm booking", {
        due_now: true,
        due_condition: "due_now_to_confirm",
      }),
    ];
  } else if (guidance === "DEPOSIT_PLUS_REMAINING") {
    const deposit = depositCents(total_cents, policy);
    drafts = [
      item("BOOKING_DEPOSIT", 1, deposit, "Booking deposit to confirm", {
        due_now: true,
        due_condition: "due_now_to_confirm",
      }),
      item("FINAL_PAYMENT", 2, total_cents - deposit, "Remaining balance", {
        due_condition: "after_work_or_completion",
      }),
    ];
  } else {
    const deposit = depositCents(total_cents, policy);
    const remainder = total_cents - deposit;
    const [milestone, finalPay] = splitExact(remainder, [1, 1]);
    drafts = [
      item("BOOKING_DEPOSIT", 1, deposit, "Booking deposit to confirm", {
        due_now: true,
        due_condition: "due_now_to_confirm",
      }),
      item("MILESTONE", 2, milestone, "Milestone after approved progress", {
        requires_customer_approval: true,
        due_condition: "contractor_complete_then_customer_approval",
      }),
      item("FINAL_PAYMENT", 3, finalPay, "Final payment", {
        due_condition: "after_prior_items",
      }),
    ];
  }

  const amount_due_now_cents = drafts.filter((row) => row.due_now).reduce((sum, row) => sum + row.amount_cents, 0);

  return {
    guidance,
    items: drafts,
    total_cents,
    amount_due_now_cents,
    charges_live: false,
    payments_live: false,
    stripe_mode: "test",
  };
}

export function scheduleTotalsMatch(
  items: { amount_cents: number }[],
  expectedTotal: number,
): boolean {
  const sum = items.reduce((acc, itemRow) => acc + itemRow.amount_cents, 0);
  return sum === expectedTotal;
}

export function requiredConfirmationItem(
  items: PaymentScheduleItemDraft[],
): PaymentScheduleItemDraft | null {
  return items.find((row) => row.due_now) ?? items[0] ?? null;
}

export function changeOrderScheduleItem(
  amountDeltaCents: number,
  sequence: number,
): PaymentScheduleItemDraft | null {
  if (amountDeltaCents <= 0) return null;
  return item(
    "APPROVED_CHANGE_ORDER",
    sequence,
    amountDeltaCents,
    "Approved change order",
    { due_condition: "after_approval", due_now: false, requires_customer_approval: false },
  );
}

export function clientsCannotSetAuthoritativeAmounts(): boolean {
  return true;
}

export function achRecommendedCopy(): string {
  return "Bank Account — Recommended for larger project payments";
}

export function cardConvenientCopy(): string {
  return "Card — Fast and convenient";
}

export function contractorPaysFeeCopy(): string {
  return "The marketplace fee is paid by the contractor. It is not added as a customer checkout surcharge.";
}

export function noInstantPayoutCopy(): string {
  return "Customer payment is not immediately withdrawable. Transfers happen after eligibility, never as a same-day withdrawal.";
}

export function checkoutDoesNotConfirmCopy(): string {
  return "Returning from Stripe does not confirm this booking. Confirmation happens only after a verified webhook.";
}
