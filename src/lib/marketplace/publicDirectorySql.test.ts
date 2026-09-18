import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = path.join(repoRoot, "supabase/migrations");
const grantMigration = "20260925000002_public_directory_helper_grants.sql";

function allSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
    .join("\n\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lastGrant(sql: string, fn: string, roles: string): string | null {
  const pattern = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escapeRegExp(fn)} TO ${roles}`, "g");
  const matches = sql.match(pattern);
  return matches ? matches[matches.length - 1] : null;
}

describe("public directory helper grants", () => {
  const latest = readFileSync(path.join(migrationsDir, grantMigration), "utf8");
  const sql = allSql();

  it("grants EXECUTE on the pure helpers anon views inline, plus authenticated write guard", () => {
    for (const fn of [
      "anonymized_pro_label(text, text[])",
      "general_service_area(text)",
      "public_safe_blurb(text, text)",
      "public_safe_about(text, text)",
      "generic_credential_badge_label(text)",
      "public_safe_portfolio_caption(text, text)",
      "text_contains_pre_hire_contact(text)",
      "text_contains_contact_info(text)",
    ]) {
      expect(lastGrant(latest, fn, "anon, authenticated")).toBeTruthy();
      expect(lastGrant(sql, fn, "anon, authenticated")).toBeTruthy();
    }
    expect(latest).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.assert_no_pre_hire_contact\(text\) TO authenticated/,
    );
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.assert_no_pre_hire_contact\(text\) FROM PUBLIC, anon/);
  });

  it("keeps public RPCs as the primary anon API and lets public views work after helper grants", () => {
    expect(latest).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_public_directory_contractors\(\) TO anon, authenticated/);
    expect(latest).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_public_directory_contractor\(uuid\) TO anon, authenticated/);
    expect(latest).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_public_directory_portfolio\(uuid\) TO anon, authenticated/);
    expect(latest).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_public_directory_reviews\(uuid\) TO anon, authenticated/);
    expect(latest).toMatch(/GRANT SELECT ON public\.contractor_public_profiles TO anon, authenticated/);
    expect(latest).toMatch(/GRANT SELECT ON public\.contractor_public_reviews TO anon, authenticated/);
    expect(latest).toMatch(/GRANT SELECT ON public\.contractor_public_portfolio TO anon, authenticated/);
  });

  it("does not broaden anon access to private tables or contact entitlement", () => {
    expect(latest).toMatch(/REVOKE ALL ON TABLE public\.profiles FROM anon/);
    expect(latest).toMatch(/REVOKE ALL ON TABLE public\.contractor_profiles FROM anon/);
    expect(latest).toMatch(/REVOKE ALL ON TABLE public\.contractor_portfolio FROM anon/);
    expect(latest).toMatch(/REVOKE ALL ON TABLE public\.booking_reviews FROM anon/);
    expect(latest).toMatch(/REVOKE ALL ON TABLE public\.booking_contact_access FROM anon/);
    expect(latest).toMatch(/REVOKE ALL ON TABLE public\.project_private_locations FROM anon/);
    expect(latest).not.toMatch(/GRANT SELECT ON TABLE public\.contractor_profiles TO anon/);
    expect(latest).not.toMatch(/GRANT SELECT ON TABLE public\.profiles TO anon/);
    expect(latest).not.toMatch(/GRANT SELECT ON TABLE public\.booking_reviews TO anon/);
    expect(latest).not.toMatch(/GRANT SELECT ON TABLE public\.contractor_portfolio TO anon/);
    expect(latest).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.booking_job_contact/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.booking_job_contact\(uuid\) FROM anon/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.contractor_is_directory_listed\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
  });

  it("documents that helpers are pure and that preview — not production — applies this file", () => {
    expect(latest).toMatch(/giiskdvitimksdewnelc/);
    expect(latest).toMatch(/Do NOT apply to production/);
    expect(latest).toMatch(/bersftkjpbzpgtahbqwd/);
    expect(latest).toMatch(/No table access/);
    expect(readdirSync(migrationsDir)).toContain(grantMigration);
  });
});
