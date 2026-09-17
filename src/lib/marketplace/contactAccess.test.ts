import { describe, expect, it } from "vitest";
import {
  bookingUnlocksContact,
  contactAccessAllowsReveal,
  contactAccessRowAllowsReveal,
  formatContactAccessState,
  privateContactHintCopy,
  privateContactLockedCopy,
  unauthorizedPayloadLeaksPrivateContact,
} from "./bookings";
import { canReadCustomerContact, canReadExactAddress, type MarketplaceActor } from "./privacy";
import { CUSTOMER_ISOLATION_RULES } from "./customerPrivacy";

const customer: MarketplaceActor = { id: "cust", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const hired: MarketplaceActor = {
  id: "pro-user",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-1",
};
const estimateOnly: MarketplaceActor = {
  id: "est-user",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-est",
};
const unhired: MarketplaceActor = {
  id: "other-user",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-unhired",
};
const otherHiredOnSameProject: MarketplaceActor = {
  id: "rival-user",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-2",
};
const admin: MarketplaceActor = { id: "admin-1", accountType: "ADMIN", accountStatus: "ACTIVE" };

const hiredProject = { customer_id: "cust", selected_contractor_profile_id: "pro-1" };
const openProject = { customer_id: "cust", selected_contractor_profile_id: null };

describe("contact-access entitlement helpers", () => {
  it("never unlocks private contact from booking status, including CONFIRMED+", () => {
    expect(bookingUnlocksContact("PENDING")).toBe(false);
    expect(bookingUnlocksContact("AWAITING_PAYMENT")).toBe(false);
    expect(bookingUnlocksContact("CONFIRMED")).toBe(false);
    expect(bookingUnlocksContact("IN_PROGRESS")).toBe(false);
    expect(bookingUnlocksContact("COMPLETED")).toBe(false);
    expect(bookingUnlocksContact("DISPUTED")).toBe(false);
    expect(bookingUnlocksContact("CANCELLED")).toBe(false);
  });

  it("reveals only UNLOCKED or ADMIN_OVERRIDE entitlement", () => {
    expect(contactAccessAllowsReveal("LOCKED")).toBe(false);
    expect(contactAccessAllowsReveal(null)).toBe(false);
    expect(contactAccessAllowsReveal(undefined)).toBe(false);
    expect(contactAccessAllowsReveal("UNLOCKED")).toBe(true);
    expect(contactAccessAllowsReveal("ADMIN_OVERRIDE")).toBe(true);
  });

  it("treats missing or revoked entitlement rows as no access", () => {
    expect(contactAccessRowAllowsReveal(null)).toBe(false);
    expect(contactAccessRowAllowsReveal(undefined)).toBe(false);
    expect(
      contactAccessRowAllowsReveal({
        status: "UNLOCKED",
        revoked_at: "2026-09-17T12:00:00.000Z",
      }),
    ).toBe(false);
    expect(contactAccessRowAllowsReveal({ status: "LOCKED", revoked_at: null })).toBe(false);
    expect(contactAccessRowAllowsReveal({ status: "UNLOCKED", revoked_at: null })).toBe(true);
    expect(formatContactAccessState(null)).toMatch(/missing row/i);
  });

  it("1. unhired contractor cannot retrieve private customer info", () => {
    expect(canReadExactAddress(unhired, openProject, "PENDING", "LOCKED")).toBe(false);
    expect(
      canReadCustomerContact(unhired, "cust", {
        bookingStatus: "PENDING",
        selectedContractorProfileId: null,
        contactAccess: "LOCKED",
      }),
    ).toBe(false);
    expect(canReadExactAddress(unhired, hiredProject, "CONFIRMED", "UNLOCKED")).toBe(false);
  });

  it("2. estimate-only contractor cannot retrieve private customer info", () => {
    expect(canReadExactAddress(estimateOnly, hiredProject, "PENDING", "LOCKED")).toBe(false);
    expect(
      canReadCustomerContact(estimateOnly, "cust", {
        bookingStatus: "PENDING",
        selectedContractorProfileId: "pro-1",
        contactAccess: "LOCKED",
      }),
    ).toBe(false);
    expect(canReadExactAddress(estimateOnly, hiredProject, "CONFIRMED", "ADMIN_OVERRIDE")).toBe(false);
  });

  it("3. CONFIRMED booking without entitlement cannot retrieve private customer info", () => {
    expect(canReadExactAddress(hired, hiredProject, "CONFIRMED", "LOCKED")).toBe(false);
    expect(
      canReadCustomerContact(hired, "cust", {
        bookingStatus: "CONFIRMED",
        selectedContractorProfileId: "pro-1",
        contactAccess: "LOCKED",
      }),
    ).toBe(false);
    expect(canReadExactAddress(hired, hiredProject, "IN_PROGRESS", null)).toBe(false);
    expect(canReadExactAddress(hired, hiredProject, "COMPLETED", "LOCKED")).toBe(false);
  });

  it("4. hired contractor WITH entitlement can retrieve private customer info", () => {
    expect(canReadExactAddress(hired, hiredProject, "CONFIRMED", "UNLOCKED")).toBe(true);
    expect(canReadExactAddress(hired, hiredProject, "PENDING", "ADMIN_OVERRIDE")).toBe(true);
    expect(
      canReadCustomerContact(hired, "cust", {
        bookingStatus: "CONFIRMED",
        selectedContractorProfileId: "pro-1",
        contactAccess: "UNLOCKED",
      }),
    ).toBe(true);
    expect(
      canReadCustomerContact(hired, "cust", {
        bookingStatus: "IN_PROGRESS",
        selectedContractorProfileId: "pro-1",
        contactAccess: "ADMIN_OVERRIDE",
      }),
    ).toBe(true);
  });

  it("5. a different contractor on the same project cannot retrieve it", () => {
    expect(canReadExactAddress(otherHiredOnSameProject, hiredProject, "CONFIRMED", "UNLOCKED")).toBe(false);
    expect(
      canReadCustomerContact(otherHiredOnSameProject, "cust", {
        bookingStatus: "CONFIRMED",
        selectedContractorProfileId: "pro-1",
        contactAccess: "ADMIN_OVERRIDE",
      }),
    ).toBe(false);
  });

  it("6-8. exact street, coords, phone, and email stay owner/admin/entitled-pair only", () => {
    expect(canReadExactAddress(customer, hiredProject, "PENDING", "LOCKED")).toBe(true);
    expect(canReadCustomerContact(customer, "cust", { bookingStatus: "PENDING", contactAccess: "LOCKED" })).toBe(true);
    expect(canReadExactAddress(admin, hiredProject, "PENDING", "LOCKED")).toBe(true);
    expect(canReadCustomerContact(admin, "cust", { bookingStatus: "PENDING", contactAccess: "LOCKED" })).toBe(true);
    expect(canReadExactAddress(hired, hiredProject, "CONFIRMED", "LOCKED")).toBe(false);
    expect(CUSTOMER_ISOLATION_RULES.some((rule) => /CONFIRMED/.test(rule))).toBe(true);
  });

  it("9. admin override is targeted and does not globally bypass contractors", () => {
    expect(canReadExactAddress(hired, hiredProject, "CONFIRMED", "ADMIN_OVERRIDE")).toBe(true);
    expect(canReadExactAddress(unhired, hiredProject, "CONFIRMED", "ADMIN_OVERRIDE")).toBe(false);
    expect(canReadExactAddress(estimateOnly, openProject, null, "ADMIN_OVERRIDE")).toBe(false);
  });

  it("describes the locked state without implying CONFIRMED unlocks privacy", () => {
    expect(privateContactLockedCopy()).toMatch(/job-fee access/i);
    expect(privateContactLockedCopy()).toMatch(/admin/i);
    expect(privateContactLockedCopy()).not.toMatch(/until (the )?booking is confirmed/i);
    expect(privateContactHintCopy()).toMatch(/hire \+ job fee/i);
    expect(unauthorizedPayloadLeaksPrivateContact({ project_id: "p1" })).toBe(false);
    expect(unauthorizedPayloadLeaksPrivateContact({ phone: "404-555-0100" })).toBe(true);
  });
});
