import type { Project, ProjectCompleteness, ProjectPrivateLocation, ServiceQuestion } from "./types";

export type CompletenessInput = {
  title: string;
  description: string;
  category_id: string | null;
  zip_code: string | null;
  city: string | null;
  state: string | null;
  timing: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  photo_count: number;
  street_line1: string | null;
  required_questions: Pick<ServiceQuestion, "id" | "is_required">[];
  answers: { question_id: string; answer_text: string | null }[];
};

export function normalizeZip(zip: string | null | undefined): string | null {
  const digits = (zip ?? "").replace(/[^0-9]/g, "").slice(0, 5);
  return digits.length === 5 ? digits : digits.length > 0 ? digits : null;
}

export function computeCompleteness(input: CompletenessInput): ProjectCompleteness {
  const required = input.required_questions.filter((q) => q.is_required);
  const answered = required.filter((q) => {
    const row = input.answers.find((a) => a.question_id === q.id);
    return Boolean(row && row.answer_text && row.answer_text.trim());
  });

  if (input.title.trim().length < 4 || !input.category_id || !normalizeZip(input.zip_code)) {
    return "MORE_INFO_NEEDED";
  }

  if (
    input.photo_count >= 1 &&
    input.description.trim().length >= 20 &&
    Boolean(input.city?.trim()) &&
    Boolean(input.state?.trim()) &&
    Boolean(input.timing) &&
    (input.budget_min_cents != null || input.budget_max_cents != null) &&
    Boolean(input.street_line1?.trim()) &&
    answered.length >= required.length
  ) {
    return "HIGH";
  }

  return "MEDIUM";
}

export function completenessFromProject(
  project: Pick<
    Project,
    | "title"
    | "description"
    | "category_id"
    | "zip_code"
    | "city"
    | "state"
    | "timing"
    | "budget_min_cents"
    | "budget_max_cents"
  >,
  extras: {
    photo_count: number;
    location: Pick<ProjectPrivateLocation, "street_line1"> | null;
    required_questions: Pick<ServiceQuestion, "id" | "is_required">[];
    answers: { question_id: string; answer_text: string | null }[];
  },
): ProjectCompleteness {
  return computeCompleteness({
    title: project.title,
    description: project.description,
    category_id: project.category_id,
    zip_code: project.zip_code,
    city: project.city,
    state: project.state,
    timing: project.timing,
    budget_min_cents: project.budget_min_cents,
    budget_max_cents: project.budget_max_cents,
    photo_count: extras.photo_count,
    street_line1: extras.location?.street_line1 ?? null,
    required_questions: extras.required_questions,
    answers: extras.answers,
  });
}

export function canPostProject(input: {
  title: string;
  category_id: string | null;
  zip_code: string | null;
}): boolean {
  return input.title.trim().length >= 4 && Boolean(input.category_id) && Boolean(normalizeZip(input.zip_code));
}
