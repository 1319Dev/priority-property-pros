import { containsPreHireContact } from "./antiCircumvention";
import { detectContactLeak } from "./contactLeak";
import { coerceProjectReference } from "./projectReference";

export type OpportunityJobLabel = {
  project_id: string;
  opportunity_id?: string | null;
  project_title?: string | null;
  project_reference_number?: number | string | null;
};

export type RecoveredJobLabel = {
  title?: string;
  reference_number?: number | null;
};

/** Drop a title that carries a phone, email, or street. The PPP number can still show. */
export function safeJobTitle(title: string | null | undefined): string | null {
  const text = (title ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (containsPreHireContact(text) || detectContactLeak(text).blocked) return null;
  return text;
}

export function mergeRecoveredJobLabels(
  rows: readonly OpportunityJobLabel[],
): Record<string, RecoveredJobLabel> {
  const out: Record<string, RecoveredJobLabel> = {};
  for (const row of rows) {
    if (!row.project_id) continue;
    const current = out[row.project_id] ?? {};
    const title = safeJobTitle(row.project_title);
    const reference = coerceProjectReference(row.project_reference_number);
    out[row.project_id] = {
      title: current.title ?? title ?? undefined,
      reference_number: current.reference_number ?? reference,
    };
  }
  return out;
}
