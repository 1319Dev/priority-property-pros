import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CUSTOMER_CTA, CUSTOMER_TAGLINE, CONTRACTOR_CTA } from "../../data/brand";
import { HOMEPAGE_SIGNUP_HEADLINE, HOMEPAGE_SIGNUP_SUPPORTING, SIGNUP_FEE_SHORT } from "../../data/pricing";
import { PROJECT_PLACEHOLDERS } from "../../data/services";
import { ButtonLink } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";
import { HERO_ART_VIEWBOX, HERO_TAGLINE } from "../../lib/marketplace/heroLayout";

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
    <section className="relative overflow-x-hidden border-b border-forest-800/10">
      <Container className="grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
            Local home services marketplace
          </p>
          <h1 className="mt-4 font-display text-[2.1rem] leading-[1.12] font-semibold tracking-tight text-forest-800 sm:text-5xl lg:text-6xl">
            {CUSTOMER_TAGLINE.split(". ").map((part, index, all) => (
              <span key={part} className="block">
                {index === all.length - 1 ? part : `${part}.`}
              </span>
            ))}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-700">
            Tell us what needs doing. Independent local contractors compete fairly for the work.
            You hire. They perform. Priority Property Pros is the place — not the crew.
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
          <p className="mt-3 text-sm text-ink-500">{SIGNUP_FEE_SHORT}. Not a monthly subscription.</p>
          <form
            className="mt-8 rounded-3xl border border-forest-800/10 bg-cream-50/80 p-3 shadow-[0_18px_50px_-28px_rgba(16,36,28,0.45)]"
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
                className="min-h-14 min-w-0 flex-1 rounded-2xl border border-forest-800/10 bg-cream-100 px-4 text-base text-ink-900 placeholder:text-ink-500"
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
        <HeroArt />
      </Container>
    </section>
  );
}

function HeroArt() {
  return (
    <figure className="relative mx-auto w-full min-w-0 max-w-md">
      <div className="flex h-auto flex-col rounded-[1.75rem] bg-forest-800 p-4 sm:p-5">
        <div className="overflow-hidden rounded-[1.15rem] bg-cream-50 px-3 pt-5 pb-3 sm:px-4">
          <svg viewBox={HERO_ART_VIEWBOX} className="h-auto w-full" role="img" aria-label="House illustration">
            <title>House illustration</title>
            <path d="M40 108 L140 38 L240 108" fill="none" stroke="#C9A227" strokeWidth="10" strokeLinejoin="round" />
            <path d="M64 104 V168 H216 V104" fill="none" stroke="#1A3C2E" strokeWidth="8" strokeLinejoin="round" />
            <path d="M104 168 V122 M140 168 V112 M176 168 V122" stroke="#A6851F" strokeWidth="8" strokeLinecap="round" />
            <circle cx="236" cy="36" r="16" fill="#E0C078" />
          </svg>
        </div>
        <figcaption className="mt-4 px-1 text-center text-[0.68rem] font-semibold uppercase leading-snug tracking-[0.14em] text-cream-100 sm:text-[0.75rem] sm:tracking-[0.18em]">
          {HERO_TAGLINE}
        </figcaption>
      </div>
    </figure>
  );
}
