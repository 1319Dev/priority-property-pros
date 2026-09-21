import { detectContactLeak } from "./contactLeak";

export const PLATFORM_REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type PlatformReviewStatus = (typeof PLATFORM_REVIEW_STATUSES)[number];

export const PLATFORM_REVIEW_MIN_BODY = 20;
export const PLATFORM_REVIEW_MAX_BODY = 1000;
export const PLATFORM_REVIEW_MIN_NAME = 2;
export const PLATFORM_REVIEW_MAX_NAME = 80;
export const PLATFORM_REVIEW_MAX_CITY = 80;
export const PLATFORM_REVIEWS_EMPTY_COPY = "Be the first to review.";
export const PLATFORM_REVIEWS_AUTH_REQUIRED = "Sign in to leave a review of Priority Property Pros.";
export const PLATFORM_REVIEWS_NOT_GOOGLE =
  "These are reviews of the Priority Property Pros marketplace from signed-in users. They are not Google reviews.";

export type PlatformReview = {
  id: string;
  user_id: string;
  display_name: string;
  city: string | null;
  rating: number;
  body: string;
  status: PlatformReviewStatus;
  created_at: string;
};

export type PublicPlatformReview = Pick<
  PlatformReview,
  "id" | "display_name" | "city" | "rating" | "body" | "created_at"
>;

export type PlatformReviewDraft = {
  display_name: string;
  city?: string | null;
  rating: number;
  body: string;
};

export function isPlatformReviewStatus(value: string): value is PlatformReviewStatus {
  return (PLATFORM_REVIEW_STATUSES as readonly string[]).includes(value);
}

export function trimReviewField(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function validatePlatformReviewDraft(draft: PlatformReviewDraft): string | null {
  const name = trimReviewField(draft.display_name);
  const body = trimReviewField(draft.body);
  const city = trimReviewField(draft.city);
  const rating = Number(draft.rating);

  if (name.length < PLATFORM_REVIEW_MIN_NAME || name.length > PLATFORM_REVIEW_MAX_NAME) {
    return "Display name must be between 2 and 80 characters.";
  }
  if (body.length < PLATFORM_REVIEW_MIN_BODY || body.length > PLATFORM_REVIEW_MAX_BODY) {
    return `Review must be between ${PLATFORM_REVIEW_MIN_BODY} and ${PLATFORM_REVIEW_MAX_BODY} characters.`;
  }
  if (city && (city.length < 2 || city.length > PLATFORM_REVIEW_MAX_CITY)) {
    return "City must be between 2 and 80 characters, or left blank.";
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return "Choose a rating from 1 to 5 stars.";
  }

  for (const field of [name, body, city]) {
    const leak = detectContactLeak(field);
    if (leak.blocked) {
      return "Please keep phone numbers, emails, and links out of platform reviews.";
    }
  }

  return null;
}

export function normalizePlatformReviewDraft(draft: PlatformReviewDraft): {
  display_name: string;
  city: string | null;
  rating: number;
  body: string;
} {
  const city = trimReviewField(draft.city);
  return {
    display_name: trimReviewField(draft.display_name),
    city: city || null,
    rating: Number(draft.rating),
    body: trimReviewField(draft.body),
  };
}

export function canSelectPlatformReview(input: {
  status: PlatformReviewStatus;
  viewerId: string | null;
  viewerIsAdmin: boolean;
  rowUserId: string;
}): boolean {
  if (input.status === "APPROVED") return true;
  if (input.viewerIsAdmin) return true;
  return Boolean(input.viewerId) && input.viewerId === input.rowUserId;
}

export function canInsertPlatformReview(input: { viewerId: string | null }): boolean {
  return Boolean(input.viewerId);
}

export function canModeratePlatformReview(input: { viewerIsAdmin: boolean }): boolean {
  return input.viewerIsAdmin;
}

export function canEditOthersPlatformReview(input: {
  viewerId: string | null;
  rowUserId: string;
  viewerIsAdmin: boolean;
}): boolean {
  if (input.viewerIsAdmin) return true;
  return false;
}

export function starsLabel(rating: number): string {
  const safe = Math.min(5, Math.max(1, Math.round(rating)));
  return `${safe} out of 5 stars`;
}
