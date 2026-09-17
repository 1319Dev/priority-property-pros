import { ButtonLink } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";
import { PRICING_HOMEPAGE_LINE, PRICING_PATH, SEE_PRICING_LABEL } from "../../data/pricing";

export function SimplePricing() {
  return (
    <section className="py-10 sm:py-12" aria-labelledby="pricing-heading">
      <Container>
        <div className="flex flex-col gap-5 rounded-[2rem] bg-forest-800 px-5 py-7 text-cream-50 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="max-w-2xl">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-300">
              Simple pricing
            </p>
            <h2 id="pricing-heading" className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
              {PRICING_HOMEPAGE_LINE}
            </h2>
          </div>
          <ButtonLink to={PRICING_PATH} variant="gold" size="lg" className="shrink-0 self-start sm:self-center">
            {SEE_PRICING_LABEL}
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
