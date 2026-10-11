import { AI_UNAVAILABLE, classifyCustomerMessage, HUMAN_HANDOFF, sanitizeAssistantReply } from "./guardrails";
import { formatLivePricing, type LivePricing } from "./pricing";
import { buildPrompt, type KbExcerpt } from "./prompt";
import { completeChat, DEFAULT_PRIORITY_HELP_BASE_URL, DEFAULT_PRIORITY_HELP_MODEL, ProviderError } from "./provider";

export type RpcResult = { data: unknown; error: string | null };

export type PriorityHelpDeps = {
  env: (key: string) => string | undefined;
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  userIdFromAuthorization: (authorization: string) => Promise<string | null>;
  fetchImpl: typeof fetch;
  randomToken?: () => string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim().slice(0, 64) ?? "";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asPricing(value: unknown): LivePricing {
  const row = asRecord(value);
  return {
    signup_fee_cents: typeof row.signup_fee_cents === "number" ? row.signup_fee_cents : null,
    signup_fee_enabled: row.signup_fee_enabled === true,
    connection_fee_cents: typeof row.connection_fee_cents === "number" ? row.connection_fee_cents : null,
    connection_fee_enabled: row.connection_fee_enabled === true,
    payments_live: row.payments_live === true,
    charges_live: row.charges_live === true,
  };
}

function asArticles(value: unknown): KbExcerpt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (typeof row.title !== "string" || typeof row.excerpt !== "string") return [];
    return [{ title: row.title, excerpt: row.excerpt, slug: typeof row.slug === "string" ? row.slug : undefined }];
  });
}

async function verifyTurnstile(input: {
  secret: string;
  token: string;
  ip: string;
  fetchImpl: typeof fetch;
}): Promise<boolean> {
  const body = new URLSearchParams();
  body.set("secret", input.secret);
  body.set("response", input.token);
  if (input.ip) body.set("remoteip", input.ip);
  const response = await input.fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  if (!response.ok) return false;
  const parsed = asRecord(await response.json());
  return parsed.success === true;
}

