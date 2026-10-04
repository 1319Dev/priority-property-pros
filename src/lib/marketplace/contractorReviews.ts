import { detectContactLeak } from "./contactLeak";
import { canSubmitProfileReview } from "./hired";
import type { BookingStatus } from "./types";
import { isExcludedPublicContractorId, isSmokeTesterText } from "./publicReviewFilters";

export const REVIEW_CLASSES = ["VERIFIED_PPP_PROJECT", "CUSTOMER_REVIEW"] as const;
export type ReviewClass = (typeof REVIEW_CLASSES)[number];

export const REVIEW_MODERATION_STATUSES = ["PUBLISHED", "HIDDEN", "REMOVED"] as const;
export type ReviewModerationStatus = (typeof REVIEW_MODERATION_STATUSES)[number];

export const REVIEW_REPORT_REASONS = [
  "spam",
  "not_a_real_customer",
  "harassment",
  "personal_information",
  "conflict_of_interest",
  "other",
] as const;
export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number];

export const REVIEW_MODERATION_ACTIONS = ["keep_published", "hide", "restore", "remove"] as const;
export type ReviewModerationAction = (typeof REVIEW_MODERATION_ACTIONS)[number];

export const REVIEW_BODY_MIN = 20;
export const REVIEW_BODY_MAX = 1000;
export const RESPONSE_BODY_MIN = 1;
export const RESPONSE_BODY_MAX = 800;
export const REPORT_NOTE_MAX = 500;

export const VERIFIED_PPP_BADGE = "Verified PPP project";
export const NO_REVIEWS_YET = "No reviews yet";
export const NEW_ON_PPP = "New on Priority Property Pros.";
export const REVIEW_PROMPT_TITLE = "How did your project go?";

export const REPORT_REASON_LABELS: Record<ReviewReportReason, string> = {
  spam: "Spam",
  not_a_real_customer: "Not a real customer",
  harassment: "Harassment",
  personal_information: "Personal information",
  conflict_of_interest: "Conflict of interest",
  other: "Other",
};

export function reviewContractorCta(contractorLabel: string | null | undefined): string {
  const label = contractorLabel?.trim() || "your contractor";
  return `Review ${label}.`;
}

export function privacySafeHomeownerDisplay(firstName: string | null | undefined): string {
  const name = (firstName ?? "").trim();
  if (!/^[A-Za-z][A-Za-z' -]{0,39}$/.test(name)) return "Homeowner";
  return `${name[0]?.toUpperCase() ?? "H"}.`;
}

export type VerifiedReviewEligibility = {
  reviewerId: string | null;
  reviewerIsProjectOwner: boolean;
  reviewerIsBookingCustomer: boolean;
  bookingContractorId: string;
  projectSelectedContractorId: string | null;
  mutuallyHired: boolean;
  bookingStatus: BookingStatus | null;
  alreadyReviewedThisProjectContractor: boolean;
};

export function verifiedProjectReviewBlockReason(input: VerifiedReviewEligibility): string | null {
  if (!input.reviewerId) return "auth required";
  if (!input.reviewerIsProjectOwner || !input.reviewerIsBookingCustomer) {
    return "only the project homeowner can review the hired contractor";
  }
  if (
    input.projectSelectedContractorId &&
    input.projectSelectedContractorId !== input.bookingContractorId
  ) {
    return "reviews require the hired contractor on this project";
  }
  if (!input.mutuallyHired || input.bookingStatus === "CANCELLED" || input.bookingStatus === "DISPUTED" || !input.bookingStatus) {
    return "reviews require mutual hired confirmation";
  }
  if (input.alreadyReviewedThisProjectContractor) {
    return "you already reviewed this contractor on this project";
  }
  return null;
}

export function canCreateVerifiedProjectReview(input: VerifiedReviewEligibility): boolean {
  return verifiedProjectReviewBlockReason(input) === null;
}

/** The platform assigns this. Callers cannot pick a class. */
export function assignedReviewClassForEligibleHomeowner(): "VERIFIED_PPP_PROJECT" {
  return "VERIFIED_PPP_PROJECT";
}

export function outsideCustomerReviewEnabled(): false {
  return false;
}

export function canSelfAssignVerifiedBadge(): false {
  return false;
}

export function adminCanCreateVerifiedReviewFromUi(): false {
  return false;
}

export function shouldShowProjectReviewPrompt(input: {
  mutuallyHired: boolean;
  bookingStatus: BookingStatus | null | undefined;
  alreadyReviewed: boolean;
  reviewerIsProjectOwner: boolean;
}): boolean {
  if (input.alreadyReviewed || !input.reviewerIsProjectOwner) return false;
  return canSubmitProfileReview({
    bookingStatus: input.bookingStatus,
    mutuallyHired: input.mutuallyHired,
    alreadyReviewed: false,
    reviewerIsParticipant: true,
  });
}

export function validateCustomerReviewBody(body: string): string | null {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length < REVIEW_BODY_MIN || text.length > REVIEW_BODY_MAX) {
    return `Review must be between ${REVIEW_BODY_MIN} and ${REVIEW_BODY_MAX} characters.`;
  }
  if (isSmokeTesterText(text)) return "Test reviews are not published.";
  if (detectContactLeak(text).blocked) {
    return "Please keep phone numbers, emails, and links out of the review.";
  }
  return null;
}

export function validateContractorResponse(body: string): string | null {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length < RESPONSE_BODY_MIN || text.length > RESPONSE_BODY_MAX) {
    return `Response must be between ${RESPONSE_BODY_MIN} and ${RESPONSE_BODY_MAX} characters.`;
  }
  if (detectContactLeak(text).blocked) {
    return "Please keep phone numbers, emails, and links out of the response.";
  }
  return null;
}

