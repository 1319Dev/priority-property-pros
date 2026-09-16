import { describe, expect, it } from "vitest";
import { canPostProject, computeCompleteness } from "./completeness";

describe("project completeness (informational)", () => {
  const required = [{ id: "q1", is_required: true }];

  it("needs more info without title, category, or ZIP", () => {
    expect(
      computeCompleteness({
        title: "TV",
        description: "",
        category_id: null,
        zip_code: null,
        city: null,
        state: null,
        timing: null,
        budget_min_cents: null,
        budget_max_cents: null,
        photo_count: 0,
        street_line1: null,
        required_questions: required,
        answers: [],
      }),
    ).toBe("MORE_INFO_NEEDED");
  });

  it("is MEDIUM with the postable minimum but missing extras", () => {
    expect(
      computeCompleteness({
        title: "Mount the living room TV",
        description: "Need it level.",
        category_id: "cat",
        zip_code: "30318",
        city: "Atlanta",
        state: "GA",
        timing: null,
        budget_min_cents: null,
        budget_max_cents: null,
        photo_count: 0,
        street_line1: "12 Oak St",
        required_questions: required,
        answers: [],
      }),
    ).toBe("MEDIUM");
  });

  it("is HIGH when photos, address, timing, budget, and required answers exist", () => {
    expect(
      computeCompleteness({
        title: "Mount the living room TV",
        description: "65 inch TV on a drywall living room wall, hide cables if possible.",
        category_id: "cat",
        zip_code: "30318",
        city: "Atlanta",
        state: "GA",
        timing: "WITHIN_A_WEEK",
        budget_min_cents: 10000,
        budget_max_cents: 25000,
        photo_count: 2,
        street_line1: "12 Oak St",
        required_questions: required,
        answers: [{ question_id: "q1", answer_text: "65 inch" }],
      }),
    ).toBe("HIGH");
  });

  it("allows posting with title, category, and ZIP even if completeness is not HIGH", () => {
    expect(canPostProject({ title: "Fence repair", category_id: "fence", zip_code: "30318" })).toBe(true);
    expect(canPostProject({ title: "Hi", category_id: "fence", zip_code: "30318" })).toBe(false);
  });
});
