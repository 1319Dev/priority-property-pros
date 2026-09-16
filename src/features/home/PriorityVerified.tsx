import { ButtonLink } from "../../components/ui/Button";
import { Container, SectionHeading } from "../../components/ui/Container";

export function PriorityVerified() {
  return (
    <section className="py-14 sm:py-16" aria-labelledby="verified-heading">
      <Container>
        <div className="rounded-[2rem] border border-dashed border-gold-600/50 bg-cream-100 px-5 py-8 sm:px-8">
          <p className="inline-flex min-h-11 items-center rounded-full border border-gold-600/40 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gold-700">
            Not available yet — disabled
          </p>
          <div className="mt-4">
            <SectionHeading
              eyebrow="Priority Verified"
              title="An optional documentation service. Not a guarantee."
            />
          </div>
          <h2 id="verified-heading" className="sr-only">
            Priority Verified
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-700">
            We are designing <strong className="font-semibold text-forest-800">Priority Verified</strong> as an
            optional way to document that work was completed — involving an independent completion verifier in a
            later phase. It is <strong>not live</strong>. It is not a code inspection, not a license check, and
            not a warranty that the job was done correctly.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-500">
            Until that product exists, treat every hire as you would any local contractor: ask questions, check
            credentials yourself, and agree on the work in writing.
          </p>
          <div className="mt-6">
            <ButtonLink to="/trust" variant="outline">
              Read trust &amp; safety
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
