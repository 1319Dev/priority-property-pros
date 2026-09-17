import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CONTRACTOR_CTA, CUSTOMER_CTA } from "../data/brand";
import {
  FEE_WHEN_HIRED_SENTENCE,
  FREE_PLAN_MONTHLY,
  HOMEOWNER_PRICING_SUMMARY,
  ORIGINAL_FEE_BRACKETS_PUBLIC,
  ORIGINAL_FEE_INTRO,
  ORIGINAL_MAX_FEE,
  ORIGINAL_MIN_FEE,
  PRIORITY_PRO_FEE_INTRO,
  PRIORITY_PRO_MONTHLY,
  PRIORITY_PRO_YEARLY,
  PRICING_PAGE_INTRO,
  PRICING_PAGE_TITLE,
  PRO_PRICING_SUMMARY,
  REPEAT_FEE_INTRO,
  REPEAT_FEE_RATE,
  REPEAT_MAX_FEE,
  REPEAT_MIN_FEE,
} from "../data/pricing";

export function PricingPage() {
  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Pricing</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">
          {PRICING_PAGE_TITLE}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{PRICING_PAGE_INTRO}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <article className="rounded-3xl bg-forest-800 px-5 py-6 text-cream-50">
            <h2 className="font-display text-2xl">For homeowners</h2>
            <p className="mt-2 text-sm leading-relaxed text-cream-200">{HOMEOWNER_PRICING_SUMMARY}</p>
          </article>
          <article className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-6">
            <h2 className="font-display text-2xl text-forest-800">For pros</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{PRO_PRICING_SUMMARY}</p>
          </article>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-6">
            <h2 className="font-display text-2xl text-forest-800">Free contractor plan</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">
              {FREE_PLAN_MONTHLY} after the $9.99 signup fee. Sliding marketplace fee on first-time jobs. 2% on
              hire-again jobs.
            </p>
          </article>
          <article className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-6">
            <h2 className="font-display text-2xl text-forest-800">Priority Pro</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">
              Still requires $9.99 to start. Then {PRIORITY_PRO_MONTHLY} or {PRIORITY_PRO_YEARLY}.{" "}
              {PRIORITY_PRO_FEE_INTRO}
            </p>
          </article>
        </div>

        <div className="mt-10 rounded-3xl border border-forest-800/10 bg-cream-50 p-5 sm:p-7">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
            First job with a pro
          </p>
          <h2 className="mt-2 font-display text-2xl text-forest-800 sm:text-3xl">Original marketplace fee</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-700 sm:text-base">{ORIGINAL_FEE_INTRO}</p>
          <ul className="mt-5 space-y-2">
            {ORIGINAL_FEE_BRACKETS_PUBLIC.map((bracket) => (
              <li
                key={bracket.range}
                className="flex min-h-12 items-center justify-between gap-4 rounded-2xl bg-cream-100 px-4 py-3 text-sm sm:text-base"
              >
                <span className="text-ink-700">{bracket.range}</span>
                <span className="font-semibold text-forest-800">{bracket.rate}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-ink-700">
            Minimum {ORIGINAL_MIN_FEE}. Maximum {ORIGINAL_MAX_FEE}.
          </p>
        </div>

        <div className="mt-4 rounded-3xl border border-forest-800/10 bg-cream-50 p-5 sm:p-7">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
            Hire again
          </p>
          <h2 className="mt-2 font-display text-2xl text-forest-800 sm:text-3xl">Repeat marketplace fee</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-700 sm:text-base">{REPEAT_FEE_INTRO}</p>
          <p className="mt-5 flex min-h-12 items-center justify-between gap-4 rounded-2xl bg-cream-100 px-4 py-3 text-sm sm:text-base">
            <span className="text-ink-700">Flat rate</span>
            <span className="font-semibold text-forest-800">{REPEAT_FEE_RATE}</span>
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink-700">
            Minimum {REPEAT_MIN_FEE}. Maximum {REPEAT_MAX_FEE}.
          </p>
        </div>

        <p className="mt-6 text-base leading-relaxed text-ink-700">{FEE_WHEN_HIRED_SENTENCE}</p>

        <div id="faq" className="mt-10 space-y-4">
          <h2 className="font-display text-2xl text-forest-800">FAQ</h2>
          <p className="text-sm leading-relaxed text-ink-700">
            Is signup free? No. Customers and contractors pay $9.99 once to activate an account.
          </p>
          <p className="text-sm leading-relaxed text-ink-700">
            Do homeowners pay a monthly fee or a PPP marketplace fee when hiring? No.
          </p>
          <p className="text-sm leading-relaxed text-ink-700">
            Does paying $9.99 approve a contractor? No. Admin approval and verification are separate.
          </p>
          <p className="text-sm leading-relaxed text-ink-700">
            Are job payments live? No. The $9.99 signup fee is isolated from homeowner-to-contractor job payments.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/post-project">{CUSTOMER_CTA}</ButtonLink>
          <ButtonLink to="/become-a-pro" variant="outline">
            {CONTRACTOR_CTA}
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
