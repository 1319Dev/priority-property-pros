import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHARGES_LIVE, PAYMENTS_LIVE } from "./types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n\n");
}

describe("contractor profile + estimate lifecycle SQL", () => {
  const sql = allSql();

  it("adds SENT/VIEWED and server-only view tracking columns", () => {
    expect(sql).toMatch(/ADD VALUE IF NOT EXISTS 'SENT'/);
    expect(sql).toMatch(/ADD VALUE IF NOT EXISTS 'VIEWED'/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS first_viewed_at/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS last_viewed_at/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS view_count/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS decline_reason/);
    expect(sql).toMatch(/CUSTOMER_DECLINED', 'ANOTHER_ESTIMATE_ACCEPTED/);
    expect(sql).toMatch(/estimate view timestamps are server-authoritative/);
    expect(sql).toMatch(/first_viewed_at is immutable once set/);
    expect(sql).toMatch(/List\/prefetch must not call this/);
    expect(sql).toMatch(/FUNCTION public\.list_my_estimates\(\)/);
    expect(sql).toMatch(/Does not mark VIEWED/);
    const listFn = sql.split("CREATE OR REPLACE FUNCTION public.list_my_estimates()")[1]?.split("CREATE OR REPLACE FUNCTION")[0] ?? "";
    expect(listFn).toMatch(/jsonb_agg/);
    expect(listFn).not.toMatch(/UPDATE public\.estimates/i);
    expect(listFn).not.toMatch(/mark_estimate_viewed/);
  });

  it("submit goes to SENT not VIEWED, and VIEWED cannot regress to SENT", () => {
    expect(sql).toMatch(/next_status := CASE WHEN est\.status = 'DRAFT' THEN 'SENT' ELSE 'REVISED' END/);
    expect(sql).toMatch(/estimate status cannot regress from VIEWED to SENT/);
    expect(sql).toMatch(/FUNCTION public\.mark_estimate_viewed\(p_estimate_id uuid/);
    expect(sql).toMatch(/first_viewed_at = coalesce\(first_viewed_at, now\(\)\)/);
    expect(sql).toMatch(/view_count = view_count \+ 1/);
  });

  it("hardens mark_estimate_viewed to the owning customer on a DETAIL open", () => {
    expect(sql).toMatch(/only the customer can mark an estimate viewed/);
    expect(sql).toMatch(/Admin tooling does not count as customer VIEWED/);
    expect(sql).toMatch(/contractors cannot mark their own estimate viewed/);
    expect(sql).toMatch(/estimate does not belong to this project/);
    expect(sql).toMatch(/auth required/);
    expect(sql).toMatch(/estimate\.first_viewed/);
    expect(sql).toMatch(/IF was_first THEN/);
    expect(sql).toMatch(/Your estimate was viewed\./);
  });

  it("accepts one winner and declines other active estimates server-side with distinct reasons", () => {
    expect(sql).toMatch(/SET status = 'ACCEPTED', accepted_at = now\(\)/);
    expect(sql).toMatch(/AND status IN \('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED'\)/);
    expect(sql).toMatch(/decline_reason = 'ANOTHER_ESTIMATE_ACCEPTED'/);
    expect(sql).toMatch(/decline_reason = 'CUSTOMER_DECLINED'/);
    expect(sql).toMatch(/The customer selected another pro for this project/);
    expect(sql).toMatch(/The customer decided not to move forward with your estimate/);
    expect(sql).toMatch(/FUNCTION public\.decline_estimate\(p_estimate_id uuid\)/);
    expect(sql).toMatch(/Does not cancel the project or cascade other estimates/);
    expect(sql).toMatch(/estimates_one_accepted_per_project/);
    expect(sql).toMatch(/idempotent retry of the same winner/i);
    expect(sql).toMatch(/PERFORM 1 FROM public\.estimates WHERE project_id = p_project_id FOR UPDATE/);
  });

  it("blocks contractor self-accept and isolates estimate reads", () => {
    expect(sql).toMatch(/contractors cannot self-set ACCEPTED/);
    expect(sql).toMatch(/contractors cannot accept their own estimate/);
    expect(sql).toMatch(/contractor_profile_id = public\.current_contractor_profile_id\(\)/);
    expect(sql).toMatch(/not your estimate/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.estimate_events/);
    expect(sql).toMatch(/estimate_events are immutable/);
    expect(sql).toMatch(/only the customer can hire an estimate/);
  });

  it("notifies first VIEWED once plus accepted/declined/not-selected/received/updated/withdrawn", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.notifications/);
    expect(sql).toMatch(/notifications_once_per_entity/);
    expect(sql).toMatch(/'estimate.viewed'/);
    expect(sql).toMatch(/'estimate.accepted'/);
    expect(sql).toMatch(/'estimate.declined'/);
    expect(sql).toMatch(/'estimate.not_selected'/);
    expect(sql).toMatch(/'estimate.received'/);
    expect(sql).toMatch(/'estimate.updated'/);
    expect(sql).toMatch(/'estimate.withdrawn'/);
    expect(sql).toMatch(/channel text NOT NULL DEFAULT 'in_app'/);
    expect(sql).toMatch(/The customer selected your estimate\./);
  });

  it("flags identity/license edits for re-review without stripping approval and demotes that credential", () => {
    expect(sql).toMatch(/identity_review_required/);
    expect(sql).toMatch(/protect_contractor_profile_fields/);
    expect(sql).toMatch(/NEW\.onboarding_status := OLD\.onboarding_status/);
    expect(sql).toMatch(/Does not strip APPROVED/);
    expect(sql).toMatch(/protect_contractor_approval/);
    expect(sql).toMatch(/demote_verified_credentials_of_kind/);
    expect(sql).toMatch(/credential\.reverification_required/);
    expect(sql).toMatch(/badge_suppressed/);
    expect(sql).toMatch(/does_not_strip_approved/);
    expect(sql).toMatch(/IDENTITY_REVIEW/);
    expect(sql).toMatch(/NEW\.approval_status := OLD\.approval_status/);
  });

  it("blocks obvious contact exchange in notes/bios/project text and keeps payments off", () => {
    expect(sql).toMatch(/text_contains_contact_info/);
    expect(sql).toMatch(/Contact info is shared after connection through Priority Property Pros/);
    expect(sql).toMatch(/Not surveillance/);
    expect(sql).toMatch(/protect_project_text_contact/);
    expect(sql).toMatch(/protect_estimate_item_contact/);
    expect(sql).toMatch(/protect_project_answer_contact/);
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(sql).not.toMatch(/payments_live',\s*1/);
    expect(sql).not.toMatch(/charges_live',\s*1/);
    expect(sql).not.toMatch(/signup_fee_enabled',\s*1/);
  });

  it("does not weaken phone/email/address gates from contact-access entitlement", () => {
    expect(sql).toMatch(/phone\/email\/address stay gated/i);
    expect(sql).toMatch(/booking_job_contact/);
    expect(sql).toMatch(/Does not open profiles SELECT/);
    expect(sql).toMatch(/project_private_locations/);
    expect(sql).toMatch(/Contact stays on the #14 entitlement path/);
  });

  it("future matching uses live category/area/accepting_work without duplicate opportunities", () => {
    expect(sql).toMatch(/ON CONFLICT \(project_id, contractor_profile_id\) DO NOTHING/);
    expect(sql).toMatch(/cp\.accepting_work = true/);
    expect(sql).toMatch(/Live matching: reads current contractor_services/);
  });
});
