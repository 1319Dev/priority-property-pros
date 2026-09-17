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

  it("revokes anonymous execute on marketplace RPCs and leftover Phase 2 helpers", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.post_project\(uuid\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.accept_opportunity\(uuid\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.select_estimate\(uuid, uuid\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.post_project\(uuid\) TO authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.write_audit_log\(uuid, text, text, uuid, jsonb\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.is_admin\(\) FROM PUBLIC, anon/);
  });

  it("locks estimate status and money to RPCs and adds labor/materials line kinds", () => {
    expect(sql).toMatch(/estimate_item_kind/);
    expect(sql).toMatch(/'LABOR'/);
    expect(sql).toMatch(/'MATERIALS'/);
    expect(sql).toMatch(/'EQUIPMENT'/);
    expect(sql).toMatch(/duration_hours/);
    expect(sql).toMatch(/available_from/);
    expect(sql).toMatch(/estimate status can only change through submit, withdraw, or select/);
    expect(sql).toMatch(/estimate money columns are computed in the database/);
    expect(sql).toMatch(/FUNCTION public\.protect_estimate_row/);
  });
});

const PHASE4A_TABLES = [
  "fee_schedules",
  "fee_schedule_brackets",
  "bookings",
  "booking_events",
  "customer_contractor_relationships",
  "change_orders",
  "booking_reviews",
];

