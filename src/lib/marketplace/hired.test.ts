import { describe, expect, it } from "vitest";
import {
  HIRED_BUTTON_LABEL,
  HIRED_CONFIRM_LABEL,
  HIRED_WAITING_HOMEOWNER,
  HIRED_WAITING_PRO,
  bookingAllowsHiredConfirmation,
  canConfirmHired,
  canSeeReviewCta,
  canSubmitProfileReview,
  hiredStatusLabel,
  idleHiredCopy,
  isMutuallyHired,
  mutualHiredState,
  otherPartyLabel,
  ownReviewerRole,
  waitingForHiredCopy,
  bookingListHiredLabel,
} from "./hired";

describe("mutual hired confirmation", () => {
  it("does not treat one-sided confirmation as hired", () => {
    expect(isMutuallyHired({ customerHiredAt: "2026-09-21T12:00:00Z", contractorHiredAt: null })).toBe(false);
    expect(isMutuallyHired({ customerHiredAt: null, contractorHiredAt: "2026-09-21T12:00:00Z" })).toBe(false);
    expect(isMutuallyHired({ customerHiredAt: "2026-09-21T12:00:00Z", contractorHiredAt: "2026-09-21T12:01:00Z" })).toBe(
      true,
    );
  });

  it("shows a waiting state until the other party confirms", () => {
    expect(
      mutualHiredState({
        bookingStatus: "PENDING",
        customerHiredAt: "2026-09-21T12:00:00Z",
        contractorHiredAt: null,
      }),
    ).toBe("waiting_for_pro");
    expect(waitingForHiredCopy("waiting_for_pro")).toBe(HIRED_WAITING_PRO);
    expect(
      mutualHiredState({
        bookingStatus: "PENDING",
        customerHiredAt: null,
        contractorHiredAt: "2026-09-21T12:00:00Z",
      }),
    ).toBe("waiting_for_homeowner");
    expect(waitingForHiredCopy("waiting_for_homeowner")).toBe(HIRED_WAITING_HOMEOWNER);
    expect(
      hiredStatusLabel(
        mutualHiredState({
          bookingStatus: "PENDING",
          customerHiredAt: "2026-09-21T12:00:00Z",
          contractorHiredAt: "2026-09-21T12:01:00Z",
        }),
      ),
    ).toBe("Hired");
  });

  it("lets each party confirm Hired on a live booking, including PENDING, and is idempotent after their click", () => {
    expect(bookingAllowsHiredConfirmation("PENDING")).toBe(true);
    expect(bookingAllowsHiredConfirmation("CONFIRMED")).toBe(true);
    expect(bookingAllowsHiredConfirmation("CANCELLED")).toBe(false);
    expect(
      canConfirmHired({
        bookingStatus: "PENDING",
        role: "customer",
        customerHiredAt: null,
        contractorHiredAt: null,
      }),
    ).toBe(true);
    expect(
      canConfirmHired({
        bookingStatus: "PENDING",
        role: "customer",
        customerHiredAt: "2026-09-21T12:00:00Z",
        contractorHiredAt: null,
      }),
    ).toBe(false);
    expect(
      canConfirmHired({
        bookingStatus: "PENDING",
        role: "contractor",
        customerHiredAt: "2026-09-21T12:00:00Z",
        contractorHiredAt: null,
      }),
    ).toBe(true);
    expect(
      canConfirmHired({
        bookingStatus: "CANCELLED",
        role: "customer",
        customerHiredAt: null,
        contractorHiredAt: null,
      }),
    ).toBe(false);
  });

  it("uses Hired / Confirm hired copy and never End job language", () => {
    expect(HIRED_BUTTON_LABEL).toBe("Hired");
    expect(HIRED_CONFIRM_LABEL).toBe("Confirm hired");
    expect(idleHiredCopy("customer")).not.toMatch(/end (this )?job/i);
    expect(idleHiredCopy("contractor")).not.toMatch(/end (this )?job/i);
  });
});

describe("profile review eligibility after mutual hired", () => {
  it("does not unlock reviews when only one party confirmed Hired", () => {
    expect(
      canSeeReviewCta({
        mutuallyHired: false,
        bookingStatus: "PENDING",
      }),
    ).toBe(false);
    expect(
      canSubmitProfileReview({
        bookingStatus: "PENDING",
        mutuallyHired: false,
        alreadyReviewed: false,
        reviewerIsParticipant: true,
      }),
    ).toBe(false);
    expect(
      canSubmitProfileReview({
        bookingStatus: "COMPLETED",
        mutuallyHired: false,
        alreadyReviewed: false,
        reviewerIsParticipant: true,
      }),
    ).toBe(false);
  });

  it("allows each participant to review the other after mutual Hired without waiting for COMPLETED", () => {
    expect(
      canSeeReviewCta({
        mutuallyHired: true,
        bookingStatus: "PENDING",
      }),
    ).toBe(true);
    expect(
      canSubmitProfileReview({
        bookingStatus: "PENDING",
        mutuallyHired: true,
        alreadyReviewed: false,
        reviewerIsParticipant: true,
      }),
    ).toBe(true);
    expect(
      canSubmitProfileReview({
        bookingStatus: "PENDING",
        mutuallyHired: true,
        alreadyReviewed: true,
        reviewerIsParticipant: true,
      }),
    ).toBe(false);
    expect(
      canSubmitProfileReview({
        bookingStatus: "PENDING",
        mutuallyHired: true,
        alreadyReviewed: false,
        reviewerIsParticipant: false,
      }),
    ).toBe(false);
    expect(
      canSubmitProfileReview({
        bookingStatus: "CANCELLED",
        mutuallyHired: true,
        alreadyReviewed: false,
        reviewerIsParticipant: true,
      }),
    ).toBe(false);
    expect(ownReviewerRole("customer")).toBe("CUSTOMER");
    expect(ownReviewerRole("contractor")).toBe("CONTRACTOR");
    expect(otherPartyLabel("customer")).toBe("this pro");
    expect(otherPartyLabel("contractor")).toBe("this homeowner");
    expect(
      bookingListHiredLabel({
        bookingStatus: "PENDING",
        customerHiredAt: "2026-09-21T12:00:00Z",
        contractorHiredAt: null,
      }),
    ).toMatch(/waiting for pro/i);
    expect(
      bookingListHiredLabel({
        bookingStatus: "PENDING",
        customerHiredAt: "2026-09-21T12:00:00Z",
        contractorHiredAt: "2026-09-21T12:01:00Z",
      }),
    ).toBe("Hired");
  });
});
