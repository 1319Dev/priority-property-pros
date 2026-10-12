import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(repoRoot, "supabase/migrations/20261019300001_admin_homeowners_directory.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(repoRoot, "supabase/rollbacks/20261019300001_admin_homeowners_directory_rollback.sql"),
  "utf8",
);
const proof = readFileSync(path.join(repoRoot, "supabase/tests/admin_homeowners_directory.sql"), "utf8");

describe("homeowners directory SQL", () => {
  it("gates both functions with is_admin and does not grant anon", () => {
    for (const name of [
      "admin_list_homeowners(text, text, boolean, integer, integer)",
      "admin_get_homeowner(uuid, boolean)",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${name} FROM PUBLIC, anon`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${name} TO authenticated`);
      expect(rollback).toContain(`DROP FUNCTION IF EXISTS public.${name.split("(")[0]}`);
    }
    expect(migration).toContain("PERFORM public.admin_require()");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public");
    expect(migration).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
    expect(migration).not.toMatch(/stripe_|phone|street_line|contractor_fee_bps/);
  });

  it("uses an explicit column allowlist and the test-account flag", () => {
    expect(migration).toContain("admin_account_is_excluded");
    expect(migration).toContain("'profile_id'");
    expect(migration).toContain("'display_name'");
    expect(migration).toContain("'email'");
    expect(migration).toContain("'project_count'");
    expect(migration).toContain("'signup_fee_status'");
    expect(migration).toContain("'reference_number'");
    expect(migration).toContain("'amount_cents'");
    expect(migration).not.toContain("to_jsonb(p");
    expect(proof).toContain("list allowlist mismatch");
    expect(proof).toContain("aal1 admin was allowed");
    expect(proof).toContain("customer was allowed to list homeowners");
  });
});
