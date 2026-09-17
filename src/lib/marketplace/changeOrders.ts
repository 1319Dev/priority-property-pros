import { CHANGE_ORDER_STATUSES, type ChangeOrderStatus } from "./types";

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