describe("Phase 4A SQL migrations", () => {
  const sql = allSql();

  it("creates booking, fee, relationship, change-order, and review tables with RLS", () => {
    for (const table of PHASE4A_TABLES) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`, "i"));
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
    }
  });

  it("keeps payments_live and charges_live false and does not add INSPECTOR", () => {
    expect(sql).toMatch(/'payments_live'/);
    expect(sql).toMatch(/'charges_live'/);
    expect(sql).toMatch(/CONSTRAINT bookings_charges_not_live CHECK \(charges_live = false\)/);
    expect(sql).toMatch(/CONSTRAINT bookings_payments_not_live CHECK \(payments_live = false\)/);
    expect(sql).not.toMatch(/INSPECTOR/);
  });

  it("unlocks exact address only after a confirmed booking, not selection", () => {
    expect(sql).toMatch(/booking_is_confirmed_for_contractor/);
    expect(sql).toMatch(/OR public\.booking_is_confirmed_for_contractor\(project_id\)/);
    expect(sql).toMatch(/Exact street \/ coordinates unlock/);
    expect(sql).toMatch(/FUNCTION public\.booking_job_contact/);
    expect(sql).toMatch(/contact is locked until the booking is confirmed/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS project_private_locations_select_protected/);
    expect(sql).toMatch(/Does not open profiles SELECT/);
  });

  it("restricts confirmation to admin testing and snapshots fees", () => {
    expect(sql).toMatch(/FUNCTION public\.confirm_booking_for_testing/);
    expect(sql).toMatch(/only an admin can confirm a booking until payments are live/);
    expect(sql).toMatch(/FUNCTION public\.lock_booking_fee/);
    expect(sql).toMatch(/fee_brackets_snapshot/);
    expect(sql).toMatch(/FUNCTION public\.compute_fee/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX fee_schedules_one_active_per_kind/);
  });

  it("creates relationships on confirm and Hire Again from completed history", () => {
    expect(sql).toMatch(/FUNCTION public\.ensure_relationship_on_confirm/);
    expect(sql).toMatch(/FUNCTION public\.hire_again_contractors/);
    expect(sql).toMatch(/pair_has_completed_booking/);
    expect(sql).toMatch(/relationship_protection_months/);
    expect(sql).toMatch(/relationships cannot be written from the client/);
  });

  it("requires dual approval on change orders and completed bookings for reviews", () => {
    expect(sql).toMatch(/FUNCTION public\.propose_change_order/);
    expect(sql).toMatch(/FUNCTION public\.respond_change_order/);
    expect(sql).toMatch(/change orders cannot be written from the client/);
    expect(sql).toMatch(/reviews require a completed booking/);
    expect(sql).toMatch(/only the customer can review this booking/);
  });

  it("revokes anonymous execute on Phase 4A RPCs and does not delete Phase 3 data", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.confirm_booking_for_testing\(uuid\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.confirm_booking_for_testing\(uuid\) TO authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.booking_job_contact\(uuid\) FROM PUBLIC, anon/);
    expect(sql).not.toMatch(/DELETE FROM auth\.users/i);
    expect(sql).not.toMatch(/TRUNCATE public\.profiles/i);
    expect(sql).not.toMatch(/DROP TABLE public\.projects/i);
    expect(sql).not.toMatch(/DROP TABLE public\.estimates/i);
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public\.bookings/);
    expect(sql).not.toMatch(/GRANT UPDATE ON TABLE public\.bookings/);
    expect(sql).toMatch(/v_repeat := public\.pair_has_completed_booking/);
    expect(sql).toMatch(/compute_fee_from_snapshot/);
  });
});

const PHASE4B_TABLES = [
  "contractor_stripe_accounts",
  "payment_schedules",
  "payment_schedule_items",
  "payments",
  "stripe_events",
  "ledger_entries",
  "contractor_transfers",
  "refunds",
  "stripe_disputes",
  "booking_cancellations",
];

describe("Phase 4B SQL migrations", () => {
  const sql = allSql();

  it("creates financial tables with RLS and no client writes", () => {
    for (const table of PHASE4B_TABLES) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`, "i"));
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
    }
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public\.ledger_entries/);
    expect(sql).not.toMatch(/GRANT UPDATE ON TABLE public\.payments/);
    expect(sql).not.toMatch(/GRANT DELETE ON TABLE public\.stripe_events/);
  });

  it("keeps payments_live and charges_live at 0 and rejects live keys in constraints", () => {
    expect(sql).toMatch(/payments_live and charges_live must stay 0/);
    expect(sql).toMatch(/CONSTRAINT contractor_stripe_accounts_test_mode CHECK \(stripe_mode = 'test'\)/);
    expect(sql).toMatch(/CONSTRAINT payments_test_mode CHECK \(stripe_mode = 'test'\)/);
    expect(sql).toMatch(/FUNCTION public\.confirm_booking_from_payment/);
    expect(sql).toMatch(/only an admin can confirm a booking until payments are live/);
  });

  it("does not rewrite Phase 4A fee schedules", () => {
    expect(sql).toMatch(/PPP original progressive v1/);
    expect(sql).toMatch(/0, 50000, 800, 1/);
    expect(sql).toMatch(/2500000, NULL, 250, 5/);
    expect(sql).toMatch(/min_fee_cents integer NOT NULL,\s*\n\s*max_fee_cents integer NOT NULL/i);
    expect(sql).not.toMatch(/UPDATE public\.fee_schedules SET/);
    expect(sql).not.toMatch(/UPDATE public\.fee_schedule_brackets SET/);
    expect(sql).not.toMatch(/DROP TABLE public\.fee_schedules/i);
  });

  it("makes ledger immutable and webhooks server-only and idempotent", () => {
    expect(sql).toMatch(/ledger entries are immutable; corrections are new rows/);
    expect(sql).toMatch(/FUNCTION public\.claim_stripe_event/);
    expect(sql).toMatch(/stripe financial RPCs are server-only/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_stripe_event\(text, text, jsonb\) TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.confirm_booking_from_payment\(uuid\) FROM PUBLIC, anon, authenticated/);
  });

  it("abandons pending bookings without unlocking contact or reopening expired estimates", () => {
    expect(sql).toMatch(/reopened_expired_estimates', false/);
    expect(sql).toMatch(/relationship_created', false/);
    expect(sql).toMatch(/FUNCTION public\.reopen_project_after_abandoned_booking/);
    expect(sql).not.toMatch(/DELETE FROM auth\.users/i);
  });
});

