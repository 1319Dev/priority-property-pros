import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { GET_ESTIMATES_CTA, SIGN_UP_TO_CONNECT_CTA } from "../data/signup";
import { BrowseIllustration } from "../features/browse/BrowseVisuals";
import {
  directoryRowBadges,
  fetchPublicContractor,
  fetchPublicContractorDirectory,
  fetchPublicContractorPortfolio,
  fetchPublicContractorReviews,
  type PublicDirectoryRpcRow,
} from "../lib/marketplace/api";
import {
  applyDirectoryFilters,
  isUuid,
  liveContractorPath,
  publicRatingOrNew,
  toPublicContractorCard,
  toPublicContractorProfile,
  toPublicSafeReview,
  type DirectoryFilters,
  type DirectorySort,
  type PublicContractorCard,
  type PublicContractorProfile,
  type PublicSafePortfolioItem,
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
        <ButtonLink to="/sign-up" variant="outline">
          {SIGN_UP_TO_CONNECT_CTA}
        </ButtonLink>
      </div>
      <ButtonLink to="/post-project?intent=estimates" variant="ghost">
        {GET_ESTIMATES_CTA}
      </ButtonLink>
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
  cta = "View Profile",
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
      className="flex min-h-28 w-full max-w-[390px] gap-3 rounded-3xl border border-forest-800/10 bg-cream-50 p-4 active:bg-cream-100 sm:max-w-none"
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
  const rating = publicRatingOrNew(card.ratingAverage, card.ratingCount, { demo });
  const years =
    card.yearsExperience != null && card.yearsExperience > 0
      ? `${card.yearsExperience} year${card.yearsExperience === 1 ? "" : "s"} experience`
      : null;
  const badges = card.badges.map((badge) => `✓ ${badge.label}`).join(" · ");
  return [rating, years, badges].filter(Boolean).join(" · ");
}

function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0" htmlFor={id}>
      <span className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-gold-700">{label}</span>
      {children}
    </label>
  );
}

