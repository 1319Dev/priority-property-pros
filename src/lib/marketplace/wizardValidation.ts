import type { ServiceQuestion } from "./types";
import type { WizardSession } from "./wizardSession";
import { dollarsToCents } from "./fees";
import { normalizeCity, normalizeState } from "./location";

export function todayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function budgetRangeError(minRaw: string, maxRaw: string): string | null {
  const min = dollarsToCents(minRaw);
  const max = dollarsToCents(maxRaw);
  if (minRaw.trim() && min == null) return "Enter the low budget as a dollar amount.";
  if (maxRaw.trim() && max == null) return "Enter the high budget as a dollar amount.";
  if (min != null && max != null && min > max) return "The low budget cannot be higher than the high budget.";
  return null;
}

export function formatBudgetRange(minCents: number | null, maxCents: number | null, format: (cents: number) => string): string {
  if (minCents == null && maxCents == null) return "—";
  if (minCents != null && maxCents != null && minCents > maxCents) return "Check the budget range";
  if (minCents != null && maxCents != null) return `${format(minCents)} to ${format(maxCents)}`;
  if (minCents != null) return `From ${format(minCents)}`;
  return `Up to ${format(maxCents as number)}`;
}

function answerMissing(question: ServiceQuestion, answers: Record<string, string>): boolean {
  return question.is_required && !(answers[question.id] ?? "").trim();
}

export function wizardStepError(
  step: number,
  form: WizardSession,
  questions: ServiceQuestion[],
  now = new Date(),
): string | null {
  if (step === 1 && !form.title.trim()) return "Add a short title so pros know what you need.";
  if (step === 2 && !form.categoryId) return "Choose a project type to continue.";
  if (step === 4) {
    const missing = questions.find((question) => answerMissing(question, form.answers));
    if (missing) return `Answer “${missing.prompt}” to continue.`;
  }
  if (step === 5) {
    if (!form.zipCode.trim()) return "Add a ZIP code so we can look for local pros.";
    if (form.zipCode.replace(/\D/g, "").length < 5) return "Enter a 5-digit ZIP code.";
  }
  if (step === 6 && form.timing === "SPECIFIC_DATE") {
    if (!form.preferredDate) return "Choose a date, or pick a different timing.";
    if (form.preferredDate < todayIsoDate(now)) return "Choose today or a future date.";
  }
  if (step === 7) return budgetRangeError(form.budgetMin, form.budgetMax);
  return null;
}

export function normalizedWizardPlace(form: Pick<WizardSession, "city" | "state">): { city: string; state: string } {
  return { city: normalizeCity(form.city), state: normalizeState(form.state) };
}
