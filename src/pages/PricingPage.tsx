import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CONTRACTOR_CTA, CUSTOMER_CTA } from "../data/brand";
import {
  CONTRACTOR_SIGNUP_HEADLINE,
  CONTRACTOR_SIGNUP_SUPPORTING,
  FEE_WHEN_HIRED_SENTENCE,
  FREE_PLAN_DETAIL,
  FREE_PLAN_NAME,
  FREE_PLAN_PRICE,
  HOMEOWNER_PRICING_SUMMARY,
  HOMEPAGE_SIGNUP_HEADLINE,
  ORIGINAL_FEE_BRACKETS_PUBLIC,
  ORIGINAL_FEE_INTRO,
  ORIGINAL_MAX_FEE,
  ORIGINAL_MIN_FEE,
  PRICING_FAQ,
  PRICING_PAGE_INTRO,
  PRICING_PAGE_TITLE,
  PRIORITY_PRO_DETAIL,
  PRIORITY_PRO_FEE_RATE,
  PRIORITY_PRO_NAME,
  PRIORITY_PRO_PRICE_MONTH,
  PRIORITY_PRO_PRICE_YEAR,
  NO_PAY_TO_WIN,
  PLAN_COMPARISON,
  PRIORITY_PRO_STATUS,
  PRO_PRICING_SUMMARY,
  CONTRACTOR_VALUE_HEADLINE,
  CONTRACTOR_VALUE_POINTS,
  REPEAT_FEE_INTRO,
  REPEAT_FEE_RATE,
  REPEAT_MAX_FEE,
  REPEAT_MIN_FEE,
  SIGNUP_FEE,
  SIGNUP_FEE_NOT_MONTHLY,
  SIGNUP_FEE_SHORT,
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
        <p className="mt-3 font-semibold text-forest-800">{CONTRACTOR_VALUE_HEADLINE}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-700">
          {CONTRACTOR_VALUE_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        <div className="mt-8 rounded-3xl bg-forest-800 px-5 py-6 text-cream-50 sm:px-7">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-300">
            Everyone
          </p>
          <p className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{SIGNUP_FEE}</p>
          <p className="mt-1 text-lg font-semibold text-gold-300">One-time signup fee</p>
          <p className="mt-3 text-sm leading-relaxed text-cream-200">{SIGNUP_FEE_NOT_MONTHLY}</p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-6">
            <h2 className="font-display text-2xl text-forest-800">For homeowners</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{HOMEOWNER_PRICING_SUMMARY}</p>
            <p className="mt-4 text-sm font-semibold text-forest-800">{HOMEPAGE_SIGNUP_HEADLINE}</p>
          </article>
          <article className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-6">
            <h2 className="font-display text-2xl text-forest-800">For pros</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{PRO_PRICING_SUMMARY}</p>
            <p className="mt-4 text-sm font-semibold text-forest-800">{CONTRACTOR_SIGNUP_HEADLINE}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">{CONTRACTOR_SIGNUP_SUPPORTING}</p>
          </article>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-6">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
              Contractor plans
            </p>
            <h2 className="mt-2 font-display text-2xl text-forest-800">
              {FREE_PLAN_NAME} · {FREE_PLAN_PRICE}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{FREE_PLAN_DETAIL}</p>
          </article>
          <article className="rounded-3xl border border-dashed border-gold-600/50 bg-cream-100 px-5 py-6">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
              {PRIORITY_PRO_STATUS}
            </p>
            <h2 className="mt-2 font-display text-2xl text-forest-800">{PRIORITY_PRO_NAME}</h2>
            <p className="mt-2 text-sm font-semibold text-forest-800">
              {PRIORITY_PRO_PRICE_MONTH} or {PRIORITY_PRO_PRICE_YEAR} · {PRIORITY_PRO_FEE_RATE} marketplace fee
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{PRIORITY_PRO_DETAIL}</p>
          </article>
        </div>

        <div className="mt-4 overflow-x-auto rounded-3xl border border-forest-800/10 bg-cream-50">
          <table className="min-w-full text-left text-sm">
            <caption className="px-5 pt-5 text-left font-display text-2xl text-forest-800">
              Free vs Priority Pro
            </caption>
            <thead>
              <tr className="border-b border-forest-800/10">
                <th className="px-5 py-3 font-semibold">Compare</th>
                <th className="px-5 py-3 font-semibold">Free</th>
                <th className="px-5 py-3 font-semibold">Priority Pro</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON.map((row) => (
                <tr key={row.feature} className="border-b border-forest-800/5 last:border-0">
                  <th className="px-5 py-3 align-top font-medium text-ink-700">{row.feature}</th>
                  <td className="px-5 py-3 align-top text-ink-700">{row.free}</td>
                  <td className="px-5 py-3 align-top text-ink-700">{row.priorityPro}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-4 text-sm text-ink-700">{NO_PAY_TO_WIN}</p>
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

        <div className="mt-10">
          <h2 className="font-display text-2xl text-forest-800 sm:text-3xl">Pricing FAQ</h2>
          <dl className="mt-5 space-y-4">
            {PRICING_FAQ.map((item) => (
              <div key={item.question} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-5">
                <dt className="font-semibold text-forest-800">{item.question}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-ink-700">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/post-project">{CUSTOMER_CTA}</ButtonLink>
          <ButtonLink to="/become-a-pro" variant="outline">
            {CONTRACTOR_CTA}
          </ButtonLink>
        </div>
        <p className="mt-4 text-sm text-ink-500">{SIGNUP_FEE_SHORT}. Not a monthly subscription.</p>
      </Container>
    </section>
  );
}
