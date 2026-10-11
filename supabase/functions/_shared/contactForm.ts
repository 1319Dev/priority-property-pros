export const DEFAULT_CONTACT_TO = "support@prioritypropertypros.com";
export const DEFAULT_CONTACT_FROM = "Priority Property Pros <notifications@prioritypropertypros.com>";

export const CONTACT_NAME_MAX = 80;
export const CONTACT_EMAIL_MAX = 254;
export const CONTACT_PHONE_MAX = 40;
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 2000;
export const CONTACT_BODY_MAX = 20_000;
export const CONTACT_RATE_LIMIT = 5;
export const CONTACT_RATE_WINDOW_SECONDS = 60 * 60;

export const CONTACT_TOPICS = [
  { id: "marketplace", label: "Marketplace question" },
  { id: "account", label: "Account help" },
  { id: "billing", label: "Billing" },
  { id: "report", label: "Report a problem" },
  { id: "other", label: "Something else" },
] as const;

export type ContactTopicId = (typeof CONTACT_TOPICS)[number]["id"];

export const CONTACT_VALIDATION_ERROR = "Check the form and try again.";

export type ContactField = "name" | "email" | "phone" | "topic" | "message";

export type ContactSubmission = {
  name: string;
  email: string;
  phone: string | null;
  topic: ContactTopicId;
  message: string;
};

export type ContactRuntime = {
  resendApiKey: string;
  toEmail: string;
  fromEmail: string;
  ipHashSalt: string;
  service: { url: string; key: string } | null;
  fetchImpl?: typeof fetch;
};

export function contactTopicLabel(topic: string): string {
  return CONTACT_TOPICS.find((item) => item.id === topic)?.label ?? "Contact";
}

export function contactUnavailableError(to = DEFAULT_CONTACT_TO): string {
  return `Contact form is temporarily unavailable. Email us at ${to}.`;
}

export function contactRateLimitError(to = DEFAULT_CONTACT_TO): string {
  return `Too many messages from this connection. Please wait and try again, or email us at ${to}.`;
}

export function contactSendFailedError(to = DEFAULT_CONTACT_TO): string {
  return `We couldn't email that just now. Email us at ${to}.`;
}

export function isAllowedContactOrigin(origin: string | null): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  const host = url.hostname.toLowerCase();
  if (url.protocol === "https:" && (host === "prioritypropertypros.com" || host === "www.prioritypropertypros.com")) {
    return true;
  }
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  return local && (url.protocol === "http:" || url.protocol === "https:");
}

export function contactCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  if (origin && isAllowedContactOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function stripContactHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
}

export function safeContactMailbox(value: string, fallback = DEFAULT_CONTACT_TO): string {
  const trimmed = value.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) return fallback;
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(trimmed)) return fallback;
  return trimmed;
}

export function safeContactFrom(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) return DEFAULT_CONTACT_FROM;
  if (!trimmed.toLowerCase().includes("@prioritypropertypros.com")) return DEFAULT_CONTACT_FROM;
  return trimmed;
}

export function contactClientIp(req: Request): string {
  const candidates = [req.headers.get("cf-connecting-ip"), req.headers.get("x-real-ip"), req.headers.get("x-forwarded-for")];
  for (const value of candidates) {
    if (!value) continue;
    const first = value.split(",")[0]?.trim() ?? "";
    if (first && first.length <= 80 && !/[\r\n\s]/.test(first)) return first;
  }
  return "unknown";
}

export async function hashContactIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}\n${ip.trim()}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildContactEmailText(value: ContactSubmission): string {
  return [
    `Name: ${value.name}`,
    `Email: ${value.email}`,
    `Phone: ${value.phone ?? "Not provided"}`,
    `Topic: ${contactTopicLabel(value.topic)}`,
    "",
    value.message,
  ].join("\n");
}

type ParseResult =
  | { ok: true; honeypot: true }
  | { ok: true; honeypot: false; value: ContactSubmission }
  | { ok: false; field: ContactField };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = stripContactHtml(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!text || text.length > max) return null;
  return text;
}

function cleanMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > CONTACT_MESSAGE_MAX * 4) return null;
  const text = stripContactHtml(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  if (text.length < CONTACT_MESSAGE_MIN || text.length > CONTACT_MESSAGE_MAX) return null;
  return text;
}

export function parseContactSubmission(body: unknown): ParseResult {
  const record = asRecord(body);
  if (!record) return { ok: false, field: "message" };
  const trap = typeof record.company_website === "string" ? record.company_website.trim() : "";
  if (trap) return { ok: true, honeypot: true };

  const name = cleanLine(record.name, CONTACT_NAME_MAX);
  if (!name) return { ok: false, field: "name" };
  const email = cleanLine(record.email, CONTACT_EMAIL_MAX);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, field: "email" };
  const phoneRaw = typeof record.phone === "string" ? stripContactHtml(record.phone).replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  if (phoneRaw.length > CONTACT_PHONE_MAX) return { ok: false, field: "phone" };
  if (phoneRaw && !/^[0-9+().\-\s]{7,40}$/.test(phoneRaw)) return { ok: false, field: "phone" };
  const digits = phoneRaw.replace(/\D/g, "");
  if (phoneRaw && digits.length < 7) return { ok: false, field: "phone" };
  const topic = typeof record.topic === "string" ? record.topic.trim() : "";
  if (!CONTACT_TOPICS.some((item) => item.id === topic)) return { ok: false, field: "topic" };
  const message = cleanMessage(record.message);
  if (!message) return { ok: false, field: "message" };

  return {
    ok: true,
    honeypot: false,
    value: {
      name,
      email,
      phone: phoneRaw || null,
      topic: topic as ContactTopicId,
      message,
    },
  };
}

