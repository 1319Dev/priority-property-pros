import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATING_SUSPENSION_MIN_REVIEWS,
  computeRatingSnapshot,
  exactlyFourDoesNotSuspend,
  minReviewThreshold,
  publicAverageNeverFromClient,
  ratingSuspensionCleared,
  roundedDisplayAverage,
  shouldAutoSuspendForRating,
} from "./ratings";

describe("rating calculation and suspension", () => {
  it("uses the unrounded average for enforcement", () => {
    const snapshot = computeRatingSnapshot([5, 4, 3, 3, 1]);
    expect(snapshot.eligibleCount).toBe(5);
    expect(snapshot.ratingSum).toBe(16);
    expect(snapshot.ratingAverage).toBe(3.2);
    expect(shouldAutoSuspendForRating(snapshot)).toBe(true);
    expect(exactlyFourDoesNotSuspend()).toBe(true);
  });

  it("suspends only when avg < 4.00 and count meets the threshold of 5", () => {
    // Below threshold - no suspension
    expect(shouldAutoSuspendForRating(computeRatingSnapshot([3, 3, 3]))).toBe(false);
    expect(shouldAutoSuspendForRating(computeRatingSnapshot([1, 1, 1, 1]))).toBe(false);
    // At threshold with good average - no suspension
    expect(shouldAutoSuspendForRating(computeRatingSnapshot([5, 4, 4, 4, 4]))).toBe(false);
    expect(shouldAutoSuspendForRating(computeRatingSnapshot([5, 5, 4, 4, 2]))).toBe(false);
    // At threshold with bad average - suspend
    expect(shouldAutoSuspendForRating(computeRatingSnapshot([3, 3, 3, 3, 3]))).toBe(true);
    expect(shouldAutoSuspendForRating(computeRatingSnapshot([4, 3, 3, 3, 2]))).toBe(true);
    // Exactly 5 reviews averaging exactly 4.00 - no suspension
    expect(shouldAutoSuspendForRating(computeRatingSnapshot([5, 4, 4, 4, 3]))).toBe(false);
  });

  it("does not suspend on a display-rounded 4.0 that is actually below 4", () => {
    const snapshot = computeRatingSnapshot([5, 4, 3, 3, 3]);
    expect(snapshot.ratingAverage).toBe(3.6);
    expect(roundedDisplayAverage(snapshot.ratingAverage)).toBe(3.6);
    expect(shouldAutoSuspendForRating(snapshot)).toBe(true);
  });

  it("uses a configurable minimum review count that defaults to 5", () => {
    expect(minReviewThreshold(undefined)).toBe(DEFAULT_RATING_SUSPENSION_MIN_REVIEWS);
    expect(minReviewThreshold(5)).toBe(5);
    expect(shouldAutoSuspendForRating(computeRatingSnapshot([1, 1, 1]), 5)).toBe(false);
    expect(shouldAutoSuspendForRating(computeRatingSnapshot([1, 1, 1, 1, 1]), 5)).toBe(true);
  });

  it("clears suspension when the unrounded rule no longer holds", () => {
    expect(ratingSuspensionCleared(computeRatingSnapshot([5, 5, 5, 5, 5]))).toBe(true);
    expect(ratingSuspensionCleared(computeRatingSnapshot([1]))).toBe(true);
    expect(ratingSuspensionCleared(computeRatingSnapshot([1, 1, 1, 1, 1]))).toBe(false);
  });

  it("never prefers a client-trusted average", () => {
    expect(publicAverageNeverFromClient(4.2, 5)).toBe(4.2);
  });
});
