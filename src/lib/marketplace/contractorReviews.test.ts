import { describe, expect, it } from "vitest";
import { SMOKE_TESTER_CONTRACTOR_PROFILE_ID } from "./publicReviewFilters";
import {
  NEW_ON_PPP,
  NO_REVIEWS_YET,
  VERIFIED_PPP_BADGE,
  adminCanCreateVerifiedReviewFromUi,
  assignedReviewClassForEligibleHomeowner,
  canCreateVerifiedProjectReview,
  canSelfAssignVerifiedBadge,
  contractorCanDeleteReview,
  contractorCanEditReviewContent,
  contractorCanHideReview,
  countsTowardPublicRating,
  decisionRatingLines,
  nextModerationStatus,
  outsideCustomerReviewEnabled,
  parseContractorReputation,
  privacySafeHomeownerDisplay,
  publicCanReadReview,
  publicReviewHidesPrivateFields,
  ratingFromPublishedReviews,
  reportChangesModerationStatus,
  reviewContractorCta,
  shouldShowProjectReviewPrompt,
  validateContractorResponse,
  validateCustomerReviewBody,
} from "./contractorReviews";

const eligible = {
  reviewerId: "homeowner-1",
  reviewerIsProjectOwner: true,
  reviewerIsBookingCustomer: true,
  bookingContractorId: "pro-1",
  projectSelectedContractorId: "pro-1",
  mutuallyHired: true,
  bookingStatus: "PENDING" as const,
  alreadyReviewedThisProjectContractor: false,
};

describe("verified project review eligibility", () => {
  it("allows the project homeowner after mutual Hired with the hired contractor", () => {
    expect(canCreateVerifiedProjectReview(eligible)).toBe(true);
    expect(assignedReviewClassForEligibleHomeowner()).toBe("VERIFIED_PPP_PROJECT");
    expect(canSelfAssignVerifiedBadge()).toBe(false);
    expect(adminCanCreateVerifiedReviewFromUi()).toBe(false);
    expect(outsideCustomerReviewEnabled()).toBe(false);
  });

  it("rejects another project and an unselected contractor", () => {
    expect(
      canCreateVerifiedProjectReview({
        ...eligible,
        reviewerIsProjectOwner: false,
        reviewerIsBookingCustomer: false,
      }),
    ).toBe(false);
    expect(
      canCreateVerifiedProjectReview({
        ...eligible,
        projectSelectedContractorId: "someone-else",
      }),
    ).toBe(false);
    expect(
      canCreateVerifiedProjectReview({
        ...eligible,
        mutuallyHired: false,
      }),
    ).toBe(false);
  });

  it("rejects a duplicate for the same homeowner, project, and contractor", () => {
    expect(
      canCreateVerifiedProjectReview({
        ...eligible,
        alreadyReviewedThisProjectContractor: true,
      }),
    ).toBe(false);
  });
});

describe("published rating math", () => {
  const published = {
    rating: 5,
    reviewerRole: "CUSTOMER" as const,
    reviewClass: "VERIFIED_PPP_PROJECT" as const,
    moderationStatus: "PUBLISHED" as const,
    verified: true,
    body: "Finished the fence repair on time.",
  };

  it("averages published verified reviews and drops hidden ones", () => {
    const stats = ratingFromPublishedReviews([
      published,
      { ...published, rating: 3 },
      { ...published, rating: 1, moderationStatus: "HIDDEN" },
      { ...published, rating: 1, moderationStatus: "REMOVED" },
      { ...published, rating: 1, reviewClass: "CUSTOMER_REVIEW" },
      { ...published, rating: 2, reviewerRole: "CONTRACTOR", reviewClass: null },
      { ...published, rating: 1, demo: true },
      { ...published, body: "Smoke Tester left this." },
      { ...published, contractorId: SMOKE_TESTER_CONTRACTOR_PROFILE_ID, rating: 1 },
    ]);
    expect(stats).toEqual({ ratingAverage: 4, ratingCount: 2, verifiedCount: 2 });
    expect(countsTowardPublicRating({ ...published, moderationStatus: "HIDDEN" })).toBe(false);
    expect(publicCanReadReview("HIDDEN")).toBe(false);
    expect(publicCanReadReview("REMOVED")).toBe(false);
    expect(publicCanReadReview("PUBLISHED")).toBe(true);
  });

  it("does not invent a rating when nothing is published", () => {
    expect(ratingFromPublishedReviews([])).toEqual({ ratingAverage: null, ratingCount: 0, verifiedCount: 0 });
    expect(decisionRatingLines(5, 0)).toEqual({
      hasRating: false,
      primary: NO_REVIEWS_YET,
      secondary: NEW_ON_PPP,
    });
    expect(decisionRatingLines(null, 0).primary).not.toMatch(/5\.0/);
  });
});

