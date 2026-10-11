import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261019700001_priority_help.sql";

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
  const rollback = read("supabase/rollbacks/20261019700001_priority_help_rollback.sql");
  const roleTest = read("supabase/tests/priority_help.sql");

  it("is additive and does not replace existing functions", () => {
    expect(migrationName > "20261016000001").toBe(true);
    expect(migrationName > "20261019400001").toBe(true);
    // 20261019500001 belongs to the Stripe live price-id PR (#123) and
    // 20261019600001 to admin profile edits (#125).
    expect(migrationName.startsWith("20261019500001")).toBe(false);
    expect(migrationName.startsWith("20261019600001")).toBe(false);
    expect(migrationName.startsWith("20261019700001")).toBe(true);
    expect(body).not.toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(body).not.toMatch(/ALTER FUNCTION public\.is_admin/);
    expect(body).not.toMatch(/purge_account_owned_rows/);
    expect(body).not.toMatch(/payments_live\s*=/);
    expect(body).not.toMatch(/charges_live\s*=/);
    expect(body).not.toMatch(/signup_fee_cents\s*=/);
    expect(body).not.toMatch(/contractor_fee_bps/);
    expect(body).not.toMatch(/CREATE EXTENSION(?! IF NOT EXISTS (pgcrypto|pg_cron);)/);
    // The only scheduled job is Priority Help retention.
    expect(body.match(/cron\.schedule\(/g)).toHaveLength(1);
    expect(body).toMatch(/cron\.schedule\('priority-help-retention', '17 8 \* \* \*', 'SELECT public\.support_purge_expired_auto\(\)'\)/);
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
    expect(body).toMatch(/marks the fee paid, not when the checkout page succeeds/);
    expect(body).toMatch(/unlocks that connection/);
    expect(body).not.toMatch(/activation checkout succeeds/);
    expect(body).not.toMatch(/Connect checkout succeeds/);
    expect(body).not.toMatch(/that checkout succeeds/);
    expect(body).toMatch(/duplicate charge/);
    expect(body).toMatch(/erroneous charge/);
    expect(body).toMatch(/legally required refund/);
    expect(body).toMatch(/approved exception/);
    expect(body).toMatch(/not employees or agents/);
    expect(body).toMatch(/to_tsvector\('english'/);
    expect(body).toMatch(/websearch_to_tsquery\('english'/);
  });

  it("caps model calls and dollars per day and fails closed at zero", () => {
    expect(body).toMatch(/daily_ai_answer_cap integer NOT NULL DEFAULT 200/);
    expect(body).toMatch(/daily_ai_answer_cap BETWEEN 0 AND 100000/);
    expect(body).toMatch(/daily_ai_budget_usd_micros bigint NOT NULL DEFAULT 1000000/);
    expect(body).toMatch(/CREATE TABLE public\.support_ai_usage/);
    expect(body).toMatch(/REVOKE ALL ON TABLE public\.support_ai_usage FROM PUBLIC, anon, authenticated/);
    expect(body).toMatch(/CREATE FUNCTION public\.support_service_ai_budget\(\)/);
    expect(body).toMatch(/v_on AND v_cap > 0 AND v_used < v_cap AND v_budget > 0 AND v_spent < v_budget/);
    expect(body).toMatch(
      /REVOKE ALL ON FUNCTION public\.support_service_ai_budget\(\) FROM PUBLIC, anon, authenticated/,
    );
    expect(body).toMatch(/GRANT EXECUTE ON FUNCTION public\.support_service_ai_budget\(\) TO service_role/);
    expect(body).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.support_service_record_ai_usage\(uuid, text, text, integer, integer, bigint\) TO service_role/,
    );
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.support_service_ai_budget\(\)/);
    expect(rollback).toMatch(/DROP TABLE IF EXISTS public\.support_ai_usage/);
  });

  it("ships off behind two flags and refuses every service entry point while off", () => {
    expect(body).toMatch(/priority_help_enabled boolean NOT NULL DEFAULT false/);
    expect(body).toMatch(/ai_answers_enabled boolean NOT NULL DEFAULT false/);
    expect(body).toMatch(/RAISE EXCEPTION 'priority help is off' USING ERRCODE = '55000'/);
    for (const fn of ["support_service_open", "support_service_history", "support_service_customer_message", "support_service_escalate"]) {
      const start = body.indexOf(`CREATE FUNCTION public.${fn}(`);
      const end = body.indexOf("$$;", start);
      expect(body.slice(start, end)).toMatch(/PERFORM public\.support_require_enabled\(\);/);
    }
    expect(body).toMatch(/CREATE FUNCTION public\.admin_support_set_settings\(/);
    expect(body).toMatch(/support\.settings_set/);
    expect(body).not.toMatch(/UPDATE public\.support_settings\s+SET priority_help_enabled = true/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.admin_support_set_settings\(boolean, boolean, integer, bigint\)/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.support_require_enabled\(\)/);
  });

  it("matches the legal documents on contact, refund exceptions, and privacy requests", () => {
    expect(body).toMatch(/contact-refund-and-privacy-requests/);
    expect(body).toMatch(/support@prioritypropertypros\.com/);
    expect(body).toMatch(/5900 Balcones Drive STE 100, Austin, TX 78731/);
    expect(body).toMatch(/answers within 45 days/);
    expect(body).toMatch(/currently \$9\.99/);
    expect(body).toMatch(/currently \$4\.99/);
    expect(body).toMatch(/no commission/);
    expect(body).toMatch(/There is no mandatory arbitration/);
    const seed = body.slice(body.indexOf("INSERT INTO public.support_kb_articles"));
    expect(seed).not.toMatch(/signup_fee_cents|connection_fee_cents|signup_fee_enabled/);
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

  it("purges guest chats after 90 days and signed-in chats after 365 days, daily", () => {
    expect(body).toMatch(/guest_retention_days integer NOT NULL DEFAULT 90/);
    expect(body).toMatch(/retention_days integer NOT NULL DEFAULT 365/);
    expect(body).toMatch(/CREATE FUNCTION public\.support_purge_expired_core\(p_actor uuid\)/);
    expect(body).toMatch(/REVOKE ALL ON FUNCTION public\.support_purge_expired_auto\(\) FROM PUBLIC, anon, authenticated/);
    expect(body).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_cron;/);
    expect(rollback).toMatch(/cron\.unschedule\('priority-help-retention'\)/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.support_purge_expired_core\(uuid\)/);
  });
});
