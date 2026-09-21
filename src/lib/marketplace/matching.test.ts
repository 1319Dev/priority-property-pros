import { describe, expect, it } from "vitest";
import {
  compareOfferRank,
  contractorEligibleForProject,
  contractorOfferFairnessPenalty,
  effectiveOfferScore,
  haversineMiles,
  nextOfferContractorIds,
  OFFER_FAIRNESS_MAX_PENALTY,
  openOfferSlotsNeeded,
  projectContractorFitScore,
  rankEligibleContractorsForOffers,
  type MatchingContractor,
  type OfferLoad,
} from "./matching";

function pro(partial: Partial<MatchingContractor> = {}): MatchingContractor {
  return {
    id: "pro-1",
    account_type: "CONTRACTOR",
    account_status: "ACTIVE",
    approval_status: "APPROVED",
    accepting_work: true,
    category_ids: ["tv"],
    min_job_cents: 5000,
    max_job_cents: 200000,
    has_verified_credential: false,
    areas: [
      {
        mode: "ZIPS",
        center_zip: "30318",
        center_lat: null,
        center_lng: null,
        radius_miles: null,
        zip_codes: ["30318", "30319"],
      },
    ],
    ...partial,
  };
}

const project = {
  category_id: "tv",
  zip_code: "30318",
  lat: 33.79,
  lng: -84.44,
  budget_min_cents: 10000,
  budget_max_cents: 40000,
  requires_verified_credential: false,
};

describe("matching eligibility", () => {
  it("matches an approved active contractor in-category and in-ZIP", () => {
    expect(contractorEligibleForProject(pro(), project).ok).toBe(true);
  });

  it("rejects pending approval, inactive accounts, and wrong category", () => {
    expect(contractorEligibleForProject(pro({ approval_status: "PENDING" }), project).ok).toBe(false);
    expect(contractorEligibleForProject(pro({ approval_status: "REJECTED" }), project).ok).toBe(false);
    expect(contractorEligibleForProject(pro({ account_status: "PENDING" }), project).ok).toBe(false);
    expect(contractorEligibleForProject(pro({ category_ids: ["paint"] }), project).ok).toBe(false);
    expect(
      contractorEligibleForProject(pro({ accepting_work: false }), project).ok,
    ).toBe(false);
  });

  it("uses the NEW categories, ZIP, radius, and Accepting Work after APPROVED+ACTIVE edits", () => {
    const edited = pro({
      category_ids: ["paint"],
      areas: [
        {
          mode: "ZIPS",
          center_zip: "10001",
          center_lat: null,
          center_lng: null,
          radius_miles: null,
          zip_codes: ["10001"],
        },
      ],
    });
    expect(contractorEligibleForProject(edited, project).ok).toBe(false);
    expect(
      contractorEligibleForProject(edited, { ...project, category_id: "paint", zip_code: "10001" }).ok,
    ).toBe(true);

    const wider = pro({
      areas: [
        {
          mode: "RADIUS",
          center_zip: "30318",
          center_lat: 33.79,
          center_lng: -84.44,
          radius_miles: 25,
          zip_codes: [],
        },
      ],
    });
    expect(contractorEligibleForProject(wider, { ...project, zip_code: "99999" }).ok).toBe(true);

    const paused = pro({ accepting_work: false });
    expect(contractorEligibleForProject(paused, project).ok).toBe(false);
  });

  it("rejects out-of-area ZIPs and too-small budgets", () => {
    expect(
      contractorEligibleForProject(pro(), { ...project, zip_code: "10001", lat: null, lng: null }).ok,
    ).toBe(false);
    expect(contractorEligibleForProject(pro({ min_job_cents: 50000 }), project).ok).toBe(false);
  });

  it("matches radius when coordinates are within miles", () => {
    const miles = haversineMiles(33.79, -84.44, 33.8, -84.45);
    expect(miles).not.toBeNull();
    expect(miles!).toBeLessThan(5);
    expect(
      contractorEligibleForProject(
        pro({
          areas: [
            {
              mode: "RADIUS",
              center_zip: "30318",
              center_lat: 33.79,
              center_lng: -84.44,
              radius_miles: 10,
              zip_codes: [],
            },
          ],
        }),
        { ...project, zip_code: "99999" },
      ).ok,
    ).toBe(true);
  });

  it("requires a verified credential only when the category says so", () => {
    expect(
      contractorEligibleForProject(pro({ has_verified_credential: false }), {
        ...project,
        requires_verified_credential: true,
      }).ok,
    ).toBe(false);
  });
});

