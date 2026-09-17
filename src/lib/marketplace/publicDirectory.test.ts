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
import {
  anonymizedProLabel,
  formatGeneralServiceArea,
  formatPublicRating,
  isDirectoryListedContractor,
  isUuid,
  PRIVATE_DIRECTORY_KEYS,
  PUBLIC_CONTRACTOR_DIRECTORY_FIELDS,
  stripPrivateDirectoryFields,
  toPublicContractorCard,
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
