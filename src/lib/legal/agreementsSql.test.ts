import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS } from "./catalog";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20261015000001_legal_agreement_acceptance.sql");

function quotedBody(sql: string, slug: string): string {
  const tag = `$ppp_legal_${slug.replaceAll("-", "_")}$`;
  const start = sql.indexOf(tag);
  const end = sql.indexOf(tag, start + tag.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start + tag.length, end).replace(/^\n/, "");
}

describe("legal agreement acceptance migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("stores each draft unpublished and not current, with the setting off", () => {
    expect(sql).toMatch(/NOT APPLIED/);
    expect(sql).toMatch(/'legal_acceptance_required',\s*\n\s*0,/);
    expect(sql).not.toMatch(/payments_live',\s*1/);
    expect(sql).not.toMatch(/charges_live',\s*1/);
    expect(sql).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(sql).not.toMatch(/connection_fee_checkout_enabled',\s*1/);
    expect(sql).not.toMatch(/stripe\.refunds|refunds\.create|\/v1\/refunds/);
    expect(sql).not.toMatch(/DELETE FROM/);
    const beforeBodies = sql.slice(0, sql.indexOf("-- LEGAL_BODY"));
    expect(beforeBodies).not.toMatch(/UPDATE public\.agreements/);
    expect(sql.match(/false,\n {2}'(?:ALL|CONTRACTOR)',\n {2}false/g)?.length).toBe(LEGAL_DOCUMENTS.length);
    for (const doc of LEGAL_DOCUMENTS) {
      const fileName =
        doc.slug === "terms-of-use"
          ? "terms-of-use.md"
          : doc.slug === "privacy-policy"
            ? "privacy-policy.md"
            : doc.slug === "refund-cancellation"
              ? "refund-cancellation-policy.md"
              : doc.slug === "community-guidelines"
                ? "community-guidelines.md"
                : doc.slug === "review-content"
                  ? "review-content-guidelines.md"
                  : "contractor-participation-terms.md";
      expect(sql).toContain(`'${doc.slug}'`);
      expect(sql).toContain(`\n  ${doc.version},`);
      expect(quotedBody(sql, doc.slug)).toBe(readFileSync(path.join(repoRoot, "docs/legal", fileName), "utf8"));
    }
    expect(sql.match(/published\n\)/g)?.length ?? 0).toBe(0);
    expect(sql).toMatch(/false\n\);/);
  });

  it("requires acceptance only after the setting is on, and keeps signup and sign-in rows apart", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'terms_not_accepted'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'agreement_version_mismatch'/);
    expect(sql).toMatch(/IF NOT public\.legal_acceptance_required\(\) THEN\s+RETURN;/);
    expect(sql).toMatch(
      /IF public\.legal_acceptance_required\(\) THEN\s+PERFORM public\.assert_signup_agreement_versions\(meta, safe_type\);/,
    );
    expect(sql).toMatch(/PERFORM public\.record_current_agreement_acceptances\(\s*NEW\.id,/);
    expect(sql).toMatch(/'signup'/);
    expect(sql).toMatch(/'sign_in'/);
    expect(sql).toMatch(/acceptance_source/);
    expect(sql).toMatch(/agreement\.slug IN \('terms-of-use', 'privacy-policy'\)/);
    expect(sql).toMatch(/NEW\.agreement_version := current_version/);
    expect(sql).toMatch(/NEW\.accepted_at := now\(\)/);
    expect(sql).toMatch(/agreement acceptances are insert-only/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.legal_acceptance_required\(\) TO anon, authenticated, service_role/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.set_legal_acceptance_required\(boolean\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_legal_acceptance_required\(boolean\) TO service_role/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.accept_current_agreements\(text\) TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.missing_current_agreements\(\) TO authenticated/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.record_current_agreement_acceptances\(uuid, text, public\.account_type, text\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).not.toMatch(
      /REVOKE ALL ON FUNCTION public\.record_current_agreement_acceptances\(uuid, text, public\.account_type\) FROM/,
    );
    expect(sql).toMatch(/Does not block reads of projects, messages, or profiles/);
    expect(sql).toMatch(/does not delete acceptances, profiles, projects, messages, reviews, photos, or payment rows/);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON public\.profiles[^;]*agreement/i);
  });
});
