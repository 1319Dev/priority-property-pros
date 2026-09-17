import { describe, expect, it } from "vitest";
import {
  allowedManageProfilePatch,
  contractorMayEditField,
  editRequiresIdentityReview,
  FORBIDDEN_CONTRACTOR_PROFILE_FIELDS,
  harmlessEditStripsApproval,
  HARMLESS_PROFILE_FIELDS,
  MANAGE_PROFILE_SECTIONS,
  profilePageMode,
  showManageProfile,
} from "./profileManage";

describe("Manage Profile vs onboarding", () => {
  it("shows Manage Profile only after onboarding is done and the contractor is APPROVED", () => {
    expect(
      showManageProfile({ onboarding_status: "COMPLETE", approval_status: "APPROVED" }),
    ).toBe(true);
    expect(
      showManageProfile({ onboarding_status: "SUBMITTED", approval_status: "APPROVED" }),
    ).toBe(true);
    expect(profilePageMode({ onboarding_status: "COMPLETE", approval_status: "APPROVED" })).toBe(
      "manage",
    );
  });

  it("keeps the onboarding wizard when the contractor is not yet approved", () => {
    expect(
      showManageProfile({ onboarding_status: "SUBMITTED", approval_status: "PENDING" }),
    ).toBe(false);
    expect(
      showManageProfile({ onboarding_status: "COMPLETE", approval_status: "PENDING" }),
    ).toBe(false);
    expect(
      showManageProfile({ onboarding_status: "NOT_STARTED", approval_status: "APPROVED" }),
    ).toBe(false);
    expect(profilePageMode({ onboarding_status: "IN_PROGRESS", approval_status: "PENDING" })).toBe(
      "onboarding",
    );
  });

  it("does not treat rejected or suspended contractors as Manage Profile", () => {
    expect(
      showManageProfile({ onboarding_status: "COMPLETE", approval_status: "REJECTED" }),
    ).toBe(false);
    expect(
      showManageProfile({ onboarding_status: "COMPLETE", approval_status: "SUSPENDED" }),
    ).toBe(false);
  });

  it("lists the requested Manage Profile sections", () => {
    expect(MANAGE_PROFILE_SECTIONS.map((s) => s.title)).toEqual([
      "Services",
      "Service Area",
      "About",
      "Portfolio",
      "Accepting Work",
    ]);
  });
});

describe("allowed vs forbidden contractor field edits", () => {
  it("allows harmless display, bio, categories-area, years, and accepting-work edits", () => {
    for (const field of HARMLESS_PROFILE_FIELDS) {
      expect(contractorMayEditField(field)).toBe(true);
    }
    expect(harmlessEditStripsApproval(["bio", "accepting_work", "years_experience"])).toBe(false);
  });

  it("forbids approval, active status, badges, admin fields, fee, and payment fields", () => {
    for (const field of FORBIDDEN_CONTRACTOR_PROFILE_FIELDS) {
      expect(contractorMayEditField(field)).toBe(false);
    }
    expect(contractorMayEditField("onboarding_status")).toBe(false);
    const blocked = allowedManageProfilePatch(
      { approval_status: "APPROVED" },
      "COMPLETE",
    );
    expect(blocked.ok).toBe(false);
  });

  it("keeps onboarding data: COMPLETE profiles cannot regress onboarding_status via manage patch", () => {
    const result = allowedManageProfilePatch(
      { business_name: "New Name", bio: "Hello" },
      "COMPLETE",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch).not.toHaveProperty("onboarding_status");
      expect(result.patch.business_name).toBe("New Name");
    }
  });

  it("flags license/insurance identity edits for re-review without stripping approval", () => {
    expect(editRequiresIdentityReview(["license_number"])).toBe(true);
    expect(editRequiresIdentityReview(["bio", "accepting_work"])).toBe(false);
    const result = allowedManageProfilePatch({ license_number: "GA-999" }, "COMPLETE");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identityReview).toBe(true);
    }
    expect(harmlessEditStripsApproval(["license_number"])).toBe(false);
  });
});
