import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CUSTOMER_CTA } from "../data/brand";

export function ComingSoonLayout({
  eyebrow,
  title,
  body,
  extra,
}: {
  eyebrow: string;
  title: string;
  body: string;
  extra?: ReactNode;
}) {
  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-2xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">{eyebrow}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">{title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{body}</p>
        <p className="mt-3 rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
          This surface is a Phase 1 placeholder. Accounts, live matching, and payments are not built yet.
        </p>
        {extra}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/">Back home</ButtonLink>
          <ButtonLink to="/post-project" variant="outline">
            {CUSTOMER_CTA}
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}

export function SeeServicesLink() {
  return (
    <p className="mt-4 text-sm">
      <Link to="/" className="font-semibold text-forest-800 underline">
        See popular services
      </Link>
    </p>
  );
}
