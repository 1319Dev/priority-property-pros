import { getSupabaseClient } from "../supabase/client";
import type { ApprovalTab, ContractorApprovalItem } from "./approvals";
import type { PortfolioPrivacyChoice, PortfolioReviewItem } from "./portfolioReview";

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
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

function asReviewItems(value: unknown): PortfolioReviewItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Partial<PortfolioReviewItem>;
    if (!item.id || !item.contractor_profile_id || !item.storage_path) return [];
    return [
      {
        id: item.id,
        contractor_profile_id: item.contractor_profile_id,
        contractor_label: item.contractor_label?.trim() || "Contractor",
        title: item.title?.trim() || "Portfolio photo",
        description: item.description ?? null,
        storage_path: item.storage_path,
        created_at: item.created_at ?? "",
      },
    ];
  });
}

export async function adminListPortfolioReviewQueue(): Promise<PortfolioReviewItem[]> {
  const { data, error } = await client().rpc("admin_list_portfolio_review_queue");
  if (error) throw new Error("Could not load photos waiting for review.");
  return asReviewItems(data);
}

export async function adminSetPortfolioPrivacy(
  itemId: string,
  state: PortfolioPrivacyChoice,
  note?: string | null,
): Promise<void> {
  const { error } = await client().rpc("admin_set_portfolio_privacy", {
    p_item_id: itemId,
    p_state: state,
    p_note: note ?? null,
  });
  if (error) throw new Error("Could not update this photo.");
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
