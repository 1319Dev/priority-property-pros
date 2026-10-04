import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Container, SectionHeading } from "../../components/ui/Container";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import type { PublicPlatformReview } from "../../lib/marketplace/platformReviews";
import { PLATFORM_REVIEWS_NOT_GOOGLE } from "../../lib/marketplace/platformReviews";
import { fetchApprovedPlatformReviews } from "../../lib/marketplace/platformReviewsApi";
import { PlatformReviewCard } from "../reviews/ReviewCard";

export function HomePlatformReviews() {
  const configured = isSupabaseConfigured();
  const [reviews, setReviews] = useState<PublicPlatformReview[]>([]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void fetchApprovedPlatformReviews(3)
      .then((rows) => {
        if (!cancelled) setReviews(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.warn("Platform reviews could not be loaded", err);
          setReviews([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  if (!configured || reviews.length === 0) return null;

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
        <ul className="mt-8 grid gap-4 lg:grid-cols-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <PlatformReviewCard review={review} />
            </li>
          ))}
        </ul>
        <p className="mt-6">
          <Link to="/reviews" className="min-h-11 inline-flex items-center font-semibold text-forest-800 underline">
            All reviews
          </Link>
        </p>
      </Container>
    </section>
  );
}
