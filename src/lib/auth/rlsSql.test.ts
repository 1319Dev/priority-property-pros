import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = path.join(root, "supabase/migrations");

function allSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
    .join("\n\n");
}

describe("Phase 2 SQL migrations", () => {
  const sql = allSql();

  it("creates the required tables", () => {
    for (const table of [
      "profiles",
      "contractor_profiles",
      "verifier_profiles",
      "agreements",
      "agreement_acceptances",
      "audit_logs",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`, "i"));
    }
  });

  it("enables RLS on every Phase 2 table", () => {
    for (const table of [
      "profiles",
      "contractor_profiles",
      "verifier_profiles",
      "agreements",
      "agreement_acceptances",
      "audit_logs",
    ]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
    }
  });

  it("never trusts client metadata for ADMIN", () => {
    expect(sql).toMatch(/permitted_signup_account_type/);
    expect(sql).toMatch(/WHEN 'ADMIN'/i);
    expect(sql).toMatch(/ELSE 'CUSTOMER'::public.account_type/);
    expect(sql).toMatch(/ADMIN cannot be assigned from the client/);
  });

  it("blocks self-approval on contractor and verifier rows", () => {
    expect(sql).toMatch(/cannot self-approve/);
    expect(sql).toMatch(/protect_contractor_approval/);
    expect(sql).toMatch(/protect_verifier_approval/);
  });

  it("keeps audit_logs immutable for clients", () => {
    expect(sql).toMatch(/audit_logs are immutable/);
    expect(sql).not.toMatch(/CREATE POLICY audit_logs_insert/i);
    expect(sql).not.toMatch(/CREATE POLICY audit_logs_update/i);
    expect(sql).not.toMatch(/CREATE POLICY audit_logs_delete/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public.audit_logs TO authenticated/);
  });

  it("does not grant profile writes to anon", () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public.profiles TO authenticated/);
    expect(sql).not.toMatch(/GRANT DELETE ON TABLE public.profiles TO (anon|authenticated)/);
  });

  it("uses a SECURITY DEFINER is_admin() helper to avoid recursive RLS", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public.is_admin/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
  });
});

const PHASE3_TABLES = [
  "service_categories",
  "service_questions",
  "contractor_services",
  "contractor_service_areas",
  "contractor_portfolio",
  "contractor_credentials",
  "projects",
  "project_photos",
  "project_answers",
  "project_status_history",
  "project_private_locations",
  "matches",
  "opportunities",
  "opportunity_slots",
  "estimate_questions",
  "estimates",
  "estimate_items",
  "platform_settings",
];

describe("Phase 3 SQL migrations", () => {
  const sql = allSql();

  it("creates the marketplace tables", () => {
    for (const table of PHASE3_TABLES) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`, "i"));
    }
  });

  it("enables RLS on every Phase 3 table", () => {
    for (const table of PHASE3_TABLES) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
    }
  });

  it("seeds the 21 service categories and does not enable electrical/plumbing/HVAC", () => {
    expect(sql).toMatch(/'handyman'/);
    expect(sql).toMatch(/'other'/);
    expect(sql).toMatch(/Intentionally omitted as ordinary unverified services: electrical, plumbing, HVAC/);
    expect(sql).not.toMatch(/\('electrical'/);
    expect(sql).not.toMatch(/\('plumbing'/);
    expect(sql).not.toMatch(/\('hvac'/);
  });

  it("enforces a max of 3 participating contractors with a slot primary key and row lock", () => {
    expect(sql).toMatch(/CONSTRAINT opportunity_slots_range CHECK \(slot_number BETWEEN 1 AND 3\)/);
    expect(sql).toMatch(/PRIMARY KEY \(project_id, slot_number\)/);
    expect(sql).toMatch(/FROM public\.projects WHERE id = opp\.project_id FOR UPDATE/);
    expect(sql).toMatch(/this project already has 3 participating contractors/);
  });

  it("validates estimate totals and previews the contractor fee without charging", () => {
    expect(sql).toMatch(/fee_cents_from_total/);
    expect(sql).toMatch(/charges_live', false/);
    expect(sql).toMatch(/estimate totals failed validation/);
    expect(sql).toMatch(/contractor_fee_bps/);
  });

  it("selects a contractor atomically and stops before payment", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX estimates_one_accepted_per_project/);
    expect(sql).toMatch(/a contractor is already selected/);
    expect(sql).toMatch(/FUNCTION public\.select_estimate/);
  });

  it("keeps exact street addresses off opportunity contractors", () => {
    expect(sql).toMatch(/CREATE TABLE public\.project_private_locations/);
    expect(sql).toMatch(/contractor_is_selected_on_project/);
    expect(sql).toMatch(/Customers do not see AVAILABLE matching-pool rows/);
  });

  it("blocks credential self-verify and creates private storage buckets", () => {
    expect(sql).toMatch(/contractors cannot self-verify credentials/);
    expect(sql).toMatch(/project-photos/);
    expect(sql).toMatch(/contractor-docs/);
    expect(sql).toMatch(/CREATE POLICY project_photos_storage_insert/);
  });

  it("does not delete auth users or profiles", () => {
    expect(sql).not.toMatch(/DELETE FROM auth\.users/i);
    expect(sql).not.toMatch(/TRUNCATE public\.profiles/i);
    expect(sql).not.toMatch(/DROP TABLE public\.profiles/i);
  });
});
