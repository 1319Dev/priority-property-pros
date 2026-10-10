import { describe, expect, it } from "vitest";
import {
  comparisonHighlights,
  ratingComparisonLabel,
  sortComparisonEstimates,
  startComparisonLabel,
  type ComparisonEstimate,
} from "./estimateComparison";

function row(patch: Partial<ComparisonEstimate> & Pick<ComparisonEstimate, "id" | "totalCents">): ComparisonEstimate {
  return {
    businessName: patch.id,
    lineItems: [{ id: `${patch.id}-labor`, label: "Labor" }],
    timelineLabel: "8 hours",
    startLabel: "2026-04-10",
    ratingAverage: null,
    ratingCount: 0,
    ratingLabel: "No reviews yet",
    badges: [],
    submittedAt: "2026-04-01T00:00:00.000Z",
    ...patch,
  };
}

describe("estimate comparison sorting", () => {
  const rows = [
    row({
      id: "high",
      businessName: "High Price Co.",
      totalCents: 180000,
      submittedAt: "2026-04-01T00:00:00.000Z",
      ratingAverage: 4.9,
      ratingCount: 12,
      ratingLabel: "4.9 · 12 reviews",
      timelineLabel: "6 hours",
      lineItems: [{ id: "h1", label: "Labor" }],
    }),
    row({
      id: "low",
      businessName: "Low Price Co.",
      totalCents: 90000,
      submittedAt: "2026-04-03T00:00:00.000Z",
      ratingAverage: 4.2,
      ratingCount: 3,
      ratingLabel: "4.2 · 3 reviews",
      timelineLabel: "12 hours",
      startLabel: "2026-04-20",
      lineItems: [
        { id: "l1", label: "Labor" },
        { id: "l2", label: "Haul-away" },
      ],
    }),
    row({
      id: "new",
      businessName: "New Crew",
      totalCents: 120000,
      submittedAt: "2026-04-02T00:00:00.000Z",
      ratingAverage: null,
      ratingCount: 0,
      ratingLabel: "No reviews yet",
    }),
  ];

  it("keeps arrival order until the customer sorts by price or rating", () => {
    expect(sortComparisonEstimates(rows, "arrival").map((item) => item.id)).toEqual(["high", "new", "low"]);
    expect(sortComparisonEstimates(rows, "lowest_price").map((item) => item.id)).toEqual(["low", "new", "high"]);
    expect(sortComparisonEstimates(rows, "best_rated").map((item) => item.id)).toEqual(["high", "low", "new"]);
  });

  it("highlights the lowest price, highest rating, soonest start, and shortest timeline", () => {
    const highlights = comparisonHighlights(rows);
    expect(highlights.lowestPriceIds).toEqual(["low"]);
    expect(highlights.highestRatingIds).toEqual(["high"]);
    expect(highlights.soonestStartIds).toEqual(["high", "new"]);
    expect(highlights.shortestTimelineIds).toEqual(["high"]);
    expect(ratingComparisonLabel(null, 0)).toBe("No reviews yet");
    expect(ratingComparisonLabel(5, 1)).toBe("5.0 · 1 review");
    expect(startComparisonLabel("2026-04-10")).toBe("Fri, Apr 10");
    expect(startComparisonLabel("2026-04-10T00:00:00.000Z")).toBe("Fri, Apr 10");
    expect(startComparisonLabel(null)).toBe("Not stated");
  });

  it("does not invent a highlight when every compared value matches", () => {
    const same = [
      row({ id: "a", totalCents: 1000, ratingAverage: 5, ratingCount: 2, ratingLabel: "5.0 · 2 reviews" }),
      row({ id: "b", totalCents: 1000, submittedAt: "2026-04-02T00:00:00.000Z", ratingAverage: 5, ratingCount: 2, ratingLabel: "5.0 · 2 reviews" }),
    ];
    const highlights = comparisonHighlights(same);
    expect(highlights.lowestPriceIds).toEqual([]);
    expect(highlights.highestRatingIds).toEqual([]);
    expect(highlights.soonestStartIds).toEqual([]);
    expect(highlights.shortestTimelineIds).toEqual([]);
  });
});
