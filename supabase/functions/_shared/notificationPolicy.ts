/**
 * Shared notification rules for the Edge Function and the website.
 * No secrets, no message bodies, and no contact fields belong in this module.
 */

export const NOTIFICATION_CATEGORIES = [
  "new_job",
  "messages",
  "connect",
  "estimates",
  "booking",
  "change_orders",
  "reviews",
  "account",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationChannel = "in_app" | "push" | "email";

export type PreferenceFlags = {
  in_app: boolean;
  push: boolean;
  email: boolean;
};

export const MESSAGE_EMAIL_THROTTLE_MS = 15 * 60 * 1000;

export const UNSUBSCRIBE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180;

export const MINIMAL_MESSAGE_EMAIL = "You have a new message on Priority Property Pros";

const EMAIL_ON_BY_DEFAULT = new Set<NotificationCategory>([
  "new_job",
  "messages",
  "connect",
  "estimates",
  "booking",
  "change_orders",
]);

export const NOTIFICATION_CATEGORY_COPY: Record<
  NotificationCategory,
  { label: string; description: string }
> = {
  new_job: {
    label: "New jobs",
    description: "A job is offered in your service area.",
  },
  messages: {
    label: "Messages",
    description: "Messages and questions. Email is limited to one per conversation every 15 minutes, and only while it is still unread.",
  },
  connect: {
    label: "Connections",
    description: "A pro connects on your project, and when contact is shared.",
  },
  estimates: {
    label: "Estimates",
    description: "Estimates sent, updated, viewed, selected, or declined.",
  },
  booking: {
    label: "Bookings",
    description: "Hired, confirmed, in progress, completed, and cancelled.",
  },
  change_orders: {
    label: "Change orders",
    description: "Proposed, approved, or declined.",
  },
  reviews: {
    label: "Reviews",
    description: "A review you receive.",
  },
  account: {
    label: "Account",
    description: "Account notices.",
  },
};

export function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export function defaultPreference(category: NotificationCategory): PreferenceFlags {
  return {
    in_app: true,
    push: false,
    email: EMAIL_ON_BY_DEFAULT.has(category),
  };
}

export function resolvePreference(
  category: NotificationCategory,
  row: PreferenceFlags | null | undefined,
): PreferenceFlags {
  if (!row) return defaultPreference(category);
  return {
    in_app: row.in_app,
    push: row.push,
    email: row.email,
  };
}

export function channelEnabled(
  category: NotificationCategory,
  row: PreferenceFlags | null | undefined,
  channel: NotificationChannel,
): boolean {
  return resolvePreference(category, row)[channel];
}

export function categoryForKind(kind: string): NotificationCategory {
  if (kind === "opportunity.offered" || kind === "job.offered" || kind.startsWith("opportunity.")) {
    return "new_job";
  }
  if (kind === "message.received" || kind.startsWith("message.") || kind.startsWith("question.")) {
    return "messages";
  }
  if (kind === "connect.paid" || kind === "contact.shared" || kind.startsWith("connect.")) {
    return "connect";
  }
  if (kind.startsWith("estimate.")) return "estimates";
  if (kind.startsWith("booking.")) return "booking";
  if (kind.startsWith("change_order.")) return "change_orders";
  if (kind.startsWith("review.")) return "reviews";
  return "account";
}

export function usesMinimalEmail(kind: string): boolean {
  return kind === "message.received" || kind.startsWith("question.");
}

export type MessageEmailDecision = {
  send: boolean;
  reason: "ok" | "already_read" | "throttled";
};

/** Rolling 15-minute cap. A read notification is never emailed. */
export function messageEmailDecision(input: {
  readAt: string | null;
  lastSentAt: string | null;
  nowMs: number;
  throttleMs?: number;
}): MessageEmailDecision {
  if (input.readAt) return { send: false, reason: "already_read" };
  const throttleMs = input.throttleMs ?? MESSAGE_EMAIL_THROTTLE_MS;
  if (input.lastSentAt) {
    const sentAt = Date.parse(input.lastSentAt);
    if (Number.isFinite(sentAt) && input.nowMs - sentAt < throttleMs) {
      return { send: false, reason: "throttled" };
    }
  }
  return { send: true, reason: "ok" };
}

export type EmailClaim = {
  notificationId: string;
  sentAt: string;
};

/** The earliest claim in the window wins. Ties break on notification id. */
export function winningEmailClaim(claims: readonly EmailClaim[], notificationId: string): boolean {
  if (claims.length === 0) return false;
  const sorted = [...claims].sort((a, b) => {
    const byTime = a.sentAt.localeCompare(b.sentAt);
    if (byTime !== 0) return byTime;
    return a.notificationId.localeCompare(b.notificationId);
  });
  return sorted[0]?.notificationId === notificationId;
}

export function isSafeAppPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || path.includes("..") || path.includes("://")) return false;
  if (/\s/.test(path)) return false;
  return true;
}

