import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CONTRACTOR_CTA, CUSTOMER_CTA } from "../data/brand";
import {
  CONNECTION_FEE,
  CONNECTION_FEE_NO_HIRE_GUARANTEE,
  CONNECTION_FEE_PER_LABEL,
  CONTRACTOR_SIGNUP_HEADLINE,
  HOMEOWNER_BUSINESS_HEADING,
  HOMEOWNER_PRICING_SUMMARY,
  MONTHLY_PRICE,
  PRICING_FAQ,
  PRICING_PAGE_INTRO,
  PRICING_PAGE_TITLE,
  PRICING_PRIMARY,
  PRICING_SECONDARY,
  PRO_PRICING_SUMMARY,
  SIGNUP_FEE,
  SIGNUP_FEE_NOT_MONTHLY,
  SIGNUP_FEE_ONE_TIME_LABEL,
  SIGNUP_FEE_SHORT,
} from "../data/pricing";

export function PricingPage() {
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Pricing</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">
          {PRICING_PAGE_TITLE}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{PRICING_PAGE_INTRO}</p>
        <p className="mt-4 text-base font-semibold text-forest-800">{PRICING_PRIMARY}</p>
        <p className="mt-2 text-base leading-relaxed text-ink-700">{PRICING_SECONDARY}</p>

        <div className="mt-8 grid gap-3">
          <article className="rounded-3xl bg-forest-800 px-5 py-6 text-cream-50">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-300">
              Everyone
            </p>
            <p className="mt-2 font-display text-4xl font-semibold sm:text-5xl">{SIGNUP_FEE}</p>
            <p className="mt-1 text-lg font-semibold uppercase tracking-[0.08em] text-gold-300">
              {SIGNUP_FEE_ONE_TIME_LABEL}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-cream-200">{SIGNUP_FEE_NOT_MONTHLY}</p>
          </article>
          <article className="rounded-3xl border border-forest-800/15 bg-cream-50 px-5 py-6">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
              Contractors
            </p>
            <p className="mt-2 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">
              {CONNECTION_FEE}
            </p>
            <p className="mt-1 text-lg font-semibold uppercase tracking-[0.08em] text-forest-800">
              {CONNECTION_FEE_PER_LABEL}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">{PRICING_PRIMARY}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{CONNECTION_FEE_NO_HIRE_GUARANTEE}</p>
          </article>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-6">
            <h2 className="font-display text-2xl text-forest-800">{HOMEOWNER_BUSINESS_HEADING}</h2>
            <p className="mt-3 text-3xl font-semibold text-forest-800">{SIGNUP_FEE_ONE_TIME_LABEL}</p>
            <p className="mt-1 text-sm font-semibold text-ink-700">{MONTHLY_PRICE} · $0 Connection Fee</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">{HOMEOWNER_PRICING_SUMMARY}</p>
          </article>
          <article className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-6">
            <h2 className="font-display text-2xl text-forest-800">Contractors</h2>
            <p className="mt-3 text-3xl font-semibold text-forest-800">{SIGNUP_FEE_ONE_TIME_LABEL}</p>
            <p className="mt-1 text-sm font-semibold text-ink-700">
              then {CONNECTION_FEE_PER_LABEL} · {MONTHLY_PRICE}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">{PRO_PRICING_SUMMARY}</p>
            <p className="mt-3 text-sm font-semibold text-forest-800">{CONTRACTOR_SIGNUP_HEADLINE}</p>
          </article>
        </div>

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
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          Legal note (attorney review required): PPP is a technology marketplace that facilitates connections. PPP
          does not employ contractors, perform the work, guarantee hiring or workmanship, process project payments, or
          take a percentage of project payment under this model.
        </p>
      </Container>
    </section>
  );
}