function json(origin: string | null, body: unknown, status: number): Response {
  const headers = contactCorsHeaders(origin);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

function serviceHeaders(key: string, extra?: Record<string, string>): Headers {
  const headers = new Headers(extra);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");
  return headers;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function insertedId(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || !("id" in row)) return null;
  const id = (row as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

export async function handleContactForm(req: Request, runtime: ContactRuntime): Promise<Response> {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (!isAllowedContactOrigin(origin)) return json(origin, { ok: false, code: "origin", error: "origin not allowed" }, 403);
    return new Response(null, { status: 204, headers: contactCorsHeaders(origin) });
  }
  if (req.method !== "POST") return json(origin, { ok: false, code: "method", error: "POST required" }, 405);
  if (!isAllowedContactOrigin(origin)) {
    return json(origin, { ok: false, code: "origin", error: "origin not allowed" }, 403);
  }

  const toEmail = safeContactMailbox(runtime.toEmail);
  const fromEmail = safeContactFrom(runtime.fromEmail);
  const unavailable = contactUnavailableError(toEmail);

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return json(origin, { ok: false, code: "validation", error: CONTACT_VALIDATION_ERROR, field: "message" }, 400);
  }
  if (raw.length > CONTACT_BODY_MAX) {
    return json(origin, { ok: false, code: "validation", error: CONTACT_VALIDATION_ERROR, field: "message" }, 400);
  }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const service = runtime.service;
  if (!service) return json(origin, { ok: false, code: "unavailable", error: unavailable }, 503);

  const ipHash = await hashContactIp(contactClientIp(req), runtime.ipHashSalt || "contact-form");
  let allowed = false;
  try {
    const rate = await fetchImpl(`${service.url}/rest/v1/rpc/consume_contact_rate_bucket`, {
      method: "POST",
      headers: serviceHeaders(service.key),
      body: JSON.stringify({
        p_ip_hash: ipHash,
        p_limit: CONTACT_RATE_LIMIT,
        p_window_seconds: CONTACT_RATE_WINDOW_SECONDS,
      }),
    });
    const decision = await readJson(rate);
    allowed = rate.ok && decision === true;
    if (!rate.ok) return json(origin, { ok: false, code: "unavailable", error: unavailable }, 503);
  } catch {
    return json(origin, { ok: false, code: "unavailable", error: unavailable }, 503);
  }
  if (!allowed) {
    return json(origin, { ok: false, code: "rate_limited", error: contactRateLimitError(toEmail) }, 429);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return json(origin, { ok: false, code: "validation", error: CONTACT_VALIDATION_ERROR, field: "message" }, 400);
  }

  const parsed = parseContactSubmission(body);
  if (!parsed.ok) {
    return json(origin, { ok: false, code: "validation", error: CONTACT_VALIDATION_ERROR, field: parsed.field }, 400);
  }
  if (parsed.honeypot) return json(origin, { ok: true }, 200);

  const value = parsed.value;
  let messageId = "";
  try {
    const inserted = await fetchImpl(`${service.url}/rest/v1/contact_messages`, {
      method: "POST",
      headers: serviceHeaders(service.key, { Prefer: "return=representation" }),
      body: JSON.stringify({
        name: value.name,
        email: value.email,
        phone: value.phone,
        topic: value.topic,
        message: value.message,
        email_status: "pending",
        ip_hash: ipHash,
      }),
    });
    const created = await readJson(inserted);
    messageId = inserted.ok ? insertedId(created) ?? "" : "";
  } catch {
    messageId = "";
  }
  if (!messageId) return json(origin, { ok: false, code: "unavailable", error: unavailable }, 503);

  const mark = async (emailStatus: string) => {
    try {
      await fetchImpl(`${service.url}/rest/v1/contact_messages?id=eq.${messageId}`, {
        method: "PATCH",
        headers: serviceHeaders(service.key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ email_status: emailStatus }),
      });
    } catch {
      console.warn("contact status update failed");
    }
  };

  if (!runtime.resendApiKey.trim()) {
    await mark("unavailable");
    return json(origin, { ok: false, code: "unavailable", error: unavailable }, 503);
  }

  try {
    const sent = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: value.email,
        subject: `Contact form: ${contactTopicLabel(value.topic)}`,
        text: buildContactEmailText(value),
      }),
    });
    if (!sent.ok) {
      await mark("failed");
      console.warn(`contact email failed: resend status ${sent.status}`);
      return json(origin, { ok: false, code: "send_failed", error: contactSendFailedError(toEmail) }, 502);
    }
  } catch {
    await mark("failed");
    console.warn("contact email failed");
    return json(origin, { ok: false, code: "send_failed", error: contactSendFailedError(toEmail) }, 502);
  }

  await mark("sent");
  return json(origin, { ok: true }, 200);
}
