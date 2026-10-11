import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261019400001_end_job_checkout_session_guard.sql";

function read(name: string): string {
  return readFileSync(path.join(root, name), "utf8");
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("\nCREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

function between(sql: string, startMarker: string, endMarker: string): string {
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("end-job cannot write checkout sessions", () => {
  const sql = read(`supabase/migrations/${migrationName}`);
  const rollback = read("supabase/rollbacks/20261019400001_end_job_checkout_session_guard_rollback.sql");
  const guard = functionBody(sql, "protect_connection_checkout_session_row");
  const helper = functionBody(sql, "expire_open_connection_checkout_sessions");
  const endJob = functionBody(sql, "contractor_end_job");
  const hired = between(endJob, "Hired contractor with a paid connection", "IF already_ended");
  const unpaid = between(endJob, "Unpaid occupying rows", "ELSIF conn.id IS NOT NULL AND conn.status = 'PAID'");
  const paid = between(endJob, "ELSIF conn.id IS NOT NULL AND conn.status = 'PAID'", "ELSIF conn.id IS NOT NULL THEN");

  it("removes the contractor_end_job marker from the checkout-session guard", () => {
    expect(guard).not.toMatch(/ppp_rpc_is\('contractor_end_job'\)/);
    expect(guard).toMatch(/ppp_rpc_is\('expire_open_connection_checkout_sessions'\)/);
    expect(guard).toMatch(/OLD\.status = 'OPEN'/);
    expect(guard).toMatch(/NEW\.status = 'EXPIRED'/);
    expect(guard).toMatch(/NEW\.amount_cents IS NOT DISTINCT FROM OLD\.amount_cents/);
    expect(guard).toMatch(/NEW\.price_id IS NOT DISTINCT FROM OLD\.price_id/);
    expect(guard).toMatch(/NEW\.currency IS NOT DISTINCT FROM OLD\.currency/);
    expect(guard).toMatch(/NEW\.payment_status IS NOT DISTINCT FROM OLD\.payment_status/);
    expect(guard).toMatch(/ppp_rpc_is\('fulfill_connection_fee_checkout'\)/);
    expect(guard).toMatch(/ppp_rpc_is\('expire_connection_checkout_session'\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.expire_open_connection_checkout_sessions\(uuid\) FROM PUBLIC, anon, authenticated, service_role/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.expire_open_connection_checkout_sessions/);
  });

  it("expires only an OPEN session from the helper", () => {
    expect(helper).toMatch(/ppp_set_rpc\('expire_open_connection_checkout_sessions'\)/);
    expect(helper).toMatch(/SET status = 'EXPIRED', updated_at = now\(\)/);
    expect(helper).toMatch(/AND status = 'OPEN'/);
    expect(helper).not.toMatch(/amount_cents\s*=/);
    expect(helper).not.toMatch(/price_id\s*=/);
    expect(helper).not.toMatch(/DELETE FROM/);
  });

  it("keeps hired, paid, and unpaid end-job paths", () => {
    expect(hired).toMatch(/active_booking\.id IS NOT NULL AND conn\.status = 'PAID'/);
    expect(hired).toMatch(/status = 'COMPLETED'/);
    expect(hired).not.toMatch(/connection_checkout_sessions/);
    expect(hired).not.toMatch(/expire_open_connection_checkout_sessions/);
    expect(hired).toMatch(/'contact_unlocked', false/);

    expect(paid).toMatch(/conn\.status = 'PAID'/);
    expect(paid).toMatch(/status = 'COMPLETED'/);
    expect(paid).not.toMatch(/SET status = 'PAID'/);
    expect(paid).not.toMatch(/connection_checkout_sessions/);
    expect(paid).not.toMatch(/expire_open_connection_checkout_sessions/);

    expect(unpaid).toMatch(/INITIATED', 'RESERVED', 'PAYMENT_DISABLED'/);
    expect(unpaid).toMatch(/expire_open_connection_checkout_sessions\(conn\.id\)/);
    expect(unpaid).toMatch(/ppp_set_rpc\('contractor_end_job'\)/);
    expect(unpaid).toMatch(/DELETE FROM public\.connection_slots/);
    expect(unpaid).toMatch(/status = 'CANCELLED'/);
    expect(unpaid).not.toMatch(/UPDATE public\.connection_checkout_sessions/);

    expect(endJob).toMatch(/already in a booking/);
    expect(endJob).not.toMatch(/fee_cents\s*=/);
    expect(endJob).not.toMatch(/INSERT INTO public\.booking_contact_access/);
    expect(endJob).toMatch(/GRANT EXECUTE ON FUNCTION public\.contractor_end_job\(uuid\) TO authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.contractor_end_job\(uuid\) FROM PUBLIC, anon/);
  });

  it("rolls back to the marker that can write checkout sessions", () => {
    const rolledGuard = functionBody(rollback, "protect_connection_checkout_session_row");
    const rolledJob = functionBody(rollback, "contractor_end_job");
    expect(rolledGuard).toMatch(/ppp_rpc_is\('contractor_end_job'\)/);
    expect(rolledGuard).not.toMatch(/expire_open_connection_checkout_sessions/);
    expect(rolledJob).toMatch(/UPDATE public\.connection_checkout_sessions/);
    expect(rolledJob).not.toMatch(/PERFORM public\.expire_open_connection_checkout_sessions/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.expire_open_connection_checkout_sessions\(uuid\)/);
  });
});
