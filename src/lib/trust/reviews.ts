/** Server-mirrored review eligibility. Clients never compute public averages. */

export const REVIEW_SIDES = ["CUSTOMER", "CONTRACTOR"] as const;
export type ReviewSide = (typeof REVIEW_SIDES)[number];

export const REVIEW_MIN_STARS = 1;
export const REVIEW_MAX_STARS = 5;

export type ReviewEligibilityInput = {
  actorId: string | null;
  actorRole: ReviewSide | "ADMIN" | "VERIFIER" | null;
  bookingStatus: string | null;
  bookingCustomerId: string | null;
  bookingContractorProfileId: string | null;
  contractorOwnerProfileId: string | null;
  existingSides: ReviewSide[];
};

export type EligibleReview = {
  reviewerId: string;
  reviewerRole: ReviewSide;
  revieweeProfileId: string;
  contractorProfileId: string;
  customerId: string;
};

export function isCompletedJobStatus(status: string | null | undefined): boolean {
  return status === "COMPLETED";
}

export function reviewEligibilityError(input: ReviewEligibilityInput): string | null {
  if (!input.actorId) return "sign in to leave a review";
  if (!isCompletedJobStatus(input.bookingStatus)) return "reviews require a completed job";
  if (!input.bookingCustomerId || !input.bookingContractorProfileId || !input.contractorOwnerProfileId) {
    return "reviews require a completed job relationship";
  }
  if (input.bookingCustomerId === input.contractorOwnerProfileId) return "you cannot review yourself";

  const isCustomer = input.actorId === input.bookingCustomerId && input.actorRole === "CUSTOMER";
  const isContractor =
    input.actorId === input.contractorOwnerProfileId && input.actorRole === "CONTRACTOR";

  if (!isCustomer && !isContractor) return "only the job’s homeowner or hired pro can review";
  const side: ReviewSide = isCustomer ? "CUSTOMER" : "CONTRACTOR";
  if (input.existingSides.includes(side)) return "this side already reviewed this job";
  return null;
}

export function eligibleReviewFrom(input: ReviewEligibilityInput): EligibleReview | null {
  if (reviewEligibilityError(input)) return null;
  if (!input.actorId || !input.bookingCustomerId || !input.bookingContractorProfileId || !input.contractorOwnerProfileId) {
    return null;
  }
  const reviewerRole: ReviewSide = input.actorId === input.bookingCustomerId ? "CUSTOMER" : "CONTRACTOR";
  return {
    reviewerId: input.actorId,
    reviewerRole,
    revieweeProfileId: reviewerRole === "CUSTOMER" ? input.contractorOwnerProfileId : input.bookingCustomerId,
    contractorProfileId: input.bookingContractorProfileId,
    customerId: input.bookingCustomerId,
  };
}

export function isValidStarRating(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= REVIEW_MIN_STARS && Number(value) <= REVIEW_MAX_STARS;
}

export function sanitizeReviewBody(body: string | null | undefined): string | null {
  const trimmed = (body ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function clientCannotInsertArbitraryReview(): boolean {
  return true;
}

export function clientCannotTrustLocalAverage(): boolean {
  return true;
}

export function isEligiblePublicReview(input: {
  bookingStatus: string | null;
  isVerified: boolean;
  includedInRating: boolean;
  reviewerRole: ReviewSide;
  reviewerId: string;
  revieweeProfileId: string;
}): boolean {
  return (
    isCompletedJobStatus(input.bookingStatus) &&
    input.isVerified &&
    input.includedInRating &&
    input.reviewerId !== input.revieweeProfileId
  );
}

export function isPublicContractorReview(input: {
  bookingStatus: string | null;
  isVerified: boolean;
  includedInRating: boolean;
  reviewerRole: ReviewSide;
  reviewerId: string;
  revieweeProfileId: string;
}): boolean {
  return input.reviewerRole === "CUSTOMER" && isEligiblePublicReview(input);
}

export function myReviewOnBooking<T extends { reviewer_role: ReviewSide }>(
  reviews: T[],
  side: ReviewSide,
): T | null {
  return reviews.find((row) => row.reviewer_role === side) ?? null;
}
