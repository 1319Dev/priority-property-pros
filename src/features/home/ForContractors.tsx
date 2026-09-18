import { CONTRACTOR_CTA, CONTRACTOR_TAGLINE } from "../../data/brand";
import { CONTRACTOR_SIGNUP_HEADLINE, CONTRACTOR_SIGNUP_SUPPORTING, SIGNUP_FEE_SHORT } from "../../data/pricing";
import { ButtonLink } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";

export function ForContractors() {
  return (
    <section className="py-14 sm:py-16" aria-labelledby="pros-heading">
      <Container>
        <div className="overflow-hidden rounded-[2rem] bg-forest-950 px-5 py-10 text-cream-50 sm:px-10">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-300">
            For contractors
          </p>
          <h2 id="pros-heading" className="mt-3 max-w-xl font-display text-3xl font-semibold sm:text-4xl">
            {CONTRACTOR_TAGLINE}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-cream-200">
            Independent contractors compete on the actual job: scope, schedule, and price. Apply to join. An admin
            still has to approve you before matching.
          </p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-cream-100">
            {CONTRACTOR_SIGNUP_HEADLINE} {CONTRACTOR_SIGNUP_SUPPORTING}
          </p>
          <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <li className="rounded-2xl border border-cream-50/15 px-4 py-3">Real projects from real property owners</li>
            <li className="rounded-2xl border border-cream-50/15 px-4 py-3">See the opportunity first, then choose to connect</li>
            <li className="rounded-2xl border border-cream-50/15 px-4 py-3">$4.99 per connection — no percentage of the job</li>
          </ul>
          <div className="mt-8">
            <ButtonLink to="/become-a-pro" variant="gold" size="lg">
              {CONTRACTOR_CTA}
            </ButtonLink>
            <p className="mt-3 text-sm text-cream-200">{SIGNUP_FEE_SHORT}. Not a monthly subscription.</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
