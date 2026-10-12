import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIp,
  enforceRateLimits,
  rateLimitedResponse,
  type RpcFn,
} from "../../../supabase/functions/_shared/rateLimit.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function rpc(answer: { data?: unknown; error?: string | null }): { fn: RpcFn; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    fn: async (_name, args) => {
      calls.push(args);
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  };
}

describe("edge rate-limit helper", () => {
  it("reads the first forwarded client IP and rejects junk", () => {
    expect(clientIp(new Request("https://x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }))).toBe("203.0.113.7");
    expect(clientIp(new Request("https://x", { headers: { "cf-connecting-ip": "2001:db8::1" } }))).toBe("2001:db8::1");
    expect(clientIp(new Request("https://x", { headers: { "x-forwarded-for": "<script>" } }))).toBeNull();
    expect(clientIp(new Request("https://x"))).toBeNull();
  });

  it("enforces a clear refusal with 429 and Retry-After", async () => {
    const { fn, calls } = rpc({ data: { allowed: false, retry_after_seconds: 42 } });
    const res = await enforceRateLimits(fn, [{ rule: RATE_LIMITS.connectionCheckoutUser, subject: "user:1" }], { paid: false });
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("42");
    expect(await res?.json()).toMatchObject({ rate_limited: true, paid: false });
    expect(calls[0]).toEqual({ p_bucket: "connection_checkout:user", p_subject: "user:1", p_max: 10, p_window_seconds: 600 });
  });

  it("allows when under the limit, when there is no subject, and fails open if the RPC errors", async () => {
    expect(await checkRateLimit(rpc({ data: { allowed: true } }).fn, RATE_LIMITS.reconcileUser, "user:1")).toEqual({ allowed: true, retryAfterSeconds: 0 });
    const none = rpc({ data: { allowed: false } });
    expect((await checkRateLimit(none.fn, RATE_LIMITS.unsubscribeIp, null)).allowed).toBe(true);
    expect(none.calls).toHaveLength(0);
    expect((await checkRateLimit(rpc({ error: "db down" }).fn, RATE_LIMITS.reconcileUser, "user:1")).allowed).toBe(true);
    expect(rateLimitedResponse(0).headers.get("Retry-After")).toBe("1");
  });

  it("is wired into checkout, reconcile, and unsubscribe functions before any Stripe call", () => {
    const checkout = read("supabase/functions/create-connection-checkout/index.ts");
    expect(checkout.indexOf("enforceRateLimits(restRpc")).toBeGreaterThan(-1);
    expect(checkout.indexOf("enforceRateLimits(restRpc")).toBeLessThan(checkout.indexOf("stripeGet(secret"));
    expect(checkout).toMatch(/RATE_LIMITS\.connectionCheckoutIp/);
    const signupFee = read("supabase/functions/create-signup-fee-checkout/index.ts");
    expect(signupFee.indexOf("enforceRateLimits(restRpc")).toBeLessThan(signupFee.indexOf("stripeForm("));
    for (const rel of ["supabase/functions/reconcile-connection-checkout/index.ts", "supabase/functions/reconcile-signup-fee-checkout/index.ts"]) {
      const src = read(rel);
      expect(src.indexOf("RATE_LIMITS.reconcileUser")).toBeLessThan(src.indexOf("stripeGet("));
    }
    const unsub = read("supabase/functions/notification-unsubscribe/index.ts");
    expect(unsub.indexOf("RATE_LIMITS.unsubscribeIp")).toBeLessThan(unsub.indexOf("verifyUnsubscribeToken(token"));
  });
});

describe("abuse protection migration", () => {
  const sql = read("supabase/migrations/20261020300001_abuse_rate_limits_signup_guard.sql");
  const rollback = read("supabase/rollbacks/20261020300001_abuse_rate_limits_signup_guard_rollback.sql");

  it("implements the requested signup limits and fails open", () => {
    expect(sql).toMatch(/c_per_ip_hour constant integer := 3;/);
    expect(sql).toMatch(/c_total_hour constant integer := 50;/);
    expect(sql).toMatch(/email_domain_is_blocked\(v_domain\)/);
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS THEN[\s\S]*'error_allowed'[\s\S]*RETURN '\{\}'::jsonb;/);
  });

  it("stores hashes, not raw IPs or emails, and keeps tables private", () => {
    expect(sql).toMatch(/sha256\(convert_to\(/);
    expect(sql).not.toMatch(/ip_address text|email text NOT NULL/);
    for (const table of ["rate_limit_hits", "blocked_email_domains", "signup_guard_log"]) {
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated;`);
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.hook_before_user_created\(jsonb\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.hook_before_user_created\(jsonb\) TO supabase_auth_admin/);
  });

  it("does not turn the hook on or change Auth, fee, or payment settings", () => {
    expect(sql).not.toMatch(/auth\.config|hook_before_user_created_enabled|platform_settings|stripe|_cents/i);
  });

  it("rolls back every object, with the hook-off warning first", () => {
    expect(rollback).toMatch(/turn it OFF first/);
    for (const name of ["admin_signup_guard_summary", "hook_before_user_created", "email_domain_is_blocked", "check_rate_limit", "rate_limit_subject_hash"]) {
      expect(rollback).toContain(`DROP FUNCTION IF EXISTS public.${name}(`);
    }
    for (const table of ["signup_guard_log", "blocked_email_domains", "rate_limit_hits"]) {
      expect(rollback).toContain(`DROP TABLE IF EXISTS public.${table};`);
    }
  });
});
