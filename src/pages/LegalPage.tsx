import { Link, Navigate, useParams } from "react-router-dom";
import { Container } from "../components/ui/Container";
import {
  ATTORNEY_REVIEW_REQUIRED,
  LEGAL_DOCUMENTS,
  LEGAL_INDEX_INTRO,
  LEGAL_LAST_UPDATED,
  LEGAL_PAGES,
  type LegalSlug,
} from "../data/legal";

function isLegalSlug(value: string | undefined): value is LegalSlug {
  return Boolean(value && value in LEGAL_DOCUMENTS);
}

export function LegalIndexPage() {
  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Legal</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">Policies</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{LEGAL_INDEX_INTRO}</p>
        <p className="mt-3 rounded-2xl bg-gold-500/15 px-4 py-3 text-sm text-forest-950">{ATTORNEY_REVIEW_REQUIRED}</p>
        <p className="mt-3 text-sm text-ink-500">Last updated {LEGAL_LAST_UPDATED}.</p>
        <ul className="mt-8 space-y-3">
          {LEGAL_PAGES.map((page) => (
            <li key={page.slug}>
              <Link
                to={page.path}
                className="flex min-h-12 items-center rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 font-semibold text-forest-800"
              >
                {page.title}
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function LegalPage() {
  const { slug } = useParams();
  if (!isLegalSlug(slug)) return <Navigate to="/legal" replace />;
  const doc = LEGAL_DOCUMENTS[slug];

  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Legal</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">{doc.title}</h1>
        <p className="mt-3 text-sm text-ink-500">Last updated {doc.lastUpdated}.</p>
        <p className="mt-4 rounded-2xl bg-gold-500/15 px-4 py-3 text-sm text-forest-950">{ATTORNEY_REVIEW_REQUIRED}</p>
        <div className="mt-8 space-y-8">
          {doc.sections.map((section) => (
            <article key={section.heading}>
              <h2 className="font-display text-2xl text-forest-800">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="mt-3 text-base leading-relaxed text-ink-700">
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </div>
        <p className="mt-10 text-sm">
          <Link to="/legal" className="font-semibold text-forest-800 underline">
            All policies
          </Link>
        </p>
      </Container>
    </section>
  );
}
