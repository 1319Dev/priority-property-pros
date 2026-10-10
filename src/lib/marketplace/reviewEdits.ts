/**
 * Days after booking_reviews.created_at that the author may edit.
 * Must match platform_settings.booking_review_edit_window_days.
 * Negative means unlimited. 0 closes edits immediately.
 * The server setting is what rejects a late save; this constant hides the button.
 */
export const BOOKING_REVIEW_EDIT_WINDOW_DAYS = 30;

export function reviewEditClosesAt(
  createdAt: string,
  windowDays = BOOKING_REVIEW_EDIT_WINDOW_DAYS,
): Date | null {
  if (windowDays < 0) return null;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return null;
  return new Date(created + windowDays * 24 * 60 * 60 * 1000);
}

/** Editable through the close instant. Matches SQL `created_at + days < now()`. */
export function reviewIsEditable(
  createdAt: string,
  now = Date.now(),
  windowDays = BOOKING_REVIEW_EDIT_WINDOW_DAYS,
): boolean {
  const closes = reviewEditClosesAt(createdAt, windowDays);
  if (!closes) return windowDays < 0;
  return now <= closes.getTime();
}

export function formatReviewPostedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function reviewEditWindowNote(editable: boolean, windowDays = BOOKING_REVIEW_EDIT_WINDOW_DAYS): string {
  if (windowDays < 0) return "You can edit this review.";
  if (!editable) return `The ${windowDays}-day edit window has closed.`;
  return `You can edit this review for ${windowDays} days after you post it.`;
}
