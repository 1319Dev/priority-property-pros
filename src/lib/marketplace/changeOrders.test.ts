import { describe, expect, it } from "vitest";
import {
  canClientSetChangeOrderApproved,
  changeOrderNeedsContractorAck,
  changeOrderNeedsCustomerApproval,
  contractorCanUnilaterallyIncrease,
  isApprovedChangeOrder,
  nextChangeOrderStatus,
} from "./changeOrders";
import { canSubmitVerifiedReview } from "./reviews";

describe("change orders", () => {
  it("blocks unilateral contractor increases", () => {
    expect(contractorCanUnilaterallyIncrease()).toBe(false);
    expect(canClientSetChangeOrderApproved()).toBe(false);
    expect(changeOrderNeedsCustomerApproval(5000, "CONTRACTOR")).toBe(true);
    expect(changeOrderNeedsCustomerApproval(5000, "CUSTOMER")).toBe(false);
    expect(changeOrderNeedsContractorAck("CUSTOMER")).toBe(true);
    expect(changeOrderNeedsContractorAck("CONTRACTOR")).toBe(false);
  });

  it("reaches APPROVED only after both parties have signed off", () => {
    expect(
      nextChangeOrderStatus({
        createdBy: "CONTRACTOR",
        customerApproved: false,
        contractorAcked: true,
        rejected: false,
      }),
    ).toBe("PROPOSED");
    expect(
      nextChangeOrderStatus({
        createdBy: "CONTRACTOR",
        customerApproved: true,
        contractorAcked: true,
        rejected: false,
      }),
    ).toBe("APPROVED");
    expect(isApprovedChangeOrder("PROPOSED")).toBe(false);
    expect(isApprovedChangeOrder("APPROVED")).toBe(true);
  });
});

describe("verified reviews", () => {
  it("allows a profile review only after mutual Hired, for either participant", () => {
    expect(
      canSubmitVerifiedReview({
        bookingStatus: "PENDING",
        reviewerIsCustomerOwner: true,
        alreadyReviewed: false,
        mutuallyHired: true,
      }),
    ).toBe(true);
    expect(
      canSubmitVerifiedReview({
        bookingStatus: "COMPLETED",
        reviewerIsCustomerOwner: true,
        alreadyReviewed: false,
        mutuallyHired: false,
      }),
    ).toBe(false);
    expect(
      canSubmitVerifiedReview({
        bookingStatus: "PENDING",
        reviewerIsParticipant: true,
        alreadyReviewed: false,
        mutuallyHired: true,
      }),
    ).toBe(true);
    expect(
      canSubmitVerifiedReview({
        bookingStatus: "PENDING",
        reviewerIsCustomerOwner: false,
        alreadyReviewed: false,
        mutuallyHired: true,
      }),
    ).toBe(false);
    expect(
      canSubmitVerifiedReview({
        bookingStatus: "PENDING",
        reviewerIsCustomerOwner: true,
        alreadyReviewed: true,
        mutuallyHired: true,
      }),
    ).toBe(false);
  });
});
