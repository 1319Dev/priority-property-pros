import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAYMENTS_LIVE, CHARGES_LIVE } from "./types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261007000001_project_messages.sql";

function migrationSql(): string {
  return readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("project message SQL", () => {
  const sql = migrationSql();
  const gate = functionBody(sql, "message_pair_has_connection_entitlement");
  const ensure = functionBody(sql, "ensure_message_thread");
  const list = functionBody(sql, "list_my_message_threads");
  const protect = functionBody(sql, "protect_project_message_contact");
  const notify = functionBody(sql, "notify_project_message");

  it("keys one thread per project and contractor and enables RLS", () => {
    expect(sql).toMatch(/CREATE TABLE public\.project_message_threads/);
    expect(sql).toMatch(/CREATE TABLE public\.project_messages/);
    expect(sql).toMatch(/CONSTRAINT project_message_threads_pair UNIQUE \(project_id, contractor_profile_id\)/);
    expect(sql).toMatch(/sender_profile_id uuid NOT NULL/);
    expect(sql).toMatch(/body text NOT NULL/);
    expect(sql).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
    expect(sql).toMatch(/ALTER TABLE public\.project_message_threads ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.project_messages ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON TABLE public\.project_message_threads TO authenticated/);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON TABLE public\.project_messages TO authenticated/);
    expect(sql).not.toMatch(/GRANT UPDATE ON TABLE public\.project_messages/);
    expect(sql).not.toMatch(/GRANT DELETE ON TABLE public\.project_messages/);
    expect(sql).not.toMatch(/FOR UPDATE\s+TO authenticated/);
    expect(sql).not.toMatch(/FOR DELETE/);
    expect(sql).not.toMatch(/TO anon/);
    expect(sql).not.toMatch(/phone text/);
    expect(sql).not.toMatch(/email text/);
    expect(sql).not.toMatch(/street_line/);
  });

  it("unlocks only a connection-fee or admin entitlement for that pair", () => {
    expect(gate).toMatch(/FROM public\.booking_contact_access a/);
    expect(gate).toMatch(/a\.contractor_profile_id = p_contractor_profile_id/);
    expect(gate).toMatch(/a\.status = 'UNLOCKED' AND a\.grant_source = 'CONNECTION_FEE_PAYMENT'/);
    expect(gate).toMatch(/a\.status = 'ADMIN_OVERRIDE' AND a\.grant_source = 'ADMIN_OVERRIDE'/);
    expect(gate).toMatch(/a\.revoked_at IS NULL/);
    expect(gate).toMatch(/p\.customer_id = \(SELECT auth\.uid\(\)\)/);
    expect(gate).toMatch(/a\.contractor_profile_id = \(SELECT public\.current_contractor_profile_id\(\)\)/);
    expect(gate).not.toMatch(/signup_fee/);
    expect(gate).not.toMatch(/hired_at/);
    expect(gate).not.toMatch(/payments_live/);
    expect(gate).not.toMatch(/charges_live/);
    expect(gate).not.toMatch(/project_connections/);
  });

  it("reuses contact scanners and notifies without the message body or contact fields", () => {
    expect(protect).toMatch(/public\.text_contains_contact_info\(NEW\.body\)/);
    expect(protect).toMatch(/public\.text_contains_pre_hire_contact\(NEW\.body\)/);
    expect(protect).toMatch(/public\.contact_info_blocked_message\(\)/);
    expect(protect).toMatch(/message_pair_has_connection_entitlement/);
    expect(notify).toMatch(/'message\.received'/);
    expect(notify).toMatch(/'You have a new message about a project\.'/);
    expect(notify).not.toMatch(/NEW\.body/);
    expect(notify).toMatch(/'thread_id', v_thread\.id/);
    expect(notify).toMatch(/'project_id', v_thread\.project_id/);
    expect(notify).toMatch(/'contractor_profile_id', v_thread\.contractor_profile_id/);
    expect(notify).not.toMatch(/'phone'/);
    expect(notify).not.toMatch(/'email'/);
    expect(notify).not.toMatch(/'street'/);
    expect(list).toMatch(/anonymized_pro_label/);
    expect(list).not.toMatch(/business_name/);
    expect(list).not.toMatch(/'phone'/);
    expect(list).not.toMatch(/'email'/);
    expect(list).not.toMatch(/'street'/);
    expect(ensure).toMatch(/messaging is locked until the \$4\.99 connection entitlement/);
    expect(ensure).not.toMatch(/'phone'/);
    expect(ensure).not.toMatch(/'email'/);
  });

  it("does not enable job payments", () => {
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(sql).not.toMatch(/payments_live',\s*1/);
    expect(sql).not.toMatch(/charges_live',\s*1/);
    expect(sql).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(sql).toMatch(/DELETE FROM public\.project_message_threads/);
  });
});
