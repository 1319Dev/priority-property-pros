import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(repoRoot, "supabase/migrations/20261014120000_admin_dashboard_rpcs.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(repoRoot, "supabase/rollbacks/20261014120000_admin_dashboard_rpcs_rollback.sql"),
  "utf8",
);
const dryRun = readFileSync(path.join(repoRoot, "scripts/dry-run-admin-dashboard-rpcs.sh"), "utf8");

describe("admin dashboard RPC migration", () => {
  it("gates every client function with is_admin and revokes anon and public", () => {
    for (const name of [
      "admin_dashboard_summary(boolean)",
      "admin_needs_attention(boolean)",
      "admin_recent_activity(integer, text, boolean)",
      "admin_dashboard_trends(text, date, date, boolean)",
      "admin_set_account_flag(uuid, text, text)",
    ]) {
      expect(migration).toContain(`FUNCTION public.${name.split("(")[0]}`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${name} FROM PUBLIC, anon`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${name} TO authenticated`);
    }
    expect(migration).toContain("PERFORM public.admin_require()");
    expect(migration).toContain("IF NOT public.is_admin()");
    expect(migration).toContain("ERRCODE = '42501'");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_account_is_excluded(uuid, boolean) FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_require() FROM PUBLIC, anon, authenticated");
  });

  it("keeps account flags admin-read, with no client writes and no seed rows", () => {
    expect(migration).toContain("CREATE TABLE public.admin_account_flags");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("USING (public.is_admin())");
    expect(migration).toContain("CHECK (flag IN ('TEST', 'OWNER', 'INTERNAL'))");
    expect(migration).not.toMatch(/INSERT INTO public\.admin_account_flags[\s\S]{0,180}'(?:TEST|OWNER|INTERNAL)'/);
    expect(migration).not.toMatch(/GRANT INSERT|GRANT UPDATE|GRANT DELETE/i);
    expect(migration).toContain("'admin.account_flag_set'");
    expect(rollback).toContain("DROP TABLE IF EXISTS public.admin_account_flags");
  });

  it("documents unavailable metrics instead of inventing zeros, and ignores the legacy fee", () => {
    expect(migration).toContain("'support_tickets'");
    expect(migration).toContain("'status', 'unavailable'");
    expect(migration).toContain("'revenue_net_cents'");
    expect(migration).toContain("'card_declines'");
    expect(migration).toContain("No support_tickets table");
    expect(migration).not.toMatch(/SELECT[^;\n]*fee_cents/i);
    expect(migration).not.toMatch(/SUM\([^)]*fee_cents/i);
    expect(migration).not.toMatch(/contractor_fee_bps\s*=/);
    expect(migration).toContain("livemode IS TRUE");
    expect(migration).toContain("'PAID', 'CONSUMED'");
    expect(migration).not.toMatch(/UPDATE public\.platform_settings/);
    expect(migration).not.toMatch(/payments_live|charges_live|signup_fee_cents|connection_fee_cents/);
  });

  it("keeps recent activity free of contact fields and paginates with a cursor", () => {
    const activity = migration.slice(
      migration.indexOf("FUNCTION public.admin_recent_activity"),
      migration.indexOf("COMMENT ON FUNCTION public.admin_recent_activity"),
    );
    expect(activity).not.toMatch(/\bemail\b/i);
    expect(activity).not.toMatch(/\bphone\b/i);
    expect(activity).not.toMatch(/street|address/i);
    expect(activity).not.toMatch(/a\.metadata/);
    expect(activity).toContain("business_name");
    expect(activity).toContain("first_name");
    expect(activity).toContain("invalid cursor");
    expect(activity).toContain("PPP-");
  });

  it("caps trends at 366 days and does not drop the pre-existing approval index on rollback", () => {
    expect(migration).toContain("granularity must be day, week, or month");
    expect(migration).toContain("(p_to - p_from) > 366");
    expect(migration).toContain("America/Chicago");
    expect(rollback).toContain("DROP FUNCTION IF EXISTS public.admin_dashboard_trends(text, date, date, boolean)");
    expect(rollback).not.toMatch(/DROP INDEX[^;]*contractor_profiles_approval_status_idx/);
    expect(dryRun).toContain("bersftkjpbzpgtahbqwd");
    expect(dryRun).toContain("Nothing was applied");
    expect(dryRun).toContain("ROLLBACK");
  });
});
