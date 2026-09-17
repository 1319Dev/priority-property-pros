import { describe, expect, it } from "vitest";
import { canClientPatchApprovalFields, canSelfApprove } from "../auth/rlsPolicy";
import type { Actor } from "../auth/rlsPolicy";
import {
  applyApproveDecision,
  applyRejectDecision,
  applyRequestInfoDecision,
  approvalContactName,
  approvedContractorMatchingGate,
  filterApprovalQueue,
  formatCategoryNames,
  formatServiceAreaSummary,
  matchingAfterDecision,
  pendingApprovalCount,
  type ContractorApprovalItem,
} from "./approvals";

const contractor: Actor = { id: "pro-1", accountType: "CONTRACTOR", accountStatus: "PENDING" };
const admin: Actor = { id: "admin-1", accountType: "ADMIN", accountStatus: "ACTIVE" };
const sqlEditor: Actor = { id: null, accountType: null, accountStatus: null };

const baseItem: ContractorApprovalItem = {
  contractor_profile_id: "cp-1",
  profile_id: "pro-1",
  business_name: "Peachtree Handy",
  contact_name: "Pat Lee",
  first_name: "Pat",
  last_name: "Lee",
  email: "pat@example.com",
  phone: "404-555-0100",
  categories: [{ id: "tv", name: "TV Mounting", slug: "tv-mounting" }],
  service_area: "Atlanta",
  service_areas: [
    {
      id: "area-1",
      mode: "ZIPS",
      center_zip: "30318",
      radius_miles: null,
      zip_codes: ["30318", "30319"],
      label: "Primary area",
    },
  ],
  applied_at: "2026-09-01T12:00:00Z",
  account_status: "PENDING",
  approval_status: "PENDING",
  onboarding_status: "SUBMITTED",
  headline: "TV mounting",
  bio: "Local independent.",
  primary_trade: "Handyman",
  years_experience: 8,
  license_number: "GA-123",
  insurance_carrier: "Hartford",
  website_url: "https://example.com",
  accepting_work: true,
  min_job_cents: 5000,
  max_job_cents: 200000,
  approved_at: null,
  approved_by: null,
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  info_requested_at: null,
  info_requested_by: null,
  info_request_message: null,
  identity_review_required: false,
  identity_review_at: null,
  identity_review_fields: [],
  credentials: [{ id: "cred-1", kind: "LICENSE", label: "Business license", status: "PENDING", expires_at: null }],
};

const project = {
  category_id: "tv",
  zip_code: "30318",
  lat: null,
  lng: null,
  budget_min_cents: 10000,
  budget_max_cents: 40000,
  requires_verified_credential: false,
};

describe("admin contractor approval decisions", () => {
  it("blocks JWT clients from patching approval fields, including admins", () => {
    expect(canClientPatchApprovalFields(contractor)).toBe(false);
    expect(canClientPatchApprovalFields(admin)).toBe(false);
    expect(canClientPatchApprovalFields(sqlEditor)).toBe(true);
    expect(canSelfApprove(contractor, "PENDING", "APPROVED")).toBe(false);
    expect(canSelfApprove(admin, "PENDING", "APPROVED")).toBe(true);
  });

  it("filters queue tabs and counts pending applications", () => {
    const approved = applyApproveDecision(baseItem, "admin-1", "2026-09-17T00:00:00Z");
    const rejected = applyRejectDecision(
      { ...baseItem, contractor_profile_id: "cp-2" },
      "admin-1",
      "2026-09-17T00:00:00Z",
      "Incomplete insurance",
    );
    const items = [baseItem, approved, rejected];
    expect(filterApprovalQueue(items, "PENDING")).toEqual([baseItem]);
    expect(filterApprovalQueue(items, "APPROVED")).toEqual([approved]);
    expect(filterApprovalQueue(items, "REJECTED")).toEqual([rejected]);
    expect(filterApprovalQueue(items, "ALL")).toHaveLength(3);
    expect(pendingApprovalCount(items)).toBe(1);
  });

  it("approve activates the account, preserves approved_at, and enables matching", () => {
    const first = applyApproveDecision(baseItem, "admin-1", "2026-09-17T12:00:00Z");
    expect(first.approval_status).toBe("APPROVED");
    expect(first.account_status).toBe("ACTIVE");
    expect(first.approved_at).toBe("2026-09-17T12:00:00Z");
    expect(first.approved_by).toBe("admin-1");
    expect(approvedContractorMatchingGate(first)).toBe(true);
    expect(matchingAfterDecision(first, project)).toBe(true);

    const preserved = applyApproveDecision(
      { ...first, approved_at: "2026-08-01T00:00:00Z" },
      "admin-2",
      "2026-09-18T00:00:00Z",
    );
    expect(preserved.approved_at).toBe("2026-08-01T00:00:00Z");
    expect(preserved.approved_by).toBe("admin-2");
  });

  it("reject does not delete and blocks opportunities even if the account stayed active", () => {
    const rejected = applyRejectDecision(baseItem, "admin-1", "2026-09-17T12:00:00Z", "Need COI");
    expect(rejected.approval_status).toBe("REJECTED");
    expect(rejected.profile_id).toBe(baseItem.profile_id);
    expect(rejected.rejected_by).toBe("admin-1");
    expect(rejected.rejection_reason).toBe("Need COI");
    expect(approvedContractorMatchingGate({ ...rejected, account_status: "ACTIVE" })).toBe(false);
    expect(matchingAfterDecision({ ...rejected, account_status: "ACTIVE" }, project)).toBe(false);
  });

  it("request more info stays pending and stores the message", () => {
    const asked = applyRequestInfoDecision(baseItem, "admin-1", "2026-09-17T12:00:00Z", "Please upload insurance.");
    expect(asked.approval_status).toBe("PENDING");
    expect(asked.info_request_message).toBe("Please upload insurance.");
    expect(asked.info_requested_by).toBe("admin-1");
    expect(approvedContractorMatchingGate(asked)).toBe(false);
  });

  it("does not treat a signup fee payment as approval", () => {
    const paidButPending = { ...baseItem, account_status: "PENDING" as const, approval_status: "PENDING" as const };
    expect(approvedContractorMatchingGate(paidButPending)).toBe(false);
    expect(matchingAfterDecision(paidButPending, project)).toBe(false);
  });

  it("formats contact, categories, and service area for the queue", () => {
    expect(approvalContactName(baseItem)).toBe("Pat Lee");
    expect(formatCategoryNames(baseItem)).toBe("TV Mounting");
    expect(formatServiceAreaSummary(baseItem)).toContain("30318");
    expect(formatServiceAreaSummary({ service_area: "Decatur", service_areas: [] })).toBe("Decatur");
  });

  it("surfaces identity re-verification without unapproving", () => {
    const reviewing = {
      ...baseItem,
      approval_status: "APPROVED" as const,
      account_status: "ACTIVE" as const,
      identity_review_required: true,
      identity_review_fields: ["license_number"],
    };
    expect(filterApprovalQueue([reviewing], "IDENTITY_REVIEW")).toEqual([reviewing]);
    expect(reviewing.approval_status).toBe("APPROVED");
    expect(approvedContractorMatchingGate(reviewing)).toBe(true);
  });
});
