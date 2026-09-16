import { describe, expect, it } from "vitest";
import { contractorEligibleForProject, haversineMiles, type MatchingContractor } from "./matching";

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
    expect(contractorEligibleForProject(pro({ account_status: "PENDING" }), project).ok).toBe(false);
    expect(contractorEligibleForProject(pro({ category_ids: ["paint"] }), project).ok).toBe(false);
    expect(contractorEligibleForProject(pro({ accepting_work: false }), project).ok).toBe(false);
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
