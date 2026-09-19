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
    expect(sql).toMatch(/FUNCTION public\.purge_account_owned_rows\(p_user_id uuid\)/);
    expect(sql).toMatch(/PERFORM public\.require_service_role\(\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.purge_account_owned_rows\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_account_owned_rows\(uuid\) TO service_role/);
    expect(sql).toMatch(/DELETE FROM public\.bookings/);
    expect(sql).toMatch(/DELETE FROM public\.project_connections/);
    expect(sql).toMatch(/DELETE FROM public\.estimates/);
    expect(sql).toMatch(/cannot delete the last active admin/);
    expect(sql).not.toMatch(/DELETE FROM auth\.users/i);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_account_owned_rows\(uuid\) TO authenticated/);
  });

  it("deletes only the signed-in auth user from the Edge Function", () => {
    expect(fn).toMatch(/userIdFromRequest/);
    expect(fn).toMatch(/auth\/v1\/admin\/users\/\$\{userId\}/);
    expect(fn).toMatch(/purge_account_owned_rows/);
    expect(fn).toMatch(/you can only delete your own account/);
    expect(fn).not.toMatch(/body\.user_id\s*=/);
    expect(fn).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY.*=.*['"]eyJ/);
    expect(fn).not.toMatch(/payments_live|charges_live|signup_fee_enabled/);
  });

  it("clears the browser session after a successful delete", () => {
    expect(frontend).toMatch(/delete-account/);
    expect(frontend).toMatch(/functions\.invoke\("delete-account", \{\s*body: \{\}/);
    expect(frontend).toMatch(/await signOut\(\)/);
  });
});