export function FindAProPage() {
  const configured = isSupabaseConfigured();
  const [live, setLive] = useState<PublicContractorCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured);
  const [service, setService] = useState("");
  const [area, setArea] = useState("");
  const [minRating, setMinRating] = useState("");
  const [minExperience, setMinExperience] = useState("");
  const [sort, setSort] = useState<DirectorySort>("recommended");

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

  const filters: DirectoryFilters = {
    service,
    area,
    minRating: minRating ? Number(minRating) : null,
    minExperience: minExperience ? Number(minExperience) : null,
    sort,
  };
  const filteredLive = useMemo(() => applyDirectoryFilters(live, filters), [live, service, area, minRating, minExperience, sort]);
  const filteredDemos = useMemo(
    () => applyDirectoryFilters(DEMO_CONTRACTORS, filters),
    [service, area, minRating, minExperience, sort],
  );

  return (
    <section className="py-8 sm:py-12">
      <Container className="max-w-3xl">
        <BrowseIllustration kind="hero" className="mb-6 min-h-36 border border-forest-800/10" />
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Find a Pro</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">Browse local independents.</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-700 sm:text-lg">
          Live cards are real approved, active contractors shown without business names or contact details. Example /
          Demo cards are fictional so you can see the marketplace. PPP is not the contractor. Listings are still few —
          we do not invent popularity counts.
        </p>
        <BrowseCtas />

        <form className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Directory filters">
          <FilterField id="filter-service" label="Service">
            <input
              id="filter-service"
              value={service}
              onChange={(event) => setService(event.target.value)}
              placeholder="Handyman, fence…"
              className="min-h-12 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3"
            />
          </FilterField>
          <FilterField id="filter-area" label="General area">
            <input
              id="filter-area"
              value={area}
              onChange={(event) => setArea(event.target.value)}
              placeholder="Houston Area…"
              className="min-h-12 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3"
            />
          </FilterField>
          <FilterField id="filter-rating" label="Rating">
            <select
              id="filter-rating"
              value={minRating}
              onChange={(event) => setMinRating(event.target.value)}
              className="min-h-12 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3"
            >
              <option value="">Any verified rating</option>
              <option value="4.5">4.5+ PPP reviews</option>
              <option value="4">4.0+ PPP reviews</option>
              <option value="3">3.0+ PPP reviews</option>
            </select>
          </FilterField>
          <FilterField id="filter-experience" label="Experience">
            <select
              id="filter-experience"
              value={minExperience}
              onChange={(event) => setMinExperience(event.target.value)}
              className="min-h-12 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3"
            >
              <option value="">Any experience</option>
              <option value="3">3+ years</option>
              <option value="5">5+ years</option>
              <option value="10">10+ years</option>
            </select>
          </FilterField>
          <FilterField id="filter-sort" label="Sort">
            <select
              id="filter-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as DirectorySort)}
              className="min-h-12 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3"
            >
              <option value="recommended">Recommended</option>
              <option value="highest_rated">Highest Rated</option>
              <option value="most_reviewed">Most Reviewed</option>
            </select>
          </FilterField>
        </form>
        <p className="mt-2 text-xs text-ink-500">Recommended is earned PPP reviews and ratings only. No paid placement.</p>

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
          {!loading && configured && filteredLive.length === 0 && !error ? (
            <p className="mt-4 rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
              No approved active contractors match this view yet. Example cards below show how the directory looks.
            </p>
          ) : null}
          <ul className="mt-4 space-y-3">
            {filteredLive.map((card) => (
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
          <p className="mt-3 text-sm text-ink-700">
            Example ratings never mix into live marketplace stats. Demo reviews stay labeled.
          </p>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-gold-700">Example contractors</h3>
          <ul className="mt-3 space-y-3">
            {filteredDemos.map((row) => (
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

function ProfileSections({
  profile,
  demo,
}: {
  profile: PublicContractorProfile;
  demo?: boolean;
}) {
  return (
    <>
      <PhotoMark initials={profile.photoInitials} label={profile.displayLabel} />
      <section>
        <h2 className="font-display text-2xl text-forest-800">About</h2>
        <p className="mt-2">{profile.about}</p>
      </section>
      <section>
        <h2 className="font-display text-2xl text-forest-800">Services</h2>
        <p className="mt-2">{profile.services.join(" • ") || "Not listed"}</p>
      </section>
      <section>
        <h2 className="font-display text-2xl text-forest-800">Experience</h2>
        <p className="mt-2">
          {profile.yearsExperience != null ? `${profile.yearsExperience} years` : "Experience not listed"} ·{" "}
          {profile.serviceArea}
        </p>
      </section>
      <section>
        <h2 className="font-display text-2xl text-forest-800">Credentials</h2>
        <p className="mt-2">
          {profile.badges.map((badge) => `✓ ${badge.label}`).join(" · ") || "Approved Pro"} (not Priority Verified)
        </p>
      </section>
      <section>
        <h2 className="font-display text-2xl text-forest-800">Portfolio</h2>
        {profile.portfolio.length === 0 ? (
          <p className="mt-2 text-sm">No screened project photos yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3">
            {profile.portfolio.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-3xl border border-forest-800/10 bg-cream-50">
                <BrowseIllustration kind={item.illustration ?? "yard"} className="min-h-32" />
                <p className="px-4 py-3 text-sm">
                  {demo ? <span className="mr-2 font-semibold text-gold-700">EXAMPLE PHOTO.</span> : null}
                  {item.caption}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="font-display text-2xl text-forest-800">Reviews</h2>
        <p className="mt-2 font-medium text-forest-800">{publicRatingOrNew(profile.ratingAverage, profile.ratingCount, { demo })}</p>
        {profile.reviews.length === 0 ? (
          <p className="mt-2 text-sm">{demo ? "No example reviews yet." : "No verified PPP reviews yet."}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {profile.reviews.map((review) => (
              <li key={review.id} className="rounded-3xl bg-cream-100 px-4 py-3 text-sm">
                {demo || review.demo ? <DemoPill /> : null}
                <p className="mt-2 font-semibold text-forest-800">★ {review.rating.toFixed(1)}</p>
                <p className="mt-1">{review.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function PublicContractorPage() {
  const { contractorId = "" } = useParams();
  const configured = isSupabaseConfigured();
  const [profile, setProfile] = useState<PublicContractorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isUuid(contractorId) || !configured) {
      setLoading(false);
      setProfile(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetchPublicContractor(contractorId),
      fetchPublicContractorPortfolio(contractorId).catch(() => []),
      fetchPublicContractorReviews(contractorId).catch(() => []),
    ])
      .then(([row, portfolio, reviews]) => {
        if (cancelled) return;
        if (!row) {
          setProfile(null);
          return;
        }
        const card = liveCardFromRow(row);
        setProfile(
          toPublicContractorProfile(card, {
            about: row.about,
            services: card.categories,
            portfolio: portfolio.map((item) => ({
              id: item.id,
              caption: item.caption,
              sortOrder: item.sort_order,
            })),
            reviews: reviews
              .map((review) => toPublicSafeReview({ id: review.id, rating: review.rating, body: review.body }))
              .filter((review): review is NonNullable<typeof review> => Boolean(review)),
          }),
        );
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
  if (error || !profile) {
    return (
      <ProfileShell eyebrow="Public profile" title="Contractor not found">
        <p>This listing is not in the public directory of approved, active contractors.</p>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell eyebrow="Public profile" title={profile.displayLabel}>
      <ProfileSections profile={profile} />
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
  const card = toPublicContractorCard({
    id: row.slug,
    displayLabel: row.displayLabel,
    categories: row.categories,
    serviceArea: row.serviceArea,
    yearsExperience: row.yearsExperience,
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    badges: row.badges,
    shortDescription: row.shortDescription,
    demo: true,
  });
  const profile = toPublicContractorProfile(card, {
    about: row.about,
    services: row.categories,
    portfolio: row.portfolio as PublicSafePortfolioItem[],
    reviews: row.reviews.map((review) => ({ ...review, demo: true })),
    demo: true,
  });
  return (
    <ProfileShell eyebrow="DEMO / EXAMPLE PROFILE" title={row.displayLabel} demo>
      <p className="rounded-2xl bg-gold-500/20 px-4 py-3 text-sm text-forest-950">{DEMO_BANNER}</p>
      <ProfileSections profile={profile} demo />
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
