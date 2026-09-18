/** Unrounded rating averages and automatic RATING_SUSPENSION. */

import { isEligiblePublicReview, type ReviewSide } from "./reviews";

export const DEFAULT_RATING_SUSPENSION_MIN_REVIEWS = 5;
export const RATING_SUSPENSION_THRESHOLD = 4;
export const RATING_SUSPENSION_REASON = "RATING_SUSPENSION" as const;

export const RATING_SETTING_KEYS = {
  minReviews: "rating_suspension_min_reviews",
} as const;

export type EligibleRatingRow = {
  rating: number;
  bookingStatus: string | null;
  isVerified: boolean;
  includedInRating: boolean;
  reviewerRole: ReviewSide;
  reviewerId: string;
  revieweeProfileId: string;
};

export type RatingSnapshot = {
  eligibleCount: number;
  ratingSum: number;
  /** Exact unrounded average, or null when there are no eligible reviews. */
  ratingAverage: number | null;
};

export function eligibleRatingsForProfile(revieweeProfileId: string, rows: EligibleRatingRow[]): number[] {
  return rows
    .filter((row) => row.revieweeProfileId === revieweeProfileId && isEligiblePublicReview(row))
    .map((row) => row.rating);
}

export function computeRatingSnapshot(ratings: number[]): RatingSnapshot {
  const eligible = ratings.filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);
  const ratingSum = eligible.reduce((sum, value) => sum + value, 0);
  const eligibleCount = eligible.length;
  return {
    eligibleCount,
    ratingSum,
    ratingAverage: eligibleCount === 0 ? null : ratingSum / eligibleCount,
  };
}

export function roundedDisplayAverage(average: number | null, digits = 1): number | null {
  if (average == null) return null;
  const factor = 10 ** digits;
  return Math.round(average * factor) / factor;
}

export function minReviewThreshold(configured: number | null | undefined): number {
  if (!Number.isInteger(configured) || Number(configured) < 1) return DEFAULT_RATING_SUSPENSION_MIN_REVIEWS;
  return Number(configured);
}

/**
 * Suspend only when unrounded avg < 4.00 AND eligible count >= threshold.
 * Exactly 4.00 does not suspend. Rounding must never drive enforcement.
 */
export function shouldAutoSuspendForRating(
  snapshot: RatingSnapshot,
  minReviews: number = DEFAULT_RATING_SUSPENSION_MIN_REVIEWS,
): boolean {
  if (snapshot.ratingAverage == null) return false;
  if (snapshot.eligibleCount < minReviewThreshold(minReviews)) return false;
  return snapshot.ratingAverage < RATING_SUSPENSION_THRESHOLD;
}

export function ratingSuspensionCleared(
  snapshot: RatingSnapshot,
  minReviews: number = DEFAULT_RATING_SUSPENSION_MIN_REVIEWS,
): boolean {
  return !shouldAutoSuspendForRating(snapshot, minReviews);
}

export function exactlyFourDoesNotSuspend(): boolean {
  return shouldAutoSuspendForRating({ eligibleCount: 5, ratingSum: 20, ratingAverage: 4 }) === false;
}

export function publicAverageNeverFromClient(serverAverage: number | null, clientGuess: number | null): number | null {
  void clientGuess;
  return serverAverage;
}
