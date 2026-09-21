import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  accountStatusLabel,
  accountTypeLabel,
  customerLifecycleLabel,
  customerNextActions,
  opportunityNextActions,
  PROJECT_STATUS_LABELS,
} from "./statusLabels";
import {
  HERO_ART_VIEWBOX,
  HERO_BANNER_FRAME_CLASS,
  HERO_BANNER_OBJECT_POSITION,
  HERO_PHOTO_FRAME_CLASS,
  HERO_PHOTO_OBJECT_POSITION,
  HERO_TAGLINE,
  IPHONE_LAYOUT_WIDTHS,
  heroSvgContainsTagline,
  heroTaglineFitsWidth,
} from "./heroLayout";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("human project states", () => {
  it("never shows raw enums to customers", () => {
    expect(PROJECT_STATUS_LABELS.DRAFT).toBe("Draft");
    expect(PROJECT_STATUS_LABELS.MATCHING).toBe("Finding Pros");
    expect(PROJECT_STATUS_LABELS.ESTIMATES_AVAILABLE).toBe("Estimates Received");
    expect(PROJECT_STATUS_LABELS.CANCELLED).toBe("Cancelled");
    expect(customerLifecycleLabel("CONTRACTOR_SELECTED", "PENDING")).toBe("Booking");
    expect(customerLifecycleLabel("CONTRACTOR_SELECTED", "CONFIRMED")).toBe("Active");
    expect(customerLifecycleLabel("CONTRACTOR_SELECTED", "COMPLETED")).toBe("Completed");
    expect(customerLifecycleLabel("CANCELLED")).toBe("Cancelled");
    expect(accountTypeLabel("CUSTOMER")).toBe("Customer");
    expect(accountStatusLabel("ACTIVE")).toBe("Active");
  });

  it("offers obvious next actions", () => {
    expect(customerNextActions({ projectId: "p1", projectStatus: "DRAFT" })[0]?.label).toBe("Finish project");
    expect(customerNextActions({ projectId: "p1", projectStatus: "ESTIMATES_AVAILABLE" })[0]?.label).toBe(
      "Review estimates",
    );
    expect(
      customerNextActions({
        projectId: "p1",
        projectStatus: "CONTRACTOR_SELECTED",
        bookingId: "b1",
        bookingStatus: "PENDING",
      }).some((item) => item.label === "Confirm hired"),
    ).toBe(true);
    expect(
      customerNextActions({
        projectId: "p1",
        projectStatus: "CONTRACTOR_SELECTED",
        bookingId: "b1",
        bookingStatus: "PENDING",
        customerHiredAt: "2026-09-21T12:00:00Z",
        contractorHiredAt: "2026-09-21T12:01:00Z",
      }).some((item) => item.label === "Confirm hired"),
    ).toBe(false);
    expect(
      customerNextActions({
        projectId: "p1",
        projectStatus: "CONTRACTOR_SELECTED",
        bookingStatus: "COMPLETED",
      }).some((item) => item.label === "Hire again"),
    ).toBe(true);
    expect(
      opportunityNextActions({ opportunityId: "o1", status: "AVAILABLE", projectStatus: "CANCELLED" })[0]?.label,
    ).toBe("View history");
    expect(
      opportunityNextActions({ opportunityId: "o1", status: "AVAILABLE", projectStatus: "POSTED" })[0]?.label,
    ).toBe("Connect");
  });
});

describe("homepage iPhone hero contract", () => {
  it("keeps the marketplace tagline as wrapping HTML, not clipped SVG text", () => {
    expect(HERO_TAGLINE).toMatch(/marketplace/i);
    expect(heroSvgContainsTagline(`<svg viewBox="${HERO_ART_VIEWBOX}"></svg>`)).toBe(false);
    for (const width of IPHONE_LAYOUT_WIDTHS) {
      expect(heroTaglineFitsWidth(width)).toBe(true);
    }
  });
});

describe("homepage house photo crop contract", () => {
  it("keeps aspect-ratio and max-height on the same overflow box so the compact hero does not clip the house from the top", () => {
    expect(HERO_PHOTO_FRAME_CLASS).toMatch(/aspect-\[16\/10\]/);
    expect(HERO_PHOTO_FRAME_CLASS).toMatch(/overflow-hidden/);
    expect(HERO_PHOTO_FRAME_CLASS).toMatch(/max-h-\[10\.5rem\]/);
    expect(HERO_PHOTO_FRAME_CLASS).toMatch(/sm:max-h-\[13rem\]/);
    expect(HERO_PHOTO_FRAME_CLASS).toMatch(/lg:max-h-\[20rem\]/);
    expect(HERO_PHOTO_OBJECT_POSITION).toBe("center 40%");

    const heroSource = readFileSync(path.join(repoRoot, "src/features/home/Hero.tsx"), "utf8");
    expect(heroSource).toContain("HERO_PHOTO_FRAME_CLASS");
    expect(heroSource).toContain("HERO_PHOTO_OBJECT_POSITION");
    expect(heroSource).not.toMatch(/max-h-\[10\.5rem\][\s\S]*aspect-\[16\/10\][\s\S]*MarketingPhoto/);
  });
});

describe("homepage branded hero banner contract", () => {
  it("shows the full first-party banner without a max-height crop that would clip the logo or CTA bar", () => {
    expect(HERO_BANNER_FRAME_CLASS).toMatch(/w-full/);
    expect(HERO_BANNER_FRAME_CLASS).not.toMatch(/max-h-/);
    expect(HERO_BANNER_OBJECT_POSITION).toBe("center center");

    const heroSource = readFileSync(path.join(repoRoot, "src/features/home/Hero.tsx"), "utf8");
    expect(heroSource).toContain("HeroBanner");

    const bannerSource = readFileSync(path.join(repoRoot, "src/features/home/HeroBanner.tsx"), "utf8");
    expect(bannerSource).toContain("homepageHeroBanner");
    expect(bannerSource).toContain('objectFit="contain"');
    expect(bannerSource).toContain("HERO_BANNER_FRAME_CLASS");
    expect(bannerSource).not.toMatch(/max-h-/);
    expect(bannerSource).not.toMatch(/object-cover/);
  });
});
