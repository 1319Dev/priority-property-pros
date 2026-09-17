import type { ApprovalStatus, OnboardingStatus } from "../auth/types";

export type ContractorProfileGate = {
  onboarding_status: OnboardingStatus;
  approval_status: ApprovalStatus;
};

/** Approved contractors who finished onboarding get Manage Profile, not the wizard. */
export function showManageProfile(profile: ContractorProfileGate): boolean {
  if (profile.approval_status !== "APPROVED") return false;
  return profile.onboarding_status === "COMPLETE" || profile.onboarding_status === "SUBMITTED";
}

export type ProfilePageMode = "manage" | "onboarding";

export function profilePageMode(profile: ContractorProfileGate): ProfilePageMode {
  return showManageProfile(profile) ? "manage" : "onboarding";
}

export const HARMLESS_PROFILE_FIELDS = [
  "business_name",
  "headline",
  "bio",
  "primary_trade",
  "service_area",
  "years_experience",
  "accepting_work",
  "min_job_cents",
  "max_job_cents",
  "website_url",
] as const;

export type HarmlessProfileField = (typeof HARMLESS_PROFILE_FIELDS)[number];

export const IDENTITY_REVIEW_FIELDS = ["license_number", "insurance_carrier"] as const;
export type IdentityReviewField = (typeof IDENTITY_REVIEW_FIELDS)[number];

export const FORBIDDEN_CONTRACTOR_PROFILE_FIELDS = [
  "approval_status",
  "approved_at",
  "approved_by",
  "rejected_at",
  "rejected_by",
  "rejection_reason",
  "info_requested_at",
  "info_requested_by",
  "info_request_message",
  "identity_review_required",
  "account_status",
  "fee_bps",
  "fee_cents",
  "marketplace_fee",
  "signup_fee_status",
  "payments_live",
  "charges_live",
  "credential_status",
  "verification_badge",
] as const;

export type ForbiddenContractorProfileField = (typeof FORBIDDEN_CONTRACTOR_PROFILE_FIELDS)[number];

export const FORBIDDEN_ONBOARDING_REGRESSIONS: OnboardingStatus[] = ["NOT_STARTED", "IN_PROGRESS"];

export function contractorMayEditField(field: string): boolean {
  if ((FORBIDDEN_CONTRACTOR_PROFILE_FIELDS as readonly string[]).includes(field)) return false;
  if ((HARMLESS_PROFILE_FIELDS as readonly string[]).includes(field)) return true;
  if ((IDENTITY_REVIEW_FIELDS as readonly string[]).includes(field)) return true;
  if (field === "onboarding_status") return false;
  return false;
}

export function editRequiresIdentityReview(fields: string[]): boolean {
  return fields.some((field) => (IDENTITY_REVIEW_FIELDS as readonly string[]).includes(field));
}

export function harmlessEditStripsApproval(fields: string[]): boolean {
  void fields;
  return false;
}

export function allowedManageProfilePatch(
  patch: Record<string, unknown>,
  currentOnboarding: OnboardingStatus,
): { ok: true; patch: Record<string, unknown>; identityReview: boolean } | { ok: false; field: string } {
  const next: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (!contractorMayEditField(key)) return { ok: false, field: key };
    next[key] = value;
    changed.push(key);
  }
  if ("onboarding_status" in next) {
    return { ok: false, field: "onboarding_status" };
  }
  if (currentOnboarding === "COMPLETE" || currentOnboarding === "SUBMITTED") {
    delete next.onboarding_status;
  }
  return { ok: true, patch: next, identityReview: editRequiresIdentityReview(changed) };
}

export const MANAGE_PROFILE_SECTIONS = [
  { key: "services", title: "Services", action: "Edit" },
  { key: "area", title: "Service Area", action: "Edit" },
  { key: "about", title: "About", action: "Edit" },
  { key: "portfolio", title: "Portfolio", action: "Manage Photos" },
  { key: "accepting", title: "Accepting Work", action: "Toggle" },
] as const;
