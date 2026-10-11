import { SUPPORT_EMAIL } from "../../data/brand";
import { getSupabaseClient } from "../supabase/client";

export const PRIORITY_HELP_FUNCTION = "priority-help";
export const GUEST_TOKEN_STORAGE_KEY = "ppp.priority-help.guest-token";
export const SUPPORT_HANDOFF =
  "I can't share account or contact details here. Use Talk to Support so a person can help.";

const PRIVATE_LEAK =
  /contractor_fee|\b7\s*%|\b\d+\s*bps\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export type HelpRole = "customer" | "assistant" | "admin" | "system";
export type HelpAvailability = "available" | "away" | "offline";
export type HelpMode = "ai" | "human_only";
export type HelpAction = "availability" | "history" | "send" | "escalate";

export type HelpMessage = {
  id: string;
  role: HelpRole;
  body: string;
  createdAt: string;
};

export type HelpResult = {
  ok: boolean;
  mode: HelpMode;
  availability: HelpAvailability;
  humanJoined: boolean;
  reference: string | null;
  alreadyOpen: boolean;
  messages: HelpMessage[];
  guestToken: string | null;
  answer: string | null;
  error: string | null;
};

export type HelpRequest = {
  action: HelpAction;
  body?: string;
  companyWebsite?: string;
  turnstileToken?: string;
  signedIn: boolean;
};

export type HelpTransport = {
  request: (input: HelpRequest) => Promise<HelpResult>;
};

type InvokeError = { message?: string; context?: { json?: () => Promise<unknown> } };
type Invoke = (body: Record<string, unknown>) => Promise<{ data: unknown; error: InvokeError | null }>;

const ROLES = new Set<HelpRole>(["customer", "assistant", "admin", "system"]);

export function availabilityNotice(availability: HelpAvailability, humanJoined: boolean, saved = false): string {
  if (humanJoined) return "A support teammate has joined this conversation.";
  if (availability === "available") return "Support is available. A person has not joined this chat yet.";
  const followUp = saved
    ? "Your message is saved. A person has not joined this chat."
    : "Leave a message and it will be saved. A person has not joined this chat.";
  if (availability === "away") return `Support is away. ${followUp}`;
  return `Support is offline. ${followUp}`;
}

export function safeSupportText(role: HelpRole, body: string): string {
  if (role === "customer") return body;
  return PRIVATE_LEAK.test(body) ? SUPPORT_HANDOFF : body;
}

export function helpErrorMessage(code: string | null): string {
  if (!code) return `That message could not be sent. You can email ${SUPPORT_EMAIL}.`;
  if (/too many/i.test(code)) return "Please wait a few minutes before sending another message.";
  if (/too long/i.test(code)) return "Messages are limited to 2,000 characters.";
  if (/closed/i.test(code)) return "This conversation is closed. Your next message starts a new request.";
  if (/html/i.test(code)) return "Send plain text only.";
  if (/not your conversation/i.test(code)) return "This chat is no longer available. Refresh and try again.";
  if (/unavailable|not configured|failed to fetch|network/i.test(code)) {
    return `Priority Help can't reach the server right now. You can email ${SUPPORT_EMAIL}.`;
  }
  return `That message could not be sent. You can email ${SUPPORT_EMAIL}.`;
}

export function containsSupportHtml(value: string): boolean {
  return /<[A-Za-z/!]/.test(value);
}

function memory(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readGuestToken(): string {
  const value = memory()?.getItem(GUEST_TOKEN_STORAGE_KEY)?.trim() ?? "";
  return value.length >= 20 && !/\s/.test(value) ? value : "";
}

export function writeGuestToken(token: string): void {
  if (token.trim().length < 20 || /\s/.test(token)) return;
  memory()?.setItem(GUEST_TOKEN_STORAGE_KEY, token.trim());
}

export function hasStoredGuestToken(): boolean {
  return readGuestToken().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asAvailability(value: unknown): HelpAvailability {
  return value === "available" || value === "away" || value === "offline" ? value : "offline";
}

function asReference(value: unknown): string | null {
  return typeof value === "string" && /^PH-\d+$/.test(value) ? value : null;
}

function asMessages(value: unknown): HelpMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: HelpMessage[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (row.visibility === "internal") continue;
    const role = row.role;
    if (typeof role !== "string" || !ROLES.has(role as HelpRole)) continue;
    if (typeof row.body !== "string" || !row.body.trim()) continue;
    const safeRole = role as HelpRole;
    messages.push({
      id: typeof row.id === "string" ? row.id : `m-${messages.length}`,
      role: safeRole,
      body: safeSupportText(safeRole, row.body),
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
    });
  }
  return messages;
}

export function normalizeHelpPayload(data: unknown, fallbackError: string | null): HelpResult {
  const raw = asRecord(data);
  const conversation = asRecord(raw.conversation);
  const error = typeof raw.error === "string" ? raw.error : fallbackError;
  const answer = typeof raw.answer === "string" ? safeSupportText("assistant", raw.answer) : null;
  const refusal = typeof raw.refusal === "string" ? safeSupportText("assistant", raw.refusal) : null;
  return {
    ok: raw.ok === true && !error,
    mode: raw.mode === "ai" ? "ai" : "human_only",
    availability: asAvailability(raw.availability ?? conversation.availability),
    humanJoined: raw.humanJoined === true || conversation.human_joined === true,
    reference: asReference(raw.reference) ?? asReference(conversation.reference),
    alreadyOpen: conversation.already_open === true || raw.already_open === true,
    messages: asMessages(conversation.messages),
    guestToken: typeof raw.guestToken === "string" ? raw.guestToken : null,
    answer: answer ?? (refusal && refusal !== answer ? refusal : null),
    error,
  };
}

function unavailable(error: string): HelpResult {
  return normalizeHelpPayload({ ok: false, mode: "human_only", availability: "offline", error }, error);
}

async function errorText(error: InvokeError | null): Promise<string | null> {
  if (!error) return null;
  try {
    const body = await error.context?.json?.();
    const record = asRecord(body);
    if (typeof record.error === "string") return record.error;
  } catch {
    /* the body is optional */
  }
  return error.message?.trim() || "support is unavailable";
}

export async function callPriorityHelp(input: HelpRequest, invoke: Invoke = defaultInvoke): Promise<HelpResult> {
  const guestToken = input.signedIn ? "" : readGuestToken();
  const body: Record<string, unknown> = {
    action: input.action,
    company_website: input.companyWebsite ?? "",
  };
  if (input.body) body.body = input.body;
  if (guestToken) body.guestToken = guestToken;
  if (input.turnstileToken) body.turnstileToken = input.turnstileToken;

  let payload: { data: unknown; error: InvokeError | null };
  try {
    payload = await invoke(body);
  } catch {
    return unavailable("support is unavailable");
  }

  const fallback = await errorText(payload.error);
  const data = payload.data ?? (fallback ? { error: fallback } : null);
  const result = normalizeHelpPayload(data, payload.error ? fallback : null);
  if (!input.signedIn && result.guestToken) writeGuestToken(result.guestToken);
  return result;
}

async function defaultInvoke(body: Record<string, unknown>) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: { message: "support is unavailable" } };
  const result = await supabase.functions.invoke(PRIORITY_HELP_FUNCTION, { body });
  const context = result.error && "context" in result.error ? (result.error.context as InvokeError["context"]) : undefined;
  return {
    data: result.data,
    error: result.error ? { message: result.error.message, context } : null,
  };
}

export function createBrowserHelpTransport(): HelpTransport {
  return { request: (input) => callPriorityHelp(input) };
}
