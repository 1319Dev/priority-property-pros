import { containsPreHireContact } from "../marketplace/antiCircumvention";
import { noticeBody, noticeProjectLine } from "../marketplace/contractorPolish";

/**
 * Kinds that should exist once per recipient and entity.
 * Kept in sync with enqueue_notification in the notification context migration.
 */
export const ONCE_PER_ENTITY_KINDS = [
  "estimate.viewed",
  "estimate.accepted",
  "estimate.declined",
  "estimate.not_selected",
  "estimate.withdrawn",
  "estimate.received",
  "connect.paid",
  "contact.shared",
  "question.asked",
  "question.answered",
  "booking.hired",
  "booking.confirmed",
  "booking.in_progress",
  "booking.completed",
  "booking.cancelled",
  "change_order.proposed",
  "change_order.approved",
  "change_order.declined",
  "review.received",
] as const;

/** Repeatable alerts: one unread row per entity, another after it is read. */
export const ONE_UNREAD_KINDS = ["message.received", "estimate.updated", "opportunity.offered"] as const;

const OPEN_ESTIMATE_ACTIONS = new Set(["estimate.received", "estimate.updated"]);

const EMAIL_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_TEXT = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
const URL_TEXT = /(?:https?:\/\/|www\.)/i;

export function textHasPrivateContact(value: string): boolean {
  return containsPreHireContact(value) || EMAIL_TEXT.test(value) || PHONE_TEXT.test(value) || URL_TEXT.test(value);
}

/** Titles that include contact details are replaced so the bell never shows them. */
export function safeNoticeTitle(title: string | null | undefined): string {
  const next = (title ?? "").replace(/\s+/g, " ").trim();
  if (!next || textHasPrivateContact(next)) return "Update";
  return next;
}

/** Project titles are allowed. Phone, email, and links are not. */
export function safeProjectTitle(value: string | null | undefined): string | null {
  const next = (value ?? "").replace(/\s+/g, " ").trim();
  if (!next || textHasPrivateContact(next)) return null;
  return next;
}

export function safeNoticeText(title: string, body: string | null | undefined): string | null {
  const next = noticeBody(title, body);
  if (!next || textHasPrivateContact(next)) return null;
  return next;
}

export function notificationProjectLine(input: {
  projectTitle?: string | null;
  referenceNumber?: unknown;
  payload?: Record<string, unknown> | null;
}): string | null {
  const payload = input.payload ?? {};
  const fromPayload = typeof payload.project_title === "string" ? payload.project_title : null;
  const reference =
    input.referenceNumber ?? payload.project_reference_number ?? payload.reference_number ?? null;
  return noticeProjectLine({
    project_title: safeProjectTitle(input.projectTitle ?? fromPayload),
    project_reference_number: reference,
  });
}

export type NoticeBookingSnapshot = {
  projectId: string;
  status: string;
  customerHiredAt?: string | null;
  contractorHiredAt?: string | null;
};

/**
 * Whether the action this alert asked for is already finished.
 * A server action_state wins. Without one, estimate cards follow the project and booking.
 */
export function notificationIsHistorical(input: {
  kind: string;
  actionState?: string | null;
  projectStatus?: string | null;
  selectedEstimateId?: string | null;
  projectId?: string | null;
  bookings?: readonly NoticeBookingSnapshot[];
}): boolean {
  if (input.actionState === "historical") return true;
  if (input.actionState === "open") return false;
  if (!OPEN_ESTIMATE_ACTIONS.has(input.kind)) return false;
  if (input.projectStatus === "CONTRACTOR_SELECTED" || input.projectStatus === "CANCELLED") return true;
  if (input.selectedEstimateId) return true;
  const projectId = input.projectId;
  if (!projectId) return false;
  return (input.bookings ?? []).some((booking) => {
    if (booking.projectId !== projectId || booking.status === "CANCELLED") return false;
    if (booking.customerHiredAt && booking.contractorHiredAt) return true;
    return booking.status === "CONFIRMED" || booking.status === "IN_PROGRESS" || booking.status === "COMPLETED";
  });
}

type DedupeRow = {
  id: string;
  kind: string;
  entityId?: string | null;
  entity_id?: string | null;
  readAt?: string | null;
  read_at?: string | null;
};

function entityOf(row: DedupeRow): string | null {
  return row.entityId ?? row.entity_id ?? null;
}

function readOf(row: DedupeRow): string | null {
  return row.readAt === undefined ? (row.read_at ?? null) : row.readAt;
}

/** Newest row wins. Rows must already be newest-first. */
export function dedupeNotificationRows<T extends DedupeRow>(rows: readonly T[]): T[] {
  const once = new Set<string>(ONCE_PER_ENTITY_KINDS);
  const unreadKinds = new Set<string>(ONE_UNREAD_KINDS);
  const seenIds = new Set<string>();
  const seenOnce = new Set<string>();
  const seenUnread = new Set<string>();
  const next: T[] = [];
  for (const row of rows) {
    if (!row.id || seenIds.has(row.id)) continue;
    seenIds.add(row.id);
    const entity = entityOf(row);
    if (entity && once.has(row.kind)) {
      const key = `${row.kind}:${entity}`;
      if (seenOnce.has(key)) continue;
      seenOnce.add(key);
    }
    if (entity && !readOf(row) && unreadKinds.has(row.kind)) {
      const key = `${row.kind}:${entity}`;
      if (seenUnread.has(key)) continue;
      seenUnread.add(key);
    }
    next.push(row);
  }
  return next;
}

export function friendlyNotificationError(error: string | null | undefined): string | null {
  if (!error) return null;
  if (/postgres|subscribe\(|realtime|jwt|stack|sql|function public/i.test(error)) {
    return "Couldn't load notifications.";
  }
  return error;
}