export function isReviewReportReason(value: string): value is ReviewReportReason {
  return (REVIEW_REPORT_REASONS as readonly string[]).includes(value);
}

export type RatingSourceReview = {
  rating: number;
  reviewerRole?: "CUSTOMER" | "CONTRACTOR" | null;
  reviewClass?: ReviewClass | null;
  moderationStatus?: ReviewModerationStatus | null;
  verified?: boolean;
  demo?: boolean;
  body?: string | null;
  homeownerDisplay?: string | null;
  category?: string | null;
  contractorId?: string | null;
};

export function countsTowardPublicRating(review: RatingSourceReview): boolean {
  if (review.demo) return false;
  if (review.verified === false) return false;
  if (review.reviewerRole && review.reviewerRole !== "CUSTOMER") return false;
  if (review.reviewClass && review.reviewClass !== "VERIFIED_PPP_PROJECT") return false;
  if (review.moderationStatus && review.moderationStatus !== "PUBLISHED") return false;
  if (isExcludedPublicContractorId(review.contractorId)) return false;
  if (isSmokeTesterText(review.body) || isSmokeTesterText(review.homeownerDisplay) || isSmokeTesterText(review.category)) {
    return false;
  }
  if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) return false;
  return true;
}

export function ratingFromPublishedReviews(reviews: RatingSourceReview[]): {
  ratingAverage: number | null;
  ratingCount: number;
  verifiedCount: number;
} {
  const published = reviews.filter(countsTowardPublicRating);
  if (published.length === 0) {
    return { ratingAverage: null, ratingCount: 0, verifiedCount: 0 };
  }
  const sum = published.reduce((total, review) => total + review.rating, 0);
  const verifiedCount = published.filter((review) => review.reviewClass !== "CUSTOMER_REVIEW").length;
  return {
    ratingAverage: Math.round((sum / published.length) * 10) / 10,
    ratingCount: published.length,
    verifiedCount,
  };
}

export function ratingDistribution(reviews: Array<{ rating: number }>): Record<1 | 2 | 3 | 4 | 5, number> {
  const counts: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) {
    const star = Math.round(review.rating);
    if (star >= 1 && star <= 5) counts[star as 1 | 2 | 3 | 4 | 5] += 1;
  }
  return counts;
}

export function decisionRatingLines(average: number | null | undefined, count: number | null | undefined): {
  hasRating: boolean;
  primary: string;
  secondary: string | null;
} {
  const safeCount = count ?? 0;
  if (safeCount <= 0 || average == null || Number.isNaN(Number(average))) {
    return { hasRating: false, primary: NO_REVIEWS_YET, secondary: NEW_ON_PPP };
  }
  const rounded = Math.round(Number(average) * 10) / 10;
  return {
    hasRating: true,
    primary: `★ ${rounded.toFixed(1)} · ${safeCount} verified PPP ${safeCount === 1 ? "review" : "reviews"}`,
    secondary: null,
  };
}

export function publicCanReadReview(status: ReviewModerationStatus | null | undefined): boolean {
  return status === "PUBLISHED";
}

export function reportChangesModerationStatus(): false {
  return false;
}

export function contractorCanEditReviewContent(): false {
  return false;
}

export function contractorCanDeleteReview(): false {
  return false;
}

export function contractorCanHideReview(): false {
  return false;
}

export function nextModerationStatus(
  action: ReviewModerationAction,
  current: ReviewModerationStatus,
): { status: ReviewModerationStatus } | { error: string } {
  if (action === "keep_published") {
    if (current !== "PUBLISHED") return { error: "review is not published" };
    return { status: "PUBLISHED" };
  }
  if (action === "hide") {
    if (current === "REMOVED") return { error: "removed reviews stay removed until restored" };
    return { status: "HIDDEN" };
  }
  if (action === "restore") {
    if (current === "PUBLISHED") return { error: "review is already published" };
    return { status: "PUBLISHED" };
  }
  return { status: "REMOVED" };
}

export type PublicReviewFields = {
  id: string;
  rating: number;
  body: string;
  category?: string | null;
  createdAt?: string | null;
  verified?: boolean;
  homeownerDisplay?: string | null;
  responseBody?: string | null;
  responseCreatedAt?: string | null;
  responseUpdatedAt?: string | null;
  moderationStatus?: ReviewModerationStatus | null;
};

