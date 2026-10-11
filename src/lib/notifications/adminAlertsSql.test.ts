import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const VERSION = "20261020100001";
const migration = readFileSync(
  path.join(root, `supabase/migrations/${VERSION}_admin_alerts_disputes_refunds.sql`),
  "utf8",
);
const rollback = readFileSync(
  path.join(root, `supabase/rollbacks/${VERSION}_admin_alerts_disputes_refunds_rollback.sql`),
  "utf8",
);

describe("admin alerts migration", () => {
  it("has a unique version", () => {
    const versions = readdirSync(path.join(root, "supabase/migrations")).map((name) => name.split("_")[0]);
    expect(versions.filter((version) => version === VERSION)).toHaveLength(1);
  });

  it("only observes refund flags: AFTER triggers, no writes to payment tables", () => {
    expect(migration).toMatch(/AFTER UPDATE OF needs_refund ON public\.project_connections/);
    expect(migration).toMatch(/AFTER UPDATE OF needs_refund ON public\.signup_fee_charges/);
    expect(migration).toMatch(/WHEN \(NEW\.needs_refund IS TRUE AND OLD\.needs_refund IS NOT TRUE\)/);
    expect(migration).not.toMatch(/UPDATE public\.(project_connections|signup_fee_charges|connection_checkout_sessions|bookings)\b/);
    expect(migration).not.toMatch(/INSERT INTO public\.(project_connections|signup_fee_charges|connection_checkout_sessions|bookings)\b/);
    expect(migration).not.toMatch(/BEFORE (UPDATE|INSERT)/);
    expect(migration).not.toMatch(/fee_cents|499|999/);
  });

  it("audits disputes and refund flags", () => {
    expect(migration).toMatch(/'booking\.disputed'/);
    expect(migration).toMatch(/'payment\.flagged_for_refund'/);
    expect(migration).toMatch(/WHEN \(NEW\.status = 'DISPUTED' AND OLD\.status IS DISTINCT FROM 'DISPUTED'\)/);
  });

  it("keeps the fan-out internal and the alert text free of private fields", () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.notify_admins\([^)]*\) FROM anon, authenticated/);
    for (const fn of [
      "admin_alert_booking_disputed",
      "admin_alert_refund_flagged",
      "admin_alert_application_submitted",
      "admin_alert_content_report",
    ]) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM anon, authenticated`));
    }
    const alerts = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.notify_admins"));
    expect(alerts).not.toMatch(/NEW\.(reason|notes)\b/);
    expect(alerts).not.toMatch(/\b(phone|email|street_line1|first_name|last_name|business_name|stripe_checkout_session_id)\b/);
  });

  it("rolls back every object and the admin categories", () => {
    for (const name of [
      "bookings_admin_alert_disputed",
      "project_connections_admin_alert_refund",
      "signup_fee_charges_admin_alert_refund",
      "contractor_profiles_admin_alert_submitted",
      "content_reports_admin_alert",
    ]) {
      expect(rollback).toContain(`DROP TRIGGER IF EXISTS ${name}`);
    }
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.notify_admins/);
    expect(rollback).toMatch(/DELETE FROM public\.notification_preferences\s+WHERE category IN \('admin_applications'/);
    expect(rollback).not.toMatch(/admin_applications'[^;]*ADD CONSTRAINT/);
    expect(rollback).not.toMatch(/DELETE FROM public\.(audit_logs|notifications|project_connections|signup_fee_charges)/);
  });
});
