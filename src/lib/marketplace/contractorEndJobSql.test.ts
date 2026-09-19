import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHARGES_LIVE, PAYMENTS_LIVE, SIGNUP_FEE_ENABLED } from "./types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20260930000001_contractor_end_job.sql";

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

describe("contractor_end_job SQL", () => {
  const latest = readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");
  const sql = allSql();
  const endJob = functionBody(sql, "contractor_end_job");
  const request = functionBody(sql, "request_project_connection");
  const reserve = functionBody(sql, "reserve_connection_checkout");
  const guard = functionBody(sql, "guard_project_connection_money");
  const helper = functionBody(sql, "contractor_has_contact_access_on_project");

  it("does not flip payment, checkout, or signup flags", () => {
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(SIGNUP_FEE_ENABLED).toBe(false);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(latest).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(latest).not.toMatch(/connection_fee_checkout_enabled',\s*1/);
    expect(endJob).toMatch(/'payments_live', false/);
    expect(endJob).toMatch(/'charges_live', false/);
    expect(endJob).toMatch(/'contact_unlocked', false/);
  });

  it("lets Connect proceed from AVAILABLE or ACCEPTED without a required Participate click", () => {
    expect(request).toMatch(/AND o\.status IN \('AVAILABLE', 'ACCEPTED'\)/);
    expect(reserve).toMatch(/AND o\.status IN \('AVAILABLE', 'ACCEPTED'\)/);
    expect(request).toMatch(/Participate\/accept is optional/);
    expect(endJob).toMatch(/PASSED/);
  });

  it("cancels unpaid occupying rows and frees connection_slots", () => {
    expect(endJob).toMatch(/status IN \('INITIATED', 'RESERVED', 'PAYMENT_DISABLED'\)/);
    expect(endJob).toMatch(/DELETE FROM public\.connection_slots WHERE connection_id = conn\.id/);
    expect(endJob).toMatch(/status = 'CANCELLED'/);
    expect(endJob).toMatch(/DELETE FROM public\.opportunity_slots WHERE opportunity_id = opp\.id/);
  });

  it("completes PAID connections without a free unlock path", () => {
    expect(endJob).toMatch(/conn\.status = 'PAID'/);
    expect(endJob).toMatch(/status = 'COMPLETED'/);
    expect(guard).toMatch(/ppp_rpc_is\('contractor_end_job'\)/);
    expect(guard).toMatch(/OLD\.status = 'PAID'/);
    expect(guard).toMatch(/NEW\.status = 'COMPLETED'/);
    expect(endJob).not.toMatch(/INSERT INTO public\.booking_contact_access/);
    expect(helper).toMatch(/FROM public\.booking_contact_access a/);
  });

  it("is RLS-safe: authenticated execute only, no client table writes", () => {
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.contractor_end_job\(uuid\) FROM PUBLIC, anon/);
    expect(latest).toMatch(/GRANT EXECUTE ON FUNCTION public\.contractor_end_job\(uuid\) TO authenticated/);
    expect(functionBody(sql, "protect_project_connection_row")).toMatch(/ppp_rpc_is\('contractor_end_job'\)/);
    expect(functionBody(sql, "protect_connection_slot_row")).toMatch(/ppp_rpc_is\('contractor_end_job'\)/);
    expect(latest).not.toMatch(/GRANT INSERT ON TABLE public\.project_connections/);
    expect(latest).not.toMatch(/GRANT UPDATE ON TABLE public\.project_connections/);
    expect(latest).not.toMatch(/GRANT DELETE ON TABLE public\.connection_slots/);
  });
});
