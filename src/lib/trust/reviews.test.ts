import { describe, expect, it } from "vitest";
import {
  clientCannotInsertArbitraryReview,
  clientCannotTrustLocalAverage,
  eligibleReviewFrom,
  isEligiblePublicReview,
  isPublicContractorReview,
  isValidStarRating,
  reviewEligibilityError,
  sanitizeReviewBody,
} from "./reviews";

const completed = {
  actorId: "cust-1",
  actorRole: "CUSTOMER" as const,
  bookingStatus: "COMPLETED",
  bookingCustomerId: "cust-1",
  bookingContractorProfileId: "pro-profile-1",
  contractorOwnerProfileId: "pro-user-1",
  existingSides: [] as ("CUSTOMER" | "CONTRACTOR")[],
};

describe("two-sided review eligibility", () => {
  it("allows a homeowner to review the hired pro after a completed job", () => {
    expect(reviewEligibilityError(completed)).toBeNull();
    expect(eligibleReviewFrom(completed)?.reviewerRole).toBe("CUSTOMER");
    expect(eligibleReviewFrom(completed)?.revieweeProfileId).toBe("pro-user-1");
  });

  it("allows the hired pro to review the homeowner after a completed job", () => {
    const input = { ...completed, actorId: "pro-user-1", actorRole: "CONTRACTOR" as const };
    expect(reviewEligibilityError(input)).toBeNull();
    expect(eligibleReviewFrom(input)?.reviewerRole).toBe("CONTRACTOR");
    expect(eligibleReviewFrom(input)?.revieweeProfileId).toBe("cust-1");
  });

  it("blocks reviews without a completed job", () => {
    for (const status of ["PENDING", "CONFIRMED", "IN_PROGRESS", "CANCELLED", null]) {
      expect(reviewEligibilityError({ ...completed, bookingStatus: status })).toMatch(/completed job/i);
    }
  });

  it("blocks self-review", () => {
    expect(
      reviewEligibilityError({
        ...completed,
        contractorOwnerProfileId: "cust-1",
      }),
    ).toMatch(/yourself/i);
  });

  it("blocks a second review from the same side", () => {
    expect(reviewEligibilityError({ ...completed, existingSides: ["CUSTOMER"] })).toMatch(/already reviewed/i);
  });

  it("blocks strangers and arbitrary actors", () => {
    expect(reviewEligibilityError({ ...completed, actorId: "stranger", actorRole: "CUSTOMER" })).toMatch(
      /homeowner or hired pro/i,
    );
    expect(clientCannotInsertArbitraryReview()).toBe(true);
  });

  it("accepts 1–5 integer stars and optional written comments", () => {
    expect(isValidStarRating(1)).toBe(true);
    expect(isValidStarRating(5)).toBe(true);
    expect(isValidStarRating(0)).toBe(false);
    expect(isValidStarRating(4.5)).toBe(false);
    expect(sanitizeReviewBody("  Great work  ")).toBe("Great work");
    expect(sanitizeReviewBody("   ")).toBeNull();
  });

  it("counts only eligible completed-job reviews toward public ratings", () => {
    expect(
      isPublicContractorReview({
        bookingStatus: "COMPLETED",
        isVerified: true,
        includedInRating: true,
        reviewerRole: "CUSTOMER",
        reviewerId: "cust-1",
        revieweeProfileId: "pro-user-1",
      }),
    ).toBe(true);
    expect(
      isEligiblePublicReview({
        bookingStatus: "COMPLETED",
        isVerified: true,
        includedInRating: false,
        reviewerRole: "CUSTOMER",
        reviewerId: "cust-1",
        revieweeProfileId: "pro-user-1",
      }),
    ).toBe(false);
    expect(clientCannotTrustLocalAverage()).toBe(true);
  });
});
