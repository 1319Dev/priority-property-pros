import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { actorIsAdmin, canClientAssignAdmin } from "../auth/rlsPolicy";
import {
  bookingUnlocksContact,
  canConfirmBooking,
  canTransitionBooking,
  clientCannotSpoofConfirmed,
  contactAccessAllowsReveal,
} from "./bookings";
import { contractorCanUnilaterallyIncrease } from "./changeOrders";
import { computeMarketplaceFee, feeBasisCents, ORIGINAL_FEE_BRACKETS } from "./feeEngine";
import { canAcceptFourthSlot, canReadCustomerContact, canReadExactAddress, type MarketplaceActor } from "./privacy";
import { clientCannotSelfMarkRepeat, relationshipCreatedOn, repeatPricingEligible } from "./relationships";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

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

const customer: MarketplaceActor = { id: "cust", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const pro: MarketplaceActor = {
  id: "pro-user",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-1",
};
const stranger: MarketplaceActor = {
  id: "stranger",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-9",
};
const selectedProject = { customer_id: "cust", selected_contractor_profile_id: "pro-1" };

describe("Phase 4A pre-merge security checks", () => {
  const sql = allSql();
  const frontend = srcFiles();
  const latestContact = readFileSync(
    path.join(repoRoot, "supabase/migrations/20260922000001_contact_access_entitlement.sql"),
    "utf8",
  );

  it("1. selecting an estimate does not unlock exact address, phone, or email", () => {
    expect(canReadExactAddress(pro, selectedProject, "PENDING")).toBe(false);
    expect(
      canReadCustomerContact(pro, "cust", {
        bookingStatus: "PENDING",
        selectedContractorProfileId: "pro-1",
      }),
    ).toBe(false);
    expect(sql).toMatch(/INSERT INTO public\.bookings \(/);
    expect(sql).toMatch(/'PENDING'/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS project_private_locations_select_protected/);
    expect(latestContact).toMatch(/OR public\.contractor_has_contact_access_on_project\(project_id\)/);
    expect(sql).toMatch(/profiles_select_own_or_admin/);
    expect(sql).toMatch(/Does not open profiles SELECT/);
  });

  it("2. pending / awaiting-payment / CONFIRMED-without-entitlement bookings do not unlock private info", () => {
    expect(bookingUnlocksContact("PENDING")).toBe(false);
    expect(bookingUnlocksContact("AWAITING_PAYMENT")).toBe(false);
    expect(bookingUnlocksContact("CONFIRMED")).toBe(false);
    expect(canReadExactAddress(pro, selectedProject, "AWAITING_PAYMENT")).toBe(false);
    expect(canReadExactAddress(pro, selectedProject, "CONFIRMED", "LOCKED")).toBe(false);
    expect(
      canReadCustomerContact(pro, "cust", {
        bookingStatus: "AWAITING_PAYMENT",
        selectedContractorProfileId: "pro-1",
      }),
    ).toBe(false);
    expect(latestContact).toMatch(/contact is locked until hire and job-fee entitlement or admin override/);
    expect(latestContact).toMatch(/entitled := public\.booking_has_contact_access\(b\.id\)/);
    expect(latestContact).not.toMatch(/unlocked := b\.status IN \('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED'\)/);
  });

  it("3. only the booked contractor sees private info after contact entitlement, never CONFIRMED alone", () => {
    for (const status of ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "DISPUTED"] as const) {
      expect(bookingUnlocksContact(status)).toBe(false);
      expect(canReadExactAddress(pro, selectedProject, status, "LOCKED")).toBe(false);
      expect(contactAccessAllowsReveal("LOCKED")).toBe(false);
      expect(canReadExactAddress(pro, selectedProject, status, "UNLOCKED")).toBe(true);
      expect(
        canReadCustomerContact(pro, "cust", {
          bookingStatus: status,
          selectedContractorProfileId: "pro-1",
          contactAccess: "UNLOCKED",
        }),
      ).toBe(true);
      expect(canReadExactAddress(stranger, selectedProject, status, "UNLOCKED")).toBe(false);
      expect(
        canReadCustomerContact(stranger, "cust", {
          bookingStatus: status,
          contractorProfileId: "pro-1",
          selectedContractorProfileId: "pro-1",
          contactAccess: "UNLOCKED",
        }),
      ).toBe(false);
    }
    expect(latestContact).toMatch(/b\.contractor_profile_id = public\.current_contractor_profile_id\(\)/);
    expect(latestContact).toMatch(/a\.status IN \('UNLOCKED', 'ADMIN_OVERRIDE'\)/);
  });

  it("4. customers and contractors cannot fake CONFIRMED", () => {
    expect(canConfirmBooking({ accountType: "CUSTOMER", paymentsLive: false })).toBe(false);
    expect(canConfirmBooking({ accountType: "CONTRACTOR", paymentsLive: false })).toBe(false);
    expect(canConfirmBooking({ accountType: "ADMIN", paymentsLive: false })).toBe(true);
    expect(canTransitionBooking("PENDING", "CONFIRMED")).toBe(false);
    expect(clientCannotSpoofConfirmed()).toBe(true);
    expect(sql).toMatch(/only an admin can confirm a booking until payments are live/);
    expect(sql).toMatch(/booking rows cannot be changed from the client/);
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public\.bookings/);
    expect(sql).not.toMatch(/GRANT UPDATE ON TABLE public\.bookings/);
  });

  it("5. pending / abandoned bookings do not create a relationship", () => {
    expect(relationshipCreatedOn("PENDING")).toBe(false);
    expect(relationshipCreatedOn("AWAITING_PAYMENT")).toBe(false);
    expect(relationshipCreatedOn("CANCELLED")).toBe(false);
    expect(sql).toMatch(/FUNCTION public\.ensure_relationship_on_confirm/);
    expect(sql).toMatch(/relationships cannot be written from the client/);
  });

  it("6. relationship is created at first CONFIRMED booking", () => {
    expect(relationshipCreatedOn("CONFIRMED")).toBe(true);
    expect(sql).toMatch(/rid := public\.ensure_relationship_on_confirm\(b\.id\)/);
    expect(sql).toMatch(/ON CONFLICT \(customer_id, contractor_profile_id\) DO NOTHING/);
  });

  it("7. repeat classification cannot be client-spoofed", () => {
    expect(clientCannotSelfMarkRepeat()).toBe(true);
    expect(repeatPricingEligible(false)).toBe(false);
    expect(repeatPricingEligible(true)).toBe(true);
    expect(sql).toMatch(/v_repeat := public\.pair_has_completed_booking\(proj\.customer_id, est\.contractor_profile_id\)/);
    expect(sql).toMatch(/AND b\.status = 'COMPLETED'/);
  });

  it("8. approved positive change orders contribute to the same booking fee calc/cap", () => {
    const base = computeMarketplaceFee({ amount_cents: 250_000, kind: "ORIGINAL" });
    const withCo = computeMarketplaceFee({
      amount_cents: feeBasisCents(250_000, [100_000]),
      kind: "ORIGINAL",
    });
    expect(base.fee_cents).toBe(18_000);
    expect(withCo.fee_cents).toBe(23_000);
    expect(sql).toMatch(/AND co\.amount_delta_cents > 0/);
    expect(sql).toMatch(/FUNCTION public\.booking_fee_basis_cents/);
    expect(contractorCanUnilaterallyIncrease()).toBe(false);
  });

  it("9. change orders cannot create a fresh $1,500 / $500 cap", () => {
    const originalCap = computeMarketplaceFee({
      amount_cents: feeBasisCents(5_000_000, [1_000_000, 1_000_000]),
      kind: "ORIGINAL",
    });
    expect(originalCap.fee_cents).toBe(150_000);
    expect(originalCap.max_fee_cents).toBe(150_000);
    const repeatCap = computeMarketplaceFee({
      amount_cents: feeBasisCents(2_500_000, [1_000_000]),
      kind: "REPEAT",
    });
    expect(repeatCap.fee_cents).toBe(50_000);
    expect(repeatCap.max_fee_cents).toBe(50_000);
    expect(sql).toMatch(/max_fee_cents_snapshot/);
    expect(sql).toMatch(/compute_fee_from_snapshot/);
  });

  it("10. historical fee snapshots do not change when a new schedule version activates", () => {
    const snapshot = computeMarketplaceFee({
      amount_cents: 100_000,
      kind: "ORIGINAL",
      brackets: ORIGINAL_FEE_BRACKETS,
      version: 1,
    });
    const later = computeMarketplaceFee({
      amount_cents: 100_000,
      kind: "ORIGINAL",
      brackets: [{ min_amount_cents: 0, max_amount_cents: null, rate_bps: 1000 }],
      version: 2,
    });
    expect(snapshot.fee_cents).toBe(7_500);
    expect(later.fee_cents).toBe(10_000);
    expect(sql).toMatch(/fee_brackets_snapshot/);
    expect(sql).toMatch(/fee_locked = true/);
    expect(sql).toMatch(/IF b\.fee_locked AND b\.fee_brackets_snapshot IS NOT NULL THEN/);
  });

  it("11. Phase 3 projects / estimates / users and max-3 matching remain intact", () => {
    expect(sql).toMatch(/CREATE TABLE public\.projects/);
    expect(sql).toMatch(/CREATE TABLE public\.estimates/);
    expect(sql).toMatch(/CREATE TABLE public\.profiles/);
    expect(sql).not.toMatch(/DROP TABLE public\.projects/i);
    expect(sql).not.toMatch(/DROP TABLE public\.estimates/i);
    expect(sql).not.toMatch(/DROP TABLE public\.profiles/i);
    expect(sql).not.toMatch(/DELETE FROM auth\.users/i);
    expect(sql).not.toMatch(/TRUNCATE public\.profiles/i);
    expect(sql).toMatch(/CONSTRAINT opportunity_slots_range CHECK \(slot_number BETWEEN 1 AND 3\)/);
    expect(sql).toMatch(/this project already has 3 participating contractors/);
    expect(canAcceptFourthSlot(3)).toBe(false);
    expect(canAcceptFourthSlot(2)).toBe(true);
    expect(sql).toMatch(/fee_bps/);
    expect(canClientAssignAdmin(customer)).toBe(false);
    expect(actorIsAdmin(customer)).toBe(false);
  });

  it("12. no live payment functionality is enabled", () => {
    const preview = computeMarketplaceFee({ amount_cents: 50_000, kind: "ORIGINAL" });
    expect(preview.charges_live).toBe(false);
    expect(preview.payments_live).toBe(false);
    expect(sql).toMatch(/CONSTRAINT bookings_charges_not_live CHECK \(charges_live = false\)/);
    expect(sql).toMatch(/CONSTRAINT bookings_payments_not_live CHECK \(payments_live = false\)/);
    expect(sql).toMatch(/'payments_live',\s*0,/);
    expect(sql).toMatch(/'charges_live',\s*0,/);
    expect(sql).not.toMatch(/CREATE TABLE public\.stripe/i);
    expect(sql).not.toMatch(/payment_intents/i);
    expect(frontend).not.toMatch(/createPaymentIntent|stripe\.charges|checkout\.sessions/i);
    expect(frontend).toMatch(/This is not “Pay now succeeded.”|This is not "Pay now succeeded."/);
    expect(frontend).toMatch(/Online payment setup is coming soon/);
  });

  it("13. no payment-processor secrets or privileged credentials are exposed to the frontend", () => {
    const envExample = readFileSync(path.join(repoRoot, ".env.example"), "utf8");
    const viteEnv = readFileSync(path.join(repoRoot, "src/vite-env.d.ts"), "utf8");
    const workflow = readFileSync(path.join(repoRoot, ".github/workflows/ci-pages.yml"), "utf8");
    expect(viteEnv).toMatch(/VITE_SUPABASE_URL/);
    expect(viteEnv).toMatch(/VITE_SUPABASE_ANON_KEY/);
    expect(viteEnv).not.toMatch(/SERVICE_ROLE/);
    expect(viteEnv).not.toMatch(/STRIPE_SECRET/);
    expect(viteEnv).not.toMatch(/sk_live/);
    expect(envExample).not.toMatch(/^[^#]*SERVICE_ROLE.*=\s*\S+/m);
    expect(envExample).toMatch(/# SUPABASE_SERVICE_ROLE_KEY=/);
    expect(workflow).toMatch(/Never add SUPABASE_SERVICE_ROLE_KEY here/);
    expect(workflow).not.toMatch(/SERVICE_ROLE_KEY: \$\{\{/);
    expect(frontend).not.toMatch(/sk_live_[A-Za-z0-9]+/);
    expect(frontend).not.toMatch(/sk_test_[A-Za-z0-9]+/);
    expect(frontend).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=/);
    expect(sql).not.toMatch(/sk_live_/);
  });
});
