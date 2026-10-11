import { dollarsToCents } from "./fees";
import { CHANGE_ORDER_STATUSES, type ChangeOrderStatus } from "./types";

export const CHANGE_ORDER_AMOUNT_ERROR = "Enter an amount other than $0.";
export const CHANGE_ORDER_CAP_ERROR = "Enter an amount of $100,000 or less.";
export const CHANGE_ORDER_DECREASE_ERROR = "A decrease can't be larger than the current job total.";
export const CHANGE_ORDER_DESCRIPTION_ERROR = "Please describe the change (at least 3 characters).";
export const CHANGE_ORDER_DESCRIPTION_LENGTH_ERROR = "Keep the description to 1,000 characters or less.";
export const CHANGE_ORDER_SAVE_ERROR = "Could not save that change. Please try again.";
export const CHANGE_ORDER_APPROVE_ERROR = "Could not approve this change. Please try again.";
export const CHANGE_ORDER_REJECT_ERROR = "Could not decline this change. Please try again.";
export const CHANGE_ORDER_ACK_ERROR = "Could not acknowledge this change. Please try again.";

/** Default matches platform_settings.change_order_max_abs_cents. The server is authoritative. */
export const CHANGE_ORDER_MAX_ABS_CENTS = 10_000_000;

export function validateChangeOrderDraft(
  amount: string,
  description: string,
  options?: { maxAbsCents?: number; jobTotalCents?: number | null },
):
  | { ok: true; cents: number; description: string }
  | { ok: false; amountError: string | null; descriptionError: string | null } {
  const maxAbsCents = options?.maxAbsCents ?? CHANGE_ORDER_MAX_ABS_CENTS;
  const cents = parseChangeOrderCents(amount);
  let amountError: string | null = null;
  if (cents == null || cents === 0) {
    amountError = CHANGE_ORDER_AMOUNT_ERROR;
  } else if (cents > maxAbsCents || cents < -maxAbsCents) {
    amountError = CHANGE_ORDER_CAP_ERROR;
  } else if (
    options?.jobTotalCents != null &&
    cents < 0 &&
    cents < -options.jobTotalCents
  ) {
    amountError = CHANGE_ORDER_DECREASE_ERROR;
  }
  const cleaned = description.trim();
  const descriptionError =
    cleaned.length < 3
      ? CHANGE_ORDER_DESCRIPTION_ERROR
      : cleaned.length > 1000
        ? CHANGE_ORDER_DESCRIPTION_LENGTH_ERROR
        : null;
  if (amountError || descriptionError || cents == null) {
    return { ok: false, amountError, descriptionError };
  }
  return {
    ok: true,
    cents,
    description: cleaned,
  };
}

function parseChangeOrderCents(amount: string): number | null {
  const trimmed = amount.trim().replace(/[$,]/g, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const magnitude = dollarsToCents(trimmed.replace(/^-/, ""));
  if (magnitude == null) return null;
  return negative ? -magnitude : magnitude;
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

/** Whose turn a row is. A customer proposal is inserted as CUSTOMER_APPROVED. */
export function changeOrderNeedsThisParty(
  role: "customer" | "contractor",
  order: { status: string; contractor_acked_at?: string | null },
): boolean {
  if (role === "contractor") {
    return order.status === "CUSTOMER_APPROVED" && !order.contractor_acked_at;
  }
  return order.status === "PROPOSED";
}

export function countChangeOrdersForParty(
  role: "customer" | "contractor",
  orders: { status: string; contractor_acked_at?: string | null }[],
): number {
  return orders.filter((order) => changeOrderNeedsThisParty(role, order)).length;
}

export function changeOrderPartyLabel(
  role: "customer" | "contractor",
  order: { status: string; contractor_acked_at?: string | null },
): string {
  if (order.status === "APPROVED") return "Approved";
  if (order.status === "REJECTED") return "Declined";
  if (order.status === "CANCELLED") return "Cancelled";
  if (role === "contractor" && order.status === "PROPOSED") return "Waiting for customer";
  if (role === "contractor" && order.status === "CUSTOMER_APPROVED" && !order.contractor_acked_at) {
    return "Needs your OK";
  }
  if (role === "customer" && order.status === "PROPOSED") return "Needs your OK";
  if (role === "customer" && order.status === "CUSTOMER_APPROVED") return "Waiting for the pro";
  return order.status;
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
