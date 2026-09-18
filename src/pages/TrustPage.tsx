import { Link } from "react-router-dom";
import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import {
  TRUST_ATTORNEY_NOTE,
  TRUST_HOW_TO_HIRE,
  TRUST_LAST_UPDATED,
  TRUST_PAGE_LEDE,
  TRUST_PAGE_TITLE,
  TRUST_WHAT_DOES_NOT_EXIST,
  TRUST_WHAT_EXISTS,
} from "../data/trustSafety";

export function TrustPage() {
  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Trust & safety</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">{TRUST_PAGE_TITLE}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{TRUST_PAGE_LEDE}</p>
        <p className="mt-3 text-sm text-ink-500">Last updated {TRUST_LAST_UPDATED}.</p>
        <p className="mt-4 rounded-2xl bg-gold-500/15 px-4 py-3 text-sm text-forest-950">{TRUST_ATTORNEY_NOTE}</p>

        <h2 className="mt-10 font-display text-2xl text-forest-800">What exists today</h2>
        <ul className="mt-4 space-y-4">
          {TRUST_WHAT_EXISTS.map((item) => (
            <li key={item.title} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-5">
              <h3 className="font-semibold text-forest-800">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{item.body}</p>
            </li>
          ))}
        </ul>

        <h2 className="mt-10 font-display text-2xl text-forest-800">What we do not claim</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-700">
          {TRUST_WHAT_DOES_NOT_EXIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2 className="mt-10 font-display text-2xl text-forest-800">Hire carefully</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-700">
          {TRUST_HOW_TO_HIRE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <p className="mt-8 text-sm text-ink-700">
          Related policies:{" "}
          <Link to="/legal/marketplace-disclaimer" className="font-semibold text-forest-800 underline">
            Marketplace Disclaimer
          </Link>
          ,{" "}
          <Link to="/legal/community-guidelines" className="font-semibold text-forest-800 underline">
            Community & Review Guidelines
          </Link>
          ,{" "}
          <Link to="/legal/dispute-policy" className="font-semibold text-forest-800 underline">
            Dispute Policy
          </Link>
          .
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/">Back home</ButtonLink>
          <ButtonLink to="/legal" variant="outline">
            Legal pages
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
