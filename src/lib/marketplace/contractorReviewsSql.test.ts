import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261007000001_contractor_review_reputation.sql";
const sql = readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");

function functionBody(name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  const create = rest.indexOf("\nCREATE FUNCTION public.", marker.length);
  const next = [end, create].filter((index) => index > 0).sort((a, b) => a - b)[0];
  return next ? rest.slice(0, next) : rest;
}

describe("contractor review reputation SQL", () => {
  const submit = functionBody("submit_booking_review");
  const respond = functionBody("respond_to_booking_review");
  const report = functionBody("report_booking_review");
  const moderate = functionBody("moderate_booking_review");

  it("does not touch live payment flags or fee constants", () => {
    expect(sql).not.toMatch(/payments_live',\s*1/);
    expect(sql).not.toMatch(/charges_live',\s*1/);
    expect(sql).not.toMatch(/signup_fee_enabled/);
    expect(sql).not.toMatch(/connection_fee_checkout_enabled/);
    expect(sql).not.toMatch(/price_id/i);
    expect(sql).not.toMatch(/GRANT UPDATE ON TABLE public\.bookings/);
  });

  it("keeps one homeowner review per project and contractor and blocks self-verified inserts", () => {
    expect(sql).toMatch(/CREATE TYPE public\.booking_review_class AS ENUM \('VERIFIED_PPP_PROJECT', 'CUSTOMER_REVIEW'\)/);
    expect(sql).toMatch(/booking_reviews_one_homeowner_project_contractor/);
    expect(sql).toMatch(/WHERE reviewer_role = 'CUSTOMER'/);
    expect(submit).toMatch(/only the project homeowner can review the hired contractor/);
    expect(submit).toMatch(/reviews require the hired contractor on this project/);
    expect(submit).toMatch(/reviews require mutual hired confirmation/);
    expect(submit).toMatch(/you already reviewed this contractor on this project/);
    expect(submit).toMatch(/only booking participants can review after mutual hire/);
    expect(submit).toMatch(/'VERIFIED_PPP_PROJECT'/);
    expect(submit).not.toMatch(/p_review_class/);
    expect(sql).toMatch(/outside customer reviews are not enabled/);
    expect(sql).toMatch(/verified status is assigned by the platform/);
    expect(sql).toMatch(/reviews cannot be edited/);
    expect(sql).toMatch(/reviews cannot be deleted from the client/);
    expect(sql).not.toMatch(/GRANT UPDATE ON TABLE public\.booking_reviews/);
    expect(sql).not.toMatch(/GRANT DELETE ON TABLE public\.booking_reviews/);
  });

  it("publishes only verified homeowner reviews and drops hidden rows from the aggregate", () => {
    expect(sql).toMatch(/r\.moderation_status = 'PUBLISHED'/);
    expect(sql).toMatch(/r\.review_class = 'VERIFIED_PPP_PROJECT'/);
    expect(sql).toMatch(/r\.reviewer_role = 'CUSTOMER'/);
    expect(sql).toMatch(/af55cdfe-b3aa-421d-84b3-0411d9d7e3b6/);
    expect(sql).toMatch(/review_text_is_excluded_from_public/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.booking_reviews FROM anon/);
    expect(sql).not.toMatch(/GRANT SELECT ON TABLE public\.booking_reviews TO anon/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it("stores one contractor response and an admin trail that a report does not hide", () => {
    expect(sql).toMatch(/CREATE TABLE public\.booking_review_responses/);
    expect(sql).toMatch(/review_id uuid NOT NULL UNIQUE/);
    expect(sql).toMatch(/char_length\(btrim\(body\)\) BETWEEN 1 AND 800/);
    expect(respond).toMatch(/only the reviewed contractor can respond/);
    expect(respond).not.toMatch(/SET rating/);
    expect(report).toMatch(/auto_hidden', false/);
    expect(report).toMatch(/a report must not change moderation status/);
    expect(sql).toMatch(/'spam'/);
    expect(sql).toMatch(/'not_a_real_customer'/);
    expect(sql).toMatch(/'harassment'/);
    expect(sql).toMatch(/'personal_information'/);
    expect(sql).toMatch(/'conflict_of_interest'/);
    expect(sql).toMatch(/'other'/);
    expect(moderate).toMatch(/only an admin can moderate a contractor review/);
    expect(sql).toMatch(/moderation cannot change the review/);
    expect(moderate).toMatch(/write_audit_log/);
    expect(sql).toMatch(/CREATE TABLE public\.booking_review_moderation_events/);
    expect(sql).toMatch(/Future votes, photos, filters, awards, and reminders may reference this id/);
    expect(sql).not.toMatch(/CREATE TABLE public\.booking_review_votes/);
    expect(sql).not.toMatch(/CREATE TABLE public\.booking_review_photos/);
  });
});
