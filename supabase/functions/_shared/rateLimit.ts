/**
 * DB-backed rate limits for edge functions (public.check_rate_limit). Supabase only.
 * Subjects are hashed in the database; raw IPs and emails are not stored.
 */
export type RpcFn = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: string | null }>;

export type RateLimitRule = { bucket: string; max: number; windowSeconds: number };

/** Limits per function. Generous for people, tight for scripts. */
export const RATE_LIMITS = {
  connectionCheckoutUser: { bucket: "connection_checkout:user", max: 10, windowSeconds: 600 },
  connectionCheckoutIp: { bucket: "connection_checkout:ip", max: 30, windowSeconds: 600 },
  signupFeeCheckoutUser: { bucket: "signup_fee_checkout:user", max: 10, windowSeconds: 600 },
  reconcileUser: { bucket: "checkout_reconcile:user", max: 30, windowSeconds: 600 },
  deleteAccountUser: { bucket: "delete_account:user", max: 5, windowSeconds: 3600 },
  unsubscribeIp: { bucket: "notification_unsubscribe:ip", max: 30, windowSeconds: 600 },
  // For PR #92 (contact form) and PR #83 (Priority Help) once they merge.
  contactFormIp: { bucket: "contact_form:ip", max: 5, windowSeconds: 3600 },
  contactFormEmail: { bucket: "contact_form:email", max: 3, windowSeconds: 3600 },
  priorityHelpIp: { bucket: "priority_help:ip", max: 30, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

/** First client address from the proxy headers Supabase Edge Functions receive. */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim() ?? "";
  const candidate = first || (req.headers.get("cf-connecting-ip") ?? "").trim() || (req.headers.get("x-real-ip") ?? "").trim();
  if (!candidate || candidate.length > 64 || !/^[0-9a-fA-F:.]+$/.test(candidate)) return null;
  return candidate;
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Fails OPEN if the rate-limit RPC itself errors (logs and allows), so a database hiccup
 * never blocks a paying customer. A clear "not allowed" answer is enforced.
 */
export async function checkRateLimit(
  rpc: RpcFn,
  rule: RateLimitRule,
  subject: string | null | undefined,
): Promise<RateLimitResult> {
  if (!subject) return { allowed: true, retryAfterSeconds: 0 };
  const res = await rpc("check_rate_limit", {
    p_bucket: rule.bucket,
    p_subject: subject,
    p_max: rule.max,
    p_window_seconds: rule.windowSeconds,
  });
  if (res.error) {
    console.warn(`rate limit check failed for ${rule.bucket}; allowing`);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const data = (res.data ?? {}) as { allowed?: boolean; retry_after_seconds?: number };
  return { allowed: data.allowed !== false, retryAfterSeconds: Math.max(0, Number(data.retry_after_seconds ?? 0)) };
}

export function rateLimitedResponse(retryAfterSeconds: number, extra: Record<string, unknown> = {}): Response {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return new Response(
    JSON.stringify({ error: "Too many requests. Please wait a moment and try again.", rate_limited: true, retry_after_seconds: seconds, ...extra }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(seconds),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
      },
    },
  );
}

/** Checks rules in order; returns a 429 Response for the first one exceeded, else null. */
export async function enforceRateLimits(
  rpc: RpcFn,
  checks: Array<{ rule: RateLimitRule; subject: string | null | undefined }>,
  extra: Record<string, unknown> = {},
): Promise<Response | null> {
  for (const check of checks) {
    const result = await checkRateLimit(rpc, check.rule, check.subject);
    if (!result.allowed) return rateLimitedResponse(result.retryAfterSeconds, extra);
  }
  return null;
}
