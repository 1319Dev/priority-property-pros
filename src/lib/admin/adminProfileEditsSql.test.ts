import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const VERSION = "20261019600001";
const migration = readFileSync(path.join(repoRoot, `supabase/migrations/${VERSION}_admin_profile_edits.sql`), "utf8");
const rollback = readFileSync(path.join(repoRoot, `supabase/rollbacks/${VERSION}_admin_profile_edits_rollback.sql`), "utf8");
const proof = readFileSync(path.join(repoRoot, "supabase/tests/admin_profile_edits.sql"), "utf8");

function body(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = migration.indexOf("$fn$;", start);
  return migration.slice(start, end);
}

const RPCS = [
  "admin_get_customer_editor(uuid)",
  "admin_update_customer_profile(uuid, jsonb, text)",
  "admin_get_contractor_editor(uuid)",
  "admin_update_contractor_profile(uuid, jsonb, text)",
];

describe("admin profile edits SQL", () => {
  it("uses a version no other migration uses", () => {
    const files = readdirSync(path.join(repoRoot, "supabase/migrations")).filter((file) => file.startsWith(VERSION));
    expect(files).toEqual([`${VERSION}_admin_profile_edits.sql`]);
  });

  it("makes every editor RPC admin-only, SECURITY DEFINER, and closed to anon", () => {
    for (const signature of RPCS) {
      const name = signature.split("(")[0];
      const fn = body(name);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = public");
      expect(fn).toContain("PERFORM public.admin_require();");
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`);
      expect(migration).not.toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO anon`);
      expect(rollback).toContain(`DROP FUNCTION IF EXISTS public.${signature.replace(/, /g, ", ")};`);
    }
  });

  it("requires a reason and writes one audit row with before and after on each save", () => {
    for (const name of ["admin_update_customer_profile", "admin_update_contractor_profile"]) {
      const fn = body(name);
      expect(fn).toContain("v_reason := public.admin_profile_edit_reason(p_reason);");
      expect(fn.match(/PERFORM public\.write_audit_log\(/g)).toHaveLength(1);
      expect(fn).toContain("'before', public.admin_audit_json(NULL, v_before)");
      expect(fn).toContain("'after', public.admin_audit_json(NULL, v_after)");
      expect(fn).toContain("RAISE EXCEPTION 'Nothing to change.'");
    }
    expect(body("admin_audit_text")).toMatch(/stripe\|token\|password\|secret\|document_path/);
  });

  it("guards the PR #110 step-up so it works before and after #110 is deployed", () => {
    const helper = body("admin_profile_edit_step_up");
    expect(helper).toContain("to_regprocedure('public.assert_admin_sensitive_step_up()') IS NOT NULL");
    expect(helper).toContain("EXECUTE 'SELECT public.assert_admin_sensitive_step_up()'");
    expect(migration).not.toMatch(/RAISE EXCEPTION 'admin profile edits depend on/);
    expect(migration).not.toMatch(/^\s*PERFORM public\.assert_admin_sensitive_step_up\(\);/m);
    for (const name of ["admin_update_customer_profile", "admin_update_contractor_profile"]) {
      const fn = body(name);
      expect(fn).toContain("PERFORM public.admin_profile_edit_step_up();");
      for (const key of ["email", "phone", "account_status"]) {
        expect(fn).toMatch(new RegExp(`IF p_patch \\? '${key}' THEN[\\s\\S]*?v_sensitive := true;`));
      }
    }
    const pro = body("admin_update_contractor_profile");
    expect(pro).toMatch(/IF p_patch \? 'approval_status' THEN[\s\S]*?v_sensitive := true;/);
    expect(pro).toMatch(/IF p_patch \? 'directory_hidden' THEN[\s\S]*?v_sensitive := true;/);
  });

  it("refuses payment, fee, amount, and Stripe keys and never writes payment tables", () => {
    const banned = body("admin_reject_money_patch");
    for (const key of ["signup_fee_status", "amount_cents", "fee_cents", "stripe_customer_id", "stripe_account_id", "needs_refund"]) {
      expect(banned).toContain(`'${key}'`);
    }
    expect(banned).toContain("LIKE 'stripe\\_%'");
    for (const name of ["admin_update_customer_profile", "admin_update_contractor_profile"]) {
      expect(body(name)).toContain("PERFORM public.admin_reject_money_patch(p_patch);");
    }
    expect(migration).not.toMatch(
      /(UPDATE|INSERT INTO|DELETE FROM)\s+public\.(payments|refunds|signup_fee_charges|project_connections|connection_checkout_sessions|contractor_stripe_accounts|booking_contact_access|ledger_entries)\b/,
    );
    // Assignment only (an UPDATE ... SET). The live public views compare signup_fee_status = ANY(...) in WHERE, which is a read.
    expect(migration).not.toMatch(/signup_fee_status\s*=(?!\s*ANY\b)/);
    expect(migration).not.toMatch(/SET[^;]*\bsignup_fee_status\s*=/);
  });

  it("changes the sign-in email server-side and clears pending self-service changes", () => {
    for (const name of ["admin_update_customer_profile", "admin_update_contractor_profile"]) {
      const fn = body(name);
      expect(fn).toContain("UPDATE auth.users");
      expect(fn).toContain("email_change = ''");
      expect(fn).toContain("UPDATE auth.identities");
      expect(fn).toContain("RAISE EXCEPTION 'That email is already in use.'");
    }
  });

  it("checks public free text for contact info and normalizes phone like the signup form", () => {
    expect(body("admin_require_public_plain_text")).toContain("public.text_contains_pre_hire_contact(v_value)");
    expect(body("admin_normalize_phone")).toContain("'^[2-9][0-9]{9}$'");
    for (const field of ["'business name'", "'bio'", "'headline'", "'project title'", "'project description'", "'portfolio caption'", "'credential label'"]) {
      expect(migration).toContain(`admin_require_public_plain_text(${field}`);
    }
  });

  it("keeps directory visibility admin-only and the editor output free of private paths", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS directory_hidden boolean NOT NULL DEFAULT false");
    expect(migration).toContain("RAISE EXCEPTION 'directory visibility is set by Priority Property Pros'");
    expect(migration).toContain("AND NOT cp.directory_hidden");
    const editor = body("admin_get_contractor_editor");
    expect(editor).not.toMatch(/document_path|storage_path|stripe_|signup_fee/);
    expect(body("admin_get_customer_editor")).not.toMatch(/stripe_|signup_fee/);
  });

  it("re-marks the RPC before the contractor update so profile triggers cannot clear it", () => {
    const pro = body("admin_update_contractor_profile");
    const update = pro.indexOf("UPDATE public.contractor_profiles");
    const remark = pro.lastIndexOf("PERFORM public.ppp_set_rpc('admin_update_contractor_profile');", update);
    expect(remark).toBeGreaterThan(pro.indexOf("UPDATE public.profiles"));
  });

  it("rolls back every object without deleting audit rows or touching payments", () => {
    for (const name of [
      "admin_profile_edit_step_up()",
      "admin_profile_edit_reason(text)",
      "admin_reject_money_patch(jsonb)",
      "admin_audit_json(text, jsonb)",
    ]) {
      expect(rollback).toContain(`DROP FUNCTION IF EXISTS public.${name};`);
    }
    expect(rollback).toContain("DROP TABLE IF EXISTS public.profile_private_locations;");
    expect(rollback).toContain("ALTER TABLE public.contractor_profiles DROP COLUMN IF EXISTS directory_hidden;");
    expect(rollback).not.toContain("directory_hidden\n  ");
    expect(rollback).not.toMatch(/DELETE FROM|TRUNCATE|audit_logs\s+WHERE/i);
    expect(rollback.indexOf("CREATE OR REPLACE VIEW")).toBeLessThan(rollback.indexOf("DROP COLUMN IF EXISTS directory_hidden"));
  });

  it("keeps the local SQL proof wired to the migration, the rollback, and the no-#110 path", () => {
    expect(proof).toContain(`\\ir ../migrations/${VERSION}_admin_profile_edits.sql`);
    expect(proof).toContain(`\\ir ../rollbacks/${VERSION}_admin_profile_edits_rollback.sql`);
    expect(proof).toContain("DROP FUNCTION public.assert_admin_sensitive_step_up();");
    expect(proof).toContain("direct directory visibility update was allowed");
  });
});
