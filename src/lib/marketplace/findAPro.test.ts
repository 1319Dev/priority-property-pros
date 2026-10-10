import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contactAccessAllowsReveal } from "./bookings";
import { CONNECTION_FEE_CENTS } from "./types";
import { payingSignupFeeGrantsProjectContact } from "../signupFee/policy";
import { SMOKE_TESTER_CONTRACTOR_PROFILE_ID } from "./publicReviewFilters";
import { publicBrowseBypassesContactEntitlement } from "./publicDirectory";
import {
  activationUnlocksContact,
  applyFindAProFilters,
  connectionFeeCentsUnchanged,
  FIND_A_PRO_LAYOUT_CLASS,
  FIND_A_PRO_PUBLIC_FIELDS,
  findAProPayloadLeaksContact,
  formatFindAProRating,
  isFindAProVisible,
  NEW_ON_PPP,
  NO_REVIEWS_YET,
  PORTFOLIO_EMPTY,
  publicDirectoryReviews,
  publicPortfolioItems,
  showVerifiedProjectBadge,
  storefrontDocumentTitle,
  toFindAProCard,
  VERIFIED_PROJECT_LABEL,
} from "./findAPro";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n\n");
}

function latestDirectoryRpc(): string {
  const sql = allSql();
  const start = sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.list_public_directory_contractors()");
  const end = sql.indexOf("$$;", start);
  return sql.slice(start, end === -1 ? start : end);
}

const approvedId = "11111111-1111-4111-8111-111111111111";

function listedCard(overrides: Partial<Parameters<typeof toFindAProCard>[0]> = {}) {
  return toFindAProCard({
    id: approvedId,
    displayLabel: "Approved Fence Pro",
    primaryTrade: "Fence",
    categories: ["Fence Repair", "Gates"],
    serviceArea: "Houston",
    yearsExperience: 8,
    shortDescription: "Independent local fence contractor.",
    acceptingWork: true,
    badges: [{ kind: "APPROVED", label: "Approved Pro" }],
    portfolio: [],
    reviews: [],
    ...overrides,
  });
}

describe("Find a Pro visibility", () => {
  it("lists an APPROVED + ACTIVE contractor with zero reviews", () => {
    expect(
      isFindAProVisible({
        id: approvedId,
        approvalStatus: "APPROVED",
        accountStatus: "ACTIVE",
        ratingCount: 0,
      }),
    ).toBe(true);
    const card = listedCard();
    expect(card.newOnPlatform).toBe(true);
    expect(card.ratingCount).toBe(0);
    expect(card.displayLabel).toBe("Approved Fence Pro");
  });

  it("hides unapproved and inactive contractors", () => {
    expect(isFindAProVisible({ approvalStatus: "PENDING", accountStatus: "ACTIVE", ratingCount: 4 })).toBe(false);
    expect(isFindAProVisible({ approvalStatus: "REJECTED", accountStatus: "ACTIVE" })).toBe(false);
    expect(isFindAProVisible({ approvalStatus: "APPROVED", accountStatus: "SUSPENDED", ratingCount: 9 })).toBe(false);
    expect(isFindAProVisible({ approvalStatus: "APPROVED", accountStatus: "PENDING" })).toBe(false);
    expect(isFindAProVisible({ id: SMOKE_TESTER_CONTRACTOR_PROFILE_ID, approvalStatus: "APPROVED", accountStatus: "ACTIVE" })).toBe(
      false,
    );
  });

  it("keeps the public RPC on APPROVED + ACTIVE and does not require reviews", () => {
    const rpc = latestDirectoryRpc();
    expect(rpc).toMatch(/cp\.approval_status = 'APPROVED'/);
    expect(rpc).toMatch(/p\.account_status = 'ACTIVE'/);
    expect(rpc).toMatch(/public\.signup_fee_is_satisfied\(cp\.profile_id\)/);
    expect(rpc).not.toMatch(/rating_count\s*>\s*0/);
    expect(rpc).not.toMatch(/business_name|website_url|license_number|avatar_url|p\.email|p\.phone|street_line/);
  });
});

describe("Find a Pro ratings", () => {
  it("does not invent stars for zero reviews", () => {
    const card = listedCard({ reviews: [] });
    expect(formatFindAProRating(null, 0)).toBeNull();
    expect(formatFindAProRating(0, 0)).toBeNull();
    expect(formatFindAProRating(5, 0)).toBeNull();
    expect(card.ratingLabel).toBeNull();
    expect(card.ratingAverage).toBeNull();
    expect(card.newOnPlatform).toBe(true);
    expect(NEW_ON_PPP).toBe("New on Priority Property Pros");
    expect(NO_REVIEWS_YET).toBe("No reviews yet");
    expect(JSON.stringify(card)).not.toMatch(/0\.0|★/);
  });

  it("shows the real average and count when reviews exist", () => {
    expect(formatFindAProRating(4.9, 17)).toBe("4.9 ★ · 17 reviews");
    expect(formatFindAProRating(5, 1)).toBe("5.0 ★ · 1 review");
    const card = listedCard({
      reviews: publicDirectoryReviews([
        { id: "r1", rating: 5, body: "Finished the gate on time." },
        { id: "r2", rating: 4, body: "Clear about the schedule." },
      ]),
    });
    expect(card.ratingCount).toBe(2);
    expect(card.ratingLabel).toBe("4.5 ★ · 2 reviews");
    expect(card.newOnPlatform).toBe(false);
  });
});

