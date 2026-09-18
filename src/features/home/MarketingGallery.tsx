import { Container } from "../../components/ui/Container";
import { MARKETING_IMAGES } from "../../data/marketingImages";
import { withBase } from "../../utils/cn";

export function MarketingGallery() {
  return (
    <section className="border-y border-forest-800/10 bg-cream-100/70 py-12 sm:py-14" aria-labelledby="work-gallery-heading">
      <Container>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Local home services</p>
        <h2 id="work-gallery-heading" className="mt-3 font-display text-3xl font-semibold text-forest-800">
          Real homes. Independent pros.
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-700">
          Exterior, kitchen, yard, and finish work — the kind of jobs homeowners post and local contractors bid on.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {MARKETING_IMAGES.map((image) => (
            <li key={image.src} className="overflow-hidden rounded-3xl border border-forest-800/10 bg-forest-800">
              <img
                src={withBase(image.src)}
                alt={image.alt}
                className="aspect-[16/10] h-auto w-full object-cover"
                loading="lazy"
              />
              <p className="px-4 py-3 text-sm font-semibold text-cream-50">{image.caption}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
