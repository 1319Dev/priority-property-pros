import { Link } from "react-router-dom";
import { ContractorAvatar } from "../../components/media/ContractorAvatar";
import { PostProjectLink } from "../../components/layout/PostProjectLink";
import { CUSTOMER_CTA } from "../../data/brand";
import { postProjectPath } from "../../lib/marketplace/customerCopy";
import {
  FIND_A_PRO_LAYOUT_CLASS,
  FIND_A_PRO_PATH,
  NEW_ON_PPP,
  NO_REVIEWS_YET,
  PORTFOLIO_EMPTY,
  showVerifiedProjectBadge,
  VERIFIED_PROJECT_LABEL,
  yearsInBusinessLabel,
  type FindAProProfile,
} from "../../lib/marketplace/findAPro";
import { PublicPortfolioGallery } from "./PublicPortfolioGallery";

export function ContractorStorefront({ profile }: { profile: FindAProProfile }) {
  const years = yearsInBusinessLabel(profile.yearsExperience);
  return (
    <article className={`min-w-0 max-w-full break-words ${FIND_A_PRO_LAYOUT_CLASS}`}>
      <header className="rounded-3xl border border-forest-800/10 bg-cream-50 p-4 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <ContractorAvatar size={64} />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Find a Pro</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-forest-800 sm:text-4xl">{profile.displayLabel}</h1>
          </div>
        </div>
        <div className="mt-4 space-y-1 text-sm leading-relaxed text-ink-700">
          {profile.primaryService ? (
            <p>
              <span className="font-semibold text-forest-800">{profile.primaryService}</span>
              {profile.otherServices.length > 0 ? ` · ${profile.otherServices.join(", ")}` : ""}
            </p>
          ) : null}
          <p>{profile.serviceArea}</p>
          {years ? <p>{years}</p> : null}
          {profile.acceptingWork === true ? <p className="font-semibold text-forest-800">Accepting work</p> : null}
          {profile.acceptingWork === false ? <p>Not accepting work</p> : null}
        </div>
        {profile.newOnPlatform ? (
          <div className="mt-4">
            <p className="font-semibold text-forest-800">{NEW_ON_PPP}</p>
            <p className="text-sm text-ink-700">{NO_REVIEWS_YET}</p>
          </div>
        ) : (
          <p className="mt-4 font-semibold text-forest-800">{profile.ratingLabel}</p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <PostProjectLink to={postProjectPath({ contractorId: profile.id, trade: profile.primaryService })} size="sm">
            {CUSTOMER_CTA}
          </PostProjectLink>
        </div>
      </header>

      <section className="mt-6">
        <h2 className="font-display text-2xl text-forest-800">About</h2>
        <p className="mt-2 text-base leading-relaxed text-ink-700">{profile.about}</p>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-2xl text-forest-800">Services</h2>
        {profile.categories.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {profile.categories.map((service) => (
              <li key={service} className="rounded-full bg-cream-100 px-3 py-1 text-sm text-forest-800">
                {service}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-700">Services not listed yet.</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-display text-2xl text-forest-800">Service area</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          {profile.serviceArea}. The public page shows a general area only — not a street address or map pin.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-2xl text-forest-800">Portfolio</h2>
        <PublicPortfolioGallery items={profile.portfolio} empty={PORTFOLIO_EMPTY} />
      </section>

      <section className="mt-6">
        <h2 className="font-display text-2xl text-forest-800">Credentials</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {profile.badges.map((badge) => (
            <li key={`${badge.kind}:${badge.label}`} className="rounded-full bg-cream-100 px-3 py-1 text-sm font-semibold text-forest-800">
              {badge.label}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Badges repeat records already stored for this approved pro. Priority Property Pros does not verify licenses,
          insurance, or workmanship.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-2xl text-forest-800">Reviews</h2>
        {profile.reviews.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700">{NO_REVIEWS_YET}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {profile.reviews.map((review) => (
              <li key={review.id} className="min-w-0 break-words rounded-3xl bg-cream-100 px-4 py-3 text-sm">
                <p className="font-semibold text-forest-800">{review.rating.toFixed(1)} ★</p>
                {showVerifiedProjectBadge(review) ? (
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-forest-800">{VERIFIED_PROJECT_LABEL}</p>
                ) : null}
                <p className="mt-1 text-ink-700">{review.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6">
        <Link to={FIND_A_PRO_PATH} className="inline-flex min-h-11 items-center font-semibold text-forest-800 underline">
          Back to Find a Pro
        </Link>
      </p>
    </article>
  );
}
