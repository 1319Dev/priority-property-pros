import { describe, expect, it } from "vitest";
import {
  accountStatusLabel,
  accountTypeLabel,
  customerLifecycleLabel,
  customerNextActions,
  opportunityNextActions,
  PROJECT_STATUS_LABELS,
} from "./statusLabels";
import { HERO_ART_VIEWBOX, HERO_TAGLINE, IPHONE_LAYOUT_WIDTHS, heroSvgContainsTagline, heroTaglineFitsWidth } from "./heroLayout";

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
      }).some((item) => item.label === "View booking"),
    ).toBe(true);
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
