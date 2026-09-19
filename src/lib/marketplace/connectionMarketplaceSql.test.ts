import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHARGES_LIVE, PAYMENTS_LIVE, SIGNUP_FEE_ENABLED } from "./types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20260926000001_connection_marketplace.sql";

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

describe("Connection marketplace SQL", () => {
  const latest = readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");
  const sql = allSql();
  const request = functionBody(latest, "request_project_connection");
  const finalize = functionBody(latest, "finalize_project_connection_payment");
  const grant = functionBody(latest, "grant_connection_contact_access_from_fee");
  const helper = functionBody(sql, "contractor_has_contact_access_on_project");

  it("creates connection tables with RLS and no client writes", () => {
    expect(latest).toMatch(/CREATE TABLE public\.project_connections/);
    expect(latest).toMatch(/CREATE TABLE public\.connection_slots/);
    expect(latest).toMatch(/ALTER TABLE public\.project_connections ENABLE ROW LEVEL SECURITY/);
    expect(latest).toMatch(/project connections cannot be written from the client/);
    expect(latest).not.toMatch(/GRANT INSERT ON TABLE public\.project_connections/);
    expect(latest).not.toMatch(/GRANT UPDATE ON TABLE public\.project_connections/);
  });

  it("authorizes private contact from #14 booking_contact_access only", () => {
    expect(sql).toMatch(/CREATE TABLE public\.booking_contact_access/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.connection_contact_access/);
    expect(sql).toMatch(/ADD VALUE IF NOT EXISTS 'CONNECTION_FEE_PAYMENT'/);
    expect(sql).toMatch(/booking_contact_access_subject_xor/);
    expect(helper).toMatch(/FROM public\.booking_contact_access a/);
    expect(helper).not.toMatch(/connection_contact_access/);
    expect(helper).not.toMatch(/FROM public\.project_connections/);
    expect(helper).toMatch(/a\.status IN \('UNLOCKED', 'ADMIN_OVERRIDE'\)/);
    expect(helper).not.toMatch(/b\.status IN \('CONFIRMED'/);
  });

  it("does not enable Stripe or flip live flags", () => {
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(SIGNUP_FEE_ENABLED).toBe(false);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(latest).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(latest).toMatch(/'stripe_test_mode',\s*1/);
    expect(finalize).toMatch(/connection-fee contact unlock is disabled while payments are off/);
    expect(grant).toMatch(/connection-fee contact unlock is not wired/);
    expect(request).toMatch(/'PAYMENT_DISABLED'/);
    expect(request).toMatch(/fee_cents,\s*499|499,/);
  });

  it("preserves estimate submit/withdraw and opportunity matching", () => {
    expect(sql).toMatch(/FUNCTION public\.submit_estimate/);
    expect(sql).toMatch(/FUNCTION public\.withdraw_estimate/);
    expect(sql).toMatch(/FUNCTION public\.delete_estimate/);
    expect(sql).toMatch(/FUNCTION public\.accept_opportunity/);
    expect(sql).toMatch(/CONSTRAINT opportunity_slots_range CHECK \(slot_number BETWEEN 1 AND 3\)/);
  });
});
