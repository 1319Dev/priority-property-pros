import { beforeEach, describe, expect, it, vi } from "vitest";
import { SMOKE_TESTER_CONTRACTOR_PROFILE_ID } from "./publicReviewFilters";
import { loadFindAProDirectory, loadFindAProStorefront } from "./findAProApi";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    fetchPublicContractorDirectory: vi.fn(),
    fetchPublicContractor: vi.fn(),
    fetchPublicContractorReviews: vi.fn(),
    fetchPublicContractorPortfolio: vi.fn(),
    fetchPublicDirectoryAcceptingWork: vi.fn(),
  };
});

import {
  fetchPublicContractor,
  fetchPublicContractorDirectory,
  fetchPublicContractorPortfolio,
  fetchPublicContractorReviews,
  fetchPublicDirectoryAcceptingWork,
} from "./api";

const directory = vi.mocked(fetchPublicContractorDirectory);
const contractor = vi.mocked(fetchPublicContractor);
const reviews = vi.mocked(fetchPublicContractorReviews);
const portfolio = vi.mocked(fetchPublicContractorPortfolio);
const accepting = vi.mocked(fetchPublicDirectoryAcceptingWork);

const zeroId = "11111111-1111-4111-8111-111111111111";
const reviewedId = "22222222-2222-4222-8222-222222222222";

function row(id: string, ratingCount: number) {
  return {
    id,
    display_label: id === reviewedId ? "Approved Handyman Pro" : "Approved Fence Pro",
    primary_trade: "Fence",
    categories: ["Fence Repair"],
    service_area: "Houston",
    years_experience: 4,
    rating_average: ratingCount > 0 ? 5 : null,
    rating_count: ratingCount,
    badges: [{ kind: "APPROVED", label: "Approved Pro" }],
    short_description: "Independent local contractor.",
    about: "Small repairs for property owners.",
  };
}

describe("Find a Pro directory loader", () => {
  beforeEach(() => {
    directory.mockReset();
    contractor.mockReset();
    reviews.mockReset();
    portfolio.mockReset();
    accepting.mockReset();
    reviews.mockResolvedValue([]);
    portfolio.mockResolvedValue([]);
    accepting.mockResolvedValue([
      { id: zeroId, accepting_work: true },
      { id: reviewedId, accepting_work: false },
    ]);
  });

  it("keeps a zero-review approved contractor and a reviewed contractor", async () => {
    directory.mockResolvedValue([
      row(zeroId, 0),
      row(reviewedId, 2),
      row(SMOKE_TESTER_CONTRACTOR_PROFILE_ID, 3),
    ]);
    reviews.mockImplementation(async (id) => {
      if (id !== reviewedId) return [];
      return [
        { id: "rev-1", rating: 5, body: "Showed up and finished the repair." },
        { id: "rev-2", rating: 4, body: "Would hire again for the same kind of work." },
      ];
    });
    portfolio.mockImplementation(async (id) => (id === reviewedId ? [{ id: "photo-1", caption: "Rehung a gate", sort_order: 0 }] : []));

    const cards = await loadFindAProDirectory();
    const zero = cards.find((card) => card.id === zeroId);
    const reviewed = cards.find((card) => card.id === reviewedId);

    expect(cards.map((card) => card.id)).toEqual([zeroId, reviewedId]);
    expect(zero?.newOnPlatform).toBe(true);
    expect(zero?.ratingLabel).toBeNull();
    expect(zero?.acceptingWork).toBe(true);
    expect(zero?.portfolio).toEqual([]);
    expect(reviewed?.ratingLabel).toBe("4.5 ★ · 2 reviews");
    expect(reviewed?.portfolio.map((item) => item.caption)).toEqual(["Rehung a gate"]);
    expect(reviews).not.toHaveBeenCalledWith(zeroId);
    expect(JSON.stringify(cards)).not.toMatch(/phone|email|street_line|@|512-/i);
  });

  it("does not open a contractor the public RPC omits", async () => {
    contractor.mockResolvedValue(null);
    await expect(loadFindAProStorefront(zeroId)).resolves.toBeNull();
    await expect(loadFindAProStorefront(SMOKE_TESTER_CONTRACTOR_PROFILE_ID)).resolves.toBeNull();
    expect(contractor).toHaveBeenCalledTimes(1);
  });
});
