import { PRE_HIRE_CONTACT_MESSAGE, assertNoPreHireContact } from "./antiCircumvention";
import { hiredJobPath, isSafeRecordId } from "./hiredJobs";
import { coerceProjectReference } from "./projectReference";

/** Job-payment copy stays out of this module. Messaging is a $4.99 connection unlock. */

export const MESSAGES_EMPTY_TITLE = "No messages yet";

export const MESSAGES_EMPTY_BODY =
  "A conversation opens after a pro connects on your project.";

export const MESSAGES_LOCKED_BODY =
  "Messaging opens after this pro connects on the project.";

export const CONTRACTOR_MESSAGES_EMPTY_BODY =
  "A conversation opens after you connect on a job.";

export const CONTRACTOR_MESSAGES_LOCKED_BODY =
  "Messaging opens after you connect on this job.";

export const THREAD_EMPTY_BODY =
  "No messages yet. Write about the work. Phone, email, and street address stay out of this thread.";

export const MESSAGE_COMPOSER_HINT =
  "Phone numbers, emails, and street addresses stay out of this thread.";

export function messageComposerHint(role: "customer" | "contractor", contactShared = false): string {
  const base = "Phone numbers, emails, and street addresses stay out of this thread.";
  if (role === "contractor") {
    return contactShared
      ? `${base} The customer already shared contact with you.`
      : `${base} The customer chooses when to share contact.`;
  }
  if (contactShared) return `${base} This pro already has the contact you shared.`;
  return `${base} Use Share my contact when you want this pro to see them.`;
}

export const MESSAGE_NOTIFICATION_TITLE = "New message";

export const MESSAGE_NOTIFICATION_BODY = "New message about your project.";

export function newMessageFromLabel(name: string): string {
  const clean = name.trim() || "someone";
  return `New message from ${clean}`;
}

export type MessageGrantSource = "CONNECTION_FEE_PAYMENT" | "ADMIN_OVERRIDE" | "SYSTEM" | null;

export type MessageAccessStatus = "LOCKED" | "UNLOCKED" | "ADMIN_OVERRIDE" | null;

export type ConnectionEntitlement = {
  status: MessageAccessStatus;
  grantSource: MessageGrantSource;
  revoked: boolean;
};

export type MessageActor = {
  userId: string;
  role: "customer" | "contractor" | "other";
  contractorProfileId: string | null;
};

export type MessageThreadSummary = {
  thread_id: string | null;
  project_id: string;
  contractor_profile_id: string;
  project_title: string;
  project_reference_number?: number | null;
  city: string | null;
  state: string | null;
  contractor_label: string;
  other_party_label: string;
  last_message_at: string | null;
  last_preview: string | null;
  last_sender_is_viewer: boolean;
  unread_count: number;
  last_read_at: string | null;
  booking_id: string | null;
  opportunity_id: string | null;
};

export type ProjectMessage = {
  id: string;
  thread_id: string;
  sender_profile_id: string | null;
  body: string;
  created_at: string;
};

/**
 * $4.99 connection entitlement on booking_contact_access.
 * ADMIN_OVERRIDE is the same contact entitlement, granted by an admin.
 * Activation, Hired, and job-payment status are ignored on purpose.
 */
export function connectionEntitlementUnlocksMessages(access: ConnectionEntitlement | null | undefined): boolean {
  if (!access || access.revoked) return false;
  if (access.status === "UNLOCKED" && access.grantSource === "CONNECTION_FEE_PAYMENT") return true;
  if (access.status === "ADMIN_OVERRIDE" && access.grantSource === "ADMIN_OVERRIDE") return true;
  return false;
}

export function canMessageProjectPair(input: {
  actor: MessageActor;
  projectOwnerId: string;
  contractorProfileId: string;
  entitlement: ConnectionEntitlement | null;
  signupFeePaid?: boolean;
  mutuallyHired?: boolean;
  bookingStatus?: string | null;
}): boolean {
  void input.signupFeePaid;
  void input.mutuallyHired;
  void input.bookingStatus;
  if (!connectionEntitlementUnlocksMessages(input.entitlement)) return false;
  const isOwner = input.actor.role === "customer" && input.actor.userId === input.projectOwnerId;
  const isContractor =
    input.actor.role === "contractor" &&
    input.actor.contractorProfileId != null &&
    input.actor.contractorProfileId === input.contractorProfileId;
  return isOwner || isContractor;
}

export function assertMessageBodyAllowed(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Write a message before sending.");
  if (trimmed.length > 4000) throw new Error("That message is too long.");
  assertNoPreHireContact(trimmed);
  return trimmed;
}

