import { describe, expect, it } from "vitest";
import {
  DEMO_BANNER,
  DEMO_CONTRACTORS,
  DEMO_HOMEOWNERS,
  DEMO_LABEL,
  DEMO_PROJECTS,
  DEMO_VERIFIERS,
} from "../../data/demoMarketplace";
import { computeMarketplaceFee } from "./feeEngine";
import {
  FLAGGED_LEAK_PATHS,
  IDENTITY_REVEAL_IMPLEMENTED,
  IDENTITY_STAGES,
  RECOMMENDED_FULL_IDENTITY_STAGE,
} from "./identityStages";
import { contactAccessAllowsReveal } from "./bookings";
import {
  applyDirectoryFilters,
  anonymizedProLabel,
  DEFAULT_PORTFOLIO_PRIVACY,
  formatGeneralServiceArea,
  formatPublicRating,
  isDirectoryListedContractor,
  isPublicSafePortfolio,
  isUuid,
  NEW_TO_PPP,
  PUBLIC_CONTRACTOR_DIRECTORY_FIELDS,
  publicBrowseBypassesContactEntitlement,
  publicRatingOrNew,
  realPppReviewStats,
  stripPrivateDirectoryFields,
  toPublicContractorCard,
  toPublicContractorProfile,
  toPublicSafePortfolioItem,
  toPublicSafeReview,
} from "./publicDirectory";
import { customerFacingBrowseExposesPrivateProjects } from "./customerPrivacy";

