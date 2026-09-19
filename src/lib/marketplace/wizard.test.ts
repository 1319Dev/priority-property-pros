import { describe, expect, it } from "vitest";
import { CUSTOMER_PROJECT_TABS, WIZARD_STEPS, customerTabForStatus } from "./types";

describe("customer wizard and lists", () => {
  it("has the eight POST A PROJECT steps in order", () => {
    expect(WIZARD_STEPS.map((step) => step.key)).toEqual([
      "need",
      "category",
      "photos",
      "questions",
      "location",
      "when",
      "budget",
      "review",
    ]);
    expect(WIZARD_STEPS[1]?.label).toBe("Type");
  });

  it("sorts customer projects into Drafts / Active / Completed / Cancelled", () => {
    expect(CUSTOMER_PROJECT_TABS.map((tab) => tab.key)).toEqual(["drafts", "active", "completed", "cancelled"]);
    expect(customerTabForStatus("DRAFT")).toBe("drafts");
    expect(customerTabForStatus("MATCHING")).toBe("active");
    expect(customerTabForStatus("ESTIMATES_AVAILABLE")).toBe("active");
    expect(customerTabForStatus("CONTRACTOR_SELECTED")).toBe("active");
    expect(customerTabForStatus("CANCELLED")).toBe("cancelled");
  });
});
