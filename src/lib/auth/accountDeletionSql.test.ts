import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20261015000004_account_deletion_anonymize.sql");
const rollbackPath = path.join(repoRoot, "supabase/rollbacks/20261015000004_account_deletion_anonymize_rollback.sql");

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("account deletion SQL", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const rollback = readFileSync(rollbackPath, "utf8");
  const purge = functionBody(migration, "purge_account_owned_rows");
  const protect = functionBody(migration, "protect_project_connection_row");
  const money = functionBody(migration, "guard_project_connection_money");

  it("anonymizes and never deletes payment rows", () => {
    expect(purge).toMatch(/Finish or cancel your active jobs before deleting this account/);
    expect(purge).toMatch(/'CONFIRMED', 'IN_PROGRESS', 'DISPUTED'/);
    expect(purge).toMatch(/account_status = 'DELETED'/);
    expect(purge).toMatch(/Deleted Pro/);
    expect(purge).toMatch(/session_replication_role', 'replica'/);
    expect(purge).toMatch(/session_replication_role', 'origin'/);
    expect(purge).not.toMatch(/DELETE FROM public\.bookings/);
    expect(purge).not.toMatch(/DELETE FROM public\.project_connections/);
    expect(purge).not.toMatch(/DELETE FROM public\.signup_fee_charges/);
    expect(purge).not.toMatch(/DELETE FROM public\.connection_checkout_sessions/);
    expect(purge).not.toMatch(/DELETE FROM public\.audit_logs/);
    expect(purge).not.toMatch(/selected_contractor_profile_id = NULL/);
    expect(purge).not.toMatch(/fee_cents\s*=/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.match_project/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.recompute_booking_money/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.respond_change_order/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.list_my_message_threads/);
  });

  it("lets purge null a connection owner and still allows contractor_end_job", () => {
    expect(protect).toMatch(/ppp_rpc_is\('contractor_end_job'\)/);
    expect(protect).toMatch(/ppp_rpc_is\('purge_account_owned_rows'\)/);
    expect(protect).toMatch(/TG_OP = 'UPDATE'/);
    expect(protect).toMatch(/NEW\.status IS NOT DISTINCT FROM OLD\.status/);
    expect(money).toMatch(/ppp_rpc_is\('contractor_end_job'\)/);
    expect(money).toMatch(/ppp_rpc_is\('purge_account_owned_rows'\)/);
    expect(money).toMatch(/OLD\.status = 'PAID'/);
    expect(money).toMatch(/NEW\.status = 'COMPLETED'/);
    expect(money).toMatch(/connection fee is server-authoritative and must be 499 cents/);
  });

  it("rolls back to the deleting purge and drops the purge allow-list", () => {
    const oldPurge = functionBody(rollback, "purge_account_owned_rows");
    const oldProtect = functionBody(rollback, "protect_project_connection_row");
    expect(oldPurge).toMatch(/DELETE FROM public\.bookings/);
    expect(oldPurge).toMatch(/DELETE FROM public\.project_connections/);
    expect(oldProtect).toMatch(/ppp_rpc_is\('contractor_end_job'\)/);
    expect(oldProtect).not.toMatch(/purge_account_owned_rows/);
    expect(rollback).toMatch(/ON DELETE CASCADE/);
    expect(rollback).toMatch(/ON DELETE RESTRICT/);
  });
});
