import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MarketingPhotoFrame } from "../components/media/MarketingPhoto";
import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CUSTOMER_CTA } from "../data/brand";
import type { MarketingPhotoId } from "../data/marketingPhotos";

export function ComingSoonLayout({
  eyebrow,
  title,
  body,
  extra,
  photo,
}: {
  eyebrow: string;
  title: string;
  body: string;
  extra?: ReactNode;
  photo?: MarketingPhotoId;
}) {
  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-2xl">
        {photo ? (
          <MarketingPhotoFrame
            photo={photo}
            ratio="banner"
            eager
            frameClassName="mb-8 max-h-40 rounded-3xl border border-forest-800/10 sm:max-h-48"
            sizes="(max-width: 768px) 100vw, 672px"
          />
        ) : null}
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">{eyebrow}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">{title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{body}</p>
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
      <Link to="/#services" className="font-semibold text-forest-800 underline">
        See popular services
      </Link>
    </p>
  );
}
