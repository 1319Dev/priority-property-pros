import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261015000002_contractor_end_job_prod_guards.sql";

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

describe("contractor end job prod guards", () => {
  const sql = read(`supabase/migrations/${migrationName}`);
  const rollback = read("supabase/rollbacks/20261015000002_contractor_end_job_prod_guards_rollback.sql");
  const endJob = functionBody(sql, "contractor_end_job");
  const guard = functionBody(sql, "guard_project_connection_money");

  it("restores the RPC name immediately after expiring reservations", () => {
    const start = endJob.indexOf("PERFORM public.expire_stale_connection_reservations()");
    const next = endJob.slice(start, start + 400);
    expect(next).toMatch(/ppp_set_rpc\('contractor_end_job'\)/);
    expect(endJob).toMatch(/status = 'COMPLETED'/);
    expect(endJob).toMatch(/status = 'CANCELLED'/);
    expect(endJob).toMatch(/already in a booking/);
    expect(endJob).not.toMatch(/INSERT INTO public\.booking_contact_access/);
    expect(endJob).not.toMatch(/fee_cents\s*=/);
    expect(endJob).toMatch(/'contact_unlocked', false/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.contractor_end_job\(uuid\) TO authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.contractor_end_job\(uuid\) FROM PUBLIC, anon/);
  });

  it("lets the RPC complete PAID to COMPLETED and still blocks a client paid write", () => {
    for (const name of [
      "protect_project_connection_row",
      "protect_connection_slot_row",
      "protect_connection_checkout_session_row",
    ]) {
      expect(functionBody(sql, name)).toMatch(/ppp_rpc_is\('contractor_end_job'\)/);
    }
    expect(guard).toMatch(/OLD\.status = 'PAID'/);
    expect(guard).toMatch(/NEW\.status = 'COMPLETED'/);
    expect(guard).toMatch(/connection cannot be marked paid from the client/);
    expect(guard).toMatch(/fee_cents IS DISTINCT FROM 499/);
  });

  it("rolls the extra RPC restore back and drops the end-job allow-list", () => {
    const rolled = functionBody(rollback, "contractor_end_job");
    const start = rolled.indexOf("PERFORM public.expire_stale_connection_reservations()");
    expect(rolled.slice(start, start + 180)).not.toMatch(/ppp_set_rpc\('contractor_end_job'\)/);
    expect(functionBody(rollback, "guard_project_connection_money")).not.toMatch(/contractor_end_job/);
    expect(functionBody(rollback, "protect_project_connection_row")).not.toMatch(/contractor_end_job/);
  });
});
