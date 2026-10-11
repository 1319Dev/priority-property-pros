import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261019200001_platform_reviews_pending_activation.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(root, "supabase/rollbacks/20261019200001_platform_reviews_pending_activation_rollback.sql"),
  "utf8",
);
const proof = readFileSync(path.join(root, "supabase/tests/platform_review_pending.sql"), "utf8");

describe("platform review pending migration", () => {
  it("forces new rows to pending for activated accounts and leaves existing rows alone", () => {
    expect(migration).toMatch(/signup_fee_status::text/);
    expect(migration).toMatch(/v_fee NOT IN \('PAID', 'NOT_REQUIRED'\)/);
    expect(migration).toMatch(/account activation is required before leaving a platform review/);
    expect(migration).toMatch(/NEW\.status := 'PENDING'/);
    expect(migration).not.toMatch(/NEW\.status := 'APPROVED'/);
    expect(migration).not.toMatch(/UPDATE public\.platform_reviews[\s\S]{0,80}PENDING/);
    expect(migration).toMatch(/REVOKE UPDATE ON TABLE public\.platform_reviews FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/ppp\.platform_review_reason/);
    expect(migration).toMatch(/platform_review\.rejected/);
    expect(migration).toMatch(/a reason between 3 and 500 characters is required/);
    expect(migration).toMatch(/SET search_path = public/);
    expect(migration).toMatch(/to_regprocedure\('public\.assert_admin_sensitive_step_up\(\)'\)/);
    expect(migration).toMatch(/EXECUTE 'SELECT public\.assert_admin_sensitive_step_up\(\)'/);
    expect(migration).toMatch(/PERFORM public\.admin_moderation_step_up\(\)/);
    expect(migration).toMatch(/IF auth\.uid\(\) IS NULL THEN/);
    expect(migration).not.toMatch(/stripe|payment_intent|signup_fee_charges/i);
    expect(rollback).toMatch(/NEW\.status := 'APPROVED'/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.admin_moderation_step_up\(\)/);
    expect(rollback).toMatch(/GRANT UPDATE \(status\) ON TABLE public\.platform_reviews TO authenticated/);
    expect(rollback).not.toMatch(/DROP TABLE/i);
    expect(rollback).not.toMatch(/UPDATE public\.platform_reviews\s+SET status = 'APPROVED'/i);
  });

  it("proves non-admins cannot moderate and pending rows are not public", () => {
    expect(proof).toMatch(/anon saw/);
    expect(proof).toMatch(/customer was allowed to moderate/);
    expect(proof).toMatch(/SET LOCAL ROLE anon/);
    expect(proof).toMatch(/SET LOCAL ROLE authenticated/);
    expect(proof).toMatch(/existing approved review was changed/);
    expect(proof).toMatch(/unpaid account was allowed to submit/);
    expect(proof).toMatch(/short reject reason was accepted/);
    expect(proof).toMatch(/reject was not audited/);
    expect(proof).toMatch(/direct status update was allowed/);
    expect(proof).toMatch(/admin step-up required/);
    expect(proof).toMatch(/step-up failure changed the review/);
    expect(proof).toMatch(/signed-in non-admin was allowed to delete/);
    expect(proof).toMatch(/null-uid delete did not remove the row/);
  });
});
