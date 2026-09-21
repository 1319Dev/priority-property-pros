import { describe, expect, it } from "vitest";
import {
  canEditOthersPlatformReview,
  canInsertPlatformReview,
  canModeratePlatformReview,
  canSelectPlatformReview,
  validatePlatformReviewDraft,
} from "./platformReviews";

describe("platform review policy mirror", () => {
  it("lets the public read approved rows only, and owners/admins read their own pending rows", () => {
    expect(
      canSelectPlatformReview({ status: "APPROVED", viewerId: null, viewerIsAdmin: false, rowUserId: "a" }),
    ).toBe(true);
    expect(
      canSelectPlatformReview({ status: "PENDING", viewerId: null, viewerIsAdmin: false, rowUserId: "a" }),
    ).toBe(false);
    expect(
      canSelectPlatformReview({ status: "REJECTED", viewerId: "a", viewerIsAdmin: false, rowUserId: "a" }),
    ).toBe(true);
    expect(
      canSelectPlatformReview({ status: "REJECTED", viewerId: "b", viewerIsAdmin: false, rowUserId: "a" }),
    ).toBe(false);
    expect(
      canSelectPlatformReview({ status: "PENDING", viewerId: "admin", viewerIsAdmin: true, rowUserId: "a" }),
    ).toBe(true);
  });

  it("requires auth to insert and only admins can edit others", () => {
    expect(canInsertPlatformReview({ viewerId: null })).toBe(false);
    expect(canInsertPlatformReview({ viewerId: "user-1" })).toBe(true);
    expect(canModeratePlatformReview({ viewerIsAdmin: false })).toBe(false);
    expect(canModeratePlatformReview({ viewerIsAdmin: true })).toBe(true);
    expect(canEditOthersPlatformReview({ viewerId: "a", rowUserId: "b", viewerIsAdmin: false })).toBe(false);
    expect(canEditOthersPlatformReview({ viewerId: "admin", rowUserId: "b", viewerIsAdmin: true })).toBe(true);
  });

  it("rejects short, unrated, or contact-leaking drafts", () => {
    expect(
      validatePlatformReviewDraft({ display_name: "Pat", rating: 5, body: "Too short" }),
    ).toMatch(/between 20 and 1000/i);
    expect(
      validatePlatformReviewDraft({
        display_name: "Pat",
        rating: 5,
        body: "This marketplace made it simple to post a fence repair.",
      }),
    ).toBeNull();
    expect(
      validatePlatformReviewDraft({
        display_name: "Pat",
        rating: 5,
        body: "Call me at 512-555-0199 if you want more detail about this marketplace.",
      }),
    ).toMatch(/phone numbers, emails, and links/i);
    expect(validatePlatformReviewDraft({ display_name: "P", rating: 5, body: "A".repeat(25) })).toMatch(/display name/i);
    expect(
      validatePlatformReviewDraft({ display_name: "Pat", rating: 9, body: "A".repeat(25) }),
    ).toMatch(/1 to 5 stars/i);
  });
});
