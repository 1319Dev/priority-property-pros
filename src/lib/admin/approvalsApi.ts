import { getSupabaseClient } from "../supabase/client";
import type { ApprovalTab, ContractorApprovalItem } from "./approvals";

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("The marketplace is not connected yet.");
  return supabase;
}

function asError(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

function asItem(value: unknown, fallback: string): ContractorApprovalItem {
  if (!value || typeof value !== "object") throw new Error(fallback);
  const item = value as ContractorApprovalItem;
  if (!item.contractor_profile_id) throw new Error(fallback);
  return {
    ...item,
    categories: Array.isArray(item.categories) ? item.categories : [],
    service_areas: Array.isArray(item.service_areas) ? item.service_areas : [],
    credentials: Array.isArray(item.credentials) ? item.credentials : [],
  };
}

function asItems(value: unknown): ContractorApprovalItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => asItem(row, "Could not read the approval queue."));
}

export async function listContractorApprovals(tab: ApprovalTab = "ALL"): Promise<ContractorApprovalItem[]> {
  const { data, error } = await client().rpc("list_contractor_approvals", { p_tab: tab });
  if (error) throw new Error(asError(error, "Could not load the approval queue."));
  return asItems(data);
}

export async function getContractorApproval(contractorProfileId: string): Promise<ContractorApprovalItem> {
  const { data, error } = await client().rpc("get_contractor_approval", {
    p_contractor_profile_id: contractorProfileId,
  });
  if (error || !data) throw new Error(asError(error, "Contractor application not found."));
  return asItem(data, "Contractor application not found.");
}

export async function countPendingContractorApprovals(): Promise<number> {
  const { data, error } = await client().rpc("count_pending_contractor_approvals");
  if (error) throw new Error(asError(error, "Could not load pending approvals."));
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function adminApproveContractor(contractorProfileId: string): Promise<ContractorApprovalItem> {
  const { data, error } = await client().rpc("admin_approve_contractor", {
    p_contractor_profile_id: contractorProfileId,
  });
  if (error || !data) throw new Error(asError(error, "Could not approve this contractor."));
  return asItem(data, "Could not approve this contractor.");
}

export async function adminRejectContractor(
  contractorProfileId: string,
  reason?: string,
): Promise<ContractorApprovalItem> {
  const { data, error } = await client().rpc("admin_reject_contractor", {
    p_contractor_profile_id: contractorProfileId,
    p_reason: reason?.trim() || null,
  });
  if (error || !data) throw new Error(asError(error, "Could not reject this contractor."));
  return asItem(data, "Could not reject this contractor.");
}

export async function adminRequestContractorInfo(
  contractorProfileId: string,
  message: string,
): Promise<ContractorApprovalItem> {
  const { data, error } = await client().rpc("admin_request_contractor_info", {
    p_contractor_profile_id: contractorProfileId,
    p_message: message.trim(),
  });
  if (error || !data) throw new Error(asError(error, "Could not request more information."));
  return asItem(data, "Could not request more information.");
}
