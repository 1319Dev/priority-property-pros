import type { BookingStatus } from "../marketplace/types";
import type { CancellationCategory, RefundDecision } from "./types";

export function cancellationCategoryFor(input: {
  bookingStatus: BookingStatus;
  hasSucceededPayment: boolean;
  workStarted: boolean;
  hasMilestonePayment: boolean;
  initiator: "CUSTOMER" | "CONTRACTOR" | "ADMIN" | "SYSTEM" | "MUTUAL";
}): CancellationCategory {
  if (input.initiator === "MUTUAL") return "MUTUAL";
  if (input.initiator === "CONTRACTOR") return "CONTRACTOR_CANCELLED";
  if (!input.hasSucceededPayment) return "BEFORE_PAYMENT";
  if (input.hasMilestonePayment) return "AFTER_MILESTONE_PAYMENT";
  if (input.workStarted) return "AFTER_WORK_STARTED";
  if (input.initiator === "CUSTOMER") return "CUSTOMER_CANCELLED";
  return "AFTER_DEPOSIT_BEFORE_WORK";
}

export function autoRefundDecision(category: CancellationCategory): RefundDecision {
  if (category === "BEFORE_PAYMENT") return "NONE";
  return "PENDING_REVIEW";
}

export function abandonedBookingCreatesRelationship(): boolean {
  return false;
}

export function abandonedBookingUnlocksContact(): boolean {
  return false;
}

export function abandonedBookingOwesFee(): boolean {
  return false;
}

export function autoReopenExpiredEstimates(): boolean {
  return false;
}

export function estimateStillSelectable(input: {
  status: string;
  validUntil: string | null;
  nowMs?: number;
}): boolean {
  if (input.status !== "SUBMITTED" && input.status !== "REVISED") return false;
  if (!input.validUntil) return true;
  const now = input.nowMs ?? Date.now();
  return new Date(input.validUntil).getTime() > now;
}
