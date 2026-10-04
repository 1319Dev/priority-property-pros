import { ButtonLink } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";

const points = [
  "An approved platform profile means an admin approved the account. It is not a workmanship inspection.",
  "Service area and trades are entered by the contractor.",
  "Phone, email, and street stay hidden until that contractor unlocks the connection.",
  "You choose who to hire.",
  "An estimate does not obligate a hire.",
  "Priority Property Pros does not verify licenses, insurance, or workmanship and does not guarantee the work.",
];

export function TrustSafety() {
  return (
    <section className="border-t border-forest-800/10 py-14 sm:py-16" aria-labelledby="trust-heading">
      <Container>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Trust</p>
        <h2 id="trust-heading" className="mt-3 max-w-2xl font-display text-3xl font-semibold text-forest-800 sm:text-4xl">
          Know who you&apos;re hiring
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {points.map((point) => (
            <li key={point} className="rounded-3xl border border-forest-800/10 bg-cream-50 p-5 text-sm leading-relaxed text-ink-700">
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <ButtonLink to="/trust" variant="ghost">
            Full trust notes
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
