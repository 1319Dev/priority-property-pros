import { JOIN_AS_A_PRO } from "../../data/brand";
import { ButtonLink } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";

const EXAMPLE_STATUSES = ["Viewed", "Accepted", "Not Selected"] as const;

export function ForContractors() {
  return (
    <section className="py-14 sm:py-16" aria-labelledby="pros-heading">
      <Container>
        <div className="overflow-hidden rounded-[2rem] bg-forest-950 px-5 py-10 text-cream-50 sm:px-10">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-300">For contractors</p>
          <h2 id="pros-heading" className="mt-3 max-w-xl font-display text-3xl font-semibold sm:text-4xl">
            Turn open days into paying jobs.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-cream-200">
            Set your service area and the work you want. Browse local opportunities and choose which ones to pursue.
          </p>
          <p className="mt-6 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-300">Example statuses</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {EXAMPLE_STATUSES.map((status) => (
              <li key={status} className="rounded-full border border-cream-50/20 px-3 py-2 text-sm">
                {status}
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream-200">
            These statuses are examples. A job and income are not guaranteed.
          </p>
          <div className="mt-8">
            <ButtonLink to="/become-a-pro" variant="gold" size="lg">
              {JOIN_AS_A_PRO}
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
