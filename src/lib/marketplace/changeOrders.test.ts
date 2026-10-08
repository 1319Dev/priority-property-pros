import { describe, expect, it } from "vitest";
import {
  CHANGE_ORDER_AMOUNT_ERROR,
  CHANGE_ORDER_DESCRIPTION_ERROR,
  canClientSetChangeOrderApproved,
  changeOrderNeedsContractorAck,
  changeOrderNeedsCustomerApproval,
  contractorCanUnilaterallyIncrease,
  isApprovedChangeOrder,
  nextChangeOrderStatus,
  validateChangeOrderDraft,
} from "./changeOrders";
import { canSubmitVerifiedReview } from "./reviews";

describe("change order draft", () => {
  it("requires a non-zero amount and a short description before submit", () => {
    expect(validateChangeOrderDraft("", "")).toEqual({
      ok: false,
      amountError: CHANGE_ORDER_AMOUNT_ERROR,
      descriptionError: CHANGE_ORDER_DESCRIPTION_ERROR,
    });
    expect(validateChangeOrderDraft("0", "Paint the extra gate")).toMatchObject({
      ok: false,
      amountError: CHANGE_ORDER_AMOUNT_ERROR,
    });
    expect(validateChangeOrderDraft("25", "No")).toMatchObject({
      ok: false,
      descriptionError: CHANGE_ORDER_DESCRIPTION_ERROR,
    });
    expect(validateChangeOrderDraft("25.50", "Add a gate")).toEqual({
      ok: true,
      cents: 2550,
      description: "Add a gate",
    });
    expect(validateChangeOrderDraft("-10", "Remove a panel")).toEqual({
      ok: true,
      cents: -1000,
      description: "Remove a panel",
    });
  });
});

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
