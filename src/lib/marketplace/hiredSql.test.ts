import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHARGES_LIVE, CONNECTION_FEE_CENTS, PAYMENTS_LIVE, SIGNUP_FEE_ENABLED } from "./types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261005000001_mutual_hired.sql";

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n\n");
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("mutual hired SQL", () => {
  const latest = readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");
  const sql = allSql();
  const confirm = functionBody(sql, "confirm_booking_hired");
  const review = functionBody(sql, "submit_booking_review");
  const expire = functionBody(sql, "expire_stale_pending_bookings");
  const protect = functionBody(sql, "protect_booking_hired_flags");

  it("does not flip payment, checkout, or fee amounts", () => {
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(SIGNUP_FEE_ENABLED).toBe(false);
    expect(CONNECTION_FEE_CENTS).toBe(499);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(latest).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(latest).not.toMatch(/connection_fee_checkout_enabled',\s*1/);
    expect(confirm).toMatch(/'payments_live', false/);
    expect(confirm).toMatch(/'charges_live', false/);
  });

  it("stores both Hired timestamps on bookings and gates writes to the matching party", () => {
    expect(latest).toMatch(/ADD COLUMN IF NOT EXISTS customer_hired_at timestamptz/);
    expect(latest).toMatch(/ADD COLUMN IF NOT EXISTS contractor_hired_at timestamptz/);
    expect(confirm).toMatch(/SET customer_hired_at = now()/);
    expect(confirm).toMatch(/SET contractor_hired_at = now()/);
    expect(confirm).toMatch(/is_customer := b\.customer_id IS NOT DISTINCT FROM auth\.uid\(\)/);
    expect(confirm).toMatch(/is_contractor := b\.contractor_profile_id IS NOT DISTINCT FROM public\.current_contractor_profile_id\(\)/);
    expect(confirm).toMatch(/already := true/);
    expect(confirm).toMatch(/'idempotent', already/);
    expect(protect).toMatch(/hired confirmation cannot be cleared/);
    expect(protect).toMatch(/ppp_rpc_is\('confirm_booking_hired'\)/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.confirm_booking_hired\(uuid\) FROM PUBLIC, anon/);
    expect(latest).toMatch(/GRANT EXECUTE ON FUNCTION public\.confirm_booking_hired\(uuid\) TO authenticated/);
    expect(latest).not.toMatch(/GRANT UPDATE ON TABLE public\.bookings/);
    expect(latest).not.toMatch(/GRANT INSERT ON TABLE public\.bookings/);
  });

  it("unlocks profile reviews only after mutual Hired for both participants", () => {
    expect(latest).toMatch(/ADD COLUMN IF NOT EXISTS reviewer_role text NOT NULL DEFAULT 'CUSTOMER'/);
    expect(latest).toMatch(/UNIQUE \(booking_id, reviewer_role\)/);
    expect(review).toMatch(/reviews require mutual hired confirmation/);
    expect(review).toMatch(/only booking participants can review after mutual hire/);
    expect(review).toMatch(/reviewer_role := CASE WHEN is_customer THEN 'CUSTOMER' ELSE 'CONTRACTOR' END/);
    expect(review).not.toMatch(/only the customer can review this booking/);
    expect(review).not.toMatch(/reviews require a completed booking/);
    expect(latest).toMatch(/AND r\.reviewer_role = 'CUSTOMER'/);
    expect(sql).toMatch(/CREATE TABLE public\.platform_reviews/);
  });

  it("does not expire pending bookings after a Hired click and has no un-hire RPC", () => {
    expect(expire).toMatch(/AND customer_hired_at IS NULL/);
    expect(expire).toMatch(/AND contractor_hired_at IS NULL/);
    expect(latest).not.toMatch(/CREATE OR REPLACE FUNCTION public\.unhire/);
    expect(latest).not.toMatch(/customer_hired_at = NULL/);
    expect(latest).not.toMatch(/End this job/);
  });
});
