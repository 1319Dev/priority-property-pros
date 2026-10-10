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
  startLabel: string;
  ratingAverage: number | null;
  ratingCount: number;
  ratingLabel: string;
  badges: string[];
  submittedAt: string | null;
};

export type EstimateComparisonSort = "arrival" | "lowest_price" | "best_rated";

export type ComparisonField = "price" | "included" | "timeline" | "start" | "rating";

export type ComparisonHighlights = {
  differing: ComparisonField[];
  lowestPriceIds: string[];
  highestRatingIds: string[];
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

export function startComparisonLabel(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text || "Not stated";
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

export function comparisonHighlights(rows: readonly ComparisonEstimate[]): ComparisonHighlights {
  const differing: ComparisonField[] = [];
  if (rows.length >= 2) {
    if (new Set(rows.map((row) => row.totalCents)).size > 1) differing.push("price");
    if (new Set(rows.map((row) => includedSignature(row.lineItems))).size > 1) differing.push("included");
    if (new Set(rows.map((row) => row.timelineLabel)).size > 1) differing.push("timeline");
    if (new Set(rows.map((row) => row.startLabel)).size > 1) differing.push("start");
    if (new Set(rows.map((row) => row.ratingLabel)).size > 1) differing.push("rating");
  }
  const lowest = rows.length > 0 ? Math.min(...rows.map((row) => row.totalCents)) : null;
  const rated = rows.filter((row) => row.ratingCount > 0 && row.ratingAverage != null);
  const best = rated.length > 0 ? Math.max(...rated.map((row) => row.ratingAverage ?? 0)) : null;
  return {
    differing,
    lowestPriceIds:
      lowest != null && differing.includes("price") ? rows.filter((row) => row.totalCents === lowest).map((row) => row.id) : [],
    highestRatingIds:
      best != null && differing.includes("rating")
        ? rated.filter((row) => row.ratingAverage === best).map((row) => row.id)
        : [],
  };
}
