import type { AccountType } from "../auth/types";
import type { SignupFeeStatus } from "../signupFee/constants";
import { NOTIFICATION_CATEGORY_COPY, type NotificationCategory } from "../notifications/policy";
import { hiredJobChip } from "./hiredJobs";
import { jobContactWasShared } from "./contactShare";
import { coerceProjectReference, formatProjectReference } from "./projectReference";
import { accountTypeLabel } from "./statusLabels";
import type { BookingStatus } from "./types";

/** Collapsed label. Both amounts stay visible before the note is opened. */
export const HOW_FEES_WORK_SUMMARY = "How fees work — $9.99 activation, $4.99 to connect";

export const HOW_FEES_WORK_BODY =
  "The $9.99 account activation is one-time and non-refundable. It is not a monthly fee. After that, browsing jobs is $0/month. Pay $4.99 only when you choose to connect. That connection fee is non-refundable and does not guarantee a hire. Priority Property Pros does not take a percentage of the job. The customer pays you directly.";

export const HISTORY_JOBS_COPY =
  "Passed, closed, and cancelled jobs stay here. The title and PPP number show when they are still available to you.";

export const CONTRACTOR_CONTACT_LOCKED_COPY =
  "Project contact is locked. Street, phone, and email stay hidden until you have a paid $4.99 connection on this job, or an admin unlocks this record.";

export const CONTRACTOR_CONTACT_WAITING_COPY =
  "The customer has not shared contact yet. Phone, email, and street stay hidden until they choose to share.";

export const MARK_COMPLETE_TITLE = "Mark this job complete?";

export const MARK_COMPLETE_BODY =
  "This tells the customer the work is finished. It does not charge anyone, and it does not change your $4.99 connection. You can still leave a review.";

export const MARK_COMPLETE_CONFIRM = "Mark complete";

export const MARK_COMPLETE_CANCEL = "Not yet";

export const PROFILE_NUDGE = "Add a photo, a headline, and a short bio so customers know who they are hiring.";

export const CREDENTIALS_EMPTY = "No credentials on file yet. Add a license or insurance when you are ready.";

export const CONTRACTOR_CONNECT_ALERT =
  "When you connect on a job, and when a customer shares contact.";

export function accountRoleNote(accountType: AccountType | null | undefined): string {
  return `Your role is ${accountTypeLabel(accountType)}. This site cannot change it.`;
}

export function formatActivationDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function activationStatusLine(input: {
  status?: SignupFeeStatus | null;
  paidAt?: string | null;
}): { text: string; showActivate: boolean } {
  if (input.status === "PAID") {
    const when = formatActivationDate(input.paidAt);
    return { text: when ? `Activation: Paid on ${when}` : "Activation: Paid", showActivate: false };
  }
  if (input.status === "UNPAID") return { text: "Activation: Not activated", showActivate: true };
  return { text: "Activation: Not required", showActivate: false };
}

export function notificationCategoryDescription(
  category: NotificationCategory,
  accountType: AccountType | null | undefined,
): string {
  if (category === "connect" && accountType === "CONTRACTOR") return CONTRACTOR_CONNECT_ALERT;
  return NOTIFICATION_CATEGORY_COPY[category].description;
}

export type HiredBookingRef = {
  project_id: string;
  status: string;
  customer_hired_at?: string | null;
  contractor_hired_at?: string | null;
};

/** Projects that already have a hired booking should leave the Open jobs list. */
export function hiredProjectIdSet(bookings: readonly HiredBookingRef[]): Set<string> {
  const ids = new Set<string>();
  for (const booking of bookings) {
    if (
      hiredJobChip({
        bookingStatus: booking.status as BookingStatus,
        customerHiredAt: booking.customer_hired_at,
        contractorHiredAt: booking.contractor_hired_at,
      })
    ) {
      ids.add(booking.project_id);
    }
  }
  return ids;
}

export function formatPhoneDisplay(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return raw;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

export function serviceAreaBaseZip(area: {
  center_zip?: string | null;
  zip_codes?: string[] | null;
  label?: string | null;
} | null | undefined): string {
  const center = (area?.center_zip ?? "").replace(/\D/g, "");
  if (center.length >= 5) return center.slice(0, 5);
  for (const zip of area?.zip_codes ?? []) {
    const digits = zip.replace(/\D/g, "");
    if (digits.length >= 5) return digits.slice(0, 5);
  }
  const fromLabel = (area?.label ?? "").match(/\b(\d{5})(?:-\d{4})?\b/);
  return fromLabel?.[1] ?? "";
}

export function customerPlaceLine(name: string | null | undefined, city: string): string {
  const who = (name ?? "").replace(/\s+/g, " ").trim();
  if (!who || /^customer$/i.test(who)) return `Customer · ${city}`;
  return `Customer · ${who} · ${city}`;
}

export function changeOrderStatusLabel(status: string): string {
  if (status === "REJECTED") return "Declined";
  return status
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function changeOrderAmountLabel(cents: number, formatUsd: (value: number) => string): string {
  if (cents === 0) return "No price change";
  return formatUsd(cents);
}

export function friendlyTimestamp(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (diffMin >= 0 && diffMin < 1) return "Just now";
  if (diffMin >= 0 && diffMin < 60) return `${diffMin}m ago`;
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (diffMin >= 0 && sameDay) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function noticeBody(title: string, body: string | null | undefined): string | null {
  const next = (body ?? "").trim();
  if (!next) return null;
  if (next.toLowerCase() === title.trim().toLowerCase()) return null;
  return next;
}

export function noticeProjectLine(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  const title = typeof payload.project_title === "string" ? payload.project_title.trim() : "";
  const reference = formatProjectReference(
    coerceProjectReference(payload.project_reference_number ?? payload.reference_number),
  );
  const parts = [title, reference].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type ProjectContactFields = {
  name: string;
  street: string;
  phone: string;
  email: string;
};

export type ProjectContactView =
  | { state: "shared"; contact: ProjectContactFields }
  | { state: "waiting" }
  | { state: "locked" };

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Display state from `booking_job_contact` only.
 * A thrown or empty RPC is locked. Entitlement rules stay on the server.
 */
export function projectContactFromRpc(payload: Record<string, unknown> | null | undefined): ProjectContactView {
  if (!payload) return { state: "locked" };
  if (jobContactWasShared(payload)) {
    const street = [textField(payload.street_line1), textField(payload.street_line2)].filter(Boolean).join(", ");
    const name = [textField(payload.first_name), textField(payload.last_name)].filter(Boolean).join(" ");
    return {
      state: "shared",
      contact: {
        name,
        street,
        phone: textField(payload.phone),
        email: textField(payload.email),
      },
    };
  }
  const status = payload.contact_access_status;
  const unlocked =
    payload.unlocked === true || status === "UNLOCKED" || status === "ADMIN_OVERRIDE";
  if (unlocked) return { state: "waiting" };
  return { state: "locked" };
}
