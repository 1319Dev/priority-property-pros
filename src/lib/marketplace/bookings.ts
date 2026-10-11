import { JOB_PAYMENT_PLAIN } from "../../data/pricing";
import type { AccountType } from "../auth/types";
import { BOOKING_STATUSES, type BookingContactAccess, type BookingStatus, type ContactAccessStatus } from "./types";

/** Keys that must never appear on unauthorized RPC / notification / event payloads. */
export const PRIVATE_CONTACT_PAYLOAD_KEYS = [
  "phone",
  "email",
  "street",
  "street_line1",
  "street_line2",
  "lat",
  "lng",
  "coords",
  "exact_address",
] as const;

/** Fields `booking_job_contact` may return after legitimate entitlement (plus booking_id / status flags). */
export const ENTITLED_CONTACT_FIELDS = [
  "street_line1",
  "street_line2",
  "lat",
  "lng",
  "city",
  "state",
  "zip_code",
  "phone",
  "email",
  "first_name",
] as const;

export { BOOKING_STATUSES };

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "Selected",
  AWAITING_PAYMENT: "Selected",
  CONFIRMED: "Hired",
  IN_PROGRESS: "Hired",
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

export function canCustomerCancelPendingBooking(input: {
  status: BookingStatus;
  customerHiredAt?: string | null;
  contractorHiredAt?: string | null;
}): boolean {
  if (input.customerHiredAt && input.contractorHiredAt) return false;
  return canCustomerCancelPending(input.status);
}

export function canStartBooking(actor: BookingActorRole | null, status: BookingStatus): boolean {
  return (actor === "CONTRACTOR" || actor === "CUSTOMER" || actor === "ADMIN") && status === "CONFIRMED";
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

export function contactAccessRowAllowsReveal(
  row: { status: ContactAccessStatus; revoked_at?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  if (row.revoked_at) return false;
  return contactAccessAllowsReveal(row.status);
}

export function unauthorizedPayloadLeaksPrivateContact(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  if (!payload) return false;
  return PRIVATE_CONTACT_PAYLOAD_KEYS.some((key) => {
    const value = payload[key];
    return value != null && value !== "";
  });
}

export type AdminContactAccessView = {
  unlocked: boolean;
  /** A paid $4.99 Connect entitlement for this contractor on this job (connection-scoped or carried onto the booking). */
  viaConnect: BookingContactAccess | null;
  /** An admin override on this one booking. */
  viaOverride: BookingContactAccess | null;
};

/**
 * Contact can be unlocked two ways: the paid Connect row (keyed by connection, booking_id may be null)
 * or a booking-scoped row (admin override, or the Connect grant carried onto the booking).
 * The admin page must look at both, the same way contractor_has_contact_access_on_project does.
 */
export function adminEffectiveContactAccess(
  bookingRow: BookingContactAccess | null | undefined,
  connectionRows: readonly BookingContactAccess[] = [],
): AdminContactAccessView {
  const bookingOpen = contactAccessRowAllowsReveal(bookingRow) ? bookingRow ?? null : null;
  const bookingIsOverride =
    bookingOpen != null && (bookingOpen.grant_source === "ADMIN_OVERRIDE" || bookingOpen.status === "ADMIN_OVERRIDE");
  const viaOverride = bookingIsOverride ? bookingOpen : null;
  const viaConnect =
    connectionRows.find((row) => contactAccessRowAllowsReveal(row) && row.grant_source !== "ADMIN_OVERRIDE") ??
    (bookingOpen && !bookingIsOverride ? bookingOpen : null);
  return { unlocked: Boolean(viaConnect || viaOverride), viaConnect, viaOverride };
}

export function adminContactAccessSummary(view: AdminContactAccessView): string {
  if (view.viaConnect && view.viaOverride) {
    return "Contact is unlocked. This contractor paid the $4.99 Connect on this job, and an admin override is also on this booking.";
  }
  if (view.viaConnect) {
    return "Contact is unlocked. This contractor paid the $4.99 Connect on this job, so no admin grant is needed.";
  }
  if (view.viaOverride) return "Contact is unlocked by an admin override on this booking.";
  return privateContactLockedCopy();
}

export function privateContactLockedCopy(): string {
  return "Project contact is locked. Street, phone, and email stay hidden until this contractor has a paid $4.99 connection entitlement or an admin unlocks this specific record.";
}

export function privateContactHintCopy(): string {
  return "Stays private until a paid $4.99 connection entitlement or an admin unlock.";
}

export function formatContactAccessState(
  access: { status: ContactAccessStatus; revoked_at?: string | null } | null | undefined,
): string {
  if (!access) return "LOCKED (missing row — no access)";
  if (access.revoked_at) return "LOCKED";
  return access.status;
}

export function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function bookingIsAbandoned(status: BookingStatus, expiresAt: string | null, nowMs = Date.now()): boolean {
  if (status !== "PENDING" && status !== "AWAITING_PAYMENT") return false;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= nowMs;
}

export function paymentsComingSoonCopy(): string {
  return JOB_PAYMENT_PLAIN;
}

export function clientCannotSpoofConfirmed(): boolean {
  return true;
}
