import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261010001728_portfolio_photo_privacy.sql"),
  "utf8",
);
const api = readFileSync(path.join(root, "src/lib/marketplace/api.ts"), "utf8");

describe("portfolio photo privacy migration", () => {
  it("guards privacy in a security invoker trigger and admin-only RPCs", () => {
    expect(migration).toMatch(/SECURITY INVOKER/);
    expect(migration).toMatch(/SET search_path = public/);
    expect(migration).toMatch(/NEW\.privacy_state := 'REVIEW_REQUIRED'/);
    expect(migration).toMatch(/You cannot change it yourself/);
    expect(migration).toMatch(/own portfolio folder/);
    expect(migration).toMatch(/FUNCTION public\.admin_set_portfolio_privacy/);
    expect(migration).toMatch(/FUNCTION public\.admin_list_portfolio_review_queue/);
    expect(migration).toMatch(/only an admin can set portfolio photo privacy/);
    expect(migration).toMatch(/portfolio\.privacy_set/);
    expect(migration).toMatch(/write_audit_log/);
    expect(migration).toMatch(/portfolio_storage_is_publicly_readable/);
    expect(migration).toMatch(/portfolio_storage_is_public_safe/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.admin_set_portfolio_privacy\(uuid, public\.portfolio_privacy_state, text\) FROM PUBLIC, anon/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_list_portfolio_review_queue\(\) TO authenticated/);
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_set_portfolio_privacy[\s\S]*TO anon/);
    expect(migration).not.toMatch(/payments_live|stripe/i);
    expect(migration).not.toMatch(/DROP VIEW/i);
    expect(migration).not.toMatch(/contractor_public_portfolio/);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.contractor_portfolio/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+(storage\.objects|public\.contractor_portfolio)/i);
    expect(migration).not.toMatch(/UPDATE\s+storage\.objects/i);
    expect(migration).not.toMatch(/TRUNCATE/i);
    expect(migration.match(/UPDATE\s+public\.contractor_portfolio/gi)).toEqual([
      "UPDATE public.contractor_portfolio",
    ]);
  });

  it("keeps privacy_state out of the portfolio insert and caption update", () => {
    const insert = api.slice(api.indexOf("export async function addPortfolioItem"), api.indexOf("export async function updatePortfolioItem"));
    const update = api.slice(api.indexOf("export async function updatePortfolioItem"), api.indexOf("export async function deletePortfolioItem"));
    expect(insert).not.toMatch(/privacy_state/);
    expect(update).not.toMatch(/privacy_state/);
    expect(insert).toMatch(/contractor_profile_id/);
    expect(insert).toMatch(/storage_path/);
  });
});