describe("offer queue ranking and fairness", () => {
  it("scores ZIP matches above radius-only and never ranks ineligible contractors", () => {
    const zipPro = pro({ id: "zip", years_experience: 4 });
    const radiusPro = pro({
      id: "radius",
      years_experience: 4,
      areas: [
        {
          mode: "RADIUS",
          center_zip: "30318",
          center_lat: 33.79,
          center_lng: -84.44,
          radius_miles: 20,
          zip_codes: [],
        },
      ],
    });
    const farProject = { ...project, zip_code: "99999", lat: 33.8, lng: -84.45 };
    expect(projectContractorFitScore(zipPro, project)).toBeGreaterThan(
      projectContractorFitScore(radiusPro, farProject),
    );
    expect(projectContractorFitScore(pro({ approval_status: "PENDING" }), project)).toBe(0);
  });

  it("caps the fairness penalty so a much better fit still ranks first", () => {
    const busy: OfferLoad = {
      sameCategoryRecentOffers: 8,
      otherRecentOffers: 8,
      openAvailableCount: 3,
      lastOfferedAt: "2026-09-20T00:00:00.000Z",
    };
    const idle: OfferLoad = {
      sameCategoryRecentOffers: 0,
      otherRecentOffers: 0,
      openAvailableCount: 0,
      lastOfferedAt: null,
    };
    expect(contractorOfferFairnessPenalty(busy)).toBe(OFFER_FAIRNESS_MAX_PENALTY);
    expect(effectiveOfferScore(90, busy)).toBeGreaterThan(effectiveOfferScore(50, idle));
  });

  it("rotates similarly suited contractors toward whoever has had fewer recent offers", () => {
    const load = {
      star: {
        sameCategoryRecentOffers: 3,
        otherRecentOffers: 0,
        openAvailableCount: 1,
        lastOfferedAt: "2026-09-20T00:00:00.000Z",
      },
      rest: {
        sameCategoryRecentOffers: 0,
        otherRecentOffers: 0,
        openAvailableCount: 0,
        lastOfferedAt: null,
      },
    };
    const ranked = rankEligibleContractorsForOffers(
      project,
      [pro({ id: "star", years_experience: 5 }), pro({ id: "rest", years_experience: 5 })],
      load,
    );
    expect(ranked[0]).toBe("rest");
    expect(ranked[1]).toBe("star");
  });

  it("offers only the next unused contractors up to remaining live slots", () => {
    expect(openOfferSlotsNeeded(0, 0)).toBe(3);
    expect(openOfferSlotsNeeded(2, 1)).toBe(0);
    expect(openOfferSlotsNeeded(1, 0)).toBe(2);
    expect(nextOfferContractorIds(["a", "b", "c", "d"], ["a", "c"], 1)).toEqual(["b"]);
    expect(nextOfferContractorIds(["a", "b", "c", "d"], [], 3)).toEqual(["a", "b", "c"]);
    expect(nextOfferContractorIds(["a", "b"], ["a", "b"], 1)).toEqual([]);
  });

  it("tie-breaks never-offered before older offers, then contractor id", () => {
    expect(
      compareOfferRank(
        { effectiveScore: 80, lastOfferedAt: null, contractorId: "b" },
        { effectiveScore: 80, lastOfferedAt: "2026-01-01T00:00:00.000Z", contractorId: "a" },
      ),
    ).toBeLessThan(0);
    expect(
      compareOfferRank(
        { effectiveScore: 80, lastOfferedAt: null, contractorId: "a" },
        { effectiveScore: 80, lastOfferedAt: null, contractorId: "b" },
      ),
    ).toBeLessThan(0);
  });
});
