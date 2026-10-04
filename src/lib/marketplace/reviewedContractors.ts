import {
  isExcludedPublicContractorId,
  isSmokeTesterText,
} from "./publicReviewFilters";

export const REVIEWED_PROS_PATH = "/find-a-pro";

export const REVIEWED_PROS_NAV_LABEL = "Reviewed pros";

export const REVIEWED_PROS_TITLE = "Contractors with reviews";

export const REVIEWED_PROS_INTRO =
  "This preview shows contractors only after a customer reviews them on Priority Property Pros. It is not a directory. Customers do not browse contractors or message them from here. A contractor pays a $4.99 connection fee to communicate with you. PPP does not take a cut of the job.";

export const REVIEWED_PROS_EMPTY_TITLE = "No reviewed contractors yet";

export const REVIEWED_PROS_EMPTY_BODY =
  "No contractor has a customer review on the platform yet. This page stays empty until that happens. It will not fill in sample people. Post a project when you are ready to hire. A contractor pays $4.99 to connect and communicate with you. PPP does not take a cut of the job.";

export const REVIEWED_PROS_EMPTY_COMPACT =
  "No contractor has a customer review on the platform yet. Sample people are not shown here.";

export type ReviewedContractorSnippet = {
  id: string;
  rating: number;
  body: string;
  demo?: boolean;
  category?: string | null;
  createdAt?: string | null;
  verified?: boolean;
  homeownerDisplay?: string | null;
  responseBody?: string | null;
  responseCreatedAt?: string | null;
  responseUpdatedAt?: string | null;
  moderationStatus?: "PUBLISHED" | "HIDDEN" | "REMOVED" | null;
  reviewClass?: "VERIFIED_PPP_PROJECT" | "CUSTOMER_REVIEW" | null;
};

export type ReviewedContractorInput = {
  id: string;
  displayLabel?: string | null;
  shortDescription?: string | null;
  reviews: ReviewedContractorSnippet[];
};

export function publishableReviewSnippets<T extends ReviewedContractorSnippet>(reviews: T[]): T[] {
  return reviews.filter((review) => {
    if (review.demo) return false;
    if (review.verified === false) return false;
    if (review.reviewClass === "CUSTOMER_REVIEW") return false;
    if (review.moderationStatus && review.moderationStatus !== "PUBLISHED") return false;
    if (review.rating < 1 || review.rating > 5) return false;
    if (isSmokeTesterText(review.body) || isSmokeTesterText(review.homeownerDisplay) || isSmokeTesterText(review.category)) {
      return false;
    }
    return true;
  });
}

export function reviewedContractorAverage(reviews: Array<{ rating: number }>): number | null {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((total, review) => total + review.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

export function isReviewBackedPublicContractor(input: ReviewedContractorInput): boolean {
  if (isExcludedPublicContractorId(input.id)) return false;
  if (isSmokeTesterText(input.displayLabel) || isSmokeTesterText(input.shortDescription)) return false;
  return publishableReviewSnippets(input.reviews).length > 0;
}
