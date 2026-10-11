import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const helper = readFileSync(
  path.join(root, "supabase/migrations/20261019000001_admin_sensitive_step_up.sql"),
  "utf8",
);
const calls = readFileSync(
  path.join(root, "supabase/migrations/20261019000002_admin_sensitive_step_up_calls.sql"),
  "utf8",
);
const helperRollback = readFileSync(
  path.join(root, "supabase/rollbacks/20261019000001_admin_sensitive_step_up_rollback.sql"),
  "utf8",
);
const callsRollback = readFileSync(
  path.join(root, "supabase/rollbacks/20261019000002_admin_sensitive_step_up_calls_rollback.sql"),
  "utf8",
);
const checklist = readFileSync(path.join(root, "docs/admin/mfa-enforcement-checklist.md"), "utf8");

const sensitive = [
  "admin_approve_contractor",
  "admin_reject_contractor",
  "admin_request_contractor_info",
  "admin_set_account_flag",
  "admin_grant_booking_contact_access",
  "admin_revoke_booking_contact_access",
  "admin_grant_connection_contact_access",
  "admin_revoke_connection_contact_access",
  "admin_set_portfolio_privacy",
  "admin_set_platform_review_status",
];

function body(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("admin sensitive step-up SQL", () => {
  it("leaves the enforcement flag off and uses a 15 minute totp window", () => {
    expect(helper).toMatch(/interval '15 minutes'/);
    expect(helper).toMatch(/IF NOT public\.admin_mfa_required\(\) THEN/);
    expect(helper).toMatch(/entry ->> 'method' = 'totp'/);
    expect(helper).toMatch(/RAISE EXCEPTION 'admin step-up required'/);
    expect(helper).toMatch(/REVOKE ALL ON FUNCTION public\.assert_admin_sensitive_step_up\(\) FROM PUBLIC, anon, authenticated/);
    expect(helper).not.toMatch(/UPDATE\s+public\.platform_settings/i);
    expect(helper).not.toMatch(/admin_mfa_required',\s*\n\s*1/);
    expect(helper).toMatch(/Does not change payments, fees, Stripe/);
    expect(helper).not.toMatch(/signup_fee_cents|connection_fee_cents/);
    expect(calls).not.toMatch(/UPDATE\s+public\.platform_settings/i);
    expect(calls).toMatch(/Does not change payments, fees, Stripe/);
    expect(calls).not.toMatch(/signup_fee_cents|connection_fee_cents|stripe\.(customers|paymentIntents)/);
  });

  it("adds one step-up call after the existing admin check and nowhere else", () => {
    for (const name of sensitive) {
      const fn = body(calls, name);
      expect(fn.match(/PERFORM public\.assert_admin_sensitive_step_up\(\);/g)).toEqual([
        "PERFORM public.assert_admin_sensitive_step_up();",
      ]);
      const rolled = body(callsRollback, name);
      expect(rolled).not.toMatch(/assert_admin_sensitive_step_up/);
    }
  });

  it("steps up platform-review writes and portfolio privacy changes without changing auto-approve", () => {
    const review = body(calls, "protect_platform_review");
    expect(review).toMatch(/Auto-approve valid signed-in reviews/);
    expect(review.match(/PERFORM public\.assert_admin_sensitive_step_up\(\);/g)).toHaveLength(2);
    expect(review).toMatch(/only an admin can change a platform review/);
    expect(review).toMatch(/only an admin can delete a platform review/);

    const photos = body(calls, "enforce_contractor_portfolio_privacy");
    expect(photos).toMatch(/IF auth\.uid\(\) IS NULL THEN/);
    expect(photos).toMatch(/NEW\.privacy_state IS DISTINCT FROM OLD\.privacy_state/);
    expect(photos.match(/PERFORM public\.assert_admin_sensitive_step_up\(\);/g)).toHaveLength(1);
    expect(photos).toMatch(/You cannot change it yourself/);

    expect(body(callsRollback, "protect_platform_review")).not.toMatch(/assert_admin_sensitive_step_up/);
    expect(body(callsRollback, "enforce_contractor_portfolio_privacy")).toMatch(
      /IF auth\.uid\(\) IS NULL OR public\.is_admin\(\) THEN/,
    );
  });

  it("ends every function body with a semicolon so the file runs as one script", () => {
    for (const sql of [calls, callsRollback]) {
      const creates = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
      const ends = sql.match(/^\$function\$;/gm) ?? [];
      expect(creates.length).toBe(12);
      expect(ends.length).toBe(creates.length);
      expect(sql).not.toMatch(/^\$function\$\s*$/m);
    }
  });

  it("keeps the PR #90 null-uid delete rule for account deletion", () => {
    const review = body(calls, "protect_platform_review");
    const del = review.slice(review.indexOf("IF TG_OP = 'DELETE' THEN"));
    const nullUid = del.indexOf("IF auth.uid() IS NULL THEN\n      RETURN OLD;");
    expect(nullUid).toBeGreaterThan(-1);
    expect(nullUid).toBeLessThan(del.indexOf("IF NOT public.is_admin() THEN"));
    expect(nullUid).toBeLessThan(del.indexOf("PERFORM public.assert_admin_sensitive_step_up();"));
    const rolled = body(callsRollback, "protect_platform_review");
    expect(rolled).toMatch(/IF auth\.uid\(\) IS NOT NULL AND NOT public\.is_admin\(\) THEN/);
  });

  it("the SQL walkthrough loads 000002 and checks a stale code", () => {
    const walk = readFileSync(path.join(root, "supabase/tests/admin_sensitive_step_up.sql"), "utf8");
    expect(walk).toMatch(/\\ir \.\.\/migrations\/20261019000002_admin_sensitive_step_up_calls\.sql/);
    expect(walk).toMatch(/interval '16 minutes'/);
    expect(walk).toMatch(/null-uid account-deletion purge/);
  });

  it("tells the owner to enroll two devices before flipping the flag", () => {
    expect(checklist).toMatch(/Leave it at 0/);
    expect(checklist).toMatch(/second authenticator/i);
    expect(checklist).toMatch(/15 minutes/);
    expect(checklist).toMatch(/value_int = 0/);
    expect(checklist).toMatch(/Do not change Stripe/);
  });

  it("rolls the helpers back without touching the flag", () => {
    expect(helperRollback).toMatch(/DROP FUNCTION IF EXISTS public\.assert_admin_sensitive_step_up\(\)/);
    expect(helperRollback).not.toMatch(/UPDATE\s+public\.platform_settings/i);
    expect(callsRollback).not.toMatch(/UPDATE\s+public\.platform_settings/i);
  });
});
