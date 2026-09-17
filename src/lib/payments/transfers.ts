import type { ConnectAccountStatus, PaymentScheduleItemKind, TransferStatus } from "./types";

export function initialTransferStatus(): TransferStatus {
  return "PENDING";
}

export function eligibilityAfterPayment(input: {
  kind: PaymentScheduleItemKind;
  bookingConfirmed: boolean;
  milestoneApproved: boolean;
  bookingCompleted: boolean;
  disputed: boolean;
}): TransferStatus {
  if (input.disputed) return "HELD";
  if (input.kind === "BOOKING_DEPOSIT" || input.kind === "FINAL_PAYMENT" || input.kind === "APPROVED_CHANGE_ORDER") {
    return input.bookingConfirmed ? "ELIGIBLE" : "PENDING";
  }
  if (input.kind === "MILESTONE") {
    return input.milestoneApproved && input.bookingConfirmed ? "ELIGIBLE" : "PENDING";
  }
  return "PENDING";
}

export function canCreateStripeTransfer(input: {
  status: TransferStatus;
  connectStatus: ConnectAccountStatus;
  existingStripeTransferId: string | null;
}): boolean {
  if (input.existingStripeTransferId) return false;
  if (input.connectStatus !== "READY") return false;
  return input.status === "ELIGIBLE";
}

export function nextTransferStatusOnCreate(): TransferStatus {
  return "TRANSFER_PENDING";
}
