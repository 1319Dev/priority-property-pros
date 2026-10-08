import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeCity } from "./location";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(repoRoot, "supabase/migrations/20261011000001_customer_project_lifecycle.sql"),
  "utf8",
);

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("customer project lifecycle migration", () => {
  const cancel = functionBody(migration, "cancel_customer_project");
  const city = functionBody(migration, "normalize_city");
  const fee = functionBody(migration, "enforce_signup_fee_on_estimates");

  it("says a protected job cannot be cancelled", () => {
    expect(cancel).toMatch(/confirmed or in-progress jobs cannot be cancelled/);
    expect(cancel).not.toMatch(/cannot be deleted/);
  });

  it("title-cases simple city names and only rewrites rows that change", () => {
    expect(city).toMatch(/initcap\(/);
    expect(migration).toMatch(
      /city IS DISTINCT FROM public\.normalize_city\(city\)\s+OR state IS DISTINCT FROM public\.normalize_us_state\(state\)/,
    );
    expect(normalizeCity("willis")).toBe("Willis");
    expect(normalizeCity("  san antonio ")).toBe("San Antonio");
  });

  it("does not let the signup fee block estimate cleanup on cancel or rejection", () => {
    expect(fee).toMatch(/ppp_rpc_is\('cancel_customer_project'\)/);
    expect(fee).toMatch(/ppp_rpc_is\('admin_reject_contractor'\)/);
    expect(fee).toMatch(/RETURN NEW/);
    const skip = fee.slice(0, fee.indexOf("assert_signup_fee_paid"));
    expect(skip).toMatch(/cancel_customer_project/);
    expect(skip).toMatch(/admin_reject_contractor/);
  });
});
