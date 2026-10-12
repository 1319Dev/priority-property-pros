import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS } from "./catalog";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(path.join(repoRoot, p), "utf8");

function body(sql: string, tag: string): string {
  const start = sql.indexOf(tag) + tag.length;
  return sql.slice(start, sql.indexOf(tag, start)).replace(/^\n/, "");
}

describe("Priority Help live legal versions", () => {
  const migration = read("supabase/migrations/20261021500001_legal_priority_help_live.sql");
  const rollback = read("supabase/rollbacks/20261021500001_legal_priority_help_live_rollback.sql");

  it("stores exactly the published Terms and Privacy text", () => {
    expect(body(migration, "$ppp_legal_terms_v4$")).toBe(read("docs/legal/terms-of-use.md"));
    expect(body(migration, "$ppp_legal_privacy_v3$")).toBe(read("docs/legal/privacy-policy.md"));
  });

  it("matches the catalog versions and publishes them", () => {
    const versions = Object.fromEntries(LEGAL_DOCUMENTS.map((doc) => [doc.slug, doc.version]));
    expect(versions["terms-of-use"]).toBe(4);
    expect(versions["privacy-policy"]).toBe(3);
    expect(versions["refund-cancellation"]).toBe(1);
    expect(migration).toMatch(/\('terms-of-use', 4\),\s*\('privacy-policy', 3\),\s*\('refund-cancellation', 1\)/);
    expect(migration).not.toMatch(/@prioritypropertypros\.com/);
    const sqlOnly = migration
      .replace(/\$ppp_legal_terms_v4\$[\s\S]*?\$ppp_legal_terms_v4\$/, "")
      .replace(/\$ppp_legal_privacy_v3\$[\s\S]*?\$ppp_legal_privacy_v3\$/, "")
      .replace(/^--.*$/gm, "");
    expect(sqlOnly).not.toMatch(/admin_mfa_required|stripe|DELETE FROM/i);
    expect(sqlOnly).not.toMatch(/UPDATE public\.platform_settings/);
  });

  it("rolls back to Terms v3 and Privacy v2", () => {
    expect(rollback).toMatch(/\('terms-of-use', 3\),\s*\('privacy-policy', 2\)\)/);
    expect(rollback).toMatch(/\('terms-of-use', 3\),\s*\('privacy-policy', 2\),\s*\('refund-cancellation', 1\)/);
  });
});
