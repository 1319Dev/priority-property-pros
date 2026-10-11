import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function allSql(): string {
  const dir = path.join(root, "supabase/migrations");
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

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, name.name);
    if (name.isDirectory()) walk(next, acc);
    else acc.push(next);
  }
  return acc;
}

describe("self-service account delete SQL and Edge Function", () => {
  const sql = allSql();
  const fn = readFileSync(path.join(root, "supabase/functions/delete-account/index.ts"), "utf8");
  const frontend = walk(path.join(root, "src"))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  it("purges owned rows as service role only and never lets the client pick a victim", () => {
    const purge = functionBody(sql, "purge_account_owned_rows");
    expect(sql).toMatch(/FUNCTION public\.purge_account_owned_rows\(p_user_id uuid\)/);
    expect(purge).toMatch(/PERFORM public\.require_service_role\(\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.purge_account_owned_rows\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_account_owned_rows\(uuid\) TO service_role/);
    expect(purge).not.toMatch(/DELETE FROM public\.bookings/);
    expect(purge).not.toMatch(/DELETE FROM public\.project_connections/);
    expect(purge).not.toMatch(/DELETE FROM public\.estimates/);
    expect(purge).not.toMatch(/DELETE FROM public\.change_orders/);
    expect(purge).not.toMatch(/DELETE FROM public\.signup_fee_charges/);
    expect(purge).not.toMatch(/DELETE FROM public\.audit_logs/);
    expect(purge).not.toMatch(/DELETE FROM public\.payments/);
    expect(purge).not.toMatch(/DELETE FROM public\.refunds/);
    expect(purge).not.toMatch(/DELETE FROM public\.ledger_entries/);
    expect(purge).not.toMatch(/DELETE FROM public\.stripe_disputes/);
    expect(purge).not.toMatch(/DELETE FROM public\.agreement_acceptances/);
    expect(purge).not.toMatch(/DELETE FROM public\.project_messages/);
    expect(purge).not.toMatch(/DELETE FROM public\.booking_reviews/);
    expect(purge).toMatch(/DELETE FROM auth\.users WHERE id = p_user_id/);
    expect(purge).toMatch(/Resolve the open dispute before deleting this account/);
    expect(purge).toMatch(/Wait until the outstanding refund is finished before deleting this account/);
    expect(purge).not.toMatch(/\bCOMMIT\b/);
    expect(purge).not.toMatch(/selected_booking_id = NULL/);
    expect(purge).not.toMatch(/selected_contractor_profile_id = NULL/);
    expect(purge).toMatch(/Finish or cancel your active jobs before deleting this account/);
    expect(purge).toMatch(/ppp_set_rpc\('purge_account_owned_rows'\)/);
    expect(sql).toMatch(/cannot delete the last active admin/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_account_owned_rows\(uuid\) TO authenticated/);
  });

  it("reauthenticates, then deletes only the signed-in auth user inside the purge", () => {
    expect(fn).toMatch(/auth\/v1\/user/);
    expect(fn).toMatch(/grant_type=password/);
    expect(fn).toMatch(/last_sign_in_at/);
    expect(fn).not.toMatch(/auth\/v1\/admin\/users/);
    expect(fn).toMatch(/purge_account_owned_rows/);
    expect(fn).toMatch(/you can only delete your own account/);
    expect(fn).toMatch(/Enter your current password/);
    expect(fn).toMatch(/Resolve the open dispute/);
    expect(fn).toMatch(/outstanding refund/);
    expect(fn).toMatch(/status: "deleted"/);
    expect(fn).toMatch(/Nothing was changed/);
    expect(fn).not.toMatch(/return json\(\{ error: purged\.error \}/);
    expect(fn).not.toMatch(/body\.user_id\s*=/);
    expect(fn).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY.*=.*['"]eyJ/);
    expect(fn).not.toMatch(/payments_live|charges_live|signup_fee_enabled/);
  });

  it("clears the browser session after a successful delete", () => {
    expect(frontend).toMatch(/delete-account/);
    expect(frontend).toMatch(/functions\.invoke\("delete-account", \{\s*body: \{ password \}/);
    expect(frontend).toMatch(/await signOut\(\)/);
    expect(frontend).toMatch(/This account is deleted/);
  });
});
