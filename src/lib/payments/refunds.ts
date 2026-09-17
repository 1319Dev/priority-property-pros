import type { RefundDecision } from "./types";

export function refundDeletesSuccessHistory(): boolean {
  return false;
}

export function refundsAreServerSideOnly(): boolean {
  return true;
}

export function refundAmountValid(input: { refund_cents: number; captured_cents: number; already_refunded_cents: number }): boolean {
  if (input.refund_cents <= 0) return false;
  return input.refund_cents <= input.captured_cents - input.already_refunded_cents;
}

export function complexPostWorkNeedsReview(decision: RefundDecision): boolean {
  return decision === "PENDING_REVIEW";
}
