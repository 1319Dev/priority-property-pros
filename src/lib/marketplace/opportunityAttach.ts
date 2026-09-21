import type { Project } from "./types";

export type OpportunityProjectPreview = Pick<
  Project,
  | "id"
  | "title"
  | "description"
  | "city"
  | "state"
  | "zip_code"
  | "timing"
  | "budget_min_cents"
  | "budget_max_cents"
  | "status"
  | "completeness"
  | "category_id"
  | "preferred_date"
  | "accepting_connections"
> | null;

export const OPPORTUNITY_COLUMNS =
  "id, project_id, contractor_profile_id, match_id, status, available_at, responded_at, expires_at, created_at";

export const OPPORTUNITY_PROJECT_EMBED_COLUMNS =
  "id, title, description, city, state, zip_code, timing, budget_min_cents, budget_max_cents, status, completeness, category_id, preferred_date, accepting_connections";

/** Left-join style embed. RLS-hidden projects come back as null instead of throwing. */
export const OPPORTUNITY_WITH_PROJECTS_SELECT = `${OPPORTUNITY_COLUMNS}, projects(${OPPORTUNITY_PROJECT_EMBED_COLUMNS})`;

export function normalizeOpportunityProject(value: unknown): OpportunityProjectPreview {
  if (Array.isArray(value)) return normalizeOpportunityProject(value[0]);
  if (!value || typeof value !== "object") return null;
  const row = value as { id?: unknown };
  if (typeof row.id !== "string" || !row.id) return null;
  return value as NonNullable<OpportunityProjectPreview>;
}

export function opportunityListTitle(row: {
  status?: string | null;
  projects?: { title?: string | null } | null;
}): string {
  const title = row.projects?.title?.trim();
  if (title) return title;
  return row.status === "PASSED" ? "Passed job" : "Project";
}

/**
 * Attach a project preview without failing the whole opportunity list.
 * Embedded `projects` (including null) is trusted; otherwise loadProject is used and errors become null.
 */
export async function attachOpportunityProject<T extends { project_id: string }>(
  row: T & { projects?: unknown },
  loadProject?: (projectId: string) => Promise<unknown>,
): Promise<T & { projects: OpportunityProjectPreview }> {
  if (row.projects !== undefined) {
    return { ...row, projects: normalizeOpportunityProject(row.projects) };
  }
  if (!loadProject) {
    return { ...row, projects: null };
  }
  try {
    return { ...row, projects: normalizeOpportunityProject(await loadProject(row.project_id)) };
  } catch {
    return { ...row, projects: null };
  }
}

export async function attachOpportunityProjects<T extends { project_id: string }>(
  rows: Array<T & { projects?: unknown }>,
  loadProject?: (projectId: string) => Promise<unknown>,
): Promise<Array<T & { projects: OpportunityProjectPreview }>> {
  return Promise.all(rows.map((row) => attachOpportunityProject(row, loadProject)));
}
