import type { EstimateItemKind, EstimateStatus, OpportunityStatus, ProjectStatus } from "./types";

export function reusableEmptyDraft<T extends { status: ProjectStatus; title: string; category_id: string | null }>(
  projects: T[],
): T | null {
  return (
    projects.find((project) => project.status === "DRAFT" && !project.title.trim() && !project.category_id) ?? null
  );
}

/** Chronological display only. Never sort by price or invent a BEST badge. */
export function comparisonDisplayOrder<T extends { submitted_at: string | null; created_at?: string | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const left = a.submitted_at ?? a.created_at ?? "";
    const right = b.submitted_at ?? b.created_at ?? "";
    return left.localeCompare(right);
  });
}

export function autoBestEstimateId(rows: { total_cents: number; id: string }[]): null {
  if (rows.length === 0) return null;
  return null;
}

export function canClientSetEstimateStatus(from: EstimateStatus, to: EstimateStatus): boolean {
  if (from === to) return true;
  return false;
}

export function canContractorAskQuestion(opportunityStatus: OpportunityStatus): boolean {
  return opportunityStatus === "ACCEPTED";
}

export function canCustomerAnswerQuestion(isOwner: boolean, alreadyAnswered: boolean): boolean {
  return isOwner && !alreadyAnswered;
}

export function isEstimateItemKind(value: string): value is EstimateItemKind {
  return value === "LABOR" || value === "MATERIALS" || value === "EQUIPMENT" || value === "CUSTOM";
}

export function photoUploadError(mime: string, sizeBytes: number): string | null {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (!allowed.includes(mime)) return "Use a JPEG, PNG, or WebP photo.";
  if (sizeBytes > 10 * 1024 * 1024) return "Photos must be 10 MB or smaller.";
  return null;
}
