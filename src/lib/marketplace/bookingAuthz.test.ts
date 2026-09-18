import { describe, expect, it } from "vitest";
import { actorIsAdmin, type Actor } from "../auth/rlsPolicy";
import { bookingUnlocksContact } from "./bookings";
import { canReadCustomerContact, canReadExactAddress, type MarketplaceActor } from "./privacy";
import { canSubmitVerifiedReview } from "./reviews";
import { contractorCanUnilaterallyIncrease } from "./changeOrders";
import { clientCannotSelfMarkRepeat, relationshipCreatedOn } from "./relationships";
import { canConfirmBooking } from "./bookings";

const customer: MarketplaceActor = { id: "cust", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const otherCustomer: MarketplaceActor = { id: "cust-b", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
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
const admin: Actor = { id: "admin-1", accountType: "ADMIN", accountStatus: "ACTIVE" };

describe("Phase 4A authorization mirrors", () => {
  it("does not let customers see other customers' bookings via contact helpers", () => {
    expect(
      canReadCustomerContact(otherCustomer, "cust", {
        bookingStatus: "CONFIRMED",
        contractorProfileId: "pro-1",
        selectedContractorProfileId: "pro-1",
      }),
    ).toBe(false);
    expect(
      canReadExactAddress(otherCustomer, { customer_id: "cust", selected_contractor_profile_id: "pro-1" }, "CONFIRMED", "UNLOCKED"),
    ).toBe(false);
  });

  it("does not let unrelated contractors see a booking or contact", () => {
    expect(
      canReadExactAddress(stranger, { customer_id: "cust", selected_contractor_profile_id: "pro-1" }, "CONFIRMED", "UNLOCKED"),
    ).toBe(false);
    expect(
      canReadCustomerContact(stranger, "cust", {
        bookingStatus: "CONFIRMED",
        contractorProfileId: "pro-1",
        selectedContractorProfileId: "pro-1",
        contactAccess: "UNLOCKED",
      }),
    ).toBe(false);
  });

  it("blocks customer/contractor confirmation spoofing and client repeat flags", () => {
    expect(canConfirmBooking({ accountType: "CUSTOMER" })).toBe(false);
    expect(canConfirmBooking({ accountType: "CONTRACTOR" })).toBe(false);
    expect(canConfirmBooking({ accountType: "ADMIN" })).toBe(true);
    expect(clientCannotSelfMarkRepeat()).toBe(true);
    expect(relationshipCreatedOn("PENDING")).toBe(false);
    expect(contractorCanUnilaterallyIncrease()).toBe(false);
    expect(actorIsAdmin(admin)).toBe(true);
    expect(actorIsAdmin(customer)).toBe(false);
  });

  it("keeps pending bookings from unlocking contact or verified reviews", () => {
    expect(bookingUnlocksContact("PENDING")).toBe(false);
    expect(bookingUnlocksContact("CONFIRMED")).toBe(false);
    expect(
      canSubmitVerifiedReview({
        bookingStatus: "PENDING",
        reviewerIsCustomerOwner: true,
        alreadyReviewed: false,
      }),
    ).toBe(false);
    expect(canReadExactAddress(pro, { customer_id: "cust", selected_contractor_profile_id: "pro-1" }, "CANCELLED")).toBe(
      false,
    );
  });
});
