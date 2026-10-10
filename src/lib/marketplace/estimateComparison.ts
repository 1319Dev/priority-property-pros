export type ComparisonLine = {
  id: string;
  label: string;
};

export type ComparisonEstimate = {
  id: string;
  businessName: string;
  totalCents: number;
  lineItems: ComparisonLine[];
  timelineLabel: string;
  timelineHours?: number | null;
  startLabel: string;
  /** Calendar date (`YYYY-MM-DD`) used to pick the soonest start. */
  startAt?: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  ratingLabel: string;
  badges: string[];
  submittedAt: string | null;
};

export type EstimateComparisonSort = "arrival" | "lowest_price" | "best_rated";

export type ComparisonHighlights = {
  lowestPriceIds: string[];
  highestRatingIds: string[];
  soonestStartIds: string[];
  shortestTimelineIds: string[];
};

export function ratingComparisonLabel(average: number | null | undefined, count: number | null | undefined): string {
  const reviews = count ?? 0;
  if (average == null || Number.isNaN(average) || reviews <= 0) return "No reviews yet";
  const unit = reviews === 1 ? "review" : "reviews";
  return `${Number(average).toFixed(1)} · ${reviews} ${unit}`;
}

export function timelineComparisonLabel(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(Number(hours))) return "Not stated";
  return `${hours} hours`;
}

/** Date-only values stay on that calendar day in any timezone. */
export function calendarStartDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec((value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function startComparisonLabel(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text || /^not stated$/i.test(text)) return "Not stated";
  const date = calendarStartDate(text);
  if (!date) return /^\d{4}-\d{2}-\d{2}/.test(text) ? "Not stated" : text;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
}

export function includedSignature(items: readonly ComparisonLine[]): string {
  return items
    .map((item) => item.label.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

/** Arrival order is the default. Price and rating sorts run only when the customer picks them. */
export function sortComparisonEstimates<T extends ComparisonEstimate>(
  rows: readonly T[],
  sort: EstimateComparisonSort,
): T[] {
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    if (sort === "lowest_price" && a.row.totalCents !== b.row.totalCents) {
      return a.row.totalCents - b.row.totalCents;
    }
    if (sort === "best_rated") {
      const aRated = a.row.ratingCount > 0 && a.row.ratingAverage != null;
      const bRated = b.row.ratingCount > 0 && b.row.ratingAverage != null;
      if (aRated !== bRated) return aRated ? -1 : 1;
      if (aRated && bRated && a.row.ratingAverage !== b.row.ratingAverage) {
        return (b.row.ratingAverage ?? 0) - (a.row.ratingAverage ?? 0);
      }
      if (aRated && bRated && a.row.ratingCount !== b.row.ratingCount) {
        return b.row.ratingCount - a.row.ratingCount;
      }
    }
    const left = a.row.submittedAt ?? "";
    const right = b.row.submittedAt ?? "";
    if (left !== right) return left.localeCompare(right);
    return a.index - b.index;
  });
  return indexed.map((item) => item.row);
}

function timelineHoursOf(row: ComparisonEstimate): number | null {
  if (row.timelineHours != null && !Number.isNaN(Number(row.timelineHours))) return Number(row.timelineHours);
  const match = /^(\d+(?:\.\d+)?) hours$/.exec(row.timelineLabel.trim());
  return match ? Number(match[1]) : null;
}

function startSortKey(row: ComparisonEstimate): number | null {
  const date = calendarStartDate((row.startAt ?? "").trim() || row.startLabel);
  return date ? date.getTime() : null;
}

export function comparisonHighlights(rows: readonly ComparisonEstimate[]): ComparisonHighlights {
  const prices = rows.map((row) => row.totalCents);
  const lowest = prices.length > 0 ? Math.min(...prices) : null;
  const rated = rows.filter((row) => row.ratingCount > 0 && row.ratingAverage != null);
  const best = rated.length > 0 ? Math.max(...rated.map((row) => row.ratingAverage ?? 0)) : null;
  const startKeys = rows.map(startSortKey);
  const knownStarts = startKeys.filter((value): value is number => value != null);
  const soonest = knownStarts.length > 0 ? Math.min(...knownStarts) : null;
  const hourValues = rows.map(timelineHoursOf);
  const knownHours = hourValues.filter((value): value is number => value != null);
  const shortest = knownHours.length > 0 ? Math.min(...knownHours) : null;
  return {
    lowestPriceIds:
      lowest != null && new Set(prices).size > 1 ? rows.filter((row) => row.totalCents === lowest).map((row) => row.id) : [],
    highestRatingIds:
      best != null && new Set(rows.map((row) => row.ratingLabel)).size > 1
        ? rated.filter((row) => row.ratingAverage === best).map((row) => row.id)
        : [],
    soonestStartIds:
      soonest != null && new Set(knownStarts).size > 1
        ? rows.filter((_, index) => startKeys[index] === soonest).map((row) => row.id)
        : [],
    shortestTimelineIds:
      shortest != null && new Set(knownHours).size > 1
        ? rows.filter((_, index) => hourValues[index] === shortest).map((row) => row.id)
        : [],
  };
}
