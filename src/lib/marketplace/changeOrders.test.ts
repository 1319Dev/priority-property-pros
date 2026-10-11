import { describe, expect, it } from "vitest";
import {
  CHANGE_ORDER_AMOUNT_ERROR,
  CHANGE_ORDER_CAP_ERROR,
  CHANGE_ORDER_DECREASE_ERROR,
  CHANGE_ORDER_DESCRIPTION_ERROR,
  CHANGE_ORDER_DESCRIPTION_LENGTH_ERROR,
  canClientSetChangeOrderApproved,
  changeOrderNeedsContractorAck,
  changeOrderNeedsCustomerApproval,
  changeOrderNeedsThisParty,
  changeOrderPartyLabel,
  contractorCanUnilaterallyIncrease,
  countChangeOrdersForParty,
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
    expect(validateChangeOrderDraft("100000", "Add a wing")).toEqual({
      ok: true,
      cents: 10_000_000,
      description: "Add a wing",
    });
    expect(validateChangeOrderDraft("100000.01", "Add a wing")).toMatchObject({
      ok: false,
      amountError: CHANGE_ORDER_CAP_ERROR,
    });
    expect(validateChangeOrderDraft("-9999.99", "Remove everything", { jobTotalCents: 5000 })).toMatchObject({
      ok: false,
      amountError: CHANGE_ORDER_DECREASE_ERROR,
    });
    expect(validateChangeOrderDraft("-50", "Remove the job", { jobTotalCents: 5000 })).toEqual({
      ok: true,
      cents: -5000,
      description: "Remove the job",
    });
    expect(validateChangeOrderDraft("12.345", "Add a gate")).toMatchObject({
      ok: false,
      amountError: CHANGE_ORDER_AMOUNT_ERROR,
    });
    expect(validateChangeOrderDraft("10", "x".repeat(1001))).toMatchObject({
      ok: false,
      descriptionError: CHANGE_ORDER_DESCRIPTION_LENGTH_ERROR,
    });
  });

  it("counts the contractor's turn as a customer proposal still waiting on the pro", () => {
    const proposed = { status: "PROPOSED", contractor_acked_at: null };
    const customerTurn = { status: "CUSTOMER_APPROVED", contractor_acked_at: null };
    const acked = { status: "CUSTOMER_APPROVED", contractor_acked_at: "2026-10-08T00:00:00Z" };
    expect(changeOrderNeedsThisParty("contractor", proposed)).toBe(false);
    expect(changeOrderNeedsThisParty("contractor", customerTurn)).toBe(true);
    expect(changeOrderNeedsThisParty("contractor", acked)).toBe(false);
    expect(changeOrderNeedsThisParty("customer", proposed)).toBe(true);
    expect(changeOrderNeedsThisParty("customer", customerTurn)).toBe(false);
    expect(countChangeOrdersForParty("contractor", [proposed, customerTurn, acked])).toBe(1);
    expect(changeOrderPartyLabel("contractor", proposed)).toBe("Waiting for customer");
    expect(changeOrderPartyLabel("contractor", customerTurn)).toBe("Needs your OK");
    expect(changeOrderPartyLabel("customer", proposed)).toBe("Needs your OK");
    expect(changeOrderPartyLabel("customer", customerTurn)).toBe("Waiting for the pro");
    expect(changeOrderPartyLabel("contractor", { status: "REJECTED" })).toBe("Declined");
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
