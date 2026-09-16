import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = path.join(root, "supabase/migrations");

function allSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
    .join("\n\n");
}

describe("Phase 2 SQL migrations", () => {
  const sql = allSql();

  it("creates the required tables", () => {
    for (const table of [
      "profiles",
      "contractor_profiles",
      "verifier_profiles",
      "agreements",
      "agreement_acceptances",
      "audit_logs",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`, "i"));
    }
  });

  it("enables RLS on every Phase 2 table", () => {
    for (const table of [
      "profiles",
      "contractor_profiles",
      "verifier_profiles",
      "agreements",
      "agreement_acceptances",
      "audit_logs",
    ]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
    }
  });

  it("never trusts client metadata for ADMIN", () => {
    expect(sql).toMatch(/permitted_signup_account_type/);
    expect(sql).toMatch(/WHEN 'ADMIN'/i);
    expect(sql).toMatch(/ELSE 'CUSTOMER'::public.account_type/);
    expect(sql).toMatch(/ADMIN cannot be assigned from the client/);
  });

  it("blocks self-approval on contractor and verifier rows", () => {
    expect(sql).toMatch(/cannot self-approve/);
    expect(sql).toMatch(/protect_contractor_approval/);
    expect(sql).toMatch(/protect_verifier_approval/);
  });

  it("keeps audit_logs immutable for clients", () => {
    expect(sql).toMatch(/audit_logs are immutable/);
    expect(sql).not.toMatch(/CREATE POLICY audit_logs_insert/i);
    expect(sql).not.toMatch(/CREATE POLICY audit_logs_update/i);
    expect(sql).not.toMatch(/CREATE POLICY audit_logs_delete/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public.audit_logs TO authenticated/);
  });

  it("does not grant profile writes to anon", () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public.profiles TO authenticated/);
    expect(sql).not.toMatch(/GRANT DELETE ON TABLE public.profiles TO (anon|authenticated)/);
  });

  it("uses a SECURITY DEFINER is_admin() helper to avoid recursive RLS", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public.is_admin/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
  });
});
