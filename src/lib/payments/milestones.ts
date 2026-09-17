import type { PaymentScheduleItemKind, PaymentScheduleItemStatus } from "./types";

export function contractorCanSelfApproveMilestone(): boolean {
  return false;
}

export function canMarkMilestoneComplete(input: {
  actor: "CONTRACTOR" | "CUSTOMER" | "ADMIN";
  kind: PaymentScheduleItemKind;
  status: PaymentScheduleItemStatus;
}): boolean {
  if (input.kind !== "MILESTONE") return false;
  if (input.status === "SUCCEEDED" || input.status === "CANCELLED") return false;
  return input.actor === "CONTRACTOR" || input.actor === "ADMIN";
}

export function canApproveMilestone(input: {
  actor: "CONTRACTOR" | "CUSTOMER" | "ADMIN";
  kind: PaymentScheduleItemKind;
  contractorCompleted: boolean;
  alreadyApproved: boolean;
}): boolean {
  if (input.kind !== "MILESTONE") return false;
  if (!input.contractorCompleted || input.alreadyApproved) return false;
  return input.actor === "CUSTOMER" || input.actor === "ADMIN";
}

export function milestoneBecomesDue(input: {
  contractorCompleted: boolean;
  customerApproved: boolean;
  requiresCustomerApproval: boolean;
}): boolean {
  if (!input.contractorCompleted) return false;
  if (input.requiresCustomerApproval) return input.customerApproved;
  return true;
}
