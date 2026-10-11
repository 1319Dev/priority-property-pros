import { TARGETED_PRO_NOTE } from "./customerCopy";

export type ContractorBlockReason = "LOW_RATING" | "CUSTOMER_REQUEST";

export type BlockedContractor = {
  id: string;
  contractorProfileId: string;
  displayLabel: string;
  usesBusinessName: boolean;
  reason: ContractorBlockReason;
  createdAt: string;
};

export const BLOCKED_TARGETED_PRO_NOTE =
  "This pro will not be included. Other pros in this trade who work in your area can still be offered the project.";

export function parseBlockedContractors(value: unknown): BlockedContractor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const contractorProfileId = typeof record.contractor_profile_id === "string" ? record.contractor_profile_id : "";
    const displayLabel = typeof record.display_label === "string" ? record.display_label.trim() : "";
    if (!id || !contractorProfileId || !displayLabel) return [];
    const reason: ContractorBlockReason = record.reason === "LOW_RATING" ? "LOW_RATING" : "CUSTOMER_REQUEST";
    return [
      {
        id,
        contractorProfileId,
        displayLabel,
        usesBusinessName: record.uses_business_name === true,
        reason,
        createdAt: typeof record.created_at === "string" ? record.created_at : "",
      },
    ];
  });
}

export function blockedReasonLabel(reason: ContractorBlockReason): string {
  return reason === "LOW_RATING" ? "Blocked after a low rating" : "You asked not to be matched";
}

export function excludeBlockedHireAgain<T extends { contractor_profile_id?: unknown }>(
  rows: readonly T[],
  blockedIds: Iterable<string>,
): T[] {
  const blocked = new Set(blockedIds);
  return rows.filter(
    (row) => typeof row.contractor_profile_id !== "string" || !blocked.has(row.contractor_profile_id),
  );
}

export function targetedProNote(pro: string | null, blocked: boolean): string | null {
  if (!pro) return null;
  return blocked ? BLOCKED_TARGETED_PRO_NOTE : TARGETED_PRO_NOTE;
}
