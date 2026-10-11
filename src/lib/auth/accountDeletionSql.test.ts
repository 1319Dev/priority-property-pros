import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20261017000001_account_deletion_anonymize.sql");
const rollbackPath = path.join(repoRoot, "supabase/rollbacks/20261017000001_account_deletion_anonymize_rollback.sql");

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("account deletion SQL", () => {
  it("is the latest migration so it applies after the live blocks migration", () => {
    const names = readdirSync(path.join(repoRoot, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(names.at(-1)).toBe("20261017000001_account_deletion_anonymize.sql");
    expect(names.includes("20261016000001_customer_contractor_blocks.sql")).toBe(true);
    const roles = readFileSync(path.join(repoRoot, "supabase/tests/account_deletion_roles.sql"), "utf8");
    expect(roles).toMatch(/CUSTOMER/);
    expect(roles).toMatch(/CONTRACTOR/);
    expect(roles).toMatch(/NOT_REQUIRED \(Plymate\)/);
    expect(roles).toMatch(/only ACTIVE admin/);
    expect(roles).toMatch(/payments, refunds, ledger_entries, stripe_disputes/);
    expect(roles).toMatch(/Another user's booking review/);
    expect(roles).toMatch(/payment_schedule_items\.description becomes the item kind/);
    expect(roles).toMatch(/stripe_disputes\.reason: Stripe dispute classification/);
    expect(roles).toMatch(/ledger_entries\.note: the ledger is immutable/);
  });

  const migration = readFileSync(migrationPath, "utf8");
  const rollback = readFileSync(rollbackPath, "utf8");
  const purge = functionBody(migration, "purge_account_owned_rows");
  const protect = functionBody(migration, "protect_project_connection_row");
  const money = functionBody(migration, "guard_project_connection_money");

  it("anonymizes and never deletes payment rows", () => {
    expect(purge).toMatch(/Finish or cancel your active jobs before deleting this account/);
    expect(purge).toMatch(/Resolve the open dispute before deleting this account/);
    expect(purge).toMatch(/Wait until the outstanding refund is finished before deleting this account/);
    expect(purge).toMatch(/'PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'/);
    expect(purge).toMatch(/DELETE FROM auth\.users WHERE id = p_user_id/);
    expect(purge).not.toMatch(/\bCOMMIT\b/);
    expect(purge).toMatch(/account_status = 'DELETED'/);
    expect(purge).toMatch(/Deleted Pro/);
    expect(purge).not.toMatch(/session_replication_role/);
    expect(purge).not.toMatch(/deleted\+/);
    expect(purge).not.toMatch(/@users\.invalid/);
    expect(purge).not.toMatch(/DELETE FROM public\.bookings/);
    expect(purge).not.toMatch(/DELETE FROM public\.project_connections/);
    expect(purge).not.toMatch(/DELETE FROM public\.signup_fee_charges/);
    expect(purge).not.toMatch(/DELETE FROM public\.connection_checkout_sessions/);
    expect(purge).not.toMatch(/DELETE FROM public\.audit_logs/);
    expect(purge).not.toMatch(/DELETE FROM public\.change_orders/);
    expect(purge).not.toMatch(/DELETE FROM public\.estimate_events/);
    expect(purge).not.toMatch(/DELETE FROM public\.signup_fee_events/);
    expect(purge).not.toMatch(/DELETE FROM public\.payments/);
    expect(purge).not.toMatch(/DELETE FROM public\.refunds/);
    expect(purge).not.toMatch(/DELETE FROM public\.ledger_entries/);
    expect(purge).not.toMatch(/DELETE FROM public\.stripe_disputes/);
    expect(purge).not.toMatch(/DELETE FROM public\.agreement_acceptances/);
    expect(purge).not.toMatch(/DELETE FROM public\.project_messages/);
    expect(purge).not.toMatch(/DELETE FROM public\.booking_reviews/);
    expect(purge).not.toMatch(/selected_contractor_profile_id = NULL/);
    expect(purge).not.toMatch(/fee_cents\s*=/);
    expect(purge).toMatch(/SET description = item\.kind::text/);
    expect(purge).toMatch(/UPDATE public\.booking_cancellations AS cancel[\s\S]*SET reason = NULL/);
    expect(purge).toMatch(/UPDATE public\.refunds AS refund[\s\S]*SET reason = NULL/);
    expect(purge).not.toMatch(/UPDATE public\.ledger_entries/);
    expect(purge).not.toMatch(/UPDATE public\.stripe_disputes/);
    expect(purge).not.toMatch(/refund_reason\s*=/);
    expect(migration).toMatch(/It is Stripe's dispute/);
    expect(migration).toMatch(/ledger entries are immutable/);
    expect(migration).toMatch(/account\.deleted[\s\S]*self_service and anonymized/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.protect_ledger_row/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.protect_financial_row/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.fulfill_connection_fee_checkout/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.fulfill_signup_fee_checkout/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.stripe_connection_price_id/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.stripe_activation_price_id/);
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
    const signupProjects = functionBody(migration, "enforce_signup_fee_on_projects");
    const signupCharges = functionBody(migration, "protect_signup_fee_charge_row");
    expect(signupProjects).toMatch(/NEW\.customer_id IS NULL AND OLD\.customer_id IS NOT NULL/);
    expect(signupProjects).toMatch(/assert_signup_fee_paid/);
    expect(signupCharges).toMatch(/ppp_rpc_is\('purge_account_owned_rows'\)/);
    expect(signupCharges).toMatch(/NEW\.profile_id IS NULL/);
    expect(signupCharges).toMatch(/register_signup_fee_checkout/);
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey/);
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS estimate_events_actor_id_fkey/);
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS signup_fee_events_profile_id_fkey/);
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS ledger_entries_actor_id_fkey/);
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS agreement_acceptances_profile_id_fkey/);
    expect(migration).toMatch(/payments_customer_id_fkey[\s\S]*ON DELETE SET NULL/);
    const reviewDelete = deleteBranch(functionBody(migration, "protect_platform_review"));
    expect(reviewDelete).toMatch(/auth\.uid\(\) IS NOT NULL AND NOT public\.is_admin\(\)/);
    expect(reviewDelete).toMatch(/only an admin can delete a platform review/);
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
    const signupProjects = functionBody(rollback, "enforce_signup_fee_on_projects");
    const signupCharges = functionBody(rollback, "protect_signup_fee_charge_row");
    expect(signupProjects).not.toMatch(/NEW\.customer_id IS NULL/);
    expect(signupProjects).toMatch(/assert_signup_fee_paid/);
    expect(signupCharges).not.toMatch(/purge_account_owned_rows/);
    expect(signupCharges).toMatch(/signup fee charges cannot be written from the client/);
    expect(rollback).toMatch(/ADD CONSTRAINT audit_logs_actor_id_fkey/);
    expect(rollback).toMatch(/ON DELETE SET NULL/);
    expect(rollback).toMatch(
      /ADD CONSTRAINT estimate_events_actor_id_fkey[\s\S]*ON DELETE SET NULL NOT VALID/,
    );
    expect(rollback).toMatch(
      /ADD CONSTRAINT signup_fee_events_profile_id_fkey[\s\S]*ON DELETE SET NULL NOT VALID/,
    );
    expect(rollback).toMatch(/ADD CONSTRAINT payments_customer_id_fkey[\s\S]*ON DELETE RESTRICT/);
    expect(rollback).toMatch(/ADD CONSTRAINT ledger_entries_actor_id_fkey/);
    expect(rollback).toMatch(/ADD CONSTRAINT agreement_acceptances_profile_id_fkey[\s\S]*NOT VALID/);
    expect(rollback).not.toMatch(/DELETE FROM auth\.users/);
    const reviewDelete = deleteBranch(functionBody(rollback, "protect_platform_review"));
    expect(reviewDelete).toMatch(/IF NOT public\.is_admin\(\) THEN/);
    expect(reviewDelete).toMatch(/only an admin can delete a platform review/);
    expect(reviewDelete).not.toMatch(/auth\.uid\(\) IS NOT NULL/);
  });
});

function deleteBranch(body: string): string {
  const start = body.indexOf("IF TG_OP = 'DELETE'");
  expect(start).toBeGreaterThan(-1);
  return body.slice(start);
}
