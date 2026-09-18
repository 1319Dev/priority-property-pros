import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = path.join(repoRoot, "supabase/migrations");

function allSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
    .join("\n\n");
}

function latestTrustSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.startsWith("20260926") && name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
    .join("\n\n");
}

describe("trust and safety SQL", () => {
  const sql = allSql();
  const latest = latestTrustSql();

  it("adds two-sided review columns and one-per-side uniqueness after 20260925", () => {
    expect(latest).toMatch(/reviewer_role public\.review_side/);
    expect(latest).toMatch(/booking_reviews_one_per_side UNIQUE \(booking_id, reviewer_role\)/);
    expect(latest).toMatch(/booking_reviews_no_self_review CHECK \(reviewer_id <> reviewee_profile_id\)/);
    expect(latest).toMatch(/only the job''s homeowner or hired pro can review/);
    expect(latest).toMatch(/this side already reviewed this job/);
    expect(latest).toMatch(/reviews require a completed booking/);
  });

  it("enforces unrounded rating suspension below 4.00 with a configurable threshold", () => {
    expect(latest).toMatch(/rating_suspension_min_reviews/);
    expect(latest).toMatch(/v_avg < 4/);
    expect(latest).toMatch(/account_status = 'SUSPENDED'/);
    expect(latest).toMatch(/RATING_SUSPENSION/);
    expect(latest).toMatch(/Your account is suspended because of ratings/);
  });

  it("creates disputes, immutable audit, and no-self-approval admin resolution", () => {
    expect(latest).toMatch(/CREATE TABLE IF NOT EXISTS public\.trust_disputes/);
    expect(latest).toMatch(/CREATE TABLE IF NOT EXISTS public\.trust_dispute_events/);
    expect(latest).toMatch(/trust_dispute_events are immutable/);
    expect(latest).toMatch(/you cannot resolve your own dispute/);
    expect(latest).toMatch(/you cannot unsuspend yourself/);
    expect(latest).toMatch(/RESOLVED_UPHELD/);
    expect(latest).toMatch(/RESOLVED_REMOVED/);
    expect(latest).toMatch(/dispute-evidence/);
  });

  it("soft-deletes accounts and removes them from new work and the public directory", () => {
    expect(latest).toMatch(/DELETED_ANONYMIZED/);
    expect(latest).toMatch(/DELETION_REQUESTED/);
    expect(latest).toMatch(/this account cannot start new marketplace work/);
    expect(latest).toMatch(/Deleted business/);
    expect(latest).toMatch(/projects_enforce_new_participation/);
    expect(latest).toMatch(/bookings_enforce_new_participation/);
  });

  it("does not enable payments or invent fee brackets", () => {
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(latest).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(latest).not.toMatch(/stripe_test_mode',\s*0/);
    expect(latest).toMatch(/list_public_fee_schedule/);
    expect(sql).toMatch(/CONSTRAINT bookings_payments_not_live CHECK \(payments_live = false\)/);
  });

  it("keeps public ratings on eligible completed-job customer reviews and preserves #11/#14 locks", () => {
    expect(latest).toMatch(/r\.reviewer_role = 'CUSTOMER'/);
    expect(latest).toMatch(/r\.included_in_rating = true/);
    expect(latest).toMatch(/b\.status = 'COMPLETED'/);
    expect(latest).toMatch(/REVOKE ALL ON TABLE public\.booking_reviews FROM anon/);
    expect(sql).toMatch(/contact is locked until hire and job-fee entitlement or admin override/);
    expect(sql).toMatch(/CREATE TABLE public\.booking_contact_access/);
  });

  it("revokes anonymous execute on new write RPCs", () => {
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.create_trust_dispute/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.admin_resolve_trust_dispute/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.request_account_deletion/);
    expect(latest).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.create_trust_dispute[^\n]+TO anon/);
    expect(latest).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_public_fee_schedule\(\) TO anon, authenticated/);
  });

  it("uses helper function names for ppp.rpc tokens and rating-suspension RPCs", () => {
    expect(latest).toMatch(/PERFORM public\.ppp_set_rpc\('apply_rating_suspension_if_needed'\)/);
    expect(latest).toMatch(/PERFORM public\.ppp_set_rpc\('maybe_clear_rating_suspension'\)/);
    expect(latest).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_rating_suspension_if_needed/);
    expect(latest).toMatch(/CREATE OR REPLACE FUNCTION public\.maybe_clear_rating_suspension/);
    expect(latest).toMatch(/DROP FUNCTION IF EXISTS public\.maybe_lift_rating_suspension/);
    expect(latest).toMatch(/'apply_rating_suspension_if_needed'/);
    expect(latest).toMatch(/'maybe_clear_rating_suspension'/);
    expect(latest).not.toMatch(/ppp_set_rpc\('apply_rating_suspension'\)/);
    expect(latest).toMatch(/default 5/);
    expect(latest).not.toMatch(/minimum reviews \(default 3\)/);
  });
});
