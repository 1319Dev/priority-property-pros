import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261015000001_paid_connection_booking_contact.sql";

function read(name: string): string {
  return readFileSync(path.join(root, name), "utf8");
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("paid connection carries onto the hired booking", () => {
  const sql = read(`supabase/migrations/${migrationName}`);
  const rollback = read("supabase/rollbacks/20261015000001_paid_connection_booking_contact_rollback.sql");
  const paid = functionBody(sql, "connection_fee_was_paid");
  const ensure = functionBody(sql, "ensure_booking_contact_access_row");
  const has = functionBody(sql, "booking_has_contact_access");
  const protect = functionBody(sql, "protect_booking_contact_access_row");

  it("treats only PAID, or COMPLETED with a consumed paid session, as paid", () => {
    expect(paid).toMatch(/c\.status = 'PAID'/);
    expect(paid).toMatch(/c\.status = 'COMPLETED'/);
    expect(paid).toMatch(/s\.status = 'CONSUMED'/);
    expect(paid).toMatch(/s\.payment_status = 'paid'/);
    expect(paid).toMatch(/needs_refund IS NOT TRUE/);
    expect(paid).not.toMatch(/'RESERVED'/);
    expect(paid).not.toMatch(/'EXPIRED'/);
    expect(paid).not.toMatch(/'PAYMENT_DISABLED'/);
    expect(paid).not.toMatch(/'INITIATED'/);
    expect(paid).not.toMatch(/signup_fee/);
    expect(paid).not.toMatch(/NOT_REQUIRED/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.connection_fee_was_paid\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.connection_fee_was_paid/);
  });

  it("unlocks the booking row at insert only when that pair already paid", () => {
    expect(ensure).toMatch(/ppp_set_rpc\('ensure_booking_contact_access_row'\)/);
    expect(ensure).toMatch(/connection_fee_was_paid\(c\.id\)/);
    expect(ensure).toMatch(/'CONNECTION_FEE_PAYMENT'/);
    expect(ensure).toMatch(/'UNLOCKED'/);
    expect(ensure).toMatch(/'LOCKED', 'SYSTEM'/);
    expect(ensure).toMatch(/v_prev/);
    expect(ensure).not.toMatch(/INSERT INTO public\.project_connections/);
    expect(ensure).not.toMatch(/fee_cents/);
    expect(ensure).not.toMatch(/signup_fee/);
    expect(sql).not.toMatch(/UPDATE public\.project_connections/);
    expect(sql).not.toMatch(/UPDATE public\.booking_contact_access/);
  });

  it("recognizes the same paid connection on read and still requires the caller", () => {
    expect(has).toMatch(/a\.booking_id = p_booking_id/);
    expect(has).toMatch(/a\.connection_id = c\.id/);
    expect(has).toMatch(/connection_fee_was_paid\(c\.id\)/);
    expect(has).toMatch(/a\.status IN \('UNLOCKED', 'ADMIN_OVERRIDE'\)/);
    expect(has).toMatch(/a\.revoked_at IS NULL/);
    expect(has).toMatch(/b\.status IS DISTINCT FROM 'CANCELLED'/);
    expect(has).toMatch(/b\.contractor_profile_id = public\.current_contractor_profile_id\(\)/);
    expect(has).toMatch(/r\.booking_id = b\.id/);
    expect(has).toMatch(/r\.revoked_at IS NOT NULL/);
    expect(has).not.toMatch(/b\.status IN \('CONFIRMED'/);
    expect(has).not.toMatch(/signup_fee/);
  });

  it("refuses a client unlock that is not backed by a paid connection", () => {
    expect(protect).toMatch(/ppp_rpc_is\('ensure_booking_contact_access_row'\)/);
    expect(protect).toMatch(/NEW\.grant_source = 'CONNECTION_FEE_PAYMENT'/);
    expect(protect).toMatch(/connection_fee_was_paid\(c\.id\)/);
    expect(protect).toMatch(/contact access cannot be written from the client/);
    expect(protect).not.toMatch(/NEW\.fee_cents/);
  });

  it("rolls back by restoring the locked insert and dropping the helper", () => {
    expect(rollback).toMatch(/'LOCKED', 'SYSTEM'/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.connection_fee_was_paid\(uuid\)/);
    expect(rollback).not.toMatch(/connection_fee_was_paid\(c\.id\)/);
    expect(functionBody(rollback, "booking_has_contact_access")).not.toMatch(/project_connections/);
  });
});
