import {
  MINIMAL_MESSAGE_EMAIL,
  absoluteUrl,
  buildNotificationEmail,
  categoryForKind,
  channelEnabled,
  isNotificationCategory,
  messageEmailDecision,
  notificationPath,
  resolvePreference,
  signUnsubscribeToken,
  usesMinimalEmail,
  winningEmailClaim,
  type EmailClaim,
  type NotificationAudience,
  type NotificationCategory,
  type PreferenceFlags,
} from "../_shared/notificationPolicy.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NotificationRow = {
  id: string;
  recipient_profile_id: string;
  kind: string;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
};

type ProfileRow = {
  email: string | null;
  account_type: NotificationAudience;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type EmailLogRow = {
  notification_id: string;
  sent_at: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function secretsMatch(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function service(): { url: string; key: string } | null {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  return { url, key };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
  const svc = service();
  if (!svc) return { status: 0, data: null };
  const headers = new Headers(init.headers);
  headers.set("apikey", svc.key);
  headers.set("Authorization", `Bearer ${svc.key}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${svc.url}/rest/v1/${path}`, { ...init, headers });
  const text = await res.text();
  if (!text) return { status: res.status, data: null };
  try {
    return { status: res.status, data: JSON.parse(text) as T };
  } catch {
    return { status: res.status, data: null };
  }
}

function asPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function siteUrl(): string {
  return (Deno.env.get("NOTIFICATION_SITE_URL") ?? "https://prioritypropertypros.com").replace(/\/$/, "");
}

async function loadNotification(id: string): Promise<NotificationRow | null> {
  const result = await rest<NotificationRow[]>(
    `notifications?id=eq.${id}&select=id,recipient_profile_id,kind,title,body,entity_type,entity_id,payload,read_at&limit=1`,
  );
  return result.data?.[0] ?? null;
}

async function loadPreference(userId: string, category: NotificationCategory): Promise<PreferenceFlags> {
  const result = await rest<PreferenceFlags[]>(
    `notification_preferences?user_id=eq.${userId}&category=eq.${category}&select=in_app,push,email&limit=1`,
  );
  return resolvePreference(category, result.data?.[0] ?? null);
}

async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const result = await rest<ProfileRow[]>(
    `profiles?id=eq.${userId}&select=email,account_type&limit=1`,
  );
  return result.data?.[0] ?? null;
}

async function recentMessageSends(userId: string, conversationId: string, sinceIso: string): Promise<EmailLogRow[]> {
  const since = encodeURIComponent(sinceIso);
  const result = await rest<EmailLogRow[]>(
    `notification_email_log?recipient_profile_id=eq.${userId}&category=eq.messages&conversation_id=eq.${conversationId}&sent_at=gt.${since}&select=notification_id,sent_at&order=sent_at.asc&limit=20`,
  );
  return result.data ?? [];
}

async function insertEmailLog(row: {
  notification_id: string;
  recipient_profile_id: string;
  category: string;
  conversation_id: string | null;
  sent_at: string;
}): Promise<number> {
  const result = await rest<EmailLogRow[]>(`notification_email_log`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return result.status;
}

async function deleteEmailLog(notificationId: string): Promise<void> {
  await rest(`notification_email_log?notification_id=eq.${notificationId}`, { method: "DELETE" });
}

async function sendEmail(input: {
  notification: NotificationRow;
  category: NotificationCategory;
  secret: string;
  profile: ProfileRow;
}): Promise<"sent" | "skipped"> {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!apiKey) {
    console.warn("email skipped: RESEND_API_KEY is not set");
    return "skipped";
  }
  const address = (input.profile.email ?? "").trim();
  if (!address.includes("@") || /\s/.test(address)) {
    console.warn("email skipped: recipient has no usable address");
    return "skipped";
  }

  const nowMs = Date.now();
  const conversationId =
    input.notification.kind === "message.received" && input.notification.entity_id && UUID.test(input.notification.entity_id)
      ? input.notification.entity_id
      : null;

  if (input.notification.kind === "message.received") {
    const fresh = await loadNotification(input.notification.id);
    const since = new Date(nowMs - 15 * 60 * 1000).toISOString();
    const recent = conversationId ? await recentMessageSends(input.notification.recipient_profile_id, conversationId, since) : [];
    const others = recent.filter((row) => row.notification_id !== input.notification.id);
    const lastSentAt = others.length > 0 ? others[others.length - 1].sent_at : null;
    const decision = messageEmailDecision({
      readAt: fresh?.read_at ?? input.notification.read_at,
      lastSentAt,
      nowMs,
    });
    if (!decision.send) {
      console.warn(`email skipped: ${decision.reason}`);
      return "skipped";
    }
  }

  const sentAt = new Date(nowMs).toISOString();
  const inserted = await insertEmailLog({
    notification_id: input.notification.id,
    recipient_profile_id: input.notification.recipient_profile_id,
    category: input.category,
    conversation_id: conversationId,
    sent_at: sentAt,
  });
  if (inserted === 409) {
    console.warn("email skipped: already sent");
    return "skipped";
  }
  if (inserted < 200 || inserted >= 300) {
    console.warn(`email skipped: log status ${inserted}`);
    return "skipped";
  }

  if (conversationId) {
    const since = new Date(nowMs - 15 * 60 * 1000).toISOString();
    const recent = await recentMessageSends(input.notification.recipient_profile_id, conversationId, since);
    const claims: EmailClaim[] = recent.map((row) => ({
      notificationId: row.notification_id,
      sentAt: row.sent_at,
    }));
    if (!claims.some((claim) => claim.notificationId === input.notification.id)) {
      claims.push({ notificationId: input.notification.id, sentAt });
    }
    if (!winningEmailClaim(claims, input.notification.id)) {
      await deleteEmailLog(input.notification.id);
      console.warn("email skipped: throttled");
      return "skipped";
    }
  }

  const path = notificationPath({
    kind: input.notification.kind,
    entityId: input.notification.entity_id,
    payload: asPayload(input.notification.payload),
    accountType: input.profile.account_type,
  });
  const origin = siteUrl();
  const itemUrl = absoluteUrl(origin, path);
  const manageUrl = absoluteUrl(origin, "/notifications");
  const token = await signUnsubscribeToken({
    userId: input.notification.recipient_profile_id,
    category: input.category,
    secret: input.secret,
  });
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const unsubscribeUrl = `${supabaseUrl}/functions/v1/notification-unsubscribe?token=${encodeURIComponent(token)}`;
  const message = buildNotificationEmail({
    kind: input.notification.kind,
    title: input.notification.title,
    body: input.notification.body,
    itemUrl,
    manageUrl,
    unsubscribeUrl,
  });
  const from = Deno.env.get("NOTIFICATION_FROM") ?? "Priority Property Pros <notifications@prioritypropertypros.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [address],
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) {
    await deleteEmailLog(input.notification.id);
    console.warn(`email skipped: resend status ${res.status}`);
    return "skipped";
  }
  console.warn("email sent");
  return "sent";
}

async function sendPush(input: { notification: NotificationRow; profile: ProfileRow }): Promise<"sent" | "skipped"> {
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:prioritypropertypros@gmail.com";
  if (!privateKey || !publicKey) {
    console.warn("push skipped: VAPID secrets are not set");
    return "skipped";
  }
  const subs = await rest<SubscriptionRow[]>(
    `push_subscriptions?user_id=eq.${input.notification.recipient_profile_id}&select=id,endpoint,p256dh,auth`,
  );
  const rows = subs.data ?? [];
  if (rows.length === 0) return "skipped";

  type WebPushClient = {
    setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
    sendNotification: (
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload: string,
      options?: { TTL?: number },
    ) => Promise<{ statusCode?: number }>;
  };
  let webpush: WebPushClient;
  try {
    const mod = (await import("npm:web-push@3.6.7")) as { default?: WebPushClient } & WebPushClient;
    webpush = mod.default ?? mod;
  } catch {
    console.warn("push skipped: web push library unavailable");
    return "skipped";
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    console.warn("push skipped: VAPID secrets are not usable");
    return "skipped";
  }

  const path = notificationPath({
    kind: input.notification.kind,
    entityId: input.notification.entity_id,
    payload: asPayload(input.notification.payload),
    accountType: input.profile.account_type,
  });
  const minimal = usesMinimalEmail(input.notification.kind);
  const payload = JSON.stringify({
    title: minimal ? MINIMAL_MESSAGE_EMAIL : input.notification.title,
    body: minimal ? MINIMAL_MESSAGE_EMAIL : input.notification.body,
    path,
    tag: input.notification.id,
  });

  let sent = 0;
  for (const sub of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 60 * 60 * 12 },
      );
      sent += 1;
      await rest(`push_subscriptions?id=eq.${sub.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ last_used_at: new Date().toISOString() }),
      });
    } catch (error) {
      const status = typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if (status === 404 || status === 410) {
        await rest(`push_subscriptions?id=eq.${sub.id}`, { method: "DELETE" });
        console.warn(`push subscription removed: ${status}`);
      } else {
        console.warn(`push skipped: status ${status || "error"}`);
      }
    }
  }
  return sent > 0 ? "sent" : "skipped";
}

async function deliver(id: string, secret: string): Promise<Record<string, unknown>> {
  if (!service()) {
    console.warn("notification skipped: service role is not available");
    return { ok: true, skipped: "service" };
  }
  const notification = await loadNotification(id);
  if (!notification || !UUID.test(notification.recipient_profile_id)) {
    return { ok: true, skipped: "missing" };
  }
  const category = categoryForKind(notification.kind);
  if (!isNotificationCategory(category)) {
    return { ok: true, skipped: "category" };
  }
  const preference = await loadPreference(notification.recipient_profile_id, category);
  const profile = await loadProfile(notification.recipient_profile_id);
  if (!profile) return { ok: true, skipped: "profile" };

  let email: "sent" | "skipped" | "off" = "off";
  let push: "sent" | "skipped" | "off" = "off";
  if (channelEnabled(category, preference, "email")) {
    email = await sendEmail({ notification, category, secret, profile });
  }
  if (channelEnabled(category, preference, "push")) {
    push = await sendPush({ notification, profile });
  }
  return {
    ok: true,
    category,
    in_app: channelEnabled(category, preference, "in_app"),
    email,
    push,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const expected = Deno.env.get("NOTIFY_WEBHOOK_SECRET") ?? "";
  const provided = req.headers.get("x-notify-secret") ?? "";
  if (!secretsMatch(provided, expected)) return json({ error: "unauthorized" }, 401);

  let notificationId = "";
  try {
    const body = (await req.json()) as { notification_id?: unknown };
    if (typeof body.notification_id === "string") notificationId = body.notification_id;
  } catch {
    return json({ error: "notification_id required" }, 400);
  }
  if (!UUID.test(notificationId)) return json({ error: "notification_id required" }, 400);

  try {
    return json(await deliver(notificationId, expected));
  } catch {
    console.warn("notification delivery failed");
    return json({ ok: false, delivered: false });
  }
});
