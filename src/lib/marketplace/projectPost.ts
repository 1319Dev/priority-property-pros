import { canPostProject, normalizeZip } from "./completeness";
import type { TimingPreference } from "./types";

/**
 * Fields the customer has typed. Nothing here is a database row.
 * `post_project` still requires an existing DRAFT row, so the submit
 * helper inserts one and posts it in the same action.
 */
export type NewProjectFields = {
  customerId: string;
  title: string;
  description: string;
  categoryId: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  timing: TimingPreference | null;
  preferredDate: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
};

export function assertReadyToPost(
  fields: Pick<NewProjectFields, "title" | "categoryId" | "zipCode" | "budgetMinCents" | "budgetMaxCents">,
): void {
  if (!canPostProject({ title: fields.title, category_id: fields.categoryId, zip_code: fields.zipCode })) {
    throw new Error("Title, project type, and ZIP are required to post.");
  }
  if (
    fields.budgetMinCents != null &&
    fields.budgetMaxCents != null &&
    fields.budgetMaxCents < fields.budgetMinCents
  ) {
    throw new Error("Budget max must be at least the minimum.");
  }
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

/** Row inserted only inside the Post action. Status stays DRAFT until `post_project` runs. */
export function projectInsertForPost(fields: NewProjectFields) {
  assertReadyToPost(fields);
  return {
    customer_id: fields.customerId,
    title: fields.title.trim(),
    description: fields.description,
    status: "DRAFT" as const,
    category_id: fields.categoryId,
    city: blankToNull(fields.city),
    state: blankToNull(fields.state),
    zip_code: normalizeZip(fields.zipCode),
    timing: fields.timing,
    preferred_date: fields.preferredDate?.trim() ? fields.preferredDate.trim() : null,
    budget_min_cents: fields.budgetMinCents,
    budget_max_cents: fields.budgetMaxCents,
    draft_step: 8,
  };
}

/**
 * Insert, attach details, then post. If posting fails, discard the row so
 * Home never gains a DRAFT card from a failed submit.
 */
export async function runProjectSubmit<T extends { id: string }>(actions: {
  insert: () => Promise<T>;
  saveDetails: (projectId: string) => Promise<void>;
  post: (projectId: string) => Promise<void>;
  discard: (projectId: string) => Promise<void>;
}): Promise<T> {
  let created: T | null = null;
  try {
    created = await actions.insert();
    await actions.saveDetails(created.id);
    await actions.post(created.id);
    return created;
  } catch (error) {
    if (created) {
      try {
        await actions.discard(created.id);
      } catch {
        // Surface the original post failure. The discard is best-effort.
      }
    }
    throw error;
  }
}