const PRIVATE_REVIEW_KEYS = [
  "email",
  "phone",
  "street",
  "business_name",
  "businessName",
  "customer_id",
  "lat",
  "lng",
  "website",
];

export function publicReviewHidesPrivateFields(review: Record<string, unknown>): boolean {
  return PRIVATE_REVIEW_KEYS.every((key) => !(key in review) || review[key] == null || review[key] === "");
}

export type ContractorDashboardReview = {
  id: string;
  rating: number;
  body: string | null;
  category: string | null;
  createdAt: string | null;
  homeownerDisplay: string | null;
  reviewClass: ReviewClass | null;
  moderationStatus: ReviewModerationStatus;
  verified: boolean;
  responseBody: string | null;
  responseCreatedAt: string | null;
  responseUpdatedAt: string | null;
  reportedByMe: boolean;
};

export type ContractorReputation = {
  ratingAverage: number | null;
  ratingCount: number;
  verifiedCount: number;
  reviews: ContractorDashboardReview[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStatus(value: unknown): ReviewModerationStatus {
  return value === "HIDDEN" || value === "REMOVED" || value === "PUBLISHED" ? value : "PUBLISHED";
}

function asClass(value: unknown): ReviewClass | null {
  return value === "VERIFIED_PPP_PROJECT" || value === "CUSTOMER_REVIEW" ? value : null;
}

export function parseContractorReputation(value: unknown): ContractorReputation {
  const row = asRecord(value) ?? {};
  const reviews = Array.isArray(row.reviews) ? row.reviews : [];
  return {
    ratingAverage: typeof row.rating_average === "number" ? row.rating_average : null,
    ratingCount: typeof row.rating_count === "number" ? row.rating_count : 0,
    verifiedCount: typeof row.verified_count === "number" ? row.verified_count : 0,
    reviews: reviews.flatMap((item) => {
      const review = asRecord(item);
      if (!review || typeof review.id !== "string") return [];
      return [
        {
          id: review.id,
          rating: typeof review.rating === "number" ? review.rating : 0,
          body: typeof review.body === "string" ? review.body : null,
          category: typeof review.category === "string" ? review.category : null,
          createdAt: typeof review.created_at === "string" ? review.created_at : null,
          homeownerDisplay: typeof review.homeowner_display === "string" ? review.homeowner_display : "Homeowner",
          reviewClass: asClass(review.review_class),
          moderationStatus: asStatus(review.moderation_status),
          verified: review.verified === true || review.review_class === "VERIFIED_PPP_PROJECT",
          responseBody: typeof review.response_body === "string" ? review.response_body : null,
          responseCreatedAt: typeof review.response_created_at === "string" ? review.response_created_at : null,
          responseUpdatedAt: typeof review.response_updated_at === "string" ? review.response_updated_at : null,
          reportedByMe: review.reported_by_me === true,
        },
      ];
    }),
  };
}

export type AdminReviewReport = {
  id: string;
  reason: string;
  note: string | null;
  createdAt: string | null;
};

export type AdminReviewEvent = {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  createdAt: string | null;
};

export type AdminContractorReview = ContractorDashboardReview & {
  contractorProfileId: string;
  displayLabel: string;
  reports: AdminReviewReport[];
  events: AdminReviewEvent[];
};

export function parseAdminContractorReviews(value: unknown): AdminContractorReview[] {
  const row = asRecord(value) ?? {};
  const reviews = Array.isArray(row.reviews) ? row.reviews : [];
  return reviews.flatMap((item) => {
    const review = asRecord(item);
    if (!review || typeof review.id !== "string") return [];
    const base = parseContractorReputation({ reviews: [review], rating_count: 0, verified_count: 0 }).reviews[0];
    if (!base) return [];
    const reports = Array.isArray(review.reports) ? review.reports : [];
    const events = Array.isArray(review.events) ? review.events : [];
    return [
      {
        ...base,
        contractorProfileId: typeof review.contractor_profile_id === "string" ? review.contractor_profile_id : "",
        displayLabel: typeof review.display_label === "string" ? review.display_label : "Approved Local Pro",
        reports: reports.flatMap((report) => {
          const parsed = asRecord(report);
          if (!parsed || typeof parsed.id !== "string") return [];
          return [
            {
              id: parsed.id,
              reason: typeof parsed.reason === "string" ? parsed.reason : "other",
              note: typeof parsed.note === "string" ? parsed.note : null,
              createdAt: typeof parsed.created_at === "string" ? parsed.created_at : null,
            },
          ];
        }),
        events: events.flatMap((event) => {
          const parsed = asRecord(event);
          if (!parsed || typeof parsed.id !== "string") return [];
          return [
            {
              id: parsed.id,
              action: typeof parsed.action === "string" ? parsed.action : "",
              fromStatus: typeof parsed.from_status === "string" ? parsed.from_status : "",
              toStatus: typeof parsed.to_status === "string" ? parsed.to_status : "",
              createdAt: typeof parsed.created_at === "string" ? parsed.created_at : null,
            },
          ];
        }),
      },
    ];
  });
}
