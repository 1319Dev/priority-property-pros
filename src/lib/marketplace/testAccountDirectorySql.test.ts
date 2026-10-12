import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const NAME = "20261021000001_exclude_test_accounts_from_public_directory";
const migration = readFileSync(path.join(root, `supabase/migrations/${NAME}.sql`), "utf8");
const rollback = readFileSync(path.join(root, `supabase/rollbacks/${NAME}_rollback.sql`), "utf8");

const VIEWS = [
  "contractor_public_profiles",
  "contractor_public_services",
  "contractor_public_areas",
  "contractor_public_portfolio",
  "contractor_public_reviews",
  "contractor_public_ratings",
];

function block(sql: string, header: string): string {
  const start = sql.indexOf(header);
  expect(start, header).toBeGreaterThan(-1);
  const rest = sql.slice(start + header.length);
  const next = rest.search(/\nCREATE OR REPLACE (VIEW|FUNCTION) |\nDROP FUNCTION /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("TEST-flagged accounts stay out of Find a Pro and matching", () => {
  it("filters every public directory view on the TEST flag and keeps them owner-run", () => {
    for (const view of VIEWS) {
      const body = block(migration, `CREATE OR REPLACE VIEW public.${view}\nWITH (security_invoker = false)`);
      expect(body, view).toMatch(/NOT cp\.directory_hidden AND NOT \(EXISTS \( SELECT 1 FROM admin_account_flags tf WHERE tf\.profile_id = p\.id AND tf\.flag = 'TEST'::text\)\)/);
    }
  });

  it("filters the directory list, the listed check, public portfolio storage, and matching eligibility", () => {
    for (const fn of [
      "contractor_is_directory_listed(",
      "list_public_directory_contractors(",
      "portfolio_storage_is_publicly_readable(",
    ]) {
      expect(block(migration, `CREATE OR REPLACE FUNCTION public.${fn}`), fn).toMatch(
        /AND NOT public\.profile_is_test_flagged\(cp\.profile_id\)/,
      );
    }
    expect(block(migration, "CREATE OR REPLACE FUNCTION public.contractor_eligible_for_project(")).toMatch(
      /IF public\.profile_is_test_flagged\(acct\.id\) THEN\s+RETURN false;/,
    );
  });

  it("only hides TEST, and the helper is not callable from the client", () => {
    const helper = block(migration, "CREATE OR REPLACE FUNCTION public.profile_is_test_flagged(");
    expect(helper).toMatch(/SECURITY DEFINER/);
    expect(helper).toMatch(/f\.flag = 'TEST'/);
    expect(helper).not.toMatch(/OWNER|INTERNAL/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.profile_is_test_flagged\(uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.profile_is_test_flagged/);
    // Definitions only: no row writes, no platform settings (fees, admin_mfa_required) touched.
    expect(migration).not.toMatch(/^\s*(UPDATE|INSERT INTO|DELETE FROM)\s/im);
    expect(migration).not.toMatch(/platform_settings/);
  });

  it("rollback restores every object without the TEST filter and drops the helper last", () => {
    for (const view of VIEWS) {
      const body = block(rollback, `CREATE OR REPLACE VIEW public.${view}\nWITH (security_invoker = false)`);
      expect(body, view).not.toMatch(/admin_account_flags/);
    }
    expect(rollback).not.toMatch(/AND NOT public\.profile_is_test_flagged|IF public\.profile_is_test_flagged/);
    expect(rollback.trim().endsWith("DROP FUNCTION IF EXISTS public.profile_is_test_flagged(uuid);")).toBe(true);
  });
});
