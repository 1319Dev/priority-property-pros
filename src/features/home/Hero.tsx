import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CUSTOMER_CTA, CUSTOMER_TAGLINE, CONTRACTOR_CTA, MARKETPLACE_NEED_LINE } from "../../data/brand";
import { HOMEPAGE_SIGNUP_HEADLINE, HOMEPAGE_SIGNUP_SUPPORTING, SIGNUP_FEE_PUBLIC_NOTE } from "../../data/pricing";
import { PROJECT_PLACEHOLDERS } from "../../data/services";
import { MarketingPhoto } from "../../components/media/MarketingPhoto";
import { ButtonLink } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";
import { MARKETING_SECTION_PHOTOS } from "../../data/marketingPhotos";
import { HERO_PHOTO_FRAME_CLASS, HERO_PHOTO_OBJECT_POSITION, HERO_TAGLINE } from "../../lib/marketplace/heroLayout";

export function Hero() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PROJECT_PLACEHOLDERS.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="relative overflow-x-hidden border-b border-forest-800/10 bg-cream-50">
      <Container className="grid items-start gap-8 py-8 sm:py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-14">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">{HERO_TAGLINE}</p>
          <h1 className="mt-4 font-display text-[2.1rem] leading-[1.12] font-semibold tracking-tight text-forest-800 sm:text-5xl lg:text-6xl">
            {CUSTOMER_TAGLINE.split(". ").map((part, index, all) => (
              <span key={part} className="block">
                {index === all.length - 1 ? part : `${part}.`}
              </span>
            ))}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-700">
            {MARKETPLACE_NEED_LINE} Independent local contractors compete fairly. You hire. They perform. Priority
            Property Pros is the place — not the crew.
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-700">
            {HOMEPAGE_SIGNUP_HEADLINE} {HOMEPAGE_SIGNUP_SUPPORTING}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/post-project" size="lg">
              {CUSTOMER_CTA}
            </ButtonLink>
            <ButtonLink to="/become-a-pro" variant="outline" size="lg">
              {CONTRACTOR_CTA}
            </ButtonLink>
          </div>
          <p className="mt-3 text-sm text-ink-500">{SIGNUP_FEE_PUBLIC_NOTE}</p>
          <form
            className="mt-8 rounded-3xl border border-forest-800/10 bg-cream-100/80 p-3 shadow-[0_18px_50px_-28px_rgba(16,36,28,0.45)]"
            onSubmit={(event) => {
              event.preventDefault();
              const params = new URLSearchParams();
              if (query.trim()) params.set("q", query.trim());
              navigate({ pathname: "/post-project", search: params.toString() });
            }}
          >
            <label htmlFor="need-done" className="px-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-700">
              What do you need done?
            </label>
            <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
              <input
                id="need-done"
                name="need"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={PROJECT_PLACEHOLDERS[placeholderIndex]}
                className="min-h-14 min-w-0 flex-1 rounded-2xl border border-forest-800/10 bg-cream-50 px-4 text-base text-ink-900 placeholder:text-ink-500"
                autoComplete="off"
              />
              <button
                type="submit"
                className="min-h-14 shrink-0 rounded-2xl bg-forest-800 px-5 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-cream-50"
              >
                Continue
              </button>
            </div>
          </form>
        </div>
        <figure className="relative mx-auto w-full min-w-0 max-w-md lg:justify-self-end">
          <div className={HERO_PHOTO_FRAME_CLASS}>
            <MarketingPhoto
              photo={MARKETING_SECTION_PHOTOS.homepageHero}
              eager
              sizes="(min-width: 1024px) 380px, 90vw"
              objectPosition={HERO_PHOTO_OBJECT_POSITION}
              className="h-full w-full"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-forest-950/55 via-forest-950/10 to-transparent"
              aria-hidden="true"
            />
            <figcaption className="absolute inset-x-0 bottom-0 px-4 pb-3 text-[0.68rem] font-semibold uppercase leading-snug tracking-[0.14em] text-cream-50 sm:text-[0.75rem]">
              {HERO_TAGLINE}
            </figcaption>
          </div>
        </figure>
      </Container>
    </section>
  );
}
