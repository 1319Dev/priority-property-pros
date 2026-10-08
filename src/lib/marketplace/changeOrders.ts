import { dollarsToCents } from "./fees";
import { CHANGE_ORDER_STATUSES, type ChangeOrderStatus } from "./types";

export const CHANGE_ORDER_AMOUNT_ERROR = "Enter an amount other than $0.";
export const CHANGE_ORDER_DESCRIPTION_ERROR = "Please describe the change (at least 3 characters).";
export const CHANGE_ORDER_SAVE_ERROR = "Could not save that change. Please try again.";
export const CHANGE_ORDER_APPROVE_ERROR = "Could not approve this change. Please try again.";
export const CHANGE_ORDER_REJECT_ERROR = "Could not decline this change. Please try again.";
export const CHANGE_ORDER_ACK_ERROR = "Could not acknowledge this change. Please try again.";

export function validateChangeOrderDraft(
  amount: string,
  description: string,
):
  | { ok: true; cents: number; description: string }
  | { ok: false; amountError: string | null; descriptionError: string | null } {
  const trimmedAmount = amount.trim();
  const negative = trimmedAmount.startsWith("-");
  const magnitude = dollarsToCents(trimmedAmount.replace(/^-/, ""));
  const amountError = magnitude == null || magnitude === 0 ? CHANGE_ORDER_AMOUNT_ERROR : null;
  const cleaned = description.trim();
  const descriptionError = cleaned.length < 3 ? CHANGE_ORDER_DESCRIPTION_ERROR : null;
  if (amountError || descriptionError || magnitude == null) {
    return { ok: false, amountError, descriptionError };
  }
  return {
    ok: true,
    cents: negative ? -magnitude : magnitude,
    description: cleaned,
  };
}

export { CHANGE_ORDER_STATUSES };

export function contractorCanUnilaterallyIncrease(): boolean {
  return false;
}

export function changeOrderNeedsCustomerApproval(deltaCents: number, createdBy: "CUSTOMER" | "CONTRACTOR"): boolean {
  if (createdBy === "CUSTOMER") return false;
  return deltaCents !== 0;
}

export function changeOrderNeedsContractorAck(createdBy: "CUSTOMER" | "CONTRACTOR"): boolean {
  return createdBy === "CUSTOMER";
}

export function isApprovedChangeOrder(status: ChangeOrderStatus): boolean {
  return status === "APPROVED";
}

export function canClientSetChangeOrderApproved(): boolean {
  return false;
}

export function nextChangeOrderStatus(input: {
  createdBy: "CUSTOMER" | "CONTRACTOR";
  customerApproved: boolean;
  contractorAcked: boolean;
  rejected: boolean;
}): ChangeOrderStatus {
  if (input.rejected) return "REJECTED";
  if (input.customerApproved && input.contractorAcked) return "APPROVED";
  if (input.createdBy === "CONTRACTOR" && input.customerApproved && !input.contractorAcked) {
    return "CUSTOMER_APPROVED";
  }
  if (input.createdBy === "CUSTOMER" && input.customerApproved && !input.contractorAcked) {
    return "CUSTOMER_APPROVED";
  }
  return "PROPOSED";
}
