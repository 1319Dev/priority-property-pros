import { describe, expect, it } from "vitest";
import type { MarketplaceActor } from "./privacy";
import {
  canReadCustomerContact,
  canReadExactAddress,
  canSelfVerifyCredential,
  estimateVisibleToCustomer,
  isAllowedImage,
  opportunityVisibleToCustomer,
  sanitizeUploadName,
} from "./privacy";
import { estimateStatusUnlocksContact } from "./estimateLifecycle";

const customer: MarketplaceActor = { id: "cust", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const pro: MarketplaceActor = {
  id: "pro-user",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-1",
};
const otherPro: MarketplaceActor = {
  id: "other",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-2",
};

describe("privacy and IDOR mirrors", () => {
  it("hides exact street from opportunity contractors until booking confirmation", () => {
    const project = {
      customer_id: "cust",
      selected_contractor_profile_id: null,
    };
    expect(canReadExactAddress(customer, project, null)).toBe(true);
    expect(canReadExactAddress(pro, project, null)).toBe(false);
    expect(
      canReadExactAddress(pro, { customer_id: "cust", selected_contractor_profile_id: "pro-1" }, "PENDING"),
    ).toBe(false);
    expect(
      canReadExactAddress(pro, { customer_id: "cust", selected_contractor_profile_id: "pro-1" }, "CONFIRMED"),
    ).toBe(true);
    expect(
      canReadExactAddress(otherPro, { customer_id: "cust", selected_contractor_profile_id: "pro-1" }, "CONFIRMED"),
    ).toBe(false);
    expect(
      canReadCustomerContact(otherPro, "cust", {
        bookingStatus: "CONFIRMED",
        contractorProfileId: "pro-1",
        selectedContractorProfileId: "pro-1",
      }),
    ).toBe(false);
  });

  it("does not show AVAILABLE opportunities to the customer matching pool", () => {
    expect(opportunityVisibleToCustomer("AVAILABLE")).toBe(false);
    expect(opportunityVisibleToCustomer("ACCEPTED")).toBe(true);
    expect(estimateVisibleToCustomer("DRAFT")).toBe(false);
    expect(estimateVisibleToCustomer("SUBMITTED")).toBe(true);
    expect(estimateVisibleToCustomer("SENT")).toBe(true);
    expect(estimateVisibleToCustomer("VIEWED")).toBe(true);
  });

  it("does not treat ACCEPTED as a contact unlock on the estimate lifecycle path", () => {
    expect(estimateStatusUnlocksContact("ACCEPTED")).toBe(false);
    expect(
      canReadExactAddress(pro, { customer_id: "cust", selected_contractor_profile_id: "pro-1" }, "PENDING"),
    ).toBe(false);
  });

  it("blocks self-verify to VERIFIED", () => {
    expect(canSelfVerifyCredential(pro, "PENDING", "VERIFIED")).toBe(false);
    expect(canSelfVerifyCredential(pro, "NOT_SUBMITTED", "PENDING")).toBe(true);
  });

  it("sanitizes upload names and rejects non-images for project photos", () => {
    expect(sanitizeUploadName("../../etc/passwd.jpg")).toBe("passwd.jpg");
    expect(sanitizeUploadName("My TV <script>.PNG")).toBe("My-TV-script-.PNG");
    expect(isAllowedImage("image/jpeg")).toBe(true);
    expect(isAllowedImage("text/html")).toBe(false);
  });
});