describe("contractor response and moderation", () => {
  it("lets a contractor respond within the length limit and not edit the review", () => {
    expect(validateContractorResponse("Thanks for the note.")).toBeNull();
    expect(validateContractorResponse("")).not.toBeNull();
    expect(contractorCanEditReviewContent()).toBe(false);
    expect(contractorCanDeleteReview()).toBe(false);
    expect(contractorCanHideReview()).toBe(false);
    expect(reportChangesModerationStatus()).toBe(false);
  });

  it("hides a published review and restores it without a fake verified write", () => {
    expect(nextModerationStatus("hide", "PUBLISHED")).toEqual({ status: "HIDDEN" });
    expect(nextModerationStatus("restore", "HIDDEN")).toEqual({ status: "PUBLISHED" });
    expect(nextModerationStatus("remove", "PUBLISHED")).toEqual({ status: "REMOVED" });
    expect(nextModerationStatus("keep_published", "HIDDEN")).toEqual({ error: "review is not published" });
  });
});

describe("review copy and privacy", () => {
  it("uses one calm prompt and a privacy-safe homeowner label", () => {
    expect(reviewContractorCta("Approved Handyman Pro")).toBe("Review Approved Handyman Pro.");
    expect(VERIFIED_PPP_BADGE).toBe("Verified PPP project");
    expect(privacySafeHomeownerDisplay("Maria")).toBe("M.");
    expect(privacySafeHomeownerDisplay("maria@example.com")).toBe("Homeowner");
    expect(privacySafeHomeownerDisplay("123 Oak Street")).toBe("Homeowner");
    expect(
      shouldShowProjectReviewPrompt({
        mutuallyHired: true,
        bookingStatus: "PENDING",
        alreadyReviewed: false,
        reviewerIsProjectOwner: true,
      }),
    ).toBe(true);
    expect(
      shouldShowProjectReviewPrompt({
        mutuallyHired: true,
        bookingStatus: "PENDING",
        alreadyReviewed: true,
        reviewerIsProjectOwner: true,
      }),
    ).toBe(false);
  });

  it("rejects contact leaks and short homeowner reviews", () => {
    expect(validateCustomerReviewBody("Too short")).not.toBeNull();
    expect(validateCustomerReviewBody("Call me at 512-555-0100 after the job was done today.")).not.toBeNull();
    expect(validateCustomerReviewBody("The pro showed up on time and finished the sticky door.")).toBeNull();
  });

  it("does not put private fields on a public review record", () => {
    expect(
      publicReviewHidesPrivateFields({
        id: "r1",
        rating: 5,
        body: "Finished the work.",
        homeownerDisplay: "M.",
        email: null,
        phone: "",
      }),
    ).toBe(true);
  });

  it("parses a contractor payload without treating a missing average as five stars", () => {
    expect(
      parseContractorReputation({
        rating_average: null,
        rating_count: 0,
        verified_count: 0,
        reviews: [],
      }),
    ).toMatchObject({ ratingAverage: null, ratingCount: 0, verifiedCount: 0 });
  });
});
