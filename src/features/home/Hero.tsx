import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CUSTOMER_CTA, CUSTOMER_TAGLINE, CONTRACTOR_CTA } from "../../data/brand";
import { PROJECT_PLACEHOLDERS } from "../../data/services";
import { ButtonLink } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";

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
    <section className="relative overflow-hidden border-b border-forest-800/10">
      <Container className="grid items-center gap-10 py-5 sm:py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
            Local home services marketplace
          </p>
          <h1 className="mt-3 font-display text-[2.05rem] leading-[1.08] font-semibold tracking-tight text-forest-800 sm:mt-4 sm:text-5xl lg:text-6xl">
            {CUSTOMER_TAGLINE.split(". ").map((part, index, all) => (
              <span key={part} className="block">
                {index === all.length - 1 ? part : `${part}.`}
              </span>
            ))}
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-700 sm:mt-5 sm:text-lg">
            Independent local contractors compete fairly for the work. You hire. They perform.
            PPP is the place — not the crew.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:mt-7 sm:flex-row sm:gap-3">
            <ButtonLink to="/post-project">{CUSTOMER_CTA}</ButtonLink>
            <ButtonLink to="/become-a-pro" variant="outline">
              {CONTRACTOR_CTA}
            </ButtonLink>
          </div>
          <form
            className="mt-5 rounded-3xl border border-forest-800/10 bg-cream-50/80 p-3 shadow-[0_18px_50px_-28px_rgba(16,36,28,0.45)] sm:mt-8"
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
            <div className="mt-2 flex flex-row gap-2">
              <input
                id="need-done"
                name="need"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={PROJECT_PLACEHOLDERS[placeholderIndex]}
                className="min-h-12 min-w-0 flex-1 rounded-2xl border border-forest-800/10 bg-cream-100 px-3 text-base text-ink-900 placeholder:text-ink-500 sm:min-h-14 sm:px-4"
                autoComplete="off"
              />
              <button
                type="submit"
                className="min-h-12 shrink-0 rounded-2xl bg-forest-800 px-3 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-cream-50 sm:min-h-14 sm:min-w-36 sm:px-5 sm:text-[0.78rem]"
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
    <div className="relative mx-auto hidden w-full max-w-md lg:block" aria-hidden="true">
      <svg viewBox="0 0 360 340" className="h-auto w-full">
        <rect x="18" y="48" width="324" height="250" rx="28" fill="#1A3C2E" />
        <rect x="38" y="78" width="284" height="198" rx="18" fill="#FBF8F1" />
        <path d="M70 168 L180 88 L290 168" fill="none" stroke="#C9A227" strokeWidth="10" strokeLinejoin="round" />
        <path d="M96 164 V246 H264 V164" fill="none" stroke="#1A3C2E" strokeWidth="8" strokeLinejoin="round" />
        <path d="M140 246 V190 M180 246 V178 M220 246 V190" stroke="#A6851F" strokeWidth="8" strokeLinecap="round" />
        <circle cx="292" cy="72" r="18" fill="#E0C078" />
        <text x="44" y="300" fill="#F3EBDA" fontFamily="Georgia, serif" fontSize="13" letterSpacing="3">
          A MARKETPLACE, NOT A CREW
        </text>
      </svg>
    </div>
  );
}
