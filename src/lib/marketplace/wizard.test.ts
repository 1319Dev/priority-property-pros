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
  });

  it("sorts customer projects into Drafts / Open / Estimates / Selected", () => {
    expect(CUSTOMER_PROJECT_TABS.map((tab) => tab.key)).toEqual(["drafts", "open", "estimates", "selected"]);
    expect(customerTabForStatus("DRAFT")).toBe("drafts");
    expect(customerTabForStatus("MATCHING")).toBe("open");
    expect(customerTabForStatus("ESTIMATES_AVAILABLE")).toBe("estimates");
    expect(customerTabForStatus("CONTRACTOR_SELECTED")).toBe("selected");
  });
});
