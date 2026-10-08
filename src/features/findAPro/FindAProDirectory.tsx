import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { PostProjectLink } from "../../components/layout/PostProjectLink";
import { PostProjectTextLink } from "../../components/layout/PublicCtas";
import { ContractorAvatar } from "../../components/media/ContractorAvatar";
import { TextInput } from "../../components/ui/Input";
import { CUSTOMER_CTA } from "../../data/brand";
import {
  applyFindAProFilters,
  FIND_A_PRO_EMPTY_BODY,
  FIND_A_PRO_EMPTY_TITLE,
  FIND_A_PRO_LAYOUT_CLASS,
  NEW_ON_PPP,
  NO_REVIEWS_YET,
  yearsInBusinessLabel,
  type FindAProCard,
  type FindAProReviewStatus,
} from "../../lib/marketplace/findAPro";
import { liveContractorPath } from "../../lib/marketplace/publicDirectory";
import { postProjectPath } from "../../lib/marketplace/customerCopy";

const selectClass =
  "min-h-14 w-full max-w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 text-base text-ink-900";

export function FindAProCardView({ card }: { card: FindAProCard }) {
  const years = yearsInBusinessLabel(card.yearsExperience);
  const other = card.otherServices.length > 0 ? card.otherServices.join(", ") : null;
  return (
    <article className={`min-w-0 max-w-full break-words rounded-3xl border border-forest-800/10 bg-cream-50 p-4 ${FIND_A_PRO_LAYOUT_CLASS}`}>
      <div className="flex min-w-0 items-start gap-3">
        <ContractorAvatar size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold text-forest-800">{card.displayLabel}</h2>
          {card.primaryService ? (
            <p className="mt-1 text-sm text-ink-700">
              <span className="font-semibold text-forest-800">{card.primaryService}</span>
              {other ? <span>{` · ${other}`}</span> : null}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-ink-700">{card.serviceArea}</p>
          {years ? <p className="mt-1 text-sm text-ink-700">{years}</p> : null}
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">{card.shortDescription}</p>
      {card.acceptingWork === true ? (
        <p className="mt-3 inline-flex min-h-11 items-center rounded-full bg-forest-800/10 px-3 text-sm font-semibold text-forest-800">
          Accepting work
        </p>
      ) : null}
      {card.acceptingWork === false ? (
        <p className="mt-3 text-sm text-ink-500">Not accepting work</p>
      ) : null}
      {card.badges.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {card.badges.map((badge) => (
            <li key={`${badge.kind}:${badge.label}`} className="rounded-full bg-cream-100 px-3 py-1 text-xs font-semibold text-forest-800">
              {badge.label}
            </li>
          ))}
        </ul>
      ) : null}
      {card.newOnPlatform ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-forest-800">{NEW_ON_PPP}</p>
          <p className="text-sm text-ink-700">{NO_REVIEWS_YET}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-forest-800">{card.ratingLabel}</p>
      )}
      <PortfolioPreview items={card.portfolio} />
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          to={liveContractorPath(card.id)}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest-800 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-cream-50"
        >
          View Profile
        </Link>
        <PostProjectLink to={postProjectPath({ contractorId: card.id, trade: card.primaryService })} variant="outline" size="sm">
          {CUSTOMER_CTA}
        </PostProjectLink>
      </div>
    </article>
  );
}

function PortfolioPreview({ items }: { items: FindAProCard["portfolio"] }) {
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-ink-500">No portfolio yet</p>;
  }
  return (
    <ul className="mt-3 grid min-w-0 gap-2">
      {items.slice(0, 2).map((item) => (
        <li key={item.id} className="min-w-0 break-words rounded-2xl bg-cream-100 px-3 py-2 text-sm text-ink-700">
          {item.caption}
        </li>
      ))}
    </ul>
  );
}

export function FindAProDirectory({
  cards,
  failed = false,
  loading,
  onRetry,
}: {
  cards: FindAProCard[];
  failed?: boolean;
  loading: boolean;
  onRetry?: () => void;
}) {
  const [service, setService] = useState("");
  const [area, setArea] = useState("");
  const [acceptingWorkOnly, setAcceptingWorkOnly] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<FindAProReviewStatus>("any");
  const [minRating, setMinRating] = useState<number | null>(null);

  const visible = useMemo(
    () =>
      applyFindAProFilters(cards, {
        service,
        area,
        acceptingWorkOnly,
        reviewStatus,
        minRating,
      }),
    [cards, service, area, acceptingWorkOnly, reviewStatus, minRating],
  );
  const showEmpty = !loading && cards.length === 0;
  const showNoMatches = !loading && cards.length > 0 && visible.length === 0;

  return (
    <div className={FIND_A_PRO_LAYOUT_CLASS}>
      <form className="grid min-w-0 gap-3 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <TextInput label="Service" name="service" value={service} onChange={(event) => setService(event.target.value)} autoComplete="off" />
        <TextInput
          label="Area"
          name="area"
          value={area}
          onChange={(event) => setArea(event.target.value)}
          hint="City or general area. Public cards do not include street addresses or map coordinates."
          autoComplete="off"
        />
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-forest-800">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={acceptingWorkOnly}
            onChange={(event) => setAcceptingWorkOnly(event.target.checked)}
          />
          Accepting work
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Reviews</span>
          <select
            className={selectClass}
            value={reviewStatus}
            aria-label="Reviews"
            onChange={(event) => setReviewStatus(event.target.value as FindAProReviewStatus)}
          >
            <option value="any">Any review status</option>
            <option value="reviewed">Has reviews</option>
            <option value="new">New — no reviews yet</option>
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Minimum rating</span>
          <select
            className={selectClass}
            aria-label="Minimum rating"
            value={minRating == null ? "" : String(minRating)}
            onChange={(event) => setMinRating(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Any rating</option>
            <option value="4">4.0 and up</option>
            <option value="4.5">4.5 and up</option>
          </select>
        </label>
      </form>

      <div className="mt-6">
        {loading ? <BrandLoader layout="section" label="Loading contractors…" /> : null}
        {showEmpty && !failed ? (
          <div className="rounded-3xl border border-dashed border-forest-800/20 bg-cream-100/70 px-5 py-6">
            <p className="font-display text-2xl text-forest-800">{FIND_A_PRO_EMPTY_TITLE}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{FIND_A_PRO_EMPTY_BODY}</p>
            <p className="mt-4">
              <PostProjectTextLink to="/post-project" className="inline-flex min-h-11 items-center font-semibold text-forest-800 underline">
                Post a project
              </PostProjectTextLink>
            </p>
          </div>
        ) : null}
        {showEmpty && failed ? (
          <p className="text-sm text-ink-700">Contractors could not be loaded. You can try again in a moment.</p>
        ) : null}
        {showEmpty && failed && onRetry ? (
          <p className="mt-3">
            <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 underline">
              Try again
            </button>
          </p>
        ) : null}
        {showNoMatches ? <p className="text-sm text-ink-700">No contractors match these filters.</p> : null}
        {visible.length > 0 ? (
          <ul className="space-y-3">
            {visible.map((card) => (
              <li key={card.id} className="min-w-0">
                <FindAProCardView card={card} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
