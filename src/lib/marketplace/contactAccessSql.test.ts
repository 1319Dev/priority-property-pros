import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canAcceptFourthSlot } from "./privacy";
import { PAYMENTS_LIVE, CHARGES_LIVE } from "./types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20260922000001_contact_access_entitlement.sql";

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n\n");
}

function srcFiles(): string {
  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const next = path.join(dir, name.name);
      if (name.isDirectory()) walk(next, acc);
      else if (/\.(ts|tsx|js|mjs)$/.test(name.name) && !/\.test\.(ts|tsx)$/.test(name.name)) {
        acc.push(readFileSync(next, "utf8"));
      }
    }
    return acc;
  };
  return walk(path.join(repoRoot, "src")).join("\n");
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("Contact-access entitlement SQL", () => {
  const latest = readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");
  const sql = allSql();
  const frontend = srcFiles();
  const jobContact = functionBody(latest, "booking_job_contact");
  const helper = functionBody(latest, "booking_has_contact_access");
  const projectHelper = functionBody(latest, "contractor_has_contact_access_on_project");
  const grant = functionBody(latest, "admin_grant_booking_contact_access");
  const revoke = functionBody(latest, "admin_revoke_booking_contact_access");
  const jobFee = functionBody(latest, "grant_booking_contact_access_from_job_fee");
  const confirm = sql.slice(sql.lastIndexOf("COMMENT ON FUNCTION public.confirm_booking_for_testing"));

  it("adds LOCKED|UNLOCKED|ADMIN_OVERRIDE entitlement keyed per booking, default LOCKED", () => {
    expect(latest).toMatch(/CREATE TYPE public\.contact_access_status AS ENUM/);
    expect(latest).toMatch(/'LOCKED'/);
    expect(latest).toMatch(/'UNLOCKED'/);
    expect(latest).toMatch(/'ADMIN_OVERRIDE'/);
    expect(latest).toMatch(/CREATE TABLE public\.booking_contact_access/);
    expect(latest).toMatch(/booking_id uuid PRIMARY KEY/);
    expect(latest).toMatch(/DEFAULT 'LOCKED'/);
    expect(latest).toMatch(/INSERT INTO public\.booking_contact_access \(booking_id, status, grant_source\)/);
    expect(latest).toMatch(/'LOCKED'::public\.contact_access_status/);
    expect(latest).toMatch(/FROM public\.bookings b/);
    expect(latest).toMatch(/AFTER INSERT ON public\.bookings/);
    expect(latest).toMatch(/ALTER TABLE public\.booking_contact_access ENABLE ROW LEVEL SECURITY/);
  });

  it("1-2. unhired and estimate-only contractors are not entitled", () => {
    expect(projectHelper).toMatch(/b\.contractor_profile_id = public\.current_contractor_profile_id\(\)/);
    expect(projectHelper).toMatch(/a\.status IN \('UNLOCKED', 'ADMIN_OVERRIDE'\)/);
    expect(projectHelper).not.toMatch(/b\.status IN \('CONFIRMED'/);
    expect(latest).toMatch(/Other contractors never inherit access/);
  });

  it("3. CONFIRMED without entitlement cannot call booking_job_contact successfully", () => {
    expect(jobContact).toMatch(/entitled := public\.booking_has_contact_access\(b\.id\)/);
    expect(jobContact).toMatch(/contact is locked until hire and job-fee entitlement or admin override/);
    expect(jobContact).not.toMatch(/unlocked := b\.status IN \('CONFIRMED'/);
    expect(helper).toMatch(/a\.status IN \('UNLOCKED', 'ADMIN_OVERRIDE'\)/);
    expect(helper).not.toMatch(/b\.status IN \('CONFIRMED'/);
    expect(confirm).toMatch(/Does NOT grant contact access/);
  });

  it("4. hired contractor with entitlement can retrieve private contact", () => {
    expect(jobContact).toMatch(/OR entitled/);
    expect(jobContact).toMatch(/'street_line1', loc\.street_line1/);
    expect(jobContact).toMatch(/'phone', cust\.phone/);
    expect(jobContact).toMatch(/'email', cust\.email/);
    expect(jobContact).toMatch(/'lat', loc\.lat/);
    expect(helper).toMatch(/b\.contractor_profile_id = public\.current_contractor_profile_id\(\)/);
  });

  it("5. a different contractor on the same project cannot inherit access", () => {
    expect(projectHelper).toMatch(/b\.project_id = p_project_id/);
    expect(projectHelper).toMatch(/b\.contractor_profile_id = public\.current_contractor_profile_id\(\)/);
    expect(jobContact).toMatch(/b\.contractor_profile_id IS DISTINCT FROM public\.current_contractor_profile_id\(\)/);
  });

  it("6-8. project/opportunity paths and direct writes do not leak street/phone/email/coords", () => {
    expect(latest).toMatch(/OR public\.contractor_has_contact_access_on_project\(project_id\)/);
    expect(latest).not.toMatch(/OR public\.booking_is_confirmed_for_contractor\(project_id\)/);
    expect(latest).toMatch(/Does not open profiles SELECT/);
    expect(latest).toMatch(/GRANT SELECT ON TABLE public\.booking_contact_access TO authenticated/);
    expect(latest).not.toMatch(/GRANT INSERT ON TABLE public\.booking_contact_access/);
    expect(latest).not.toMatch(/GRANT UPDATE ON TABLE public\.booking_contact_access/);
    expect(latest).toMatch(/contact access cannot be written from the client/);
    expect(sql).toMatch(/profiles_select_own_or_admin/);
    expect(readFileSync(path.join(repoRoot, "src/lib/marketplace/api.ts"), "utf8")).toMatch(/fetchBookingJobContact/);
    expect(readFileSync(path.join(repoRoot, "src/lib/marketplace/api.ts"), "utf8")).not.toMatch(
      /from\("profiles"\)[\s\S]{0,180}phone/,
    );
  });

  it("9. admin override requires is_admin, targets one booking, stamps who/when/reason, and audits", () => {
    expect(grant).toMatch(/only an admin can grant booking contact access/);
    expect(grant).toMatch(/public\.is_admin\(\)/);
    expect(grant).toMatch(/a reason is required to grant contact access/);
    expect(grant).toMatch(/status = 'ADMIN_OVERRIDE'/);
    expect(grant).toMatch(/granted_by = auth\.uid\(\)/);
    expect(grant).toMatch(/grant_reason = v_reason/);
    expect(grant).toMatch(/'booking\.contact_access\.granted'/);
    expect(grant).toMatch(/write_audit_log/);
    expect(grant).toMatch(/customer_id/);
    expect(grant).toMatch(/contractor_profile_id/);
    expect(revoke).toMatch(/only an admin can revoke booking contact access/);
    expect(revoke).toMatch(/'booking\.contact_access\.revoked'/);
    expect(latest).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_grant_booking_contact_access\(uuid, text\) TO authenticated/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.admin_grant_booking_contact_access\(uuid, text\) FROM PUBLIC, anon/);
    expect(latest).toMatch(/No global contractor bypass/);
    expect(frontend).toMatch(/admin_grant_booking_contact_access/);
    expect(frontend).toMatch(/Grant contact access/);
  });

  it("10. marketplace matching/estimate flows stay intact and Stripe stays off", () => {
    expect(sql).toMatch(/FUNCTION public\.select_estimate/);
    expect(sql).toMatch(/FUNCTION public\.submit_estimate/);
    expect(sql).toMatch(/FUNCTION public\.accept_opportunity/);
    expect(sql).toMatch(/CONSTRAINT opportunity_slots_range CHECK \(slot_number BETWEEN 1 AND 3\)/);
    expect(canAcceptFourthSlot(3)).toBe(false);
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(latest).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(latest).toMatch(/Does not change payments_live, charges_live, or signup_fee_enabled/);
    expect(jobFee).toMatch(/job-fee contact unlock is disabled while payments are off/);
    expect(jobFee).toMatch(/job-fee contact unlock is not wired/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.grant_booking_contact_access_from_job_fee\(uuid, text\) FROM PUBLIC, anon, authenticated/);
    expect(latest).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.grant_booking_contact_access_from_job_fee/);
    expect(sql).toMatch(/CONSTRAINT bookings_payments_not_live CHECK \(payments_live = false\)/);
    expect(sql).toMatch(/CONSTRAINT bookings_charges_not_live CHECK \(charges_live = false\)/);
  });

  it("does not leak private fields from opportunity or estimate RPC returns", () => {
    const submit = functionBody(sql, "submit_estimate");
    const accept = functionBody(sql, "accept_opportunity");
    const listMine = functionBody(sql, "list_my_customer_projects");
    expect(submit).not.toMatch(/street_line1/);
    expect(submit).not.toMatch(/cust\.phone/);
    expect(submit).not.toMatch(/cust\.email/);
    expect(accept).not.toMatch(/street_line1/);
    expect(accept).not.toMatch(/loc\.lat/);
    expect(listMine).not.toMatch(/street_line1/);
    expect(listMine).not.toMatch(/from public\.profiles/i);
  });
});

describe("Contact-access + estimate-lifecycle SQL compatibility", () => {
  const sql = allSql();
  const compatName = "20260924000001_contact_access_lifecycle_compat.sql";
  const compat = readFileSync(path.join(repoRoot, "supabase/migrations", compatName), "utf8");
  const liveJobContact = functionBody(sql, "booking_job_contact");
  const liveHelper = functionBody(sql, "booking_has_contact_access");
  const liveGrant = functionBody(sql, "admin_grant_booking_contact_access");
  const liveRevoke = functionBody(sql, "admin_revoke_booking_contact_access");
  const liveJobFee = functionBody(sql, "grant_booking_contact_access_from_job_fee");
  const liveSelect = functionBody(sql, "select_estimate");
  const liveListEstimates = functionBody(sql, "list_my_estimates");
  const liveListNotes = functionBody(sql, "list_my_notifications");
  const liveMarkViewed = functionBody(sql, "mark_estimate_viewed");
  const liveEvents = functionBody(sql, "write_estimate_event");
  const liveEnqueue = functionBody(sql, "enqueue_notification");

  it("applies a later additive hardening migration after #16 timestamps", () => {
    expect(compatName > "20260923000004_estimate_lifecycle_select_rls.sql").toBe(true);
    expect(compat).toMatch(/Missing booking_contact_access row = NO ACCESS/);
    expect(compat).toMatch(/ACCEPTED and CONFIRMED never unlock/);
    expect(compat).not.toMatch(/payments_live',\s*1/);
    expect(compat).not.toMatch(/charges_live',\s*1/);
    expect(compat).not.toMatch(/signup_fee_enabled',\s*1/);
  });

  it("keeps missing-row / LOCKED as no access and never keys off ACCEPTED or CONFIRMED", () => {
    expect(liveHelper).toMatch(/a\.status IN \('UNLOCKED', 'ADMIN_OVERRIDE'\)/);
    expect(liveHelper).toMatch(/FROM public\.booking_contact_access a/);
    expect(liveHelper).not.toMatch(/b\.status IN \('CONFIRMED'/);
    expect(liveJobContact).toMatch(/Missing row is LOCKED/);
    expect(liveJobContact).toMatch(/entitled := public\.booking_has_contact_access\(b\.id\)/);
    expect(liveJobContact).toMatch(/ACCEPTED estimate status and CONFIRMED booking status are not consulted/);
    expect(liveJobContact).not.toMatch(/unlocked := b\.status IN \('CONFIRMED'/);
    expect(liveSelect).not.toMatch(/booking_contact_access/);
    expect(liveSelect).toMatch(/'PENDING'/);
  });

  it("does not put private fields on #16 list/view/select/notification/event payloads", () => {
    expect(liveListEstimates).not.toMatch(/street_line1/);
    expect(liveListEstimates).not.toMatch(/cust\.phone/);
    expect(liveListEstimates).not.toMatch(/cust\.email/);
    expect(liveMarkViewed).not.toMatch(/street_line1/);
    expect(liveMarkViewed).not.toMatch(/cust\.phone/);
    expect(liveSelect).not.toMatch(/street_line1/);
    expect(liveSelect).not.toMatch(/cust\.phone/);
    expect(liveListNotes).toMatch(/strip_private_contact_keys\(n\.payload\)/);
    expect(liveEvents).toMatch(/strip_private_contact_keys/);
    expect(liveEnqueue).toMatch(/strip_private_contact_keys/);
    expect(compat).toMatch(/- 'phone' - 'email' - 'street'/);
  });

  it("keeps admin grant/revoke admin-only with required reason and immediate revoke", () => {
    expect(liveGrant).toMatch(/only an admin can grant booking contact access/);
    expect(liveGrant).toMatch(/a reason is required to grant contact access/);
    expect(liveRevoke).toMatch(/only an admin can revoke booking contact access/);
    expect(liveRevoke).toMatch(/a reason is required to revoke contact access/);
    expect(liveRevoke).toMatch(/status = 'LOCKED'/);
    expect(liveRevoke).toMatch(/revoked_at = now\(\)/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_grant_booking_contact_access\(uuid, text\) TO authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_grant_booking_contact_access\(uuid, text\) FROM PUBLIC, anon/);
  });

  it("refuses client manufacture of UNLOCKED while payments are off", () => {
    expect(liveJobFee).toMatch(/job-fee contact unlock is disabled while payments are off/);
    expect(liveJobFee).toMatch(/job-fee contact unlock is not wired/);
    expect(compat).toMatch(/REVOKE ALL ON FUNCTION public\.grant_booking_contact_access_from_job_fee\(uuid, text\) FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.grant_booking_contact_access_from_job_fee/);
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
  });

  it("unauthorized booking_job_contact errors contain no private field assignment", () => {
    const beforeSelect = liveJobContact.slice(0, liveJobContact.indexOf("SELECT * INTO loc"));
    expect(beforeSelect).toMatch(/is_hired AND entitled/);
    expect(beforeSelect).toMatch(/RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override'/);
    expect(beforeSelect).not.toMatch(/'street_line1'/);
    expect(beforeSelect).not.toMatch(/'phone'/);
    expect(beforeSelect).not.toMatch(/'email'/);
    expect(beforeSelect).not.toMatch(/loc\.lat/);
  });
});

