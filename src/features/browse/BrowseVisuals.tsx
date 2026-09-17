import { Link } from "react-router-dom";
import { Container } from "../../components/ui/Container";

type IllustrationKind = "hero" | "fence" | "interior" | "yard";

function HeroArt() {
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" role="img" aria-label="Abstract local street with independent homes">
      <rect width="320" height="180" fill="#F4EFE4" />
      <path d="M0 128h320v52H0z" fill="#E4D8C4" />
      <path d="M0 118h320" stroke="#C9B89A" strokeWidth="8" />
      <rect x="28" y="72" width="70" height="52" rx="6" fill="#1F3D32" />
      <path d="M22 78 63 48l41 30" fill="#C9A227" />
      <rect x="128" y="80" width="62" height="44" rx="6" fill="#2B5345" />
      <path d="M122 84 159 58l37 26" fill="#1F3D32" />
      <rect x="214" y="68" width="78" height="56" rx="6" fill="#1F3D32" />
      <path d="M208 74 253 42l45 32" fill="#C9A227" />
      <circle cx="52" cy="102" r="6" fill="#F4EFE4" />
      <circle cx="248" cy="98" r="6" fill="#F4EFE4" />
      <rect x="148" y="98" width="14" height="26" fill="#F4EFE4" />
    </svg>
  );
}

function FenceArt() {
  return (
    <svg viewBox="0 0 240 160" className="h-full w-full" role="img" aria-label="Abstract screened fence work illustration">
      <rect width="240" height="160" fill="#EFE6D4" />
      <rect x="18" y="108" width="204" height="10" fill="#1F3D32" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={24 + i * 26} y="48" width="16" height="70" rx="3" fill="#2B5345" />
      ))}
      <rect x="18" y="70" width="204" height="8" fill="#C9A227" />
    </svg>
  );
}

function InteriorArt() {
  return (
    <svg viewBox="0 0 240 160" className="h-full w-full" role="img" aria-label="Abstract screened interior repair illustration">
      <rect width="240" height="160" fill="#F4EFE4" />
      <rect x="20" y="28" width="200" height="110" rx="8" fill="#1F3D32" />
      <rect x="40" y="48" width="88" height="54" rx="4" fill="#C9A227" />
      <rect x="142" y="86" width="58" height="36" rx="4" fill="#EFE6D4" />
    </svg>
  );
}

function YardArt() {
  return (
    <svg viewBox="0 0 240 160" className="h-full w-full" role="img" aria-label="Abstract screened yard work illustration">
      <rect width="240" height="160" fill="#EFE6D4" />
      <ellipse cx="120" cy="118" rx="92" ry="22" fill="#2B5345" />
      <circle cx="78" cy="70" r="22" fill="#1F3D32" />
      <circle cx="150" cy="62" r="28" fill="#1F3D32" />
      <rect x="146" y="84" width="8" height="28" fill="#C9A227" />
    </svg>
  );
}

export function BrowseIllustration({ kind, className = "" }: { kind: IllustrationKind; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-3xl ${className}`}>
      {kind === "hero" ? <HeroArt /> : null}
      {kind === "fence" ? <FenceArt /> : null}
      {kind === "interior" ? <InteriorArt /> : null}
      {kind === "yard" ? <YardArt /> : null}
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
