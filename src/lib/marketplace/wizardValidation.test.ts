import { describe, expect, it } from "vitest";
import { budgetRangeError, formatBudgetRange, todayIsoDate, wizardStepError } from "./wizardValidation";
import { emptyWizardSession } from "./wizardSession";
import type { ServiceQuestion } from "./types";

const question: ServiceQuestion = {
  id: "q1",
  category_id: "cat",
  prompt: "What is broken?",
  help_text: null,
  kind: "TEXT",
  options: [],
  is_required: true,
  sort_order: 1,
  is_active: true,
};

describe("wizard validation", () => {
  it("requires a title, type, ZIP, required answers, and a future date", () => {
    const form = emptyWizardSession();
    expect(wizardStepError(1, form, [])).toMatch(/title/i);
    form.title = "Fence repair";
    expect(wizardStepError(2, form, [])).toMatch(/project type/i);
    form.categoryId = "cat";
    expect(wizardStepError(4, form, [question])).toMatch(/What is broken/);
    form.answers = { q1: "The latch" };
    expect(wizardStepError(4, form, [question])).toBeNull();
    expect(wizardStepError(5, form, [])).toMatch(/ZIP/i);
    form.zipCode = "30318";
    expect(wizardStepError(5, form, [])).toBeNull();
    form.timing = "SPECIFIC_DATE";
    form.preferredDate = "2000-01-01";
    expect(wizardStepError(6, form, [], new Date("2026-10-08T12:00:00"))).toMatch(/future/i);
    form.preferredDate = todayIsoDate(new Date("2026-10-08T12:00:00"));
    expect(wizardStepError(6, form, [], new Date("2026-10-08T12:00:00"))).toBeNull();
  });

  it("does not show an inverted budget as a range", () => {
    expect(budgetRangeError("100", "50")).toMatch(/cannot be higher/i);
    expect(formatBudgetRange(10000, 5000, (cents) => `$${cents / 100}`)).toBe("Check the budget range");
    expect(formatBudgetRange(5000, 10000, (cents) => `$${cents / 100}`)).toBe("$50 to $100");
  });
});
