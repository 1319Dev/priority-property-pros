import type { AccountType } from "../auth/types";
import { isStagingAppEnv } from "../supabase/config";
import { CHARGES_LIVE, PAYMENTS_LIVE, BOOKING_STATUSES, type BookingStatus } from "./types";

export { BOOKING_STATUSES };

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "Pre-booking",
  AWAITING_PAYMENT: "Pre-booking",
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

/** Customer-facing pause: flags off, or any staging preview. */
export function paymentsArePaused(input?: {
  paymentsLive?: boolean;
  chargesLive?: boolean;
  appEnv?: string;
}): boolean {
  const paymentsLive = input?.paymentsLive ?? PAYMENTS_LIVE;
  const chargesLive = input?.chargesLive ?? CHARGES_LIVE;
  if (!paymentsLive || !chargesLive) return true;
  return isStagingAppEnv(input?.appEnv);
}

export function preBookingHeadline(): string {
  return "This is not a confirmed booking.";
}

export function preBookingTitle(): string {
  return "Payment setup is paused";
}

export function selectionDoesNotConfirmCopy(): string {
  return "Selecting a pro starts a pending booking. It does not confirm the job, take payment, or share your contact details.";
}

export function contactLockedUntilConfirmedCopy(): string {
  return "The contractor cannot see your exact address, phone, or email until the booking is confirmed.";
}

export function customerPayPath(bookingId: string): string {
  return `/app/customer/bookings/${bookingId}/pay`;
}

export function customerPreBookingPath(projectId: string): string {
  return `/app/customer/projects/${projectId}/pre-booking`;
}

export function bookingIdFromSelectResult(result: { booking_id?: unknown } | null | undefined): string | null {
  const id = result?.booking_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** After hire/select, send the customer to the gated pay screen — never a live Stripe checkout. */
export function afterSelectEstimatePath(input: {
  projectId: string;
  bookingId?: string | null;
  paymentsPaused?: boolean;
}): string {
  const paused = input.paymentsPaused ?? paymentsArePaused();
  if (paused && input.bookingId) return customerPayPath(input.bookingId);
  if (paused) return customerPreBookingPath(input.projectId);
  return input.bookingId ? `/app/customer/bookings/${input.bookingId}` : `/app/customer/projects/${input.projectId}`;
}

export function clientCannotSpoofConfirmed(): boolean {
  return true;
}
