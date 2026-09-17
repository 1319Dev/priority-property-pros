import type { ConnectAccountStatus, PaymentScheduleItemStatus, TransferStatus } from "./types";

export function customerCanPayBooking(input: {
  actorId: string | null;
  bookingCustomerId: string;
  bookingId: string;
  requestedBookingId: string;
}): boolean {
  if (!input.actorId) return false;
  if (input.requestedBookingId !== input.bookingId) return false;
  return input.actorId === input.bookingCustomerId;
}

export function contractorCanStartPayoutOnboarding(input: {
  actorContractorProfileId: string | null;
  targetContractorProfileId: string;
}): boolean {
  if (!input.actorContractorProfileId) return false;
  return input.actorContractorProfileId === input.targetContractorProfileId;
}

export function clientCanSetFeeOrEarnings(): boolean {
  return false;
}

export function clientCanMarkPaymentSucceeded(): boolean {
  return false;
}

export function clientCanConfirmBooking(): boolean {
  return false;
}

export function clientCanIssueRefund(): boolean {
  return false;
}

export function clientCanExecuteTransfer(): boolean {
  return false;
}

export function transferAllowed(input: {
  connectStatus: ConnectAccountStatus;
  transferStatus: TransferStatus;
  itemStatus: PaymentScheduleItemStatus;
  held: boolean;
}): boolean {
  if (input.held) return false;
  if (input.connectStatus !== "READY") return false;
  if (input.itemStatus !== "SUCCEEDED") return false;
  return input.transferStatus === "ELIGIBLE";
}

export function duplicateTransferBlocked(existingStripeTransferId: string | null): boolean {
  return Boolean(existingStripeTransferId);
}

export function heldMoneyIsNotAvailable(status: TransferStatus): boolean {
  return status !== "TRANSFERRED";
}

export function displayTransferAsAvailable(status: TransferStatus): boolean {
  return status === "TRANSFERRED";
}
