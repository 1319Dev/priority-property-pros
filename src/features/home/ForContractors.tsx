import { CONTRACTOR_CTA, CONTRACTOR_TAGLINE } from "../../data/brand";
import { CONTRACTOR_SIGNUP_HEADLINE, CONTRACTOR_SIGNUP_SUPPORTING, SIGNUP_FEE_PUBLIC_NOTE } from "../../data/pricing";
import { MARKETING_SECTION_PHOTOS } from "../../data/marketingPhotos";
import { MarketingPhoto } from "../../components/media/MarketingPhoto";
import { ButtonLink } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";

export function ForContractors() {
  return (
    <section className="py-14 sm:py-16" aria-labelledby="pros-heading">
      <Container>
        <div className="grid overflow-hidden rounded-[2rem] bg-forest-950 text-cream-50 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
          <div className="px-5 py-10 sm:px-10">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-300">
            For contractors
          </p>
          <h2 id="pros-heading" className="mt-3 max-w-xl font-display text-3xl font-semibold sm:text-4xl">
            {CONTRACTOR_TAGLINE}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-cream-200">
            Independent contractors compete on the actual job: scope, schedule, and price. Apply to join. An admin
            still has to approve you before matching. PPP is the marketplace — not your boss and not a lead mill.
          </p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-cream-100">
            {CONTRACTOR_SIGNUP_HEADLINE} {CONTRACTOR_SIGNUP_SUPPORTING}
          </p>
          <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <li className="rounded-2xl border border-cream-50/15 px-4 py-3">Real projects from real property owners</li>
            <li className="rounded-2xl border border-cream-50/15 px-4 py-3">See the opportunity first, then choose to connect</li>
            <li className="rounded-2xl border border-cream-50/15 px-4 py-3">$4.99 only when you connect — no percentage of the job</li>
          </ul>
          <div className="mt-8">
            <ButtonLink to="/become-a-pro" variant="gold" size="lg">
              {CONTRACTOR_CTA}
            </ButtonLink>
            <p className="mt-3 text-sm text-cream-200">{SIGNUP_FEE_PUBLIC_NOTE}</p>
          </div>
          </div>
          <figure className="relative min-h-56 lg:min-h-full">
            <div className="aspect-[467/370] h-full min-h-56 w-full lg:absolute lg:inset-0 lg:aspect-auto">
              <MarketingPhoto
                photo={MARKETING_SECTION_PHOTOS.contractorMarketing}
                sizes="(max-width: 1024px) 100vw, 480px"
                className="h-full w-full"
              />
            </div>
          </figure>
        </div>
      </Container>
    </section>
  );
}
