import { detectContactLeak } from "./contactLeak";

const RATING_ONLY_WORDS = new Set([
  "star",
  "stars",
  "rating",
  "ratings",
  "score",
  "scores",
  "negative",
  "low",
  "bad",
  "poor",
  "one",
  "two",
  "three",
  "1",
  "2",
  "3",
  "because",
  "of",
  "the",
  "a",
  "an",
  "only",
  "just",
  "too",
  "review",
  "reviews",
]);

export const BOOKING_REVIEW_REPORT_MIN = 3;
export const BOOKING_REVIEW_REPORT_MAX = 200;
export const BOOKING_REVIEW_MODERATION_MIN = 20;
export const BOOKING_REVIEW_MODERATION_MAX = 500;
export const BOOKING_REVIEW_RESPONSE_MIN = 20;
export const BOOKING_REVIEW_RESPONSE_MAX = 500;

export const HIDDEN_REVIEW_NOTE = "Hidden from the public profile. Both of you can still see it here.";
export const RESPONSE_HIDDEN_NOTE = "This response is hidden from the public profile.";
export const RATING_ONLY_HIDE_NOTE = "A review cannot be hidden only because of its rating.";
export const REPORT_RECEIVED_NOTE = "Report received. An admin reviews reports. Reporting does not hide the review.";
export const RESPONSE_CONTACT_NOTE =
  "A public response cannot include a phone number, email, link, or social handle.";

export function moderationReasonIsRatingOnly(reason: string): boolean {
  const words = reason
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !RATING_ONLY_WORDS.has(word));
  return words.join(" ").length < 12;
}

export function moderationReasonReady(reason: string): boolean {
  const trimmed = reason.trim();
  return (
    trimmed.length >= BOOKING_REVIEW_MODERATION_MIN &&
    trimmed.length <= BOOKING_REVIEW_MODERATION_MAX &&
    !moderationReasonIsRatingOnly(trimmed)
  );
}

export function reportReasonReady(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= BOOKING_REVIEW_REPORT_MIN && trimmed.length <= BOOKING_REVIEW_REPORT_MAX;
}

export function bookingReviewResponseError(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length < BOOKING_REVIEW_RESPONSE_MIN || trimmed.length > BOOKING_REVIEW_RESPONSE_MAX) {
    return `A public response must be ${BOOKING_REVIEW_RESPONSE_MIN} to ${BOOKING_REVIEW_RESPONSE_MAX} characters.`;
  }
  if (detectContactLeak(trimmed).blocked) return RESPONSE_CONTACT_NOTE;
  return null;
}
