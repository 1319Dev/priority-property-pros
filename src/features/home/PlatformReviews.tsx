import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Container, SectionHeading } from "../../components/ui/Container";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import type { PublicPlatformReview } from "../../lib/marketplace/platformReviews";
import { PLATFORM_REVIEWS_NOT_GOOGLE } from "../../lib/marketplace/platformReviews";
import { fetchApprovedPlatformReviews } from "../../lib/marketplace/platformReviewsApi";
import { PlatformReviewCard, ReviewsEmptyState } from "../reviews/ReviewCard";

export function HomePlatformReviews() {
  const configured = isSupabaseConfigured();
  const [reviews, setReviews] = useState<PublicPlatformReview[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void fetchApprovedPlatformReviews(3)
      .then((rows) => {
        if (!cancelled) setReviews(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load reviews.");
      });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  return (
    <section className="border-t border-forest-800/10 py-14 sm:py-16" aria-labelledby="reviews-heading">
      <Container>
        <SectionHeading
          eyebrow="Reviews"
          title="What people say about the marketplace."
          kicker={PLATFORM_REVIEWS_NOT_GOOGLE}
        />
        <h2 id="reviews-heading" className="sr-only">
          Platform reviews
        </h2>
        {error ? <p className="mt-6 text-sm text-danger-600">{error}</p> : null}
        <div className="mt-8">
          {reviews.length === 0 ? (
            <ReviewsEmptyState compact />
          ) : (
            <ul className="grid gap-4 lg:grid-cols-3">
              {reviews.map((review) => (
                <li key={review.id}>
                  <PlatformReviewCard review={review} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-6">
          <Link to="/reviews" className="min-h-11 inline-flex items-center font-semibold text-forest-800 underline">
            All reviews
          </Link>
        </p>
      </Container>
    </section>
  );
}
