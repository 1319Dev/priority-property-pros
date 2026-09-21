import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { TextInput } from "../components/ui/Input";
import { FormError } from "../lib/auth/AuthCard";
import { displayName } from "../lib/auth/roles";
import { useAuth } from "../lib/auth/useAuth";
import {
  PLATFORM_REVIEW_MAX_BODY,
  PLATFORM_REVIEWS_AUTH_REQUIRED,
  PLATFORM_REVIEWS_NOT_GOOGLE,
  type PublicPlatformReview,
} from "../lib/marketplace/platformReviews";
import {
  fetchApprovedPlatformReviews,
  fetchOwnPlatformReview,
  submitPlatformReview,
} from "../lib/marketplace/platformReviewsApi";
import { isSupabaseConfigured } from "../lib/supabase/config";
import { PlatformReviewCard, ReviewsEmptyState, StarRating } from "../features/reviews/ReviewCard";

export function ReviewsPage() {
  const configured = isSupabaseConfigured();
  const { user, profile } = useAuth();
  const [reviews, setReviews] = useState<PublicPlatformReview[]>([]);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [display, setDisplay] = useState("");
  const [city, setCity] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplay((current) => current || displayName(profile.first_name, profile.last_name, profile.email));
    }
  }, [profile]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void Promise.all([
      fetchApprovedPlatformReviews(50),
      user ? fetchOwnPlatformReview(user.id).catch(() => null) : Promise.resolve(null),
    ])
      .then(([rows, own]) => {
        if (cancelled) return;
        setReviews(rows);
        setAlreadyReviewed(Boolean(own));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load reviews.");
      });
    return () => {
      cancelled = true;
    };
  }, [configured, user]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const saved = await submitPlatformReview({
        viewerId: user?.id ?? null,
        draft: { display_name: display, city, rating, body },
      });
      setAlreadyReviewed(true);
      setSuccess("Thanks. Your review is now on the marketplace.");
      setReviews((current) => {
        if (current.some((row) => row.id === saved.id)) return current;
        const publicRow: PublicPlatformReview = {
          id: saved.id,
          display_name: saved.display_name,
          city: saved.city,
          rating: saved.rating,
          body: saved.body,
          created_at: saved.created_at,
        };
        return [publicRow, ...current];
      });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Reviews</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">
          Reviews of Priority Property Pros
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{PLATFORM_REVIEWS_NOT_GOOGLE}</p>

        <div className="mt-8 rounded-[1.75rem] border border-forest-800/10 bg-cream-50 px-5 py-6">
          <h2 className="font-display text-2xl text-forest-800">Leave a review</h2>
          {!user ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm leading-relaxed text-ink-700">{PLATFORM_REVIEWS_AUTH_REQUIRED}</p>
              {!configured ? (
                <p className="text-sm text-ink-700">Reviews need a connected marketplace before they can be published.</p>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <ButtonLink to="/sign-in">Sign in</ButtonLink>
                <ButtonLink to="/sign-up" variant="outline">
                  Create account
                </ButtonLink>
              </div>
            </div>
          ) : alreadyReviewed ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              You already left a review. Thank you — one review per account keeps this page honest.
            </p>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={(event) => void onSubmit(event)}>
              <fieldset>
                <legend className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
                  Stars
                </legend>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      className={`min-h-11 rounded-full px-3 text-sm font-semibold ${
                        rating === value
                          ? "bg-gold-500 text-forest-950"
                          : "border border-forest-800/15 bg-cream-100 text-forest-800"
                      }`}
                      aria-pressed={rating === value}
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <StarRating rating={rating} className="mt-2" />
              </fieldset>
              <TextInput
                label="Display name"
                name="display_name"
                value={display}
                onChange={(event) => setDisplay(event.target.value)}
                required
                maxLength={80}
              />
              <TextInput
                label="City (optional)"
                name="city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                maxLength={80}
              />
              <label className="block" htmlFor="review-body">
                <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
                  Your review
                </span>
                <textarea
                  id="review-body"
                  name="body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  required
                  minLength={20}
                  maxLength={PLATFORM_REVIEW_MAX_BODY}
                  rows={5}
                  className="min-h-32 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 py-3 text-base text-ink-900"
                />
                <span className="mt-1.5 block text-sm text-ink-500">
                  {body.trim().length}/{PLATFORM_REVIEW_MAX_BODY} characters. At least 20.
                </span>
              </label>
              <FormError message={formError} />
              {success ? <p className="text-sm font-semibold text-forest-800">{success}</p> : null}
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Publish review"}
              </Button>
            </form>
          )}
        </div>

        <div className="mt-10">
          <h2 className="font-display text-2xl text-forest-800">Latest reviews</h2>
          {error ? <p className="mt-3 text-sm text-danger-600">{error}</p> : null}
          <div className="mt-4 space-y-4">
            {reviews.length === 0 ? (
              <ReviewsEmptyState />
            ) : (
              reviews.map((review) => <PlatformReviewCard key={review.id} review={review} />)
            )}
          </div>
        </div>
        <p className="mt-8 text-sm">
          <Link to="/faq" className="font-semibold text-forest-800 underline">
            Read the FAQ
          </Link>
        </p>
      </Container>
    </section>
  );
}
