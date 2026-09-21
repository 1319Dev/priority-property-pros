import { Link } from "react-router-dom";
import type { PublicPlatformReview } from "../../lib/marketplace/platformReviews";
import { starsLabel } from "../../lib/marketplace/platformReviews";

export function StarRating({ rating, className = "" }: { rating: number; className?: string }) {
  const value = Math.min(5, Math.max(1, Math.round(rating)));
  return (
    <p className={`font-semibold text-gold-600 ${className}`} aria-label={starsLabel(value)}>
      <span aria-hidden="true">{"★".repeat(value)}{"☆".repeat(5 - value)}</span>
    </p>
  );
}

export function PlatformReviewCard({ review }: { review: PublicPlatformReview }) {
  const when = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
    new Date(review.created_at),
  );
  const place = review.city ? ` · ${review.city}` : "";
  return (
    <article className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-5">
      <StarRating rating={review.rating} />
      <p className="mt-3 text-sm leading-relaxed text-ink-700">{review.body}</p>
      <p className="mt-4 text-sm font-semibold text-forest-800">
        {review.display_name}
        <span className="font-normal text-ink-500">
          {place} · {when}
        </span>
      </p>
    </article>
  );
}

export function ReviewsEmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-forest-800/20 bg-cream-100/70 px-5 py-6">
      <p className="font-display text-2xl text-forest-800">Be the first to review.</p>
      {compact ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          Signed-in customers and pros can share how the marketplace worked for them.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          Reviews come from signed-in Priority Property Pros accounts. They are not Google reviews and they are not
          invented testimonials.
        </p>
      )}
      <p className="mt-4">
        <Link to="/reviews" className="min-h-11 inline-flex items-center font-semibold text-forest-800 underline">
          Leave a review
        </Link>
      </p>
    </div>
  );
}
