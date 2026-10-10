import type { BookingStatus } from "./types";

export const HIRED_JOB_CHIPS = ["Hired", "Confirmed", "In progress", "Completed"] as const;
export type HiredJobChip = (typeof HIRED_JOB_CHIPS)[number];

export type HiredJobSource = {
  bookingId: string;
  projectId: string;
  bookingStatus: BookingStatus;
  customerHiredAt?: string | null;
  contractorHiredAt?: string | null;
  title: string;
  referenceNumber?: number | null;
  city?: string | null;
  /** First name already returned by the message inbox, or null when contact is still locked. */
  customerLabel?: string | null;
  pendingChangeOrders?: number;
};

export type HiredJobCardModel = {
  bookingId: string;
  projectId: string;
  title: string;
  referenceNumber: number | null;
  customerFirstName: string;
  city: string;
  chip: HiredJobChip;
  nextStep: string;
  href: string;
};

const CHIP_RANK: Record<HiredJobChip, number> = {
  "In progress": 0,
  Confirmed: 1,
  Hired: 2,
  Completed: 3,
};

export function hiredJobPath(bookingId: string): string {
  return `/app/pro/jobs/${bookingId}`;
}

export function hiredJobByProjectPath(projectId: string): string {
  return `/app/pro/jobs/project/${projectId}`;
}

export function isSafeRecordId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,80}$/.test(value);
}

/** Inbox labels are already a first name, or the word Customer when the name is withheld. */
export function customerFirstNameFromLabel(label: string | null | undefined): string {
  const text = (label ?? "").replace(/\s+/g, " ").trim();
  if (!text || /^customer$/i.test(text)) return "Customer";
  return text;
}

export function hiredJobChip(input: {
  bookingStatus: BookingStatus | null | undefined;
  customerHiredAt?: string | null;
  contractorHiredAt?: string | null;
}): HiredJobChip | null {
  const status = input.bookingStatus;
  if (!status || status === "CANCELLED") return null;
  if (status === "COMPLETED") return "Completed";
  if (status === "IN_PROGRESS") return "In progress";
  if (input.customerHiredAt && input.contractorHiredAt) return "Confirmed";
  if (status === "PENDING" || status === "AWAITING_PAYMENT" || status === "CONFIRMED" || status === "DISPUTED") {
    return "Hired";
  }
  return null;
}

export function hiredJobNextStep(input: {
  bookingStatus: BookingStatus | null | undefined;
  customerHiredAt?: string | null;
  contractorHiredAt?: string | null;
  pendingChangeOrders?: number;
}): string {
  const status = input.bookingStatus;
  if (!status || status === "CANCELLED") return "This job was cancelled.";
  if (status === "DISPUTED") return "Review the dispute on this job.";
  if (status === "COMPLETED") return "This job is complete.";
  if ((input.pendingChangeOrders ?? 0) > 0 && (status === "CONFIRMED" || status === "IN_PROGRESS")) {
    return "Review the change order.";
  }
  if (status === "IN_PROGRESS") return "Finish the work, then mark it complete.";
  if (!input.contractorHiredAt) return "Confirm hired.";
  if (!input.customerHiredAt) return "Waiting for the homeowner to confirm Hired.";
  return "Start the job when you are ready.";
}

export function toHiredJobCard(input: HiredJobSource): HiredJobCardModel | null {
  const chip = hiredJobChip(input);
  if (!chip || !isSafeRecordId(input.bookingId)) return null;
  const city = (input.city ?? "").trim();
  return {
    bookingId: input.bookingId,
    projectId: input.projectId,
    title: input.title.trim() || "Project",
    referenceNumber: input.referenceNumber ?? null,
    customerFirstName: customerFirstNameFromLabel(input.customerLabel),
    city: city || "City not listed",
    chip,
    nextStep: hiredJobNextStep(input),
    href: hiredJobPath(input.bookingId),
  };
}

export function sortHiredJobCards(cards: HiredJobCardModel[]): HiredJobCardModel[] {
  return [...cards].sort((a, b) => {
    const byChip = CHIP_RANK[a.chip] - CHIP_RANK[b.chip];
    if (byChip !== 0) return byChip;
    return a.title.localeCompare(b.title);
  });
}

export type HiredBookingRef = {
  id: string;
  project_id: string;
  status: BookingStatus | string;
  customer_hired_at?: string | null;
  contractor_hired_at?: string | null;
};

export function hiredBookingIdForProject(bookings: readonly HiredBookingRef[], projectId: string): string | null {
  const match = bookings.find((row) => {
    if (row.project_id !== projectId) return false;
    return Boolean(
      hiredJobChip({
        bookingStatus: row.status as BookingStatus,
        customerHiredAt: row.customer_hired_at,
        contractorHiredAt: row.contractor_hired_at,
      }),
    );
  });
  return match && isSafeRecordId(match.id) ? match.id : null;
}

function bookingIdFromPath(path: string): string | null {
  const match = /^\/app\/pro\/(?:jobs|bookings)\/([A-Za-z0-9-]{1,80})$/.exec(path);
  return match?.[1] ?? null;
}

/**
 * Contractor links for a hired job open the single job page.
 * Message links stay on Messages until a non-cancelled booking exists for that project.
 */
export function contractorHiredLandingPath(input: {
  kind: string;
  path: string;
  payload?: Record<string, unknown> | null;
  entityId?: string | null;
  bookings?: readonly HiredBookingRef[];
}): string {
  const payload = input.payload ?? {};
  const projectId = typeof payload.project_id === "string" ? payload.project_id : null;
  const payloadBooking = typeof payload.booking_id === "string" ? payload.booking_id : null;
  const entityBooking = input.kind.startsWith("booking.") ? input.entityId : null;
  const bookingId =
    [payloadBooking, bookingIdFromPath(input.path), entityBooking].find((value) => isSafeRecordId(value)) ?? null;
  const fromBookings =
    projectId && input.bookings ? hiredBookingIdForProject(input.bookings, projectId) : null;

  if (input.kind.startsWith("booking.") || input.kind.startsWith("change_order.") || input.kind.startsWith("review.")) {
    const resolved = bookingId ?? fromBookings;
    return resolved ? hiredJobPath(resolved) : "/app/pro/jobs";
  }
  if (input.kind === "estimate.accepted") {
    const resolved = bookingId ?? fromBookings;
    if (resolved) return hiredJobPath(resolved);
    return isSafeRecordId(projectId) ? hiredJobByProjectPath(projectId) : "/app/pro/jobs";
  }
  if (input.kind === "message.received" || input.kind === "contact.shared") {
    const resolved = bookingId ?? fromBookings;
    if (resolved) return hiredJobPath(resolved);
  }
  return input.path;
}