export function customerFacingMessageError(message: string | null | undefined): string {
  const text = message ?? "";
  if (/keep communication|contact info|phone numbers|exact street/i.test(text)) return PRE_HIRE_CONTACT_MESSAGE;
  if (/messaging is locked/i.test(text)) return MESSAGES_LOCKED_BODY;
  if (/a message is required|write a message/i.test(text)) return "Write a message before sending.";
  if (/too long/i.test(text)) return "That message is too long.";
  return "Could not send that message.";
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Allowlist. Extra keys such as phone, email, or street are dropped. */
export function sanitizeThreadSummary(value: unknown): MessageThreadSummary | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.project_id !== "string" || typeof row.contractor_profile_id !== "string") return null;
  const contractorLabel = textOrNull(row.contractor_label) ?? "Connected pro";
  return {
    thread_id: textOrNull(row.thread_id),
    project_id: row.project_id,
    contractor_profile_id: row.contractor_profile_id,
    project_title: textOrNull(row.project_title) ?? "Project",
    project_reference_number: coerceProjectReference(row.project_reference_number),
    city: textOrNull(row.city),
    state: textOrNull(row.state),
    contractor_label: contractorLabel,
    other_party_label: textOrNull(row.other_party_label) ?? contractorLabel,
    last_message_at: textOrNull(row.last_message_at),
    last_preview: textOrNull(row.last_preview),
    last_sender_is_viewer: row.last_sender_is_viewer === true,
    unread_count: typeof row.unread_count === "number" && row.unread_count > 0 ? Math.floor(row.unread_count) : 0,
    last_read_at: textOrNull(row.last_read_at),
    booking_id: textOrNull(row.booking_id),
    opportunity_id: textOrNull(row.opportunity_id),
  };
}

export function sanitizeProjectMessage(value: unknown): ProjectMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.thread_id !== "string" ||
    (row.sender_profile_id != null && typeof row.sender_profile_id !== "string") ||
    typeof row.body !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    thread_id: row.thread_id,
    sender_profile_id: typeof row.sender_profile_id === "string" ? row.sender_profile_id : null,
    body: row.body,
    created_at: row.created_at,
  };
}

export function messageNotificationHref(
  role: "customer" | "contractor",
  payload: Record<string, unknown> | null | undefined,
): string | null {
  const projectId = typeof payload?.project_id === "string" ? payload.project_id : null;
  const contractorId = typeof payload?.contractor_profile_id === "string" ? payload.contractor_profile_id : null;
  if (!projectId || !contractorId) return null;
  const base = role === "customer" ? "/app/customer/messages" : "/app/pro/messages";
  return `${base}/${projectId}/${contractorId}`;
}

export function threadPlaceLabel(thread: Pick<MessageThreadSummary, "city" | "state">): string | null {
  const parts = [thread.city, thread.state].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function inboxPreview(preview: string | null | undefined, sentByViewer: boolean, senderLabel?: string | null): string {
  const text = (preview ?? "").trim();
  const name = (senderLabel ?? "").trim();
  if (!text) return "No messages yet";
  if (name && text.toLowerCase() === name.toLowerCase()) return "No message text yet";
  return sentByViewer ? `You: ${text}` : text;
}

export function deriveUnread(input: {
  lastMessageAt: string | null;
  lastSenderIsViewer: boolean;
  lastReadAt: string | null;
}): number {
  if (!input.lastMessageAt || input.lastSenderIsViewer) return 0;
  if (!input.lastReadAt) return 1;
  const messageAt = Date.parse(input.lastMessageAt);
  const readAt = Date.parse(input.lastReadAt);
  if (Number.isNaN(messageAt) || Number.isNaN(readAt)) return 0;
  return messageAt > readAt ? 1 : 0;
}

export function sortMessageThreads<T extends { last_message_at: string | null; project_title: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    const aTime = Number.isNaN(at) ? 0 : at;
    const bTime = Number.isNaN(bt) ? 0 : bt;
    if (bTime !== aTime) return bTime - aTime;
    return a.project_title.localeCompare(b.project_title);
  });
}

export function formatInboxTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (sameCalendarDay(date, now)) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameCalendarDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatMessageDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (sameCalendarDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameCalendarDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function desktopEnterSends(isDesktop: boolean, key: string, shiftKey: boolean): boolean {
  return isDesktop && key === "Enter" && !shiftKey;
}

export type ThreadBubble = {
  kind: "day" | "message";
  id: string;
  label?: string;
  body?: string;
  createdAt?: string;
  mine?: boolean;
  showLabel?: boolean;
  senderLabel?: string;
};

export function layoutThreadMessages(input: {
  messages: Array<{ id: string; sender_profile_id: string | null; body: string; created_at: string }>;
  viewerId: string;
  otherLabel: string;
  now?: Date;
}): ThreadBubble[] {
  const now = input.now ?? new Date();
  const items: ThreadBubble[] = [];
  let lastDay = "";
  let lastSender = "";
  for (const message of input.messages) {
    const day = formatMessageDay(message.created_at, now);
    if (day !== lastDay) {
      items.push({ kind: "day", id: `day-${message.id}`, label: day });
      lastDay = day;
      lastSender = "";
    }
    const mine = message.sender_profile_id != null && message.sender_profile_id === input.viewerId;
    const senderLabel = message.sender_profile_id == null ? "Deleted account" : mine ? "You" : input.otherLabel;
    items.push({
      kind: "message",
      id: message.id,
      body: message.body,
      createdAt: message.created_at,
      mine,
      showLabel: senderLabel !== lastSender,
      senderLabel,
    });
    lastSender = senderLabel;
  }
  return items;
}

export function threadContextHref(
  role: "customer" | "contractor",
  thread: Pick<MessageThreadSummary, "project_id" | "booking_id" | "opportunity_id">,
): string {
  if (role === "customer") {
    return thread.booking_id
      ? `/app/customer/bookings/${thread.booking_id}`
      : `/app/customer/projects/${thread.project_id}`;
  }
  if (isSafeRecordId(thread.booking_id)) return hiredJobPath(thread.booking_id);
  if (thread.opportunity_id) return `/app/pro/opportunities/${thread.opportunity_id}`;
  return "/app/pro/opportunities";
}

export function isWideInbox(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}
