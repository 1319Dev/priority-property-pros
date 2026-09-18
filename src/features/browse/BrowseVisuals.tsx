import { Link } from "react-router-dom";
import { MarketingPhoto } from "../../components/media/MarketingPhoto";
import { Container } from "../../components/ui/Container";
import type { MarketingPhotoId } from "../../data/marketingPhotos";

type IllustrationKind = "hero" | "fence" | "interior" | "yard";

const KIND_TO_PHOTO: Record<IllustrationKind, MarketingPhotoId> = {
  hero: "finished",
  fence: "fence",
  interior: "handyman",
  yard: "landscaping",
};

export function BrowseIllustration({ kind, className = "" }: { kind: IllustrationKind; className?: string }) {
  const photo = KIND_TO_PHOTO[kind];
  return (
    <div className={`overflow-hidden rounded-3xl bg-forest-800/10 ${className}`}>
      <MarketingPhoto
        photo={photo}
        className="aspect-[16/10] min-h-32"
        sizes={kind === "hero" ? "(max-width: 1024px) 100vw, 520px" : "(max-width: 640px) 100vw, 420px"}
      />
    </div>
  );
}

export function HomeBrowsePreview() {
  return (
    <section className="border-y border-forest-800/10 bg-cream-100/70 py-12" aria-labelledby="browse-preview-heading">
      <Container className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Find a Pro</p>
          <h2 id="browse-preview-heading" className="mt-3 font-display text-3xl font-semibold text-forest-800">
            Browse approved locals — without private contact.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-700">
            Public cards show a generic trade title, general area, and real PPP ratings when they exist. The marketplace
            is still early, so listings stay honest instead of inventing social proof.
          </p>
          <p className="mt-4">
            <Link to="/find-a-pro" className="min-h-11 inline-flex items-center font-semibold text-forest-800 underline">
              View the public directory
            </Link>
          </p>
        </div>
        <BrowseIllustration kind="hero" className="min-h-40 border border-forest-800/10" />
      </Container>
    </section>
  );
}
