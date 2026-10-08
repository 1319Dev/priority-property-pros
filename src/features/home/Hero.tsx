import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CUSTOMER_CTA, CUSTOMER_TAGLINE, CONTRACTOR_CTA, MARKETPLACE_NEED_LINE } from "../../data/brand";
import { HOMEPAGE_SIGNUP_HEADLINE, HOMEPAGE_SIGNUP_SUPPORTING, JOB_PAYMENT_PLAIN, SIGNUP_FEE_PUBLIC_NOTE } from "../../data/pricing";
import { useHidePlatformPricing } from "../../lib/auth/platformPricing";
import { PROJECT_PLACEHOLDERS } from "../../data/services";
import { TrustMarkList } from "../../components/brand/TrustMarks";
import { ContractorEntryLink } from "../../components/layout/PublicCtas";
import { PostProjectLink } from "../../components/layout/PostProjectLink";
import { Container } from "../../components/ui/Container";
import { authAwarePostPath } from "../../lib/auth/publicEntry";
import { useAuth } from "../../lib/auth/useAuth";
import { HERO_TAGLINE } from "../../lib/marketplace/heroLayout";
import { HeroBanner } from "./HeroBanner";

export function Hero() {
  const navigate = useNavigate();
  const { loading, account_type } = useAuth();
  const hidePricing = useHidePlatformPricing();
  const [query, setQuery] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PROJECT_PLACEHOLDERS.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="relative border-b border-forest-800/10 bg-cream-50">
      <HeroBanner />
      <Container className="py-8 sm:py-12 lg:py-14">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">{HERO_TAGLINE}</p>
          <h1 className="mt-4 max-w-full text-balance font-display text-[2.1rem] leading-[1.12] font-semibold tracking-tight break-words text-forest-800 sm:text-4xl lg:text-5xl">
            {CUSTOMER_TAGLINE.split(". ").map((part, index, all) => (
              <span key={part} className="block">
                {index === all.length - 1 ? part : `${part}.`}
              </span>
            ))}
          </h1>
        </div>
        <div className="mt-5 min-w-0 max-w-3xl">
          <p className="max-w-xl text-lg leading-relaxed text-ink-700">
            {MARKETPLACE_NEED_LINE} Independent local contractors compete fairly. You hire. They perform. Priority
            Property Pros is the place — not the crew.
          </p>
          {hidePricing ? (
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-700">{JOB_PAYMENT_PLAIN}</p>
          ) : (
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-700">
              {HOMEPAGE_SIGNUP_HEADLINE} {HOMEPAGE_SIGNUP_SUPPORTING}
            </p>
          )}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <PostProjectLink to="/post-project" size="lg">
              {CUSTOMER_CTA}
            </PostProjectLink>
            <ContractorEntryLink to="/become-a-pro" variant="outline" size="lg">
              {CONTRACTOR_CTA}
            </ContractorEntryLink>
          </div>
          {hidePricing ? null : <p className="mt-3 text-sm text-ink-500">{SIGNUP_FEE_PUBLIC_NOTE}</p>}
          <div className="mt-6 max-w-3xl">
            <TrustMarkList />
          </div>
          <form
            className="mt-8 rounded-3xl border border-forest-800/10 bg-cream-100/80 p-3 shadow-[0_18px_50px_-28px_rgba(16,36,28,0.45)]"
            onSubmit={(event) => {
              event.preventDefault();
              const params = new URLSearchParams();
              if (query.trim()) params.set("q", query.trim());
              const search = params.toString();
              navigate(authAwarePostPath(search ? `/post-project?${search}` : "/post-project", { loading, accountType: account_type }));
            }}
          >
            <label htmlFor="need-done" className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-700">
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
      </Container>
    </section>
  );
}
