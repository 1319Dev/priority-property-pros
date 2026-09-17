import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAYMENTS_LIVE, CHARGES_LIVE } from "./types";
import { customerCanReadProject, filterCustomerProjectList, type PrivacyActor } from "./customerPrivacy";
import { paymentsComingSoonCopy } from "./bookings";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n\n");
}

describe("Phase 5A security and pause constraints", () => {
  const sql = allSql();
  const customerA: PrivacyActor = { id: "cust-a", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
  const projectB = { id: "proj-b", customer_id: "cust-b", status: "POSTED" as const };

  it("keeps Stripe paused", () => {
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(sql).toMatch(/CONSTRAINT bookings_payments_not_live CHECK \(payments_live = false\)/);
    expect(sql).not.toMatch(/payments_live',\s*1/);
    expect(sql).not.toMatch(/charges_live',\s*1/);
    expect(paymentsComingSoonCopy()).toBe("Online payment setup is coming soon.");
  });

  it("does not let customer A read customer B's project", () => {
    expect(customerCanReadProject(customerA, projectB)).toBe(false);
    expect(filterCustomerProjectList(customerA, [projectB])).toEqual([]);
    expect(sql).toMatch(/CREATE POLICY projects_select_owner/);
    expect(sql).toMatch(/list_my_customer_projects/);
    expect(sql).toMatch(/get_my_customer_project/);
  });

  it("does not rank estimates or show Stripe test-mode copy to customers", () => {
    const customerDir = path.join(repoRoot, "src/pages/app/customer");
    const customerUi =
      readdirSync(customerDir)
        .filter((name) => name.endsWith(".tsx"))
        .sort()
        .map((name) => readFileSync(path.join(customerDir, name), "utf8"))
        .join("\n\n") + readFileSync(path.join(repoRoot, "src/features/home/Hero.tsx"), "utf8");
    expect(customerUi).not.toMatch(/BEST estimate/i);
    expect(customerUi).not.toMatch(/Stripe/i);
    expect(customerUi).not.toMatch(/TEST MODE/i);
    expect(customerUi).not.toMatch(/test mode/i);
    expect(customerUi).not.toMatch(/Phase 4B/);
    expect(customerUi).not.toMatch(/payments_live/);
    expect(customerUi).not.toMatch(/charges_live/);
    expect(customerUi).not.toMatch(/PaymentIntent/i);
    expect(customerUi).not.toMatch(/payment\s*intent/i);
    expect(customerUi).not.toMatch(/\bwebhook\b/i);
    expect(customerUi).not.toMatch(/payment succeeded/i);
    expect(customerUi).not.toMatch(/unlock contact/i);
    expect(customerUi).toMatch(/paymentsComingSoonCopy/);
    expect(paymentsComingSoonCopy()).toBe("Online payment setup is coming soon.");
    expect(customerUi).toMatch(/preBookingHeadline/);
    expect(customerUi).toMatch(/contactLockedUntilConfirmedCopy/);
    expect(customerUi).toMatch(/sanitizeCustomerFacingError/);
  });

  it("keeps estimate compare as mobile cards and gates hire/select behind a paused pay screen", () => {
    const compare = readFileSync(path.join(repoRoot, "src/pages/app/customer/CustomerMarketplacePages.tsx"), "utf8");
    const app = readFileSync(path.join(repoRoot, "src/App.tsx"), "utf8");
    expect(compare).not.toMatch(/<table/i);
    expect(compare).toMatch(/data-estimate-compare="cards"/);
    expect(compare).toMatch(/afterSelectEstimatePath/);
    expect(compare).toMatch(/Yes, select this pro/);
    expect(compare).not.toMatch(/Confirm this pro/);
    expect(app).toMatch(/bookings\/:bookingId\/pay/);
    expect(app).toMatch(/projects\/:projectId\/pre-booking/);
    expect(app).toMatch(/CustomerPayGatePage/);
  });
});
