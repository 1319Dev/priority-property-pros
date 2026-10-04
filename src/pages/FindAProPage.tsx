import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MarketingPhoto } from "../components/media/MarketingPhoto";
import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CUSTOMER_CTA } from "../data/brand";
import { MARKETING_SECTION_PHOTOS } from "../data/marketingPhotos";
import { PRICING_PATH } from "../data/pricing";
import { ReviewedContractorsList } from "../features/browse/ReviewedContractorsPreview";
import { useReviewedContractors } from "../features/browse/useReviewedContractors";
import { applyPublicMeta, resolvePublicMeta } from "../data/publicSeo";
import { PublicReviewSection } from "../features/browse/PublicReviewSection";
import { formatPublicRating, isUuid, publicAboutText } from "../lib/marketplace/publicDirectory";
import { REVIEWED_PROS_INTRO, REVIEWED_PROS_PATH, REVIEWED_PROS_TITLE } from "../lib/marketplace/reviewedContractors";
import { loadReviewedContractor, type ReviewedContractorCard } from "../lib/marketplace/reviewedContractorsApi";
import { isSupabaseConfigured } from "../lib/supabase/config";
import { PUBLIC_FETCH_TIMEOUT_MS, withTimeout } from "../lib/withTimeout";

export function FindAProPage() {
  const { cards, failed, loading, retry } = useReviewedContractors();

  return (
    <section className="py-8 sm:py-12">
      <Container className="max-w-3xl">
        <div className="mb-8 h-52 w-full overflow-hidden rounded-3xl border border-forest-800/10 sm:h-64">
          <MarketingPhoto
            photo={MARKETING_SECTION_PHOTOS.findAProHeader}
            eager
            sizes="(max-width: 768px) 100vw, 672px"
          />
        </div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Reviewed pros</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">{REVIEWED_PROS_TITLE}</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-700 sm:text-lg">{REVIEWED_PROS_INTRO}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/post-project">{CUSTOMER_CTA}</ButtonLink>
          <ButtonLink to={PRICING_PATH} variant="outline">
            See pricing
          </ButtonLink>
        </div>
        <div className="mt-10">
          <ReviewedContractorsList cards={cards} failed={failed} loading={loading} onRetry={retry} />
        </div>
      </Container>
    </section>
  );
}

export function PublicContractorPage() {
  const { contractorId = "" } = useParams();
  const configured = isSupabaseConfigured();
  const [card, setCard] = useState<ReviewedContractorCard | null>(null);
  const [about, setAbout] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured && isUuid(contractorId));

  useEffect(() => {
    const meta = resolvePublicMeta(`/find-a-pro/${contractorId || "contractor"}`);
    applyPublicMeta({
      ...meta,
      title: card?.displayLabel ? `${card.displayLabel} | Priority Property Pros` : meta.title,
      canonicalPath: `/find-a-pro/${contractorId}`,
    });
  }, [card, contractorId]);

  useEffect(() => {
    if (!isUuid(contractorId) || !configured) {
      setLoading(false);
      setCard(null);
      return;
    }
    let cancelled = false;

    void withTimeout(loadReviewedContractor(contractorId), PUBLIC_FETCH_TIMEOUT_MS)
      .then((result) => {
        if (cancelled) return;
        setCard(result?.card ?? null);
        setAbout(result?.about ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.warn("Reviewed contractor could not be loaded", err);
          setError("This review could not be loaded. You can try again in a moment.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contractorId, configured]);

  if (loading) {
    return (
      <section className="py-8 sm:py-12">
        <Container className="max-w-xl">
          <p className="text-sm text-ink-700">Loading reviewed contractors…</p>
        </Container>
      </section>
    );
  }

  if (error || !card) {
    return (
      <section className="py-8 sm:py-12">
        <Container className="max-w-xl">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Reviewed pros</p>
          <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">No public review</h1>
          <p className="mt-4 text-base leading-relaxed text-ink-700">
            {error ??
              "This contractor does not have a customer review on Priority Property Pros. The public site does not list contractors you can message."}
          </p>
          <p className="mt-6">
            <Link to={REVIEWED_PROS_PATH} className="min-h-11 inline-flex items-center font-semibold text-forest-800 underline">
              Back to reviewed contractors
            </Link>
          </p>
        </Container>
      </section>
    );
  }

  const rating = formatPublicRating(card.ratingAverage, card.ratingCount);

  return (
    <section className="py-8 sm:py-12">
      <Container className="max-w-xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Reviewed pros</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">{card.displayLabel}</h1>
        <div className="mt-4 space-y-4 text-base leading-relaxed text-ink-700">
          <p>
            {card.serviceArea}
            {card.categories.length ? ` · ${card.categories.join(" • ")}` : ""}
          </p>
          {rating ? (
            <p className="font-medium text-forest-800">
              <a href="#reviews" className="underline">
                {rating}
              </a>
            </p>
          ) : (
            <p>No reviews yet. New on Priority Property Pros.</p>
          )}
          <p>{publicAboutText(about, card.shortDescription)}</p>
          <PublicReviewSection reviews={card.reviews} average={card.ratingAverage} count={card.ratingCount} />
          <p className="text-sm">{REVIEWED_PROS_INTRO}</p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/post-project">{CUSTOMER_CTA}</ButtonLink>
          <ButtonLink to={PRICING_PATH} variant="outline">
            See pricing
          </ButtonLink>
        </div>
        <p className="mt-6">
          <Link to={REVIEWED_PROS_PATH} className="min-h-11 inline-flex items-center font-semibold text-forest-800 underline">
            Back to reviewed contractors
          </Link>
        </p>
      </Container>
    </section>
  );
}
