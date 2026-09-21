import { MarketingPhoto } from "../components/media/MarketingPhoto";
import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CONTRACTOR_CTA } from "../data/brand";
import { MARKETING_SECTION_PHOTOS } from "../data/marketingPhotos";
import {
  CONNECTION_FEE_PER_LABEL,
  CONTRACTOR_SIGNUP_HEADLINE,
  CONTRACTOR_SIGNUP_SUPPORTING,
  SIGNUP_FEE_PUBLIC_NOTE,
} from "../data/pricing";

const steps = [
  {
    n: "01",
    title: "Create a contractor account",
    body: "One-time $9.99 account activation. Not a monthly subscription. You stay an independent business.",
  },
  {
    n: "02",
    title: "Finish onboarding",
    body: "Add your trades, area, and a short profile. An admin still has to approve you before matching.",
  },
  {
    n: "03",
    title: "Browse first, then connect",
    body: "See the opportunity before you pay. $4.99 only when you choose to connect. No percentage of the job.",
  },
];

export function BecomeAProPage() {
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-3xl">
        <div className="mb-8 h-52 w-full overflow-hidden rounded-3xl border border-forest-800/10 sm:h-64">
          <MarketingPhoto
            photo={MARKETING_SECTION_PHOTOS.becomeAPro}
            eager
            sizes="(max-width: 768px) 100vw, 672px"
          />
        </div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Become a Pro</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">
          Real projects. Real customers. Fair competition.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">
          {CONTRACTOR_SIGNUP_HEADLINE} {CONTRACTOR_SIGNUP_SUPPORTING} Priority Property Pros is a marketplace, not a
          lead mill and not a national dispatch desk. PPP will not sell the same job to five contractors.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-3">
          <li className="rounded-3xl bg-forest-800 px-5 py-5 text-cream-50">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-300">Activation</p>
            <p className="mt-2 font-display text-2xl">$9.99 one time</p>
            <p className="mt-2 text-sm text-cream-200">Then $0/month to keep the account.</p>
          </li>
          <li className="rounded-3xl border border-forest-800/15 bg-cream-50 px-5 py-5">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Connect</p>
            <p className="mt-2 font-display text-2xl text-forest-800">{CONNECTION_FEE_PER_LABEL}</p>
            <p className="mt-2 text-sm text-ink-700">Only when you choose to connect. Not a bid fee.</p>
          </li>
          <li className="rounded-3xl border border-forest-800/15 bg-cream-50 px-5 py-5">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">The job</p>
            <p className="mt-2 font-display text-2xl text-forest-800">You keep the work</p>
            <p className="mt-2 text-sm text-ink-700">Project pay is between you and the customer.</p>
          </li>
        </ul>
        <ol className="mt-10 grid gap-4">
          {steps.map((step) => (
            <li key={step.n} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-5">
              <p className="font-display text-2xl italic text-gold-600">{step.n}</p>
              <h2 className="mt-1 font-display text-2xl text-forest-800">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/sign-up/contractor">{CONTRACTOR_CTA}</ButtonLink>
          <ButtonLink to="/sign-in" variant="outline">
            Sign in
          </ButtonLink>
        </div>
        <p className="mt-4 text-sm text-ink-500">{SIGNUP_FEE_PUBLIC_NOTE}</p>
      </Container>
    </section>
  );
}
