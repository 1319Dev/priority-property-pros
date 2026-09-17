import type { AccountType } from "../auth/types";
import { BOOKING_STATUSES, type BookingStatus } from "./types";

export { BOOKING_STATUSES };

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "Waiting for payment",
  AWAITING_PAYMENT: "Waiting for payment",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
};

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED", "DISPUTED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED", "DISPUTED"],
  COMPLETED: ["DISPUTED"],
  CANCELLED: [],
  DISPUTED: [],
};

export type BookingActorRole = AccountType | "ADMIN" | "CUSTOMER" | "CONTRACTOR" | "VERIFIER";

export function allowedBookingTransitions(from: BookingStatus): BookingStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Production UI never treats confirm as a customer/contractor payment success. */
export function canConfirmBooking(actor: { accountType: BookingActorRole | null; paymentsLive?: boolean }): boolean {
  if (actor.paymentsLive) return false;
  return actor.accountType === "ADMIN";
}

export function canCustomerCancelPending(status: BookingStatus): boolean {
  return status === "PENDING" || status === "AWAITING_PAYMENT";
}

export function canStartBooking(actor: BookingActorRole | null, status: BookingStatus): boolean {
  return (actor === "CONTRACTOR" || actor === "ADMIN") && status === "CONFIRMED";
}

export function canCompleteBooking(actor: BookingActorRole | null, status: BookingStatus): boolean {
  return (actor === "CONTRACTOR" || actor === "CUSTOMER" || actor === "ADMIN") && status === "IN_PROGRESS";
}

export function canDisputeBooking(actor: BookingActorRole | null, status: BookingStatus): boolean {
  if (actor !== "CUSTOMER" && actor !== "CONTRACTOR" && actor !== "ADMIN") return false;
  return status === "CONFIRMED" || status === "IN_PROGRESS" || status === "COMPLETED";
}

export function bookingUnlocksContact(status: BookingStatus): boolean {
  return status === "CONFIRMED" || status === "IN_PROGRESS" || status === "COMPLETED" || status === "DISPUTED";
}

export function bookingIsAbandoned(status: BookingStatus, expiresAt: string | null, nowMs = Date.now()): boolean {
  if (status !== "PENDING" && status !== "AWAITING_PAYMENT") return false;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= nowMs;
}

export function paymentsComingSoonCopy(): string {
  return "Online payment setup is coming soon.";
}

export function clientCannotSpoofConfirmed(): boolean {
  return true;
}
