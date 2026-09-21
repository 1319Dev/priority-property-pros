import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CUSTOMER_CTA, CONTRACTOR_CTA } from "../data/brand";
import { HOMEPAGE_SIGNUP_HEADLINE, HOMEPAGE_SIGNUP_SUPPORTING } from "../data/pricing";

const steps = [
  {
    n: "01",
    title: "Post the project",
    body: "Describe the work in plain words. Sign in as a customer. Independent local contractors see an anonymized opportunity — not your phone number.",
  },
  {
    n: "02",
    title: "Pros choose to connect",
    body: "Up to three local independents can connect for $4.99 each. Connecting does not guarantee a hire. The $4.99 Connection Fee is non-refundable.",
  },
  {
    n: "03",
    title: "You hire",
    body: "Compare timing, approach, and price. You stay in charge. PPP does not pick the contractor and does not become the crew.",
  },
  {
    n: "04",
    title: "They do the work",
    body: "The contractor performs the job. Project payment is between you and that pro. PPP does not take a percentage of the job.",
  },
];

export function HowItWorksPage() {
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">How it works</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">
          The marketplace in four steps.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">
          {HOMEPAGE_SIGNUP_HEADLINE} {HOMEPAGE_SIGNUP_SUPPORTING}
        </p>
        <ol className="mt-8 grid gap-4">
          {steps.map((step) => (
            <li key={step.n} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-5">
              <p className="font-display text-3xl italic text-gold-600">{step.n}</p>
              <h2 className="mt-1 font-display text-2xl text-forest-800">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{step.body}</p>
            </li>
          ))}
        </ol>
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
