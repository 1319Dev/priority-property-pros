import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadReviewedContractors } from "./reviewedContractorsApi";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    fetchPublicContractorDirectory: vi.fn(),
    fetchPublicContractorReviews: vi.fn(),
  };
});

import { fetchPublicContractorDirectory, fetchPublicContractorReviews } from "./api";

const directory = vi.mocked(fetchPublicContractorDirectory);
const reviews = vi.mocked(fetchPublicContractorReviews);

const reviewedId = "22222222-2222-4222-8222-222222222222";

describe("reviewed contractor loader", () => {
  beforeEach(() => {
    directory.mockReset();
    reviews.mockReset();
  });

  it("keeps the directory average when a hidden review is in the payload", async () => {
    directory.mockResolvedValue([
      {
        id: reviewedId,
        display_label: "Handyman pro in Houston",
        primary_trade: "Handyman",
        categories: ["Handyman"],
        service_area: "Houston",
        years_experience: 4,
        rating_average: 5,
        rating_count: 2,
        badges: [],
        short_description: "Independent local contractor.",
        business_name: "Northside Fence Co.",
      } as Awaited<ReturnType<typeof fetchPublicContractorDirectory>>[number],
    ]);
    reviews.mockResolvedValue([
      { id: "rev-1", rating: 5, body: "Showed up and finished the repair." },
      { id: "rev-2", rating: 5, body: "Would hire again for the same kind of work." },
      { id: "rev-hidden", rating: 1, body: "This row was hidden by an admin.", hidden: true },
      { id: "rev-open", rating: 1, body: "This row is not a verified job.", verified: false },
    ] as Awaited<ReturnType<typeof fetchPublicContractorReviews>>);

    const cards = await loadReviewedContractors();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.displayLabel).toBe("Handyman pro in Houston");
    expect(cards[0]?.ratingAverage).toBe(5);
    expect(cards[0]?.ratingCount).toBe(2);
    expect(cards[0]?.reviews.map((review) => review.id)).toEqual(["rev-1", "rev-2"]);
    expect(JSON.stringify(cards)).not.toMatch(/Northside|business_name|businessName/);
  });
});
