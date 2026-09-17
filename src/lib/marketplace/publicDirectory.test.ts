import { describe, expect, it } from "vitest";
import {
  DEMO_BANNER,
  DEMO_CONTRACTORS,
  DEMO_HOMEOWNERS,
  DEMO_LABEL,
  DEMO_PROJECTS,
  DEMO_VERIFIERS,
} from "../../data/demoMarketplace";
import {
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

  it("keeps the public field allowlist free of contact and street data", () => {
    expect(PUBLIC_CONTRACTOR_DIRECTORY_FIELDS).toEqual([
      "id",
      "businessName",
      "photoUrl",
      "categories",
      "serviceArea",
      "ratingAverage",
      "ratingCount",
      "badges",
      "shortDescription",
    ]);
    for (const key of PRIVATE_DIRECTORY_KEYS) {
      expect(PUBLIC_CONTRACTOR_DIRECTORY_FIELDS).not.toContain(key);
    }
  });

  it("strips private keys before a card is shown", () => {
    const card = toPublicContractorCard({
      id: "11111111-1111-4111-8111-111111111111",
      businessName: "Live Cedar Fence Co.",
      photoUrl: "https://images.example.com/logo.png",
      categories: ["Fence Repair"],
      serviceArea: "Cedar Park area",
      ratingAverage: 4.9,
      ratingCount: 4,
      badges: [{ kind: "LICENSE", label: "License reviewed" }],
      headline: "Independent fence repair",
      bio: "Local independent contractor.",
    });
    const leaked = stripPrivateDirectoryFields({
      ...card,
      email: "secret@example.com",
      phone: "512-555-0100",
      street_line1: "123 Main St",
      license_number: "TX-999",
    });
    expect(leaked.email).toBeUndefined();
    expect(leaked.phone).toBeUndefined();
    expect(leaked.street_line1).toBeUndefined();
    expect(leaked.license_number).toBeUndefined();
    expect(card.businessName).toBe("Live Cedar Fence Co.");
    expect(card.photoUrl).toBe("https://images.example.com/logo.png");
    expect(formatPublicRating(card.ratingAverage, card.ratingCount)).toBe("4.9 · 4 reviews");
    expect(toPublicContractorCard({ ...card, photoUrl: "javascript:alert(1)" }).photoUrl).toBeNull();
  });

  it("does not treat demo example slugs as live contractor UUIDs", () => {
    expect(isUuid("example-cedar-ridge-fence")).toBe(false);
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it("never lists private customer projects on public browse", () => {
    expect(customerFacingBrowseExposesPrivateProjects()).toBe(false);
    for (const project of DEMO_PROJECTS) {
      expect(project.shortDescription.toLowerCase()).toMatch(/city and zip|not a real|fictional/);
      const blob = JSON.stringify(project);
      expect(blob).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
      expect(blob).not.toMatch(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
      expect(blob.toLowerCase()).not.toMatch(/street_line|123 main|apt\s|#\d{2,}/);
    }
  });
});

describe("labeled demo marketplace content", () => {
  it("marks contractors, homeowners, verifiers, and sample projects as Example/Demo", () => {
    expect(DEMO_LABEL).toMatch(/example/i);
    expect(DEMO_LABEL).toMatch(/demo/i);
    expect(DEMO_BANNER).toMatch(/not real/i);
    expect(DEMO_CONTRACTORS.every((row) => /example|demo/i.test(row.businessName))).toBe(true);
    expect(DEMO_HOMEOWNERS.every((row) => /example|demo/i.test(row.displayName))).toBe(true);
    expect(DEMO_VERIFIERS.every((row) => /example|demo/i.test(row.displayName))).toBe(true);
    expect(DEMO_PROJECTS.every((row) => /example|demo/i.test(row.title))).toBe(true);
  });

  it("keeps demo profiles free of email, phone, and exact street addresses", () => {
    const blob = JSON.stringify({
      DEMO_CONTRACTORS,
      DEMO_HOMEOWNERS,
      DEMO_VERIFIERS,
      DEMO_PROJECTS,
    });
    expect(blob).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(blob).not.toMatch(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
    expect(blob.toLowerCase()).not.toMatch(/street_line|123 main|apt\s|#\d{2,}/);
  });
});
