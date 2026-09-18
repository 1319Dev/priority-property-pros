import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clientCannotChangeConnectionPrice, connectionFeeCents, paymentFlagsRemainOff, serverConnectionFee } from "./connectionFee";
import {
  canRequestConnection,
  connectClickSetsPaid,
  connectClickUnlocksContact,
  connectionAvailabilityCopy,
  connectionClickResult,
  countCompletedConnections,
  customerCanControlOtherCustomersProject,
  customerCanStopNewConnections,
  finalizeConnectionPayment,
  paymentDisabledCannotBeBypassed,
  preConnectionPayloadLeaksPrivate,
  remainingConnectionSpots,
  reserveConnectionSlot,
  stopNewConnectionsPreservesUnlocked,
} from "./connectionLifecycle";
import { canReadCustomerContact, canReadExactAddress, type MarketplaceActor } from "./privacy";
import { bookingUnlocksContact, contactAccessAllowsReveal } from "./bookings";
import { containsPreHireContact, findPreHireContact, preConnectionContactBlocked } from "./antiCircumvention";
import { LEGACY_PROGRESSIVE_FEE_ENGINE } from "./feeEngine";
import { CHARGES_LIVE, CONNECTION_FEE_CENTS, PAYMENTS_LIVE, SIGNUP_FEE_ENABLED, STRIPE_ENABLED, STRIPE_TEST_MODE } from "./types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n\n");
}

function walkSrc(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, name.name);
    if (name.isDirectory()) walkSrc(next, acc);
    else if (/\.(ts|tsx)$/.test(name.name) && !/\.test\.(ts|tsx)$/.test(name.name)) acc.push(next);
  }
  return acc;
}

function pagesAndComponents(): string {
  const roots = [path.join(repoRoot, "src/pages"), path.join(repoRoot, "src/features"), path.join(repoRoot, "src/components")];
  return roots.flatMap((root) => walkSrc(root)).map((file) => readFileSync(file, "utf8")).join("\n");
}

