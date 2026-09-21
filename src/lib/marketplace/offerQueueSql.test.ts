import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHARGES_LIVE, PAYMENTS_LIVE, SIGNUP_FEE_ENABLED } from "./types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261004000001_opportunity_offer_queue.sql";

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
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

describe("opportunity offer queue SQL", () => {
  const latest = readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");
  const sql = allSql();
  const matchProject = functionBody(sql, "match_project");
  const pass = functionBody(sql, "pass_opportunity");
  const fill = functionBody(sql, "fill_project_opportunity_offers");
  const rank = functionBody(sql, "rank_project_matches");
  const eligible = functionBody(sql, "contractor_eligible_for_project");
  const fairness = functionBody(sql, "contractor_offer_fairness_penalty");
  const endJob = functionBody(sql, "contractor_end_job");
  const reserve = functionBody(sql, "reserve_connection_checkout");

  it("does not enable Stripe or flip live flags", () => {
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(SIGNUP_FEE_ENABLED).toBe(false);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(latest).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(endJob).toMatch(/'payments_live', false/);
    expect(endJob).toMatch(/'charges_live', false/);
  });

  it("keeps hard eligibility including service area and never offers duplicates", () => {
    expect(eligible).toMatch(/location_matches\(proj\.zip_code/);
    expect(eligible).toMatch(/contractor_service_areas/);
    expect(eligible).toMatch(/approval_status IS DISTINCT FROM 'APPROVED'/);
    expect(eligible).toMatch(/accepting_work IS NOT TRUE/);
    expect(matchProject).toMatch(/contractor_eligible_for_project/);
    expect(fill).toMatch(/NOT EXISTS \(/);
    expect(fill).toMatch(/o\.contractor_profile_id = m\.contractor_profile_id/);
    expect(pass).toMatch(/status = 'PASSED'/);
  });

  it("creates at most 3 live AVAILABLE offers and backfills on pass", () => {
    expect(fill).toMatch(/max_participating_contractors/);
    expect(fill).toMatch(/needed := cap - participating - live_available/);
    expect(fill).toMatch(/LIMIT needed/);
    expect(matchProject).toMatch(/fill_project_opportunity_offers/);
    expect(pass).toMatch(/fill_project_opportunity_offers\(opp\.project_id\)/);
    expect(endJob).toMatch(/fill_project_opportunity_offers\(opp\.project_id\)/);
    expect(endJob).not.toMatch(/SET status = 'AVAILABLE'\s+WHERE project_id = opp\.project_id\s+AND id <> opp\.id\s+AND status = 'CLOSED'/);
  });

  it("ranks with a capped fairness penalty then fit score, with a stable contractor-id tie-break", () => {
    expect(fairness).toMatch(/LEAST\(24/);
    expect(fairness).toMatch(/offer_fairness_lookback_days/);
    expect(rank).toMatch(/effective DESC/);
    expect(rank).toMatch(/last_offered_at ASC NULLS FIRST/);
    expect(rank).toMatch(/contractor_profile_id ASC/);
    expect(latest).toMatch(/ADD COLUMN IF NOT EXISTS rank_order integer NOT NULL DEFAULT 0/);
  });

  it("keeps match_project internal and pass_opportunity authenticated-only", () => {
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.match_project\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.fill_project_opportunity_offers\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.rank_project_matches\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.pass_opportunity\(uuid\) FROM PUBLIC, anon/);
    expect(latest).toMatch(/GRANT EXECUTE ON FUNCTION public\.pass_opportunity\(uuid\) TO authenticated/);
  });

  it("preserves AVAILABLE or ACCEPTED connection-fee reserve eligibility", () => {
    expect(reserve).toMatch(/AND o\.status IN \('AVAILABLE', 'ACCEPTED'\)/);
  });
});
