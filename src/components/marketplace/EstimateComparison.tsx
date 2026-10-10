import { useState, type ReactNode } from "react";
import { Button, ButtonLink } from "../ui/Button";
import { StatusBanner } from "../ui/StatusBanner";
import { formatUsdFromCents } from "../../lib/marketplace/fees";
import {
  comparisonHighlights,
  sortComparisonEstimates,
  startComparisonLabel,
  type ComparisonEstimate,
  type EstimateComparisonSort,
} from "../../lib/marketplace/estimateComparison";

export type ComparisonViewRow = ComparisonEstimate & {
  selectable: boolean;
  declinable: boolean;
  selected: boolean;
  outOfDate: boolean;
  statusLabel: string;
};

const SORTS: Array<{ key: EstimateComparisonSort; label: string }> = [
  { key: "arrival", label: "As sent" },
  { key: "lowest_price", label: "Lowest price" },
  { key: "best_rated", label: "Best rated" },
];

function highlightNote(ids: readonly string[], id: string, label: string): string | null {
  return ids.includes(id) ? label : null;
}

export function EstimateComparison({
  rows,
  confirmId,
  busy,
  bookingHref,
  selectedCopy,
  confirmBody,
  onStartHire,
  onConfirmHire,
  onCancelHire,
  onDecline,
}: {
  rows: ComparisonViewRow[];
  confirmId: string | null;
  busy: boolean;
  bookingHref: string | null;
  selectedCopy: string;
  confirmBody: string;
  onStartHire: (id: string) => void;
  onConfirmHire: (id: string) => void;
  onCancelHire: () => void;
  onDecline: (id: string) => void;
}) {
  const [sort, setSort] = useState<EstimateComparisonSort>("arrival");
  const ordered = sortComparisonEstimates(rows, sort);
  const highlights = comparisonHighlights(rows);

  return (
    <section id="compare" className="space-y-4" aria-label="Compare estimates">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl text-forest-800">Compare estimates</h2>
        <div className="flex flex-wrap gap-2" aria-label="Sort estimates">
          {SORTS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`min-h-11 rounded-full px-4 text-sm font-semibold ${
                sort === item.key ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-forest-800"
              }`}
              aria-pressed={sort === item.key}
              onClick={() => setSort(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-ink-700">Compare up to three estimates side by side. Pick the pro that fits you best.</p>
      {ordered.length === 0 ? <p className="text-sm text-ink-500">Submitted estimates will appear here.</p> : null}
      <p className="text-sm font-semibold text-forest-800 lg:hidden">Swipe sideways to compare pros.</p>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:hidden" aria-label="Estimate cards">
        {ordered.map((row) => (
          <article
            key={row.id}
            className="w-[85%] max-w-sm shrink-0 snap-center rounded-3xl border border-forest-800/10 bg-cream-50 p-4"
            aria-label={row.businessName}
          >
            <EstimateBody
              row={row}
              highlights={highlights}
              confirmId={confirmId}
              busy={busy}
              bookingHref={bookingHref}
              selectedCopy={selectedCopy}
              confirmBody={confirmBody}
              onStartHire={onStartHire}
              onConfirmHire={onConfirmHire}
              onCancelHire={onCancelHire}
              onDecline={onDecline}
            />
          </article>
        ))}
      </div>
      <div className="hidden min-w-0 lg:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-44" />
            {ordered.map((row) => (
              <col key={row.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-forest-800/10 text-left">
              <th className="whitespace-nowrap px-3 py-3 font-semibold text-ink-500" scope="col">
                <span className="sr-only">Detail</span>
              </th>
              {ordered.map((row) => (
                <th key={row.id} scope="col" className="break-words px-3 py-3 font-display text-xl text-forest-800">
                  {row.businessName}
                  <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{row.statusLabel}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <CompareRow label="Price">
              {ordered.map((row) => (
                <CompareCell key={row.id} note={highlightNote(highlights.lowestPriceIds, row.id, "Lowest price")}>
                  <span className="text-lg font-semibold text-forest-800">{formatUsdFromCents(row.totalCents)}</span>
                </CompareCell>
              ))}
            </CompareRow>
            <CompareRow label="Included">
              {ordered.map((row) => (
                <CompareCell key={row.id} note={null}>
                  <LineList items={row.lineItems} />
                </CompareCell>
              ))}
            </CompareRow>
            <CompareRow label="Timeline">
              {ordered.map((row) => (
                <CompareCell key={row.id} note={highlightNote(highlights.shortestTimelineIds, row.id, "Shortest timeline")}>
                  {row.timelineLabel}
                </CompareCell>
              ))}
            </CompareRow>
            <CompareRow label="Start">
              {ordered.map((row) => (
                <CompareCell key={row.id} note={highlightNote(highlights.soonestStartIds, row.id, "Soonest start")}>
                  {startComparisonLabel(row.startAt || row.startLabel)}
                </CompareCell>
              ))}
            </CompareRow>
            <CompareRow label="Rating">
              {ordered.map((row) => (
                <CompareCell key={row.id} note={highlightNote(highlights.highestRatingIds, row.id, "Highest rating")}>
                  {row.ratingLabel}
                </CompareCell>
              ))}
            </CompareRow>
            <CompareRow label="Verified" border={false}>
              {ordered.map((row) => (
                <CompareCell key={row.id} note={null}>
                  <BadgeList badges={row.badges} />
                </CompareCell>
              ))}
            </CompareRow>
            <CompareRow label="Hire" border={false}>
              {ordered.map((row) => (
                <CompareCell key={row.id} note={null}>
                  <HireActions
                    row={row}
                    confirmId={confirmId}
                    busy={busy}
                    bookingHref={bookingHref}
                    selectedCopy={selectedCopy}
                    confirmBody={confirmBody}
                    onStartHire={onStartHire}
                    onConfirmHire={onConfirmHire}
                    onCancelHire={onCancelHire}
                    onDecline={onDecline}
                  />
                </CompareCell>
              ))}
            </CompareRow>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CompareRow({
  label,
  border = true,
  children,
}: {
  label: string;
  border?: boolean;
  children: ReactNode;
}) {
  return (
    <tr className={border ? "border-b border-forest-800/10 align-top" : "align-top"}>
      <th scope="row" className="whitespace-nowrap px-3 py-3 text-left font-semibold text-forest-800">
        {label}
      </th>
      {children}
    </tr>
  );
}

function CompareCell({ note, children }: { note: string | null; children: ReactNode }) {
  return (
    <td className={`break-words px-3 py-3 align-top ${note ? "bg-gold-500/20" : ""}`}>
      {children}
      {note ? <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{note}</span> : null}
    </td>
  );
}

function MobileField({ note, children }: { note: string | null; children: ReactNode }) {
  return (
    <div className={note ? "rounded-2xl bg-gold-500/20 px-3 py-2" : undefined}>
      {children}
      {note ? <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{note}</span> : null}
    </div>
  );
}

function LineList({ items }: { items: ComparisonEstimate["lineItems"] }) {
  if (items.length === 0) return <p>Not stated</p>;
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  );
}

function BadgeList({ badges }: { badges: string[] }) {
  if (badges.length === 0) return <p className="text-ink-500">No verified badges yet</p>;
  return (
    <ul className="space-y-1">
      {badges.map((badge) => (
        <li key={badge} className="font-semibold text-forest-800">
          {badge}
        </li>
      ))}
    </ul>
  );
}

function EstimateBody({
  row,
  highlights,
  confirmId,
  busy,
  bookingHref,
  selectedCopy,
  confirmBody,
  onStartHire,
  onConfirmHire,
  onCancelHire,
  onDecline,
}: {
  row: ComparisonViewRow;
  highlights: ReturnType<typeof comparisonHighlights>;
  confirmId: string | null;
  busy: boolean;
  bookingHref: string | null;
  selectedCopy: string;
  confirmBody: string;
  onStartHire: (id: string) => void;
  onConfirmHire: (id: string) => void;
  onCancelHire: () => void;
  onDecline: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-2xl text-forest-800">{row.businessName}</h3>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{row.statusLabel}</p>
      {row.outOfDate ? (
        <StatusBanner tone="warning" title="This estimate is out of date" body="The job details changed after this price was sent." />
      ) : null}
      <MobileField note={highlightNote(highlights.lowestPriceIds, row.id, "Lowest price")}>
        <p className="text-lg font-semibold text-forest-800">{formatUsdFromCents(row.totalCents)}</p>
      </MobileField>
      <div>
        <p className="font-semibold text-forest-800">Included</p>
        <LineList items={row.lineItems} />
      </div>
      <MobileField note={highlightNote(highlights.shortestTimelineIds, row.id, "Shortest timeline")}>
        <p>
          <span className="font-semibold text-forest-800">Timeline: </span>
          {row.timelineLabel}
        </p>
      </MobileField>
      <MobileField note={highlightNote(highlights.soonestStartIds, row.id, "Soonest start")}>
        <p>
          <span className="font-semibold text-forest-800">Start: </span>
          {startComparisonLabel(row.startAt || row.startLabel)}
        </p>
      </MobileField>
      <MobileField note={highlightNote(highlights.highestRatingIds, row.id, "Highest rating")}>
        <p>
          <span className="font-semibold text-forest-800">Rating: </span>
          {row.ratingLabel}
        </p>
      </MobileField>
      <div>
        <p className="font-semibold text-forest-800">Verified</p>
        <BadgeList badges={row.badges} />
      </div>
      <HireActions
        row={row}
        confirmId={confirmId}
        busy={busy}
        bookingHref={bookingHref}
        selectedCopy={selectedCopy}
        confirmBody={confirmBody}
        onStartHire={onStartHire}
        onConfirmHire={onConfirmHire}
        onCancelHire={onCancelHire}
        onDecline={onDecline}
      />
    </div>
  );
}

function HireActions({
  row,
  confirmId,
  busy,
  bookingHref,
  selectedCopy,
  confirmBody,
  onStartHire,
  onConfirmHire,
  onCancelHire,
  onDecline,
}: {
  row: ComparisonViewRow;
  confirmId: string | null;
  busy: boolean;
  bookingHref: string | null;
  selectedCopy: string;
  confirmBody: string;
  onStartHire: (id: string) => void;
  onConfirmHire: (id: string) => void;
  onCancelHire: () => void;
  onDecline: (id: string) => void;
}) {
  if (row.selected) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-forest-800">{selectedCopy}</p>
        {bookingHref ? (
          <ButtonLink to={bookingHref} className="min-h-14 w-full">
            View booking
          </ButtonLink>
        ) : null}
      </div>
    );
  }
  if (row.outOfDate) return <p className="text-sm text-ink-500">Waiting on a new estimate from this pro.</p>;
  if (!row.selectable && !row.declinable) return <p className="text-sm text-ink-500">{row.statusLabel}</p>;
  return (
    <div className="space-y-2">
      {row.selectable && confirmId === row.id ? (
        <>
          <p className="text-sm text-ink-700">{confirmBody}</p>
          <Button type="button" className="min-h-14 w-full" disabled={busy} onClick={() => onConfirmHire(row.id)}>
            Confirm this pro
          </Button>
          <Button type="button" variant="ghost" className="min-h-12 w-full" onClick={onCancelHire}>
            Keep comparing
          </Button>
        </>
      ) : null}
      {row.selectable && confirmId !== row.id ? (
        <Button type="button" className="min-h-14 w-full" onClick={() => onStartHire(row.id)}>
          Hire
        </Button>
      ) : null}
      {row.declinable ? (
        <Button type="button" variant="outline" className="min-h-12 w-full" disabled={busy} onClick={() => onDecline(row.id)}>
          Decline
        </Button>
      ) : null}
    </div>
  );
}
