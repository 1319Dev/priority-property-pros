import { Link } from "react-router-dom";
import { FAQ_INTRO, FAQ_ITEMS, FAQ_PAGE_TITLE } from "../data/faq";
import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CUSTOMER_CTA, CONTRACTOR_CTA } from "../data/brand";

export function FaqPage() {
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">FAQ</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">{FAQ_PAGE_TITLE}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{FAQ_INTRO}</p>
        <dl className="mt-8 space-y-4">
          {FAQ_ITEMS.map((item) => (
            <div key={item.question} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-5">
              <dt className="font-semibold text-forest-800">{item.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-700">{item.answer}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/post-project">{CUSTOMER_CTA}</ButtonLink>
          <ButtonLink to="/become-a-pro" variant="outline">
            {CONTRACTOR_CTA}
          </ButtonLink>
        </div>
        <p className="mt-6 text-sm">
          Still stuck?{" "}
          <Link to="/contact" className="font-semibold text-forest-800 underline">
            Contact PPP
          </Link>
          .
        </p>
      </Container>
    </section>
  );
}
