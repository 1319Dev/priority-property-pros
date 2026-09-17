import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { CUSTOMER_CTA } from "../data/brand";
import {
  DEMO_BANNER,
  DEMO_CONTRACTORS,
  DEMO_HOMEOWNERS,
  DEMO_LABEL,
  DEMO_PROJECTS,
  DEMO_VERIFIERS,
  demoContractorPath,
  demoHomeownerPath,
  demoProjectPath,
  demoVerifierPath,
  findDemoContractor,
  findDemoHomeowner,
  findDemoProject,
  findDemoVerifier,
} from "../data/demoMarketplace";
import { HOMEPAGE_SIGNUP_HEADLINE } from "../data/pricing";
import { GET_ESTIMATES_CTA } from "../data/signup";
import {
  directoryRowBadges,
  fetchPublicContractor,
  fetchPublicContractorDirectory,
  type PublicDirectoryRpcRow,
} from "../lib/marketplace/api";
import {
  formatPublicRating,
  isUuid,
  liveContractorPath,
  toPublicContractorCard,
  type PublicContractorCard,
} from "../lib/marketplace/publicDirectory";
import { isSupabaseConfigured } from "../lib/supabase/config";

function DemoPill() {
  return (
    <span className="inline-flex rounded-full bg-gold-500 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-forest-950">
      {DEMO_LABEL}
    </span>
  );
}

function BrowseCtas() {
  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <ButtonLink to="/post-project">{CUSTOMER_CTA}</ButtonLink>
        <ButtonLink to="/post-project?intent=estimates" variant="outline">
          {GET_ESTIMATES_CTA}
        </ButtonLink>
      </div>
      <p className="text-sm leading-relaxed text-ink-700">{HOMEPAGE_SIGNUP_HEADLINE} Checkout is not live yet.</p>
    </div>
  );
}

