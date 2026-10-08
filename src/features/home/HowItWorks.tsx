import { MarketingPhoto } from "../../components/media/MarketingPhoto";
import { Container, SectionHeading } from "../../components/ui/Container";
import { MARKETING_SECTION_PHOTOS } from "../../data/marketingPhotos";
import { JOB_PAYMENT_PLAIN } from "../../data/pricing";
import { useHidePlatformPricing } from "../../lib/auth/platformPricing";

const CONNECT_STEP_WITH_FEE =
  "Independent contractors browse anonymized opportunities. Up to three can connect for $4.99 each. Connecting does not guarantee a hire. The $4.99 Connection Fee is non-refundable.";

const CONNECT_STEP_WITHOUT_FEE =
  "Independent contractors browse anonymized opportunities. Up to three can connect. You choose who to hire.";

const steps = [
  {
    n: "01",
    title: "Post the project",
    body: "Describe the work in plain words. Sign in as a customer and post the project.",
  },
  {
    n: "02",
    title: "Local pros can connect",
    body: CONNECT_STEP_WITH_FEE,
  },
  {
    n: "03",
    title: "You choose who to hire",
    body: "Compare timing, approach, and price. You stay in charge of the hire.",
  },
  {
    n: "04",
    title: "They do the work",
    body: `The contractor performs the job. ${JOB_PAYMENT_PLAIN}`,
  },
];

export function HowItWorks() {
  const hidePricing = useHidePlatformPricing();
  const visibleSteps = steps.map((step) =>
    step.n === "02" && hidePricing ? { ...step, body: CONNECT_STEP_WITHOUT_FEE } : step,
  );

  return (
    <section className="border-y border-forest-800/10 bg-cream-100/60 py-14 sm:py-16" aria-labelledby="how-heading">
      <Container>
        <SectionHeading
          eyebrow="How PPP works"
          title="Four steps. No mystery middleman."
          kicker={JOB_PAYMENT_PLAIN}
        />
        <h2 id="how-heading" className="sr-only">
          How PPP works
        </h2>
        <div className="mt-8 h-52 w-full overflow-hidden rounded-3xl border border-forest-800/10 sm:h-64">
          <MarketingPhoto
            photo={MARKETING_SECTION_PHOTOS.homepageHowItWorks}
            sizes="(max-width: 1024px) 100vw, 960px"
          />
        </div>
        <ol className="mt-10 grid gap-5 md:grid-cols-2">
          {visibleSteps.map((step) => (
            <li
              key={step.n}
              className="rounded-3xl border border-forest-800/10 bg-cream-50 p-5 sm:p-6"
            >
              <p className="font-display text-3xl italic text-gold-600">{step.n}</p>
              <h3 className="mt-2 font-display text-2xl text-forest-800">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
