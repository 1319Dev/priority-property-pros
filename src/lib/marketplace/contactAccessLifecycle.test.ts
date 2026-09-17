import { describe, expect, it } from "vitest";
import {
  bookingUnlocksContact,
  contactAccessAllowsReveal,
  contactAccessRowAllowsReveal,
  ENTITLED_CONTACT_FIELDS,
  PRIVATE_CONTACT_PAYLOAD_KEYS,
  unauthorizedPayloadLeaksPrivateContact,
} from "./bookings";
import {
  canCustomerSelectFrom,
  canMarkEstimateViewed,
  canTransitionEstimate,
  contractorEstimateUiStatus,
  estimateStatusUnlocksContact,
  lifecyclePayloadLeaksContact,
  submitTargetStatus,
} from "./estimateLifecycle";
import { NOTIFICATION_CATALOG } from "./notifications";
import { canReadCustomerContact, canReadExactAddress, type MarketplaceActor } from "./privacy";
import { profilePageMode } from "./profileManage";

const hired: MarketplaceActor = {
  id: "pro-user",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-1",
};
const other: MarketplaceActor = {
  id: "pro-other",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-2",
};
const customer: MarketplaceActor = { id: "cust", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const otherCustomer: MarketplaceActor = { id: "cust-b", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const admin: MarketplaceActor = { id: "admin-1", accountType: "ADMIN", accountStatus: "ACTIVE" };
const hiredProject = { customer_id: "cust", selected_contractor_profile_id: "pro-1" };

const ownerView = {
  authUserId: "cust",
  accountType: "CUSTOMER" as const,
  projectCustomerId: "cust",
  estimateProjectId: "p1",
  requestedProjectId: "p1",
  estimateContractorProfileId: "pro-1",
  actorContractorProfileId: null,
  source: "detail" as const,
};

describe("#16 + #14 integration matrix", () => {
  it("SENT / VIEWED / ACCEPTED / CONFIRMED never grant contact", () => {
    expect(submitTargetStatus("DRAFT")).toBe("SENT");
    expect(canTransitionEstimate("DRAFT", "SENT", "submit_estimate")).toBe(true);
    expect(canMarkEstimateViewed(ownerView).ok).toBe(true);
    expect(canCustomerSelectFrom("VIEWED")).toBe(true);
    expect(contractorEstimateUiStatus("SENT")).toBe("sent");
    expect(contractorEstimateUiStatus("VIEWED")).toBe("viewed");
    expect(contractorEstimateUiStatus("ACCEPTED")).toBe("accepted");
    expect(estimateStatusUnlocksContact("SENT")).toBe(false);
    expect(estimateStatusUnlocksContact("VIEWED")).toBe(false);
    expect(estimateStatusUnlocksContact("ACCEPTED")).toBe(false);
    expect(bookingUnlocksContact("CONFIRMED")).toBe(false);
    expect(canReadExactAddress(hired, hiredProject, "CONFIRMED", "LOCKED")).toBe(false);
    expect(
      canReadCustomerContact(hired, "cust", {
        bookingStatus: "CONFIRMED",
        selectedContractorProfileId: "pro-1",
        contactAccess: "LOCKED",
      }),
    ).toBe(false);
  });

  it("LOCKED or missing entitlement is no access; UNLOCKED is only the hired pair", () => {
    expect(contactAccessAllowsReveal("LOCKED")).toBe(false);
    expect(contactAccessRowAllowsReveal(null)).toBe(false);
    expect(canReadExactAddress(hired, hiredProject, "CONFIRMED", null)).toBe(false);
    expect(canReadExactAddress(hired, hiredProject, "PENDING", "UNLOCKED")).toBe(true);
    expect(canReadExactAddress(other, hiredProject, "CONFIRMED", "UNLOCKED")).toBe(false);
    expect(
      canReadCustomerContact(otherCustomer, "cust", {
        bookingStatus: "CONFIRMED",
        selectedContractorProfileId: "pro-1",
        contactAccess: "UNLOCKED",
      }),
    ).toBe(false);
    expect(canReadExactAddress(customer, hiredProject, "PENDING", "LOCKED")).toBe(true);
  });

  it("UUID manipulation of the contractor or customer id cannot inherit entitlement", () => {
    const spoofed: MarketplaceActor = {
      ...hired,
      contractorProfileId: "pro-1-but-not-really",
    };
    expect(canReadExactAddress(spoofed, hiredProject, "CONFIRMED", "ADMIN_OVERRIDE")).toBe(false);
    expect(
      canReadCustomerContact(spoofed, "cust", {
        bookingStatus: "CONFIRMED",
        selectedContractorProfileId: "pro-1",
        contactAccess: "UNLOCKED",
      }),
    ).toBe(false);
    expect(
      canReadCustomerContact(otherCustomer, "cust", {
        bookingStatus: "CONFIRMED",
        selectedContractorProfileId: "pro-1",
        contactAccess: "ADMIN_OVERRIDE",
      }),
    ).toBe(false);
  });

  it("admin override is admin-targeted; revoke is immediate loss of access", () => {
    expect(canReadExactAddress(admin, hiredProject, null, "LOCKED")).toBe(true);
    expect(canReadExactAddress(hired, hiredProject, "CONFIRMED", "ADMIN_OVERRIDE")).toBe(true);
    expect(contactAccessRowAllowsReveal({ status: "ADMIN_OVERRIDE", revoked_at: null })).toBe(true);
    expect(
      contactAccessRowAllowsReveal({
        status: "ADMIN_OVERRIDE",
        revoked_at: "2026-09-17T18:00:00.000Z",
      }),
    ).toBe(false);
    expect(canReadExactAddress(hired, hiredProject, "CONFIRMED", "LOCKED")).toBe(false);
  });

  it("unauthorized notification and event payloads must not include private fields", () => {
    for (const event of Object.values(NOTIFICATION_CATALOG)) {
      expect(unauthorizedPayloadLeaksPrivateContact({ title: event.title, body: event.body })).toBe(false);
      expect(event.body).not.toMatch(/@/);
      expect(event.body).not.toMatch(/\d{3}[-.\s]\d{3}/);
    }
    expect(lifecyclePayloadLeaksContact({ project_id: "p1", status: "ACCEPTED" })).toBe(false);
    expect(lifecyclePayloadLeaksContact({ phone: "404-555-0100" })).toBe(true);
    expect(lifecyclePayloadLeaksContact({ email: "a@b.com" })).toBe(true);
    expect(lifecyclePayloadLeaksContact({ street_line1: "12 Oak" })).toBe(true);
    expect(lifecyclePayloadLeaksContact({ lat: 33.7, lng: -84.4 })).toBe(true);
    for (const key of PRIVATE_CONTACT_PAYLOAD_KEYS) {
      expect(unauthorizedPayloadLeaksPrivateContact({ [key]: "secret" })).toBe(true);
    }
  });

  it("documents the exact fields revealed after legitimate entitlement", () => {
    expect([...ENTITLED_CONTACT_FIELDS]).toEqual([
      "street_line1",
      "street_line2",
      "lat",
      "lng",
      "city",
      "state",
      "zip_code",
      "phone",
      "email",
      "first_name",
    ]);
  });

  it("keeps #16 Manage Profile and estimate lifecycle behavior", () => {
    expect(profilePageMode({ onboarding_status: "COMPLETE", approval_status: "APPROVED" })).toBe("manage");
    expect(profilePageMode({ onboarding_status: "SUBMITTED", approval_status: "PENDING" })).toBe("onboarding");
    expect(canCustomerSelectFrom("SENT")).toBe(true);
    expect(canCustomerSelectFrom("ACCEPTED")).toBe(false);
    expect(contractorEstimateUiStatus("DECLINED")).toBe("not_selected");
  });
});