export async function handlePriorityHelp(req: Request, deps: PriorityHelpDeps): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = asRecord(await req.json());
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const action = payload.action;
  if (action !== "open" && action !== "send" && action !== "escalate" && action !== "history" && action !== "availability") {
    return json({ error: "unknown action" }, 400);
  }

  const turnstileSecret = (deps.env("PRIORITY_HELP_TURNSTILE_SECRET") ?? "").trim();
  const ip = clientIp(req);
  if (turnstileSecret && action !== "availability") {
    const token = typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";
    if (!token) return json({ error: "turnstile required" }, 400);
    const passed = await verifyTurnstile({ secret: turnstileSecret, token, ip, fetchImpl: deps.fetchImpl });
    if (!passed) return json({ error: "turnstile failed" }, 400);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const userId = authorization ? await deps.userIdFromAuthorization(authorization) : null;
  const guestToken = userId ? "" : typeof payload.guestToken === "string" ? payload.guestToken.trim() : "";
  const honeypot = typeof payload.company_website === "string" ? payload.company_website : "";
  const salt = (deps.env("PRIORITY_HELP_IP_HASH_SALT") ?? "priority-help-v1").trim() || "priority-help-v1";
  const ipHash = ip ? await sha256Hex(`${salt}:${ip}`) : "";

  if (action === "availability") {
    const context = await deps.rpc("support_service_context", { p_query: "" });
    if (context.error) return json({ error: "support is unavailable" }, 503);
    const row = asRecord(context.data);
    return json({
      ok: true,
      mode: aiMode(deps),
      availability: typeof row.availability === "string" ? row.availability : "offline",
      humanJoined: false,
    });
  }

  if ((action === "send" || action === "escalate") && honeypot.trim()) {
    return json({ ok: true, mode: aiMode(deps), availability: "offline", humanJoined: false });
  }

  const session = await openSession({ deps, userId, guestToken, ipHash });
  if ("error" in session) return json({ error: session.error }, session.status);

  if (action === "open" || action === "history") {
    return json({
      ok: true,
      mode: aiMode(deps),
      guestToken: session.issuedToken,
      availability: session.availability,
      humanJoined: session.humanJoined,
      conversation: session.conversation,
    });
  }

  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) return json({ error: "message is empty" }, 400);
  if (body.length > 2000) return json({ error: "message is too long" }, 400);

  if (action === "escalate") {
    const escalated = await deps.rpc("support_service_escalate", {
      p_user_id: userId,
      p_guest_token_hash: session.guestHash,
      p_conversation_id: session.conversationId,
      p_body: body,
      p_honeypot: "",
      p_ip_hash: ipHash,
    });
    if (escalated.error) return json({ error: publicRpcError(escalated.error) }, 400);
    const conversation = asRecord(escalated.data);
    return json({
      ok: true,
      mode: aiMode(deps),
      availability: typeof conversation.availability === "string" ? conversation.availability : session.availability,
      humanJoined: conversation.human_joined === true,
      reference: typeof conversation.reference === "string" ? conversation.reference : null,
      conversation,
    });
  }

  const decision = classifyCustomerMessage(body);
  const stored = await deps.rpc("support_service_customer_message", {
    p_user_id: userId,
    p_guest_token_hash: session.guestHash,
    p_conversation_id: session.conversationId,
    p_body: body,
    p_honeypot: "",
    p_ip_hash: ipHash,
  });
  if (stored.error) return json({ error: publicRpcError(stored.error) }, 400);
  if (asRecord(stored.data).dropped === true) {
    return json({ ok: true, mode: aiMode(deps), availability: session.availability, humanJoined: false, conversation: session.conversation });
  }

  const apiKey = (deps.env("PRIORITY_HELP_AI_API_KEY") ?? "").trim();
  if (!apiKey || decision.action === "refuse") {
    const reply = decision.action === "refuse" ? decision.message : AI_UNAVAILABLE;
    if (decision.action === "refuse") {
      await deps.rpc("support_service_assistant_message", {
        p_conversation_id: session.conversationId,
        p_body: reply,
      });
    }
    return json({
      ok: true,
      mode: apiKey ? "ai" : "human_only",
      availability: session.availability,
      humanJoined: false,
      answer: decision.action === "refuse" ? reply : null,
      refusal: reply,
      conversation: asRecord(stored.data),
    });
  }

  const context = await deps.rpc("support_service_context", { p_query: body.slice(0, 240) });
  const contextRow = asRecord(context.data);
  const pricing = asPricing(contextRow.pricing);
  const articles = asArticles(contextRow.articles);
  const history: Array<{ role: "customer" | "assistant"; body: string }> = [];
  const prior = asRecord(stored.data).messages;
  if (Array.isArray(prior)) {
    for (const item of prior) {
      const row = asRecord(item);
      if ((row.role === "customer" || row.role === "assistant") && typeof row.body === "string") {
        history.push({ role: row.role, body: row.body });
      }
    }
  }
  const messages = buildPrompt({ pricing, articles, history, question: body });
  if (messages.some((message) => /contractor_fee|\b700\b/.test(message.content))) {
    return json({ ok: true, mode: "ai", answer: HUMAN_HANDOFF, refusal: HUMAN_HANDOFF, humanJoined: false, availability: session.availability });
  }

  let draft: string;
  try {
    const completed = await completeChat({
      apiKey,
      model: (deps.env("PRIORITY_HELP_AI_MODEL") ?? "").trim() || DEFAULT_PRIORITY_HELP_MODEL,
      baseUrl: (deps.env("PRIORITY_HELP_AI_BASE_URL") ?? "").trim() || DEFAULT_PRIORITY_HELP_BASE_URL,
      messages,
      fetchImpl: deps.fetchImpl,
    });
    draft = completed.text;
  } catch (err) {
    if (!(err instanceof ProviderError)) {
      /* keep the provider body off the client either way */
    }
    draft = AI_UNAVAILABLE;
  }
  const safe = sanitizeAssistantReply(draft);
  await deps.rpc("support_service_assistant_message", {
    p_conversation_id: session.conversationId,
    p_body: safe.text,
  });
  return json({
    ok: true,
    mode: "ai",
    availability: typeof contextRow.availability === "string" ? contextRow.availability : session.availability,
    humanJoined: false,
    answer: safe.text,
    refusal: safe.blocked ? safe.text : null,
    pricingSummary: formatLivePricing(pricing),
    conversation: asRecord(stored.data),
  });
}

function aiMode(deps: PriorityHelpDeps): "ai" | "human_only" {
  return (deps.env("PRIORITY_HELP_AI_API_KEY") ?? "").trim() ? "ai" : "human_only";
}

function publicRpcError(error: string): string {
  if (/too many support requests/i.test(error)) return "too many support requests";
  if (/message is too long/i.test(error)) return "message is too long";
  if (/not your conversation/i.test(error)) return "not your conversation";
  if (/closed/i.test(error)) return "this conversation is closed";
  return "support could not save that message";
}

async function openSession(input: {
  deps: PriorityHelpDeps;
  userId: string | null;
  guestToken: string;
  ipHash: string;
}): Promise<
  | {
      conversationId: string;
      conversation: Record<string, unknown>;
      guestHash: string | null;
      issuedToken: string | null;
      availability: string;
      humanJoined: boolean;
    }
  | { error: string; status: number }
> {
  let issuedToken: string | null = null;
  let guestHash: string | null = null;
  if (!input.userId) {
    const token = input.guestToken || (input.deps.randomToken ?? randomToken)();
    if (!input.guestToken) issuedToken = token;
    guestHash = await sha256Hex(token);
  }
  const opened = await input.deps.rpc("support_service_open", {
    p_user_id: input.userId,
    p_guest_token_hash: guestHash,
    p_ip_hash: input.ipHash,
  });
  if (opened.error) return { error: "support is unavailable", status: 503 };
  const conversation = asRecord(opened.data);
  const conversationId = typeof conversation.id === "string" ? conversation.id : "";
  if (!UUID.test(conversationId)) return { error: "support is unavailable", status: 503 };
  return {
    conversationId,
    conversation,
    guestHash,
    issuedToken,
    availability: typeof conversation.availability === "string" ? conversation.availability : "offline",
    humanJoined: conversation.human_joined === true,
  };
}
