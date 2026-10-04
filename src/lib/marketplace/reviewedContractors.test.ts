import { describe, expect, it } from "vitest";
import { SMOKE_TESTER_CONTRACTOR_PROFILE_ID } from "./publicReviewFilters";
import {
  isReviewBackedPublicContractor,
  publishableReviewSnippets,
  REVIEWED_PROS_EMPTY_BODY,
  REVIEWED_PROS_INTRO,
} from "./reviewedContractors";

const realReview = {
  id: "review-1",
  rating: 5,
  body: "Showed up on time and finished the fence repair.",
};

describe("review-backed contractor preview", () => {
  it("keeps a contractor only when a real customer review exists", () => {
    expect(
      isReviewBackedPublicContractor({
        id: "contractor-1",
        displayLabel: "Approved Fence Pro",
        reviews: [],
      }),
    ).toBe(false);
    expect(
      isReviewBackedPublicContractor({
        id: "contractor-1",
        displayLabel: "Approved Fence Pro",
        reviews: [realReview],
      }),
    ).toBe(true);
  });

  it("drops demo reviews and Smoke Tester text", () => {
    expect(
      publishableReviewSnippets([
        { ...realReview, demo: true },
        { id: "review-2", rating: 4, body: "Smoke Tester checked this listing." },
        realReview,
      ]),
    ).toEqual([realReview]);
    expect(
      isReviewBackedPublicContractor({
        id: "contractor-1",
        displayLabel: "Approved Fence Pro",
        reviews: [{ id: "review-2", rating: 5, body: "Left by Smoke Tester during setup." }],
      }),
    ).toBe(false);
    expect(
      isReviewBackedPublicContractor({
        id: SMOKE_TESTER_CONTRACTOR_PROFILE_ID,
        displayLabel: "Approved Handyman Pro",
        reviews: [realReview],
      }),
    ).toBe(false);
  });

  it("does not describe a free public directory", () => {
    expect(REVIEWED_PROS_INTRO).toMatch(/\$4\.99/);
    expect(REVIEWED_PROS_INTRO).toMatch(/not a directory/i);
    expect(REVIEWED_PROS_INTRO).toMatch(/does not take a cut of the job/i);
    expect(REVIEWED_PROS_EMPTY_BODY).toMatch(/No contractor has a customer review/i);
    expect(`${REVIEWED_PROS_INTRO} ${REVIEWED_PROS_EMPTY_BODY}`).not.toMatch(/browse and message/i);
    expect(`${REVIEWED_PROS_INTRO} ${REVIEWED_PROS_EMPTY_BODY}`).not.toMatch(/smoke tester/i);
  });
});
