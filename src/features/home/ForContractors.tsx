import { CONTRACTOR_CTA, CONTRACTOR_TAGLINE } from "../../data/brand";
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
            Priority Property Pros is not a lead marketplace that sells the same homeowner five times.
            Independent contractors will compete on the actual job: scope, schedule, and price. Get started for $9.99.
            No monthly subscription required on the Free plan. Marketplace fees apply only when you are hired. An admin
            still has to approve you before matching.
          </p>
          <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <li className="rounded-2xl border border-cream-50/15 px-4 py-3">Real projects from real property owners</li>
            <li className="rounded-2xl border border-cream-50/15 px-4 py-3">Fair shot — not pay-to-play junk leads</li>
            <li className="rounded-2xl border border-cream-50/15 px-4 py-3">You remain an independent business</li>
          </ul>
          <div className="mt-8">
            <ButtonLink to="/become-a-pro" variant="gold" size="lg">
              {CONTRACTOR_CTA}
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