export type NotificationAudience = "CUSTOMER" | "CONTRACTOR" | "VERIFIER" | "ADMIN" | null;

function segment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^[A-Za-z0-9-]{1,80}$/.test(value)) return null;
  return value;
}

function homeFor(audience: NotificationAudience): string {
  if (audience === "CONTRACTOR") return "/app/pro";
  if (audience === "VERIFIER") return "/app/verifier";
  if (audience === "ADMIN") return "/app/admin";
  return "/app/customer";
}

export function notificationPath(input: {
  kind: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  accountType: NotificationAudience;
}): string {
  const explicit = typeof input.payload.path === "string" ? input.payload.path : "";
  if (isSafeAppPath(explicit)) return explicit;

  const projectId = segment(input.payload.project_id);
  const contractorId = segment(input.payload.contractor_profile_id);
  const bookingId = segment(input.payload.booking_id) ?? (input.kind.startsWith("booking.") ? segment(input.entityId) : null);
  const opportunityId = segment(input.payload.opportunity_id) ?? (input.kind === "opportunity.offered" ? segment(input.entityId) : null);
  const proRoot = input.accountType === "CONTRACTOR";

  if (input.kind === "message.received" && projectId && contractorId) {
    const root = proRoot ? "/app/pro" : "/app/customer";
    return `${root}/messages/${projectId}/${contractorId}`;
  }
  if (input.kind === "contact.shared" && projectId && contractorId) {
    return `/app/pro/messages/${projectId}/${contractorId}`;
  }
  if (input.kind === "question.asked") {
    return projectId ? `/app/customer/projects/${projectId}` : "/app/customer/projects";
  }
  if (input.kind === "question.answered") {
    return opportunityId ? `/app/pro/opportunities/${opportunityId}` : "/app/pro/opportunities";
  }
  if (input.kind === "opportunity.offered" || input.kind === "job.offered") {
    return opportunityId ? `/app/pro/opportunities/${opportunityId}` : "/app/pro/opportunities";
  }
  if (input.kind === "connect.paid" || input.kind.startsWith("connect.")) {
    return projectId ? `/app/customer/projects/${projectId}` : "/app/customer/projects";
  }
  if (input.kind.startsWith("estimate.")) {
    if (proRoot) return "/app/pro/estimates";
    const estimateId = segment(input.entityId);
    if (projectId && estimateId) return `/app/customer/projects/${projectId}/estimates/${estimateId}`;
    if (projectId) return `/app/customer/projects/${projectId}`;
    return "/app/customer/projects";
  }
  if (
    input.kind.startsWith("booking.") ||
    input.kind.startsWith("change_order.") ||
    input.kind.startsWith("review.")
  ) {
    const root = proRoot ? "/app/pro" : "/app/customer";
    return bookingId ? `${root}/bookings/${bookingId}` : `${root}/bookings`;
  }
  return homeFor(input.accountType);
}

export function absoluteUrl(siteUrl: string, path: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const safe = isSafeAppPath(path) ? path : "/";
  return `${base}${safe}`;
}

