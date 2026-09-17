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
    expect(sql).toMatch(/FUNCTION public\.mark_estimate_viewed\(p_estimate_id uuid\)/);
    expect(sql).toMatch(/first_viewed_at = coalesce\(first_viewed_at, now\(\)\)/);
    expect(sql).toMatch(/view_count = view_count \+ 1/);
  });

  it("accepts one winner and declines other active estimates server-side", () => {
    expect(sql).toMatch(/SET status = 'ACCEPTED', accepted_at = now\(\)/);
    expect(sql).toMatch(/AND status IN \('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED'\)/);
    expect(sql).toMatch(/SET status = 'DECLINED', declined_at = now\(\)/);
    expect(sql).toMatch(/The customer selected another pro for this project/);
    expect(sql).toMatch(/FUNCTION public\.decline_estimate\(p_estimate_id uuid\)/);
  });

  it("blocks contractor self-accept and isolates estimate reads", () => {
    expect(sql).toMatch(/contractors cannot self-set ACCEPTED/);
    expect(sql).toMatch(/contractor_profile_id = public\.current_contractor_profile_id\(\)/);
    expect(sql).toMatch(/not your estimate/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.estimate_events/);
    expect(sql).toMatch(/estimate_events are immutable/);
  });

  it("notifies first VIEWED once plus accepted/declined/received/updated/withdrawn", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.notifications/);
    expect(sql).toMatch(/notifications_once_per_entity/);
    expect(sql).toMatch(/'estimate.viewed'/);
    expect(sql).toMatch(/'estimate.accepted'/);
    expect(sql).toMatch(/'estimate.declined'/);
    expect(sql).toMatch(/'estimate.received'/);
    expect(sql).toMatch(/'estimate.updated'/);
    expect(sql).toMatch(/'estimate.withdrawn'/);
    expect(sql).toMatch(/channel text NOT NULL DEFAULT 'in_app'/);
    expect(sql).toMatch(/IF was_first THEN/);
  });

  it("flags identity/license edits for re-review without stripping approval", () => {
    expect(sql).toMatch(/identity_review_required/);
    expect(sql).toMatch(/protect_contractor_profile_fields/);
    expect(sql).toMatch(/NEW\.onboarding_status := OLD\.onboarding_status/);
    expect(sql).toMatch(/Does not strip APPROVED/);
    expect(sql).toMatch(/protect_contractor_approval/);
  });

  it("blocks obvious contact exchange in notes/bios and keeps payments off", () => {
    expect(sql).toMatch(/text_contains_contact_info/);
    expect(sql).toMatch(/Contact info is shared after connection through PPP/);
    expect(sql).toMatch(/Not surveillance/);
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
  });
});
