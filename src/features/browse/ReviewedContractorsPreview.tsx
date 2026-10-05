import { Link } from "react-router-dom";
import { formatPublicRating, liveContractorPath } from "../../lib/marketplace/publicDirectory";
import {
  REVIEWED_PROS_EMPTY_BODY,
  REVIEWED_PROS_EMPTY_COMPACT,
  REVIEWED_PROS_EMPTY_TITLE,
} from "../../lib/marketplace/reviewedContractors";
import type { ReviewedContractorCard } from "../../lib/marketplace/reviewedContractorsApi";

export function ReviewedContractorsEmpty({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-forest-800/20 bg-cream-100/70 px-5 py-6">
      <p className="font-display text-2xl text-forest-800">{REVIEWED_PROS_EMPTY_TITLE}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-700">
        {compact ? REVIEWED_PROS_EMPTY_COMPACT : REVIEWED_PROS_EMPTY_BODY}
      </p>
      <p className="mt-4">
        <Link to="/post-project" className="min-h-11 inline-flex items-center font-semibold text-forest-800 underline">
          Post a project
        </Link>
      </p>
    </div>
  );
}

export function ReviewedContractorCardView({ card }: { card: ReviewedContractorCard }) {
  const rating = formatPublicRating(card.ratingAverage, card.ratingCount);
  const categories = card.categories.length > 0 ? ` · ${card.categories.join(" • ")}` : "";
  return (
    <article className="rounded-3xl border border-forest-800/10 bg-cream-50 p-4">
      <h3 className="font-display text-xl font-semibold text-forest-800">{card.displayLabel}</h3>
      <p className="mt-1 text-sm text-ink-700">
        {card.serviceArea}
        {categories}
      </p>
      {rating ? <p className="mt-2 text-sm font-medium text-forest-800">{rating}</p> : null}
      <p className="mt-2 text-sm leading-relaxed text-ink-700">{card.shortDescription}</p>
      <ul className="mt-3 space-y-2">
        {card.reviews.map((review) => (
          <li key={review.id} className="rounded-2xl bg-cream-100 px-3 py-3 text-sm text-ink-700">
            <p className="font-semibold text-forest-800">★ {review.rating.toFixed(1)}</p>
            <p className="mt-1">{review.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3">
        <Link
          to={liveContractorPath(card.id)}
          className="min-h-11 inline-flex items-center text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-forest-800"
        >
          Read review
        </Link>
      </p>
    </article>
  );
}

export function ReviewedContractorsList({
  cards,
  failed = false,
  loading,
  compactEmpty = false,
  onRetry,
}: {
  cards: ReviewedContractorCard[];
  failed?: boolean;
  loading: boolean;
  compactEmpty?: boolean;
  onRetry?: () => void;
}) {
  const showEmpty = !loading && cards.length === 0;
  return (
    <div>
      {loading ? <p className="text-sm text-ink-700">Loading reviewed contractors…</p> : null}
      {showEmpty ? <ReviewedContractorsEmpty compact={compactEmpty} /> : null}
      {showEmpty && failed && onRetry ? (
        <p className="mt-3">
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 inline-flex items-center text-sm font-semibold text-forest-800 underline"
          >
            Try again
          </button>
        </p>
      ) : null}
      {cards.length > 0 ? (
        <ul className="space-y-3">
          {cards.map((card) => (
            <li key={card.id}>
              <ReviewedContractorCardView card={card} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
