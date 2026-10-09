import type { EmailOtpType } from "@supabase/supabase-js";

export type RecoveryLink =
  | { kind: "token_hash"; tokenHash: string; type: string }
  | { kind: "code"; code: string }
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error"; code: string | null; description: string | null }
  | { kind: "none" };

export const EXPIRED_RESET_LINK_MESSAGE = "This reset link is missing or expired.";

export const DIFFERENT_BROWSER_RESET_MESSAGE =
  "This link was opened in a different browser than the one that asked for it. Request a new link below.";

export const PASSWORD_RESET_RATE_LIMIT_MESSAGE = "Please wait a minute before asking for another link";

const RECOVERY_QUERY_KEYS = [
  "access_token",
  "refresh_token",
  "expires_in",
  "expires_at",
  "token_type",
  "provider_token",
  "provider_refresh_token",
  "type",
  "code",
  "token_hash",
  "error",
  "error_code",
  "error_description",
  "sb_flow_id",
] as const;

let snapshot: RecoveryLink = { kind: "none" };
const attempts = new Map<string, Promise<RecoveryEstablishResult>>();

export type RecoveryAuthError = { message: string; code?: string | null };

export type RecoverySessionApi = {
  getSession: () => Promise<{ data: { session: unknown } }>;
  setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<{ error: RecoveryAuthError | null }>;
  verifyOtp: (params: { token_hash: string; type: "recovery" }) => Promise<{ error: RecoveryAuthError | null }>;
  exchangeCodeForSession: (code: string) => Promise<{ error: RecoveryAuthError | null }>;
};

export type RecoveryEstablishResult = { status: "ready" } | { status: "expired"; message: string };

type ActionLink = Extract<RecoveryLink, { kind: "token_hash" | "code" | "tokens" }>;

function paramsFrom(value: string, prefix: "?" | "#"): URLSearchParams {
  const trimmed = value.startsWith(prefix) ? value.slice(1) : value;
  return new URLSearchParams(trimmed);
}

function pick(query: URLSearchParams, fragment: URLSearchParams, key: string): string | null {
  const fromQuery = query.get(key);
  if (fromQuery) return fromQuery;
  const fromHash = fragment.get(key);
  if (fromHash) return fromHash;
  return null;
}

/**
 * Read a Supabase redirect. Query wins over the hash for the same key, matching
 * supabase-js. An error beats token_hash, which beats a PKCE code, which beats
 * implicit tokens.
 */
export function parseRecoveryParams(search: string, hash: string): RecoveryLink {
  const query = paramsFrom(search, "?");
  const fragment = paramsFrom(hash, "#");
  const read = (key: string) => pick(query, fragment, key);

  const error = read("error");
  const errorCode = read("error_code");
  const description = read("error_description");
  if (error || errorCode || description) {
    return { kind: "error", code: errorCode ?? error, description };
  }

  const tokenHash = read("token_hash");
  const type = read("type");
  if (tokenHash && type) {
    return { kind: "token_hash", tokenHash, type };
  }

  const code = read("code");
  if (code) return { kind: "code", code };

  const accessToken = read("access_token");
  const refreshToken = read("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "tokens", accessToken, refreshToken };
  }

  return { kind: "none" };
}

export function captureRecoveryLink(search: string, hash: string): RecoveryLink {
  snapshot = parseRecoveryParams(search, hash);
  return snapshot;
}

export function getRecoveryLinkSnapshot(): RecoveryLink {
  return snapshot;
}

export function expiredResetMessage(reason: string | null | undefined): string {
  const detail = reason?.replace(/\s+/g, " ").trim();
  if (!detail || detail === EXPIRED_RESET_LINK_MESSAGE) return EXPIRED_RESET_LINK_MESSAGE;
  return `${EXPIRED_RESET_LINK_MESSAGE} ${detail}`;
}

export function isMissingPkceVerifier(error: { message?: string; code?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "pkce_code_verifier_not_found") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("code verifier") || message.includes("code_verifier");
}

export function passwordResetRequestMessage(result: { error: string | null; status?: number | null }): string | null {
  if (!result.error && result.status !== 429) return null;
  if (result.status === 429) return PASSWORD_RESET_RATE_LIMIT_MESSAGE;
  const message = result.error ?? "";
  if (/rate limit|too many requests|only request this once|over_request_rate_limit|for security purposes/i.test(message)) {
    return PASSWORD_RESET_RATE_LIMIT_MESSAGE;
  }
  return result.error;
}

export function emailOtpType(value: string | null | undefined): EmailOtpType | null {
  if (!value?.trim()) return null;
  return value as EmailOtpType;
}

export function stripRecoveryCredentialsFromLocation(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of RECOVERY_QUERY_KEYS) {
    if (!url.searchParams.has(key)) continue;
    url.searchParams.delete(key);
    changed = true;
  }
  if (url.hash) {
    url.hash = "";
    changed = true;
  }
  if (!changed) return;
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function attemptKey(link: ActionLink): string {
  switch (link.kind) {
    case "token_hash":
      return `token_hash:${link.type}:${link.tokenHash}`;
    case "code":
      return `code:${link.code}`;
    case "tokens":
      return `tokens:${link.accessToken}:${link.refreshToken}`;
  }
}

async function runRecovery(api: RecoverySessionApi, link: ActionLink): Promise<RecoveryEstablishResult> {
  try {
    if (link.kind === "token_hash") {
      const { error } = await api.verifyOtp({ token_hash: link.tokenHash, type: "recovery" });
      if (error) return { status: "expired", message: expiredResetMessage(error.message) };
      return { status: "ready" };
    }

    if (link.kind === "tokens") {
      const { error } = await api.setSession({
        access_token: link.accessToken,
        refresh_token: link.refreshToken,
      });
      if (error) return { status: "expired", message: expiredResetMessage(error.message) };
      return { status: "ready" };
    }

    const existing = await api.getSession();
    if (existing.data.session) return { status: "ready" };
    const { error } = await api.exchangeCodeForSession(link.code);
    if (!error) return { status: "ready" };
    const after = await api.getSession();
    if (after.data.session) return { status: "ready" };
    if (isMissingPkceVerifier(error)) {
      return { status: "expired", message: DIFFERENT_BROWSER_RESET_MESSAGE };
    }
    return { status: "expired", message: expiredResetMessage(error.message) };
  } catch (error) {
    const message = error instanceof Error ? error.message : null;
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : null;
    if (isMissingPkceVerifier({ message: message ?? undefined, code })) {
      return { status: "expired", message: DIFFERENT_BROWSER_RESET_MESSAGE };
    }
    return { status: "expired", message: expiredResetMessage(message) };
  }
}

/** One in-flight attempt per link so StrictMode does not consume a token twice. */
export function establishRecoverySession(api: RecoverySessionApi, link: ActionLink): Promise<RecoveryEstablishResult> {
  const key = attemptKey(link);
  const cached = attempts.get(key);
  if (cached) return cached;
  const promise = runRecovery(api, link);
  attempts.set(key, promise);
  return promise;
}

export function resetRecoveryLinkStateForTests(): void {
  snapshot = { kind: "none" };
  attempts.clear();
}
