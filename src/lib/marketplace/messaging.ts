import { PRE_HIRE_CONTACT_MESSAGE, assertNoPreHireContact } from "./antiCircumvention";

/** Job-payment copy stays out of this module. Messaging is a $4.99 connection unlock. */

export const MESSAGES_EMPTY_TITLE = "No messages yet";

export const MESSAGES_EMPTY_BODY =
  "A thread opens after a contractor completes the $4.99 connection for that project. The $9.99 account activation, Hired, and job payment do not open messaging.";

export const MESSAGES_LOCKED_BODY =
  "Messaging stays locked until the $4.99 connection is unlocked for this contractor on this project. Account activation, Hired, and job payment do not open it.";

export const THREAD_EMPTY_BODY =
  "No messages yet. Write about the work. Phone, email, and street address stay out of this thread.";

export const MESSAGE_COMPOSER_HINT =
  "Don't include a phone number, email, link, social handle, or exact street. Use Share my contact & address when you want this contractor to see them. This thread will not carry that.";

export const MESSAGE_NOTIFICATION_TITLE = "New message";

export const MESSAGE_NOTIFICATION_BODY = "You have a new message about a project.";

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
  city: string | null;
  state: string | null;
  contractor_label: string;
  last_message_at: string | null;
  last_preview: string | null;
};

export type ProjectMessage = {
  id: string;
  thread_id: string;
  sender_profile_id: string;
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
  return {
    thread_id: textOrNull(row.thread_id),
    project_id: row.project_id,
    contractor_profile_id: row.contractor_profile_id,
    project_title: textOrNull(row.project_title) ?? "Project",
    city: textOrNull(row.city),
    state: textOrNull(row.state),
    contractor_label: textOrNull(row.contractor_label) ?? "Connected pro",
    last_message_at: textOrNull(row.last_message_at),
    last_preview: textOrNull(row.last_preview),
  };
}

export function sanitizeProjectMessage(value: unknown): ProjectMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.thread_id !== "string" ||
    typeof row.sender_profile_id !== "string" ||
    typeof row.body !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    thread_id: row.thread_id,
    sender_profile_id: row.sender_profile_id,
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
