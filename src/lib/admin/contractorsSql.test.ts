import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(repoRoot, "supabase/migrations/20261019300002_admin_contractors_directory.sql"),
  "utf8",
);

describe("contractors directory SQL", () => {
  it("gates both functions and keeps an allowlist", () => {
    for (const name of [
      "admin_list_contractors(text, text, boolean, integer, integer)",
      "admin_get_contractor(uuid, boolean)",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${name} FROM PUBLIC, anon`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${name} TO authenticated`);
    }
    expect(migration).toContain("PERFORM public.admin_require()");
    expect(migration).toContain("admin_account_is_excluded");
    expect(migration).toContain("'business_name'");
    expect(migration).toContain("'trades'");
    expect(migration).toContain("'signup_fee_status'");
    expect(migration).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
    expect(migration).not.toMatch(/stripe_|phone|street_line|fee_cents|license_number|\blat\b|\blng\b/);
  });
});
