import {
  NEW_ON_PPP,
  NO_REVIEWS_YET,
  VERIFIED_PPP_BADGE,
  decisionRatingLines,
  ratingDistribution,
} from "../../lib/marketplace/contractorReviews";
import type { ReviewedContractorSnippet } from "../../lib/marketplace/reviewedContractors";

function reviewDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function PublicReviewSection({
  reviews,
  average,
  count,
}: {
  reviews: ReviewedContractorSnippet[];
  average: number | null;
  count: number;
}) {
  const lines = decisionRatingLines(average, count);
  const distribution = ratingDistribution(reviews);
  return (
    <section id="reviews" aria-labelledby="contractor-reviews-heading" className="max-w-full">
      <h2 id="contractor-reviews-heading" className="font-display text-2xl text-forest-800">
        Reviews
      </h2>
      {lines.hasRating ? (
        <p className="mt-2 text-sm font-medium text-forest-800">{lines.primary}</p>
      ) : (
        <p className="mt-2 text-sm text-ink-700">
          {NO_REVIEWS_YET} {NEW_ON_PPP}
        </p>
      )}
      {lines.hasRating ? (
        <ul className="mt-3 space-y-1 text-sm text-ink-700" aria-label="Rating distribution">
          {([5, 4, 3, 2, 1] as const).map((star) => (
            <li key={star}>
              {star} star{star === 1 ? "" : "s"}, {distribution[star]} {distribution[star] === 1 ? "review" : "reviews"}
            </li>
          ))}
        </ul>
      ) : null}
      {reviews.length === 0 ? null : (
        <ul className="mt-3 space-y-3">
          {reviews.map((review) => {
            const when = reviewDate(review.createdAt);
            const responseWhen = reviewDate(review.responseUpdatedAt ?? review.responseCreatedAt);
            return (
              <li key={review.id} className="max-w-full rounded-3xl bg-cream-100 px-4 py-3 text-sm">
                <p className="font-semibold text-forest-800">★ {review.rating.toFixed(1)}</p>
                {review.verified !== false ? (
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{VERIFIED_PPP_BADGE}</p>
                ) : null}
                <p className="mt-1">{review.body}</p>
                <p className="mt-2 text-ink-500">
                  {review.homeownerDisplay || "Homeowner"}
                  {review.category ? ` · ${review.category}` : ""}
                  {when ? ` · ${when}` : ""}
                </p>
                {review.responseBody ? (
                  <p className="mt-3 border-t border-forest-800/10 pt-3 text-ink-700">
                    <span className="font-semibold text-forest-800">Response from the pro</span>
                    {responseWhen ? <span className="text-ink-500"> · {responseWhen}</span> : null}
                    <span className="mt-1 block">{review.responseBody}</span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
