import { ButtonLink } from "../../components/ui/Button";
import { Container, SectionHeading } from "../../components/ui/Container";
import { SIGNUP_FEE_NOT_MONTHLY } from "../../data/pricing";

export function TrustSafety() {
  return (
    <section className="border-t border-forest-800/10 py-14 sm:py-16" aria-labelledby="trust-heading">
      <Container>
        <SectionHeading
          eyebrow="Trust & safety"
          title="Clear words. No false badges."
        />
        <h2 id="trust-heading" className="sr-only">
          Trust and safety
        </h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-forest-800/10 bg-cream-50 p-6">
            <h3 className="font-display text-2xl text-forest-800">What PPP is</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-700">
              <li>A marketplace that connects property owners with independent local contractors.</li>
              <li>Live posting and estimates for signed-in accounts. Online payment setup is coming soon.</li>
              <li>{SIGNUP_FEE_NOT_MONTHLY}</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-forest-800/10 bg-cream-50 p-6">
            <h3 className="font-display text-2xl text-forest-800">What PPP is not</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-700">
              <li>PPP is not the contractor and does not employ the people who do the work.</li>
              <li>We do not currently verify licenses, insurance, or workmanship.</li>
              <li>We do not claim jobs are guaranteed, bonded, or code-inspected by PPP.</li>
            </ul>
          </div>
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-500">
          When you hire, ask for proof of insurance and any required local licenses yourself. Agree on scope and
          price before work starts. If something feels wrong, pause.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink to="/trust" variant="ghost">
            Full trust notes
          </ButtonLink>
          <ButtonLink to="/legal" variant="ghost">
            Legal pages
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
