import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261019500001_priority_help.sql";

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

function executable(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

describe("Priority Help migration contract", () => {
  const sql = read(`supabase/migrations/${migrationName}`);
  const body = executable(sql);
  const rollback = read("supabase/rollbacks/20261019500001_priority_help_rollback.sql");
  const roleTest = read("supabase/tests/priority_help.sql");

  it("is additive and does not replace existing functions", () => {
    expect(migrationName > "20261016000001").toBe(true);
    expect(migrationName > "20261019400001").toBe(true);
    expect(body).not.toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(body).not.toMatch(/ALTER FUNCTION public\.is_admin/);
    expect(body).not.toMatch(/purge_account_owned_rows/);
    expect(body).not.toMatch(/payments_live\s*=/);
    expect(body).not.toMatch(/charges_live\s*=/);
    expect(body).not.toMatch(/signup_fee_cents\s*=/);
    expect(body).not.toMatch(/contractor_fee_bps/);
    expect(body).not.toMatch(/CREATE EXTENSION(?! IF NOT EXISTS pgcrypto)/);
    expect(body).not.toMatch(/cron\.schedule/);
  });

  it("keeps guest secrets and internal notes off anon and customer reads", () => {
    expect(body).toMatch(/CREATE TABLE public\.support_guest_secrets/);
    expect(body).toMatch(/token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(body).toMatch(/REVOKE ALL ON TABLE public\.support_guest_secrets FROM PUBLIC, anon, authenticated/);
    expect(body).toMatch(/REVOKE ALL ON TABLE public\.support_conversations FROM PUBLIC, anon, authenticated/);
    expect(body).not.toMatch(/GRANT SELECT ON TABLE public\.support_guest_secrets/);
    expect(body).toMatch(/visibility = 'public'/);
    expect(body).toMatch(/visibility <> 'internal' OR author_role = 'admin'/);
    expect(body).toMatch(/GRANT EXECUTE ON FUNCTION public\.support_service_open\(uuid, text, text\) TO service_role/);
    expect(body).toMatch(/REVOKE ALL ON FUNCTION public\.support_service_open\(uuid, text, text\) FROM PUBLIC, anon, authenticated/);
    expect(body).toMatch(/IF NOT public\.is_admin\(\)/);
    expect(body).toMatch(/ERRCODE = '42501'/);
  });

  it("rates limits, caps length, rejects HTML, and purges only when an admin asks", () => {
    expect(body).toMatch(/too many support requests/);
    expect(body).toMatch(/char_length\(v_body\) > 2000/);
    expect(body).toMatch(/HTML is not allowed in support content/);
    expect(body).toMatch(/admin_support_purge_expired/);
    expect(body).toMatch(/status IN \('RESOLVED', 'CLOSED'\)/);
    expect(body).toMatch(/support_purge_on_profile_delete/);
    expect(body).toMatch(/support\.account_purged/);
    expect(body).toMatch(/support\.escalated/);
    expect(body).toMatch(/START WITH 10001/);
  });

  it("reads live activation and Connect prices and seeds the public topics", () => {
    expect(body).toMatch(/signup_fee_cents/);
    expect(body).toMatch(/connection_fee_cents/);
    expect(body).toMatch(/connection_fee_checkout_enabled/);
    expect(body).toMatch(/registration-and-activation/);
    expect(body).toMatch(/find-a-pro/);
    expect(body).toMatch(/independent-marketplace/);
    expect(body).toMatch(/complaints-and-reports/);
    expect(body).toMatch(/does not guarantee/);
    expect(body).toMatch(/does not employ contractors/);
    expect(body).toMatch(/does not supervise the work/);
    expect(body).toMatch(/does not inspect the work/);
    expect(body).toMatch(/does not insure the work/);
    expect(body).toMatch(/does not verify the contractor's work/);
    expect(body).toMatch(/does not resolve construction disputes/);
    expect(body).toMatch(/generally non-refundable once/);
    expect(body).toMatch(/duplicate charge/);
    expect(body).toMatch(/erroneous charge/);
    expect(body).toMatch(/legally required refund/);
    expect(body).toMatch(/approved exception/);
    expect(body).toMatch(/not employees or agents/);
    expect(body).toMatch(/to_tsvector\('english'/);
    expect(body).toMatch(/websearch_to_tsquery\('english'/);
  });

  it("caps assistant answers per day and fails closed at zero", () => {
    expect(body).toMatch(/daily_ai_answer_cap integer NOT NULL DEFAULT 200/);
    expect(body).toMatch(/daily_ai_answer_cap BETWEEN 0 AND 100000/);
    expect(body).toMatch(/CREATE FUNCTION public\.support_service_ai_budget\(\)/);
    expect(body).toMatch(/author_role = 'assistant'/);
    expect(body).toMatch(/'allowed', v_cap > 0 AND v_used < v_cap/);
    expect(body).toMatch(
      /REVOKE ALL ON FUNCTION public\.support_service_ai_budget\(\) FROM PUBLIC, anon, authenticated/,
    );
    expect(body).toMatch(/GRANT EXECUTE ON FUNCTION public\.support_service_ai_budget\(\) TO service_role/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.support_service_ai_budget\(\)/);
  });

  it("ships a rollback and a role-access script for anon, guests, and staff", () => {
    expect(rollback).toMatch(/DROP TABLE IF EXISTS public\.support_conversations/);
    expect(rollback).toMatch(/DROP TRIGGER IF EXISTS support_purge_on_profile_delete/);
    expect(rollback).not.toMatch(/DROP FUNCTION IF EXISTS public\.is_admin/);
    expect(roleTest).toMatch(/SET ROLE anon/);
    expect(roleTest).toMatch(/SET ROLE service_role/);
    expect(roleTest).toMatch(/SET ROLE authenticated/);
    expect(roleTest).toMatch(/PH-10001/);
    expect(roleTest).toMatch(/guest A and B are different conversations/);
    expect(roleTest).toMatch(/customer cannot read internal notes/);
    expect(roleTest).toMatch(/contractor sees only their conversation/);
    expect(roleTest).toMatch(/other customer sees no support rows/);
    expect(roleTest).toMatch(/aal2 admin lists the open queue/);
  });
});