const customer: MarketplaceActor = { id: "cust-a", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const otherCustomer: MarketplaceActor = { id: "cust-b", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const pro: MarketplaceActor = {
  id: "pro-user",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-1",
};
const otherPro: MarketplaceActor = {
  id: "pro-other",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-2",
};

describe("Flat $4.99 Connection Marketplace", () => {
  const sql = allSql();
  const ui = pagesAndComponents();
  const latest = readFileSync(path.join(repoRoot, "supabase/migrations/20260926000001_connection_marketplace.sql"), "utf8");

  it("1. price is exactly 499 cents server-side", () => {
    expect(CONNECTION_FEE_CENTS).toBe(499);
    expect(connectionFeeCents()).toBe(499);
    expect(serverConnectionFee().fee_cents).toBe(499);
    expect(latest).toMatch(/fee_cents integer NOT NULL DEFAULT 499/);
    expect(latest).toMatch(/CONSTRAINT project_connections_fee_cents_check CHECK \(fee_cents = 499\)/);
    expect(latest).toMatch(/SELECT 499;/);
    expect(latest).toMatch(/'connection_fee_cents',\s*499/);
  });

  it("2. client cannot change the price", () => {
    expect(serverConnectionFee(1999).fee_cents).toBe(499);
    expect(clientCannotChangeConnectionPrice(1999)).toBe(false);
    expect(latest).toMatch(/connection fee is server-authoritative and must be 499 cents/);
    expect(latest).toMatch(/Clients cannot pass a price/);
    expect(latest).not.toMatch(/p_fee_cents/);
  });

  it("3. browse is anonymized before connection", () => {
    const project = { customer_id: "cust-a", selected_contractor_profile_id: null };
    expect(canReadExactAddress(pro, project, null)).toBe(false);
    expect(preConnectionPayloadLeaksPrivate({ title: "Fence", city: "Atlanta", state: "GA" })).toBe(false);
    expect(preConnectionPayloadLeaksPrivate({ phone: "404-555-0100" })).toBe(true);
    expect(ui).toMatch(/Approximate location only/);
    expect(ui).toMatch(/Connect — \$4\.99/);
  });

  it("4. private contact is inaccessible without entitlement", () => {
    expect(contactAccessAllowsReveal("LOCKED")).toBe(false);
    expect(contactAccessAllowsReveal(null)).toBe(false);
    expect(
      canReadCustomerContact(pro, "cust-a", {
        bookingStatus: "CONFIRMED",
        selectedContractorProfileId: "pro-1",
        contactAccess: "LOCKED",
      }),
    ).toBe(false);
    expect(canReadExactAddress(pro, { customer_id: "cust-a", selected_contractor_profile_id: "pro-1" }, "CONFIRMED", "LOCKED")).toBe(false);
  });

  it("5. Connect click alone does not unlock", () => {
    expect(connectClickUnlocksContact()).toBe(false);
    expect(connectClickSetsPaid()).toBe(false);
    expect(connectionClickResult({ paymentsLive: false }).contactUnlocked).toBe(false);
    expect(connectionClickResult({ paymentsLive: false }).paid).toBe(false);
    expect(connectionClickResult({ paymentsLive: false }).status).toBe("PAYMENT_DISABLED");
    expect(latest).toMatch(/contact_unlocked', false/);
    expect(latest).toMatch(/'LOCKED'/);
    expect(bookingUnlocksContact("CONFIRMED")).toBe(false);
  });

  it("6. payment-disabled cannot be bypassed", () => {
    expect(paymentDisabledCannotBeBypassed(false, false)).toBe(true);
    expect(finalizeConnectionPayment({ paymentsLive: false, chargesLive: false, clientPaid: true }).ok).toBe(false);
    expect(latest).toMatch(/connection-fee contact unlock is disabled while payments are off/);
    expect(latest).toMatch(/REVOKE ALL ON FUNCTION public\.finalize_project_connection_payment\(uuid, text\) FROM PUBLIC, anon, authenticated/);
    expect(latest).toMatch(/connection cannot be marked paid from the client/);
  });

  it("7. customer cannot access another customer's project controls", () => {
    expect(customerCanControlOtherCustomersProject(customer.id!, otherCustomer.id!)).toBe(false);
    expect(customerCanStopNewConnections(customer.id!, "cust-b")).toBe(false);
    expect(customerCanStopNewConnections(customer.id!, customer.id!)).toBe(true);
    expect(latest).toMatch(/only the project owner can stop new connections/);
  });

  it("8. contractor cannot create a connection for another contractor", () => {
    expect(
      canRequestConnection({
        actorContractorProfileId: "pro-1",
        targetContractorProfileId: "pro-2",
        existingForPair: false,
        occupied: 0,
        acceptingConnections: true,
      }).ok,
    ).toBe(false);
    expect(latest).toMatch(/contractor_id := public\.current_contractor_profile_id\(\)/);
  });

  it("9. duplicate connection is prevented", () => {
    expect(
      canRequestConnection({
        actorContractorProfileId: "pro-1",
        targetContractorProfileId: "pro-1",
        existingForPair: true,
        occupied: 0,
        acceptingConnections: true,
      }).reason,
    ).toBe("duplicate connection");
    expect(latest).toMatch(/CONSTRAINT project_connections_pair UNIQUE \(project_id, contractor_profile_id\)/);
    expect(latest).toMatch(/RAISE EXCEPTION 'duplicate connection'/);
  });

  it("10-11. max 3 completed connections; fourth rejected", () => {
    expect(countCompletedConnections(["COMPLETED", "PAID", "COMPLETED"])).toBe(3);
    expect(remainingConnectionSpots(["PAYMENT_DISABLED", "PAYMENT_DISABLED", "PAYMENT_DISABLED"])).toBe(0);
    expect(connectionAvailabilityCopy(0)).toBe("Connections Full");
    expect(
      canRequestConnection({
        actorContractorProfileId: "pro-1",
        targetContractorProfileId: "pro-1",
        existingForPair: false,
        occupied: 3,
        acceptingConnections: true,
      }).ok,
    ).toBe(false);
    expect(latest).toMatch(/IF occupied >= 3 THEN/);
    expect(latest).toMatch(/RAISE EXCEPTION 'connections full'/);
    expect(latest).toMatch(/CONSTRAINT connection_slots_range CHECK \(slot_number BETWEEN 1 AND 3\)/);
  });

  it("12. concurrent final-slot cannot create >3", () => {
    const taken = new Set([1, 2]);
    expect(reserveConnectionSlot(taken)).toBe(3);
    expect(reserveConnectionSlot(taken)).toBeNull();
    expect(latest).toMatch(/SELECT \* INTO proj FROM public\.projects WHERE id = p_project_id FOR UPDATE/);
    expect(latest).toMatch(/EXCEPTION WHEN unique_violation THEN/);
  });

  it("13-14. customer can stop new connections; existing unlocked survive", () => {
    expect(stopNewConnectionsPreservesUnlocked(true)).toBe(true);
    expect(latest).toMatch(/Stop New Connections/);
    expect(latest).toMatch(/existing_unlocked_kept/);
    expect(latest).toMatch(/Existing unlocked connections are not deleted/);
    expect(ui).toMatch(/Stop New Connections/);
  });

  it("15-16. anti-circumvention blocks obvious contact and does not block entitled parties", () => {
    expect(findPreHireContact("Call 512-555-0199")).toBe("phone");
    expect(findPreHireContact("pro@example.com")).toBe("email");
    expect(findPreHireContact("https://crew.example")).toBe("url");
    expect(findPreHireContact("DM @joesfence")).toBe("social");
    expect(preConnectionContactBlocked("Call 512-555-0199", false)).toBe(true);
    expect(preConnectionContactBlocked("Call 512-555-0199", true)).toBe(false);
    expect(containsPreHireContact("Replace 40 ft of cedar fence")).toBe(false);
  });

  it("17. public/anonymized project has no exact address/phone/email/private coords", () => {
    expect(preConnectionPayloadLeaksPrivate({ street_line1: "123 Oak" })).toBe(true);
    expect(preConnectionPayloadLeaksPrivate({ lat: 33.7, lng: -84.3 })).toBe(true);
    expect(preConnectionPayloadLeaksPrivate({ city: "Atlanta", state: "GA", title: "Fence" })).toBe(false);
    expect(canReadExactAddress(pro, { customer_id: "cust-a", selected_contractor_profile_id: null })).toBe(false);
  });

  it("18. legacy % fee engine is unused by active UI / new lifecycle", () => {
    expect(LEGACY_PROGRESSIVE_FEE_ENGINE).toBe(true);
    expect(ui).not.toMatch(/You would earn/);
    expect(ui).not.toMatch(/Original marketplace fee/);
    expect(ui).not.toMatch(/\$0–\$499\.99/);
    expect(ui).not.toMatch(/pay when you win/i);
    expect(ui).not.toMatch(/contractor earnings = project amount/i);
    expect(latest).toMatch(/LEGACY \/ DEPRECATED progressive marketplace job-fee schedules/);
    expect(sql).toMatch(/CREATE TABLE public\.fee_schedules/);
  });

  it("19. no project payment / payout / Connect is activated", () => {
    expect(paymentFlagsRemainOff()).toBe(true);
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(SIGNUP_FEE_ENABLED).toBe(false);
    expect(STRIPE_ENABLED).toBe(false);
    expect(STRIPE_TEST_MODE).toBe(true);
    expect(latest).toMatch(/'signup_fee_enabled',\s*0/);
    expect(latest).toMatch(/'stripe_test_mode',\s*1/);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(latest).not.toMatch(/@stripe|PaymentIntent|stripe\.checkout|Stripe Connect/i);
    expect(sql).toMatch(/CONSTRAINT bookings_payments_not_live CHECK \(payments_live = false\)/);
  });

  it("does not let a Connect click unlock another contractor via booking entitlement", () => {
    expect(
      canReadExactAddress(otherPro, { customer_id: "cust-a", selected_contractor_profile_id: "pro-1" }, "CONFIRMED", "UNLOCKED"),
    ).toBe(false);
    expect(
      canReadExactAddress(pro, { customer_id: "cust-a", selected_contractor_profile_id: null }, null, null, {
        access: "UNLOCKED",
        contractorProfileId: "pro-1",
      }),
    ).toBe(true);
  });
});
