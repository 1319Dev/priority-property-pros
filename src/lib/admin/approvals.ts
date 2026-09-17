import type { AccountStatus, ApprovalStatus, OnboardingStatus } from "../auth/types";
import { displayName } from "../auth/roles";
import { contractorEligibleForProject, type MatchingContractor, type MatchingProject } from "../marketplace/matching";

export const APPROVAL_TABS = ["PENDING", "APPROVED", "REJECTED", "IDENTITY_REVIEW", "ALL"] as const;
export type ApprovalTab = (typeof APPROVAL_TABS)[number];

export type ApprovalCategory = {
  id: string;
  name: string;
  slug: string;
};

export type ApprovalServiceArea = {
  id: string;
  mode: string;
  center_zip: string | null;
  radius_miles: number | null;
  zip_codes: string[];
  label: string | null;
};

export type ApprovalCredential = {
  id: string;
  kind: string;
  label: string;
  status: string;
  expires_at: string | null;
};

export type ContractorApprovalItem = {
  contractor_profile_id: string;
  profile_id: string;
  business_name: string;
  contact_name: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  categories: ApprovalCategory[];
  service_area: string | null;
  service_areas: ApprovalServiceArea[];
  applied_at: string;
  account_status: AccountStatus;
  approval_status: ApprovalStatus;
  onboarding_status: OnboardingStatus;
  headline: string | null;
  bio: string | null;
  primary_trade: string | null;
  years_experience: number | null;
  license_number: string | null;
  insurance_carrier: string | null;
  website_url: string | null;
  accepting_work: boolean;
  min_job_cents: number | null;
  max_job_cents: number | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  info_requested_at: string | null;
  info_requested_by: string | null;
  info_request_message: string | null;
  identity_review_required: boolean;
  identity_review_at: string | null;
  identity_review_fields: string[];
  credentials: ApprovalCredential[];
};

export function filterApprovalQueue(
  items: ContractorApprovalItem[],
  tab: ApprovalTab,
): ContractorApprovalItem[] {
  if (tab === "ALL") return items;
  if (tab === "IDENTITY_REVIEW") return items.filter((item) => item.identity_review_required);
  return items.filter((item) => item.approval_status === tab);
}

export function identityReviewCount(items: ContractorApprovalItem[]): number {
  return items.filter((item) => item.identity_review_required).length;
}

export function pendingApprovalCount(items: ContractorApprovalItem[]): number {
  return items.filter((item) => item.approval_status === "PENDING").length;
}

export function approvalContactName(item: Pick<ContractorApprovalItem, "contact_name" | "first_name" | "last_name" | "email">): string {
  if (item.contact_name?.trim()) return item.contact_name.trim();
  return displayName(item.first_name, item.last_name, item.email);
}

export function formatApprovalDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatServiceAreaSummary(
  item: Pick<ContractorApprovalItem, "service_area" | "service_areas">,
): string {
  const parts: string[] = [];
  for (const area of item.service_areas ?? []) {
    const zips = (area.zip_codes ?? []).map((zip) => zip.trim()).filter(Boolean);
    if (zips.length) parts.push(zips.join(", "));
    if (area.radius_miles != null && area.center_zip) {
      parts.push(`${area.radius_miles} mi from ${area.center_zip}`);
    } else if (area.radius_miles != null) {
      parts.push(`${area.radius_miles} mile radius`);
    } else if (area.center_zip && !zips.includes(area.center_zip)) {
      parts.push(area.center_zip);
    } else if (area.label) {
      parts.push(area.label);
    }
  }
  if (parts.length) return Array.from(new Set(parts)).join(" · ");
  return item.service_area?.trim() || "Not provided";
}

export function formatCategoryNames(item: Pick<ContractorApprovalItem, "categories" | "primary_trade">): string {
  const names = (item.categories ?? []).map((cat) => cat.name).filter(Boolean);
  if (names.length) return names.join(", ");
  return item.primary_trade?.trim() || "Not provided";
}

export function approvalStatusLabel(value: ApprovalStatus | null | undefined): string {
  switch (value) {
    case "PENDING":
      return "Pending";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "SUSPENDED":
      return "Suspended";
    default:
      return "Unknown";
  }
}

export function onboardingStatusLabel(value: OnboardingStatus | null | undefined): string {
  switch (value) {
    case "NOT_STARTED":
      return "Not started";
    case "IN_PROGRESS":
      return "In progress";
    case "SUBMITTED":
      return "Submitted";
    case "COMPLETE":
      return "Complete";
    default:
      return "Unknown";
  }
}

/** Matching gate after an admin decision. Category/area still have to match the job. */
export function approvedContractorMatchingGate(input: {
  account_status: AccountStatus;
  approval_status: ApprovalStatus;
  accepting_work: boolean;
}): boolean {
  return (
    input.account_status === "ACTIVE" &&
    input.approval_status === "APPROVED" &&
    input.accepting_work
  );
}

export function applyApproveDecision(
  item: ContractorApprovalItem,
  adminId: string,
  at: string,
): ContractorApprovalItem {
  return {
    ...item,
    approval_status: "APPROVED",
    account_status: "ACTIVE",
    approved_at: item.approved_at ?? at,
    approved_by: adminId,
    onboarding_status: "COMPLETE",
  };
}

export function applyRejectDecision(
  item: ContractorApprovalItem,
  adminId: string,
  at: string,
  reason?: string | null,
): ContractorApprovalItem {
  return {
    ...item,
    approval_status: "REJECTED",
    rejected_at: at,
    rejected_by: adminId,
    rejection_reason: reason?.trim() || null,
  };
}

export function applyRequestInfoDecision(
  item: ContractorApprovalItem,
  adminId: string,
  at: string,
  message: string,
): ContractorApprovalItem {
  return {
    ...item,
    approval_status: "PENDING",
    info_requested_at: at,
    info_requested_by: adminId,
    info_request_message: message.trim(),
  };
}

export function matchingAfterDecision(
  item: ContractorApprovalItem,
  project: MatchingProject,
  extra?: Partial<MatchingContractor>,
): boolean {
  const contractor: MatchingContractor = {
    id: item.contractor_profile_id,
    account_type: "CONTRACTOR",
    account_status: item.account_status,
    approval_status: item.approval_status,
    accepting_work: item.accepting_work,
    category_ids: item.categories.map((cat) => cat.id),
    min_job_cents: item.min_job_cents,
    max_job_cents: item.max_job_cents,
    has_verified_credential: item.credentials.some((cred) => cred.status === "VERIFIED"),
    areas: item.service_areas.map((area) => ({
      mode: (area.mode as MatchingContractor["areas"][number]["mode"]) || "ZIPS",
      center_zip: area.center_zip,
      center_lat: null,
      center_lng: null,
      radius_miles: area.radius_miles,
      zip_codes: area.zip_codes,
    })),
    ...extra,
  };
  return contractorEligibleForProject(contractor, project).ok;
}
