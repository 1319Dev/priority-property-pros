import type { AccountType } from "../auth/types";
import { BOOKING_STATUSES, type BookingStatus, type ContactAccessStatus } from "./types";

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

/** Booking status alone never unlocks private contact. Use contactAccessAllowsReveal. */
export function bookingUnlocksContact(status: BookingStatus): boolean {
  void status;
  return false;
}

export function contactAccessAllowsReveal(status: ContactAccessStatus | null | undefined): boolean {
  return status === "UNLOCKED" || status === "ADMIN_OVERRIDE";
}

export function privateContactLockedCopy(): string {
  return "Private street, phone, and email stay locked until the hired contractor has job-fee access (payments coming soon) or an admin unlocks this specific booking.";
}

export function privateContactHintCopy(): string {
  return "Stays private until hire + job fee (payments coming soon) or an admin unlock.";
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