describe("Find a Pro privacy", () => {
  it("keeps phone, email, and address out of public card payloads", () => {
    const card = listedCard({
      shortDescription: "Call 512-555-0100 or email secret@example.com at 123 Main Street",
      serviceArea: "123 Main Street",
    });
    expect(FIND_A_PRO_PUBLIC_FIELDS).not.toContain("phone");
    expect(FIND_A_PRO_PUBLIC_FIELDS).not.toContain("email");
    expect(FIND_A_PRO_PUBLIC_FIELDS).not.toContain("businessName");
    expect(card).not.toHaveProperty("phone");
    expect(card).not.toHaveProperty("email");
    expect(card).not.toHaveProperty("businessName");
    expect(card.serviceArea).toBe("Local service area");
    expect(card.shortDescription).toBe("Independent local contractor.");
    expect(findAProPayloadLeaksContact(card)).toEqual([]);
    expect(JSON.stringify(card)).not.toMatch(/512-555|secret@example|123 Main/i);
  });

  it("does not let the $9.99 activation unlock contact", () => {
    expect(payingSignupFeeGrantsProjectContact()).toBe(false);
    expect(publicBrowseBypassesContactEntitlement()).toBe(false);
    expect(activationUnlocksContact()).toBe(false);
  });

  it("leaves the $4.99 connection entitlement unchanged", () => {
    expect(CONNECTION_FEE_CENTS).toBe(499);
    expect(contactAccessAllowsReveal("LOCKED")).toBe(false);
    expect(contactAccessAllowsReveal("UNLOCKED")).toBe(true);
    expect(contactAccessAllowsReveal(null)).toBe(false);
    expect(connectionFeeCentsUnchanged()).toBe(true);
  });
});

describe("Find a Pro portfolio and reviews", () => {
  it("publishes only screened portfolio rows that were supplied", () => {
    const items = publicPortfolioItems([
      { id: "p1", caption: "Repaired gate hardware", sort_order: 1 },
    ]);
    expect(items).toEqual([{ id: "p1", caption: "Repaired gate hardware", sortOrder: 1 }]);
    expect(JSON.stringify(items)).not.toMatch(/storage_path|secret-name|filename/i);
  });

  it("leaves an empty portfolio empty", () => {
    expect(publicPortfolioItems([])).toEqual([]);
    expect(PORTFOLIO_EMPTY).toBe("No portfolio yet");
  });

  it("leaves an empty review list without a verified badge", () => {
    const card = listedCard({ reviews: publicDirectoryReviews([]) });
    expect(card.reviews).toEqual([]);
    expect(card.newOnPlatform).toBe(true);
    expect(showVerifiedProjectBadge({})).toBe(false);
  });

  it("shows Verified Project only when the public review relationship qualifies", () => {
    expect(showVerifiedProjectBadge({ verifiedProject: false })).toBe(false);
    expect(showVerifiedProjectBadge({ verifiedProject: true, demo: true })).toBe(false);
    expect(showVerifiedProjectBadge({ verifiedProject: true })).toBe(true);
    const published = publicDirectoryReviews([
      { id: "r1", rating: 5, body: "Real customer review." },
      { id: "demo", rating: 5, body: "Sample person", demo: true },
      { id: "smoke", rating: 5, body: "Smoke Tester left this." },
    ]);
    expect(published.map((review) => review.id)).toEqual(["r1"]);
    expect(published[0]?.verifiedProject).toBe(true);
    expect(VERIFIED_PROJECT_LABEL).toBe("Verified Project");
  });
});

describe("Find a Pro filters and titles", () => {
  const cards = [
    listedCard({ id: "a", categories: ["Fence Repair"], serviceArea: "Houston", acceptingWork: true, reviews: publicDirectoryReviews([{ id: "r", rating: 5, body: "Solid repair." }]) }),
    listedCard({ id: "b", displayLabel: "Approved Lawn Pro", categories: ["Lawn Care"], serviceArea: "Austin", acceptingWork: false, reviews: [] }),
  ];

  it("filters by service, general area, accepting work, and review status", () => {
    expect(applyFindAProFilters(cards, { service: "fence" }).map((card) => card.id)).toEqual(["a"]);
    expect(applyFindAProFilters(cards, { area: "austin" }).map((card) => card.id)).toEqual(["b"]);
    expect(applyFindAProFilters(cards, { acceptingWorkOnly: true }).map((card) => card.id)).toEqual(["a"]);
    expect(applyFindAProFilters(cards, { reviewStatus: "new" }).map((card) => card.id)).toEqual(["b"]);
    expect(applyFindAProFilters(cards, { reviewStatus: "reviewed" }).map((card) => card.id)).toEqual(["a"]);
    expect(applyFindAProFilters(cards, {}).map((card) => card.id).sort()).toEqual(["a", "b"]);
  });

  it("sets a public document title without private contact", () => {
    expect(storefrontDocumentTitle("Approved Fence Pro")).toBe("Approved Fence Pro | Priority Property Pros");
    expect(storefrontDocumentTitle("Call 512-555-0199")).toBe("Find a Pro | Priority Property Pros");
    expect(storefrontDocumentTitle("secret@example.com")).toBe("Find a Pro | Priority Property Pros");
    expect(FIND_A_PRO_LAYOUT_CLASS).toMatch(/overflow-x-hidden/);
    expect(FIND_A_PRO_LAYOUT_CLASS).toMatch(/max-w-full/);
  });
});