describe("public marketplace directory privacy", () => {
  it("lists only APPROVED + ACTIVE contractors", () => {
    expect(isDirectoryListedContractor({ approvalStatus: "APPROVED", accountStatus: "ACTIVE" })).toBe(true);
    expect(isDirectoryListedContractor({ approvalStatus: "PENDING", accountStatus: "ACTIVE" })).toBe(false);
    expect(isDirectoryListedContractor({ approvalStatus: "APPROVED", accountStatus: "PENDING" })).toBe(false);
    expect(isDirectoryListedContractor({ approvalStatus: "APPROVED", accountStatus: "SUSPENDED" })).toBe(false);
    expect(isDirectoryListedContractor({ approvalStatus: "REJECTED", accountStatus: "ACTIVE" })).toBe(false);
  });

  it("keeps the public field allowlist free of identity and contact data", () => {
    expect(PUBLIC_CONTRACTOR_DIRECTORY_FIELDS).toEqual([
      "id",
      "displayLabel",
      "categories",
      "serviceArea",
      "yearsExperience",
      "ratingAverage",
      "ratingCount",
      "badges",
      "shortDescription",
    ]);
    for (const key of [
      "businessName",
      "business_name",
      "phone",
      "email",
      "website",
      "address",
      "license_number",
      "photoUrl",
    ]) {
      expect(PUBLIC_CONTRACTOR_DIRECTORY_FIELDS).not.toContain(key);
    }
  });

  it("omits business name, phone, email, website, address, and license from public cards", () => {
    const card = toPublicContractorCard({
      id: "11111111-1111-4111-8111-111111111111",
      primaryTrade: "Handyman",
      categories: ["Handyman", "Fencing", "Minor Remodeling"],
      serviceArea: "Houston",
      yearsExperience: 12,
      ratingAverage: 4.9,
      ratingCount: 18,
      badges: [{ kind: "LICENSE", label: "TDLR-999-SECRET" }],
      headline: "Call 512-555-0100 or visit joesfence.com",
      bio: "Local independent for gates and small remodels.",
    });
    const leaked = stripPrivateDirectoryFields({
      ...card,
      business_name: "Joe's Fence Co.",
      email: "secret@example.com",
      phone: "512-555-0100",
      website_url: "https://joesfence.com",
      street_line1: "123 Main St",
      license_number: "TX-999",
      photo_url: "https://images.example.com/logo.png",
    });
    expect(leaked.business_name).toBeUndefined();
    expect(leaked.email).toBeUndefined();
    expect(leaked.phone).toBeUndefined();
    expect(leaked.website_url).toBeUndefined();
    expect(leaked.street_line1).toBeUndefined();
    expect(leaked.license_number).toBeUndefined();
    expect(leaked.photo_url).toBeUndefined();
    expect(card).not.toHaveProperty("businessName");
    expect(card).not.toHaveProperty("photoUrl");
    expect(card.displayLabel).toBe("Approved Handyman Pro");
    expect(card.serviceArea).toBe("Houston Area");
    expect(formatPublicRating(card.ratingAverage, card.ratingCount)).toBe("★ 4.9 · 18 verified PPP reviews");
    expect(card.badges.map((badge) => badge.label)).toContain("Approved Pro");
    expect(card.badges.map((badge) => badge.label).join(" ")).not.toMatch(/TDLR|999|SECRET/i);
    expect(card.shortDescription).toBe("Local independent for gates and small remodels.");
    expect(JSON.stringify(card)).not.toMatch(/Joe's Fence|512-555|joesfence|TX-999|secret@/i);
  });

  it("does not fabricate ratings and generalizes street-like service areas", () => {
    const empty = toPublicContractorCard({
      id: "11111111-1111-4111-8111-111111111111",
      primaryTrade: "Handyman",
      categories: ["Handyman"],
      serviceArea: "123 Main Street",
      ratingAverage: 5,
      ratingCount: 0,
    });
    expect(empty.ratingAverage).toBeNull();
    expect(formatPublicRating(empty.ratingAverage, empty.ratingCount)).toBeNull();
    expect(publicRatingOrNew(empty.ratingAverage, empty.ratingCount)).toBe(NEW_TO_PPP);
    expect(empty.serviceArea).toBe("Local service area");
    expect(formatGeneralServiceArea({ serviceArea: "77002" })).toBe("Local service area");
    expect(anonymizedProLabel({ categories: ["Fencing"] })).toBe("Approved Fencing Pro");
  });

  it("does not treat demo example slugs as live contractor UUIDs", () => {
    expect(isUuid("example-cedar-ridge-fence")).toBe(false);
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it("never lists private customer projects on public browse", () => {
    expect(customerFacingBrowseExposesPrivateProjects()).toBe(false);
    for (const project of DEMO_PROJECTS) {
      expect(project.shortDescription.toLowerCase()).toMatch(/no street|not a real|fictional/);
      expect(JSON.stringify(project)).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
      expect(JSON.stringify(project)).not.toMatch(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
    }
  });

  it("leaves marketplace fee math unchanged and payments paused", () => {
    expect(computeMarketplaceFee({ amount_cents: 250_000, kind: "ORIGINAL" }).fee_cents).toBe(18_000);
    expect(computeMarketplaceFee({ amount_cents: 100_000, kind: "REPEAT" }).fee_cents).toBe(2_000);
    expect(computeMarketplaceFee({ amount_cents: 100_000, kind: "ORIGINAL" }).payments_live).toBe(false);
    expect(computeMarketplaceFee({ amount_cents: 100_000, kind: "ORIGINAL" }).charges_live).toBe(false);
  });
});

describe("labeled demo marketplace content", () => {
  it("marks contractors, homeowners, verifiers, and sample projects as Example/Demo", () => {
    expect(DEMO_LABEL).toMatch(/example/i);
    expect(DEMO_LABEL).toMatch(/demo/i);
    expect(DEMO_BANNER).toMatch(/not real/i);
    expect(DEMO_CONTRACTORS.every((row) => /example|demo/i.test(row.displayLabel))).toBe(true);
    expect(DEMO_HOMEOWNERS.every((row) => /example|demo/i.test(row.displayName))).toBe(true);
    expect(DEMO_VERIFIERS.every((row) => /example|demo/i.test(row.displayName))).toBe(true);
    expect(DEMO_PROJECTS.every((row) => /example|demo/i.test(row.title))).toBe(true);
  });

  it("keeps demo profiles free of email, phone, exact street, and googable live business names", () => {
    const blob = JSON.stringify({
      DEMO_CONTRACTORS,
      DEMO_HOMEOWNERS,
      DEMO_VERIFIERS,
      DEMO_PROJECTS,
    });
    expect(blob).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(blob).not.toMatch(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
    expect(blob.toLowerCase()).not.toMatch(/street_line|123 main|apt\s|#\d{2,}/);
    expect(blob).not.toMatch(/Cedar Ridge Fence Co|Hill Country Handyman|Oak & Stone Care/i);
  });
});

describe("identity stage model", () => {
  it("implements only public anonymization and recommends hire+entitlement for full identity", () => {
    expect(IDENTITY_STAGES).toHaveLength(4);
    expect(IDENTITY_REVEAL_IMPLEMENTED.publicVisitor).toBe(true);
    expect(IDENTITY_REVEAL_IMPLEMENTED.registeredHomeowner).toBe(false);
    expect(IDENTITY_REVEAL_IMPLEMENTED.estimateReceived).toBe(false);
    expect(IDENTITY_REVEAL_IMPLEMENTED.hiredEntitlement).toBe(false);
    expect(RECOMMENDED_FULL_IDENTITY_STAGE).toBe("hired_entitlement");
    expect(FLAGGED_LEAK_PATHS.length).toBeGreaterThan(3);
  });
});

describe("public-safe profile, reviews, and portfolio", () => {
  it("builds an anonymized profile without private contact fields", () => {
    const card = toPublicContractorCard({
      id: "11111111-1111-4111-8111-111111111111",
      primaryTrade: "Handyman",
      categories: ["Handyman"],
      serviceArea: "Austin",
      yearsExperience: 7,
      ratingAverage: 5,
      ratingCount: 2,
      shortDescription: "Independent local contractor.",
    });
    const profile = toPublicContractorProfile(card, {
      about: "Call 512-555-0199 or visit secretpro.com",
      bio: "Small indoor repairs for property owners.",
      portfolio: [
        {
          id: "p1",
          caption: "Screened project photo",
          sortOrder: 1,
        },
      ],
      reviews: [
        {
          id: "r1",
          rating: 5,
          body: "Verified PPP review.",
        },
      ],
    });
    expect(profile.about).toBe("Small indoor repairs for property owners.");
    expect(profile.services).toEqual(["Handyman"]);
    expect(JSON.stringify(profile)).not.toMatch(/512-555|secretpro|business_name|@/);
    expect(profile.reviews[0]?.body).toBe("Verified PPP review.");
  });

  it("never mixes demo reviews into real marketplace aggregates", () => {
    expect(
      realPppReviewStats([
        { rating: 5, demo: true, verified: true },
        { rating: 4, demo: false, verified: true },
        { rating: 3, demo: false, verified: true },
      ]),
    ).toEqual({ ratingAverage: 3.5, ratingCount: 2 });
    expect(realPppReviewStats([{ rating: 5, demo: true }])).toEqual({ ratingAverage: null, ratingCount: 0 });
    expect(publicRatingOrNew(null, 0)).toBe(NEW_TO_PPP);
  });

  it("labels demo reviews and keeps zero-review demos honest", () => {
    const labeled = toPublicSafeReview({
      id: "d1",
      rating: 5,
      body: "Fast fence repair.",
      demo: true,
    });
    expect(labeled?.body).toMatch(/example review/i);
    expect(DEMO_CONTRACTORS[2]?.ratingCount).toBe(0);
    expect(DEMO_CONTRACTORS[2]?.reviews).toEqual([]);
    expect(DEMO_CONTRACTORS.every((row) => /example|demo/i.test(row.about))).toBe(true);
  });

  it("only publishes manually screened PUBLIC_SAFE portfolio items without filenames", () => {
    expect(DEFAULT_PORTFOLIO_PRIVACY).toBe("REVIEW_REQUIRED");
    expect(isPublicSafePortfolio("REVIEW_REQUIRED")).toBe(false);
    expect(isPublicSafePortfolio("PRIVATE")).toBe(false);
    expect(isPublicSafePortfolio("PUBLIC_SAFE")).toBe(true);
    expect(
      toPublicSafePortfolioItem({
        id: "1",
        title: "truck-logo.jpg",
        description: "Call 512-555-0100",
        privacyState: "PUBLIC_SAFE",
      }),
    ).toEqual({
      id: "1",
      caption: "Screened project photo",
      sortOrder: 0,
    });
    expect(
      toPublicSafePortfolioItem({
        id: "2",
        title: "Cedar panel reset",
        privacyState: "REVIEW_REQUIRED",
        storagePath: "user/portfolio/secret-name.jpg",
      }),
    ).toBeNull();
    const safe = toPublicSafePortfolioItem({
      id: "3",
      description: "Repaired gate hardware",
      privacyState: "PUBLIC_SAFE",
      storagePath: "user/portfolio/secret-name.jpg",
      filename: "secret-name.jpg",
    });
    expect(safe?.caption).toBe("Repaired gate hardware");
    expect(JSON.stringify(safe)).not.toMatch(/secret-name|storage_path|user\/portfolio/i);
  });

  it("filters and sorts without paid placement", () => {
    const cards = [
      toPublicContractorCard({
        id: "a",
        displayLabel: "Approved Handyman Pro",
        categories: ["Handyman"],
        serviceArea: "Houston Area",
        yearsExperience: 4,
        ratingAverage: 4.2,
        ratingCount: 3,
      }),
      toPublicContractorCard({
        id: "b",
        displayLabel: "Approved Fence Pro",
        categories: ["Fence Repair"],
        serviceArea: "Austin Area",
        yearsExperience: 12,
        ratingAverage: 4.9,
        ratingCount: 20,
      }),
      toPublicContractorCard({
        id: "c",
        displayLabel: "Approved Lawn Care Pro",
        categories: ["Lawn Care"],
        serviceArea: "Houston Area",
        yearsExperience: 6,
        ratingCount: 0,
      }),
    ];
    expect(applyDirectoryFilters(cards, { service: "fence" }).map((card) => card.id)).toEqual(["b"]);
    expect(applyDirectoryFilters(cards, { area: "houston" }).map((card) => card.id)).toEqual(["a", "c"]);
    expect(applyDirectoryFilters(cards, { minRating: 4.5 }).map((card) => card.id)).toEqual(["b"]);
    expect(applyDirectoryFilters(cards, { minExperience: 10 }).map((card) => card.id)).toEqual(["b"]);
    expect(applyDirectoryFilters(cards, { sort: "most_reviewed" }).map((card) => card.id)).toEqual(["b", "a", "c"]);
    expect(applyDirectoryFilters(cards, { sort: "highest_rated" }).map((card) => card.id)).toEqual(["b", "a", "c"]);
    expect(applyDirectoryFilters(cards, { sort: "recommended" })[0]?.id).toBe("b");
  });

  it("does not bypass #14 contact entitlement from public browse", () => {
    expect(publicBrowseBypassesContactEntitlement()).toBe(false);
    expect(contactAccessAllowsReveal("LOCKED")).toBe(false);
    expect(contactAccessAllowsReveal("UNLOCKED")).toBe(true);
    expect(contactAccessAllowsReveal(null)).toBe(false);
    expect(IDENTITY_STAGES.find((stage) => stage.id === "hired_entitlement")?.hidden.join(" ")).toMatch(/CONFIRMED/);
  });
});