function PhotoMark({ initials, label }: { initials: string; label: string }) {
  return (
    <div
      className="grid size-14 place-items-center rounded-2xl bg-forest-800 text-sm font-semibold text-cream-50 sm:size-16"
      aria-hidden="true"
    >
      {initials}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function DirectoryCard({
  to,
  name,
  initials,
  meta,
  description,
  extra,
  demo,
  cta = "View Pro",
}: {
  to: string;
  name: string;
  initials: string;
  meta: string;
  description: string;
  extra?: ReactNode;
  demo?: boolean;
  cta?: string;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-28 gap-3 rounded-3xl border border-forest-800/10 bg-cream-50 p-4 active:bg-cream-100"
    >
      <PhotoMark initials={initials} label={name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {demo ? <DemoPill /> : null}
          <h3 className="font-display text-xl font-semibold text-forest-800">{name}</h3>
        </div>
        <p className="mt-1 text-sm text-ink-700">{meta}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">{description}</p>
        {extra}
        <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-forest-800">{cta}</p>
      </div>
    </Link>
  );
}

function liveCardFromRow(row: PublicDirectoryRpcRow): PublicContractorCard {
  return toPublicContractorCard({
    id: row.id,
    displayLabel: row.display_label,
    primaryTrade: row.primary_trade,
    categories: row.categories ?? (row.primary_trade ? [row.primary_trade] : []),
    serviceArea: row.service_area,
    yearsExperience: row.years_experience,
    ratingAverage: row.rating_average,
    ratingCount: row.rating_count,
    badges: directoryRowBadges(row),
    shortDescription: row.short_description,
  });
}

function cardRatingLine(card: Pick<PublicContractorCard, "ratingAverage" | "ratingCount" | "yearsExperience" | "badges">, demo = false) {
  const rating = formatPublicRating(card.ratingAverage, card.ratingCount, { demo });
  const years =
    card.yearsExperience != null && card.yearsExperience > 0
      ? `${card.yearsExperience} year${card.yearsExperience === 1 ? "" : "s"} experience`
      : null;
  const badges = card.badges.map((badge) => `✓ ${badge.label}`).join(" · ");
  return [rating, years, badges].filter(Boolean).join(" · ");
}

export function FindAProPage() {
  const configured = isSupabaseConfigured();
  const [live, setLive] = useState<PublicContractorCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void fetchPublicContractorDirectory()
      .then((rows) => {
        if (!cancelled) setLive(rows.map(liveCardFromRow));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the live directory.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  return (
    <section className="py-8 sm:py-12">
      <Container className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Find a Pro</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">Browse local independents.</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-700 sm:text-lg">
          Live cards are real approved, active contractors shown without business names or contact details. Example /
          Demo cards are fictional so you can see the marketplace. PPP is not the contractor.
        </p>
        <BrowseCtas />

        <section className="mt-10" aria-labelledby="live-directory-heading">
          <h2 id="live-directory-heading" className="font-display text-2xl text-forest-800">
            Live approved contractors
          </h2>
          <p className="mt-2 text-sm text-ink-700">
            Public cards show a generic trade title, general service area, real PPP ratings when they exist, earned
            badges, and a short non-identifying description. Business names, phones, websites, logos, and exact
            addresses stay private until you hire through Priority Property Pros.
          </p>
          {loading ? <p className="mt-4 text-sm text-ink-700">Loading live directory…</p> : null}
          {error ? <p className="mt-4 text-sm text-danger-600">{error}</p> : null}
          {!configured ? (
            <p className="mt-4 rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
              Live directory needs a connected marketplace. Example profiles below still work.
            </p>
          ) : null}
          {!loading && configured && live.length === 0 && !error ? (
            <p className="mt-4 rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
              No approved active contractors are listed yet. Example cards below show how the directory looks.
            </p>
          ) : null}
          <ul className="mt-4 space-y-3">
            {live.map((card) => (
              <li key={card.id}>
                <DirectoryCard
                  to={liveContractorPath(card.id)}
                  name={card.displayLabel}
                  initials={card.photoInitials}
                  meta={`${card.serviceArea}${card.categories.length ? ` · ${card.categories.join(" • ")}` : ""}`}
                  description={card.shortDescription}
                  extra={<p className="mt-2 text-sm font-medium text-forest-800">{cardRatingLine(card)}</p>}
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="demo-heading">
          <h2 id="demo-heading" className="font-display text-2xl text-forest-800">
            Example / Demo showcase
          </h2>
          <p className="mt-2 rounded-2xl bg-gold-500/20 px-4 py-3 text-sm text-forest-950">{DEMO_BANNER}</p>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-gold-700">Example contractors</h3>
          <ul className="mt-3 space-y-3">
            {DEMO_CONTRACTORS.map((row) => (
              <li key={row.slug}>
                <DirectoryCard
                  to={demoContractorPath(row.slug)}
                  name={row.displayLabel}
                  initials={row.photoInitials}
                  meta={`${row.serviceArea} · ${row.categories.join(" • ")}`}
                  description={row.shortDescription}
                  extra={<p className="mt-2 text-sm font-medium text-forest-800">{cardRatingLine(row, true)}</p>}
                  demo
                />
              </li>
            ))}
          </ul>

          <h3 className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-gold-700">Example homeowners</h3>
          <ul className="mt-3 space-y-3">
            {DEMO_HOMEOWNERS.map((row) => (
              <li key={row.slug}>
                <DirectoryCard
                  to={demoHomeownerPath(row.slug)}
                  name={row.displayName}
                  initials={row.photoInitials}
                  meta={row.generalArea}
                  description={row.shortDescription}
                  demo
                  cta="View example"
                />
              </li>
            ))}
          </ul>

          <h3 className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-gold-700">Example verifiers</h3>
          <ul className="mt-3 space-y-3">
            {DEMO_VERIFIERS.map((row) => (
              <li key={row.slug}>
                <DirectoryCard
                  to={demoVerifierPath(row.slug)}
                  name={row.displayName}
                  initials={row.photoInitials}
                  meta={row.coverageArea}
                  description={row.shortDescription}
                  demo
                  cta="View example"
                />
              </li>
            ))}
          </ul>

          <h3 className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-gold-700">Sample projects</h3>
          <ul className="mt-3 space-y-3">
            {DEMO_PROJECTS.map((row) => (
              <li key={row.slug}>
                <DirectoryCard
                  to={demoProjectPath(row.slug)}
                  name={row.title}
                  initials="EX"
                  meta={`${row.category} · ${row.city}, ${row.state} ${row.zip} · ${row.timing}`}
                  description={row.shortDescription}
                  demo
                  cta="View example"
                />
              </li>
            ))}
          </ul>
        </section>
      </Container>
    </section>
  );
}

function ProfileShell({
  eyebrow,
  title,
  demo,
  children,
}: {
  eyebrow: string;
  title: string;
  demo?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="py-8 sm:py-12">
      <Container className="max-w-xl">
        {demo ? <DemoPill /> : null}
        <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">{eyebrow}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">{title}</h1>
        <div className="mt-4 space-y-4 text-base leading-relaxed text-ink-700">{children}</div>
        <BrowseCtas />
        <p className="mt-6">
          <Link to="/find-a-pro" className="min-h-11 inline-flex items-center font-semibold text-forest-800 underline">
            Back to directory
          </Link>
        </p>
      </Container>
    </section>
  );
}

export function PublicContractorPage() {
  const { contractorId = "" } = useParams();
  const configured = isSupabaseConfigured();
  const [card, setCard] = useState<PublicContractorCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isUuid(contractorId) || !configured) {
      setLoading(false);
      setCard(null);
      return;
    }
    let cancelled = false;
    void fetchPublicContractor(contractorId)
      .then((row) => {
        if (!cancelled) setCard(row ? liveCardFromRow(row) : null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contractorId, configured]);

  if (loading) {
    return (
      <ProfileShell eyebrow="Public profile" title="Loading…">
        <p>Looking up this approved contractor.</p>
      </ProfileShell>
    );
  }
  if (error || !card) {
    return (
      <ProfileShell eyebrow="Public profile" title="Contractor not found">
        <p>This listing is not in the public directory of approved, active contractors.</p>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell eyebrow="Public profile" title={card.displayLabel}>
      <PhotoMark initials={card.photoInitials} label={card.displayLabel} />
      <p>{card.shortDescription}</p>
      <p>
        <span className="font-semibold text-forest-800">Categories.</span> {card.categories.join(" • ") || "Not listed"}
      </p>
      <p>
        <span className="font-semibold text-forest-800">Service area.</span> {card.serviceArea}
      </p>
      {card.yearsExperience != null ? (
        <p>
          <span className="font-semibold text-forest-800">Experience.</span> {card.yearsExperience} years
        </p>
      ) : null}
      <p>
        <span className="font-semibold text-forest-800">Ratings.</span>{" "}
        {formatPublicRating(card.ratingAverage, card.ratingCount) ?? "No verified PPP reviews yet"}
      </p>
      {card.badges.length > 0 ? (
        <p>
          <span className="font-semibold text-forest-800">Reviewed credentials.</span>{" "}
          {card.badges.map((badge) => `✓ ${badge.label}`).join(" · ")} (not Priority Verified)
        </p>
      ) : null}
      <p className="text-sm">
        Business name and contact details are shared after you hire through Priority Property Pros. {HOMEPAGE_SIGNUP_HEADLINE}
      </p>
    </ProfileShell>
  );
}

export function DemoContractorPage() {
  const { slug = "" } = useParams();
  const row = findDemoContractor(slug);
  if (!row) {
    return (
      <ProfileShell eyebrow="Example contractor" title="Example not found" demo>
        <p>{DEMO_BANNER}</p>
      </ProfileShell>
    );
  }
  return (
    <ProfileShell eyebrow="Example contractor" title={row.displayLabel} demo>
      <p>{row.shortDescription}</p>
      <p>
        <span className="font-semibold text-forest-800">Categories.</span> {row.categories.join(" • ")}
      </p>
      <p>
        <span className="font-semibold text-forest-800">Service area.</span> {row.serviceArea}
      </p>
      {row.yearsExperience != null ? (
        <p>
          <span className="font-semibold text-forest-800">Experience.</span> {row.yearsExperience} years
        </p>
      ) : null}
      <p>
        <span className="font-semibold text-forest-800">Ratings.</span>{" "}
        {formatPublicRating(row.ratingAverage, row.ratingCount, { demo: true }) ?? "No example reviews yet"}
      </p>
      <p>
        <span className="font-semibold text-forest-800">Example badges.</span>{" "}
        {row.badges.map((badge) => `✓ ${badge.label}`).join(" · ")}
      </p>
    </ProfileShell>
  );
}

export function DemoHomeownerPage() {
  const { slug = "" } = useParams();
  const row = findDemoHomeowner(slug);
  if (!row) {
    return (
      <ProfileShell eyebrow="Example homeowner" title="Example not found" demo>
        <p>{DEMO_BANNER}</p>
      </ProfileShell>
    );
  }
  return (
    <ProfileShell eyebrow="Example homeowner" title={row.displayName} demo>
      <p>{row.shortDescription}</p>
      <p>
        <span className="font-semibold text-forest-800">General area.</span> {row.generalArea}
      </p>
    </ProfileShell>
  );
}

export function DemoVerifierPage() {
  const { slug = "" } = useParams();
  const row = findDemoVerifier(slug);
  if (!row) {
    return (
      <ProfileShell eyebrow="Example verifier" title="Example not found" demo>
        <p>{DEMO_BANNER}</p>
      </ProfileShell>
    );
  }
  return (
    <ProfileShell eyebrow="Example verifier" title={row.displayName} demo>
      <p>{row.shortDescription}</p>
      <p>
        <span className="font-semibold text-forest-800">Coverage area.</span> {row.coverageArea}
      </p>
    </ProfileShell>
  );
}

export function DemoProjectPage() {
  const { slug = "" } = useParams();
  const row = findDemoProject(slug);
  if (!row) {
    return (
      <ProfileShell eyebrow="Sample project" title="Example not found" demo>
        <p>{DEMO_BANNER}</p>
      </ProfileShell>
    );
  }
  return (
    <ProfileShell eyebrow="Sample project" title={row.title} demo>
      <p>{row.shortDescription}</p>
      <p>
        <span className="font-semibold text-forest-800">Category.</span> {row.category}
      </p>
      <p>
        <span className="font-semibold text-forest-800">General area.</span> {row.city}, {row.state} {row.zip}
      </p>
      <p>
        <span className="font-semibold text-forest-800">Timing.</span> {row.timing}
      </p>
    </ProfileShell>
  );
}