export type NotificationEmail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildNotificationEmail(input: {
  kind: string;
  title: string;
  body: string;
  itemUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;
}): NotificationEmail {
  const minimal = usesMinimalEmail(input.kind);
  const subject = minimal ? MINIMAL_MESSAGE_EMAIL : input.title.trim() || "Priority Property Pros";
  const lead = minimal ? MINIMAL_MESSAGE_EMAIL : input.body.trim() || input.title.trim();
  const text = [
    lead,
    "",
    `Open: ${input.itemUrl}`,
    "",
    `Manage notification settings: ${input.manageUrl}`,
    `Unsubscribe from these emails: ${input.unsubscribeUrl}`,
    "",
    "Priority Property Pros",
    "prioritypropertypros@gmail.com",
  ].join("\n");

  const safeLead = escapeHtml(lead);
  const safeSubject = escapeHtml(subject);
  const item = escapeHtml(input.itemUrl);
  const manage = escapeHtml(input.manageUrl);
  const unsub = escapeHtml(input.unsubscribeUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:#fbf8f1;color:#1a1814;font-family:Georgia, 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf8f1;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e6d5b5;border-radius:24px;overflow:hidden;">
          <tr>
            <td style="background:#1a3c2e;padding:22px 28px;">
              <p style="margin:0;font-family:Arial, Helvetica, sans-serif;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#c9a227;">Priority Property Pros</p>
              <h1 style="margin:8px 0 0;font-size:28px;line-height:1.2;font-weight:600;color:#fbf8f1;">${safeSubject}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-family:Arial, Helvetica, sans-serif;font-size:16px;line-height:1.5;color:#3f3a33;">
              <p style="margin:0 0 24px;">${safeLead}</p>
              <a href="${item}" style="display:inline-block;background:#1a3c2e;color:#fbf8f1;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 22px;">Open in Priority Property Pros</a>
              <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#6b645a;">
                <a href="${manage}" style="color:#1a3c2e;">Manage notification settings</a><br>
                <a href="${unsub}" style="color:#1a3c2e;">Unsubscribe from these emails</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 22px;font-family:Arial, Helvetica, sans-serif;font-size:12px;line-height:1.5;color:#6b645a;">
              Priority Property Pros<br>
              <a href="mailto:prioritypropertypros@gmail.com" style="color:#6b645a;">prioritypropertypros@gmail.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function signUnsubscribeToken(input: {
  userId: string;
  category: NotificationCategory;
  secret: string;
  nowSeconds?: number;
  ttlSeconds?: number;
}): Promise<string> {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = nowSeconds + (input.ttlSeconds ?? UNSUBSCRIBE_TOKEN_TTL_SECONDS);
  const payload = JSON.stringify({ u: input.userId, c: input.category, e: exp });
  const signature = await signPayload(input.secret, payload);
  return `${bytesToBase64Url(textEncoder.encode(payload))}.${signature}`;
}

export type UnsubscribeToken =
  | { ok: true; userId: string; category: NotificationCategory }
  | { ok: false; reason: "invalid" | "expired" };

export async function verifyUnsubscribeToken(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<UnsubscribeToken> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || !secret) return { ok: false, reason: "invalid" };
  let payloadText = "";
  try {
    payloadText = new TextDecoder().decode(base64UrlToBytes(parts[0]));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const expected = await signPayload(secret, payloadText);
  const actualBytes = textEncoder.encode(parts[1]);
  const expectedBytes = textEncoder.encode(expected);
  if (!timingSafeEqual(actualBytes, expectedBytes)) return { ok: false, reason: "invalid" };
  let parsed: { u?: unknown; c?: unknown; e?: unknown };
  try {
    parsed = JSON.parse(payloadText) as { u?: unknown; c?: unknown; e?: unknown };
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof parsed.u !== "string" || typeof parsed.c !== "string" || typeof parsed.e !== "number") {
    return { ok: false, reason: "invalid" };
  }
  if (!isNotificationCategory(parsed.c)) return { ok: false, reason: "invalid" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.u)) {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.e < nowSeconds) return { ok: false, reason: "expired" };
  return { ok: true, userId: parsed.u, category: parsed.c };
}
