import { describe, expect, it } from "vitest";
import {
  adminCanReadAnyProject,
  contractorCanReadOpportunityProject,
  customerCanCancelProject,
  customerCanEditProject,
  customerCanListProject,
  customerCanReadProject,
  customerCanReadRelatedRecord,
  customerFacingBrowseExposesPrivateProjects,
  customerOwnsProject,
  customerProjectRouteAccess,
  filterCustomerProjectList,
  type PrivacyActor,
} from "./customerPrivacy";
import type { ProjectPrivacyRow } from "./customerPrivacy";

const customerA: PrivacyActor = { id: "cust-a", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const customerB: PrivacyActor = { id: "cust-b", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const contractor: PrivacyActor = {
  id: "pro-user",
  accountType: "CONTRACTOR",
  accountStatus: "ACTIVE",
  contractorProfileId: "pro-1",
};
const admin: PrivacyActor = { id: "admin-1", accountType: "ADMIN", accountStatus: "ACTIVE" };

const projectA: ProjectPrivacyRow = { id: "proj-a", customer_id: "cust-a", status: "POSTED" };
const projectB: ProjectPrivacyRow = { id: "proj-b", customer_id: "cust-b", status: "ESTIMATES_AVAILABLE" };

describe("Phase 5A customer project isolation (hard gate)", () => {
  it("1-3. customer A creates and sees only project A", () => {
    expect(customerOwnsProject(customerA, projectA)).toBe(true);
    expect(customerCanListProject(customerA, projectA)).toBe(true);
    expect(customerCanReadProject(customerA, projectA)).toBe(true);
  });

  it("4. customer A does not see project B in any customer project list", () => {
    const listed = filterCustomerProjectList(customerA, [projectA, projectB]);
    expect(listed.map((row) => row.id)).toEqual(["proj-a"]);
    expect(customerCanListProject(customerA, projectB)).toBe(false);
  });

  it("5. customer A cannot open project B by direct URL/ID", () => {
    expect(customerProjectRouteAccess(customerA, projectB)).toBe("not_found");
    expect(customerProjectRouteAccess(customerA, projectA)).toBe("ok");
    expect(customerProjectRouteAccess(customerA, null)).toBe("not_found");
  });

  it("6. customer A cannot read project B through direct database/API requests", () => {
    expect(customerCanReadProject(customerA, projectB)).toBe(false);
  });

  it("7. customer A cannot edit project B", () => {
    expect(customerCanEditProject(customerA, projectB)).toBe(false);
    expect(customerCanEditProject(customerA, projectA)).toBe(true);
  });

  it("8. customer A cannot cancel/delete project B", () => {
    expect(customerCanCancelProject(customerA, projectB)).toBe(false);
    expect(customerCanCancelProject(customerA, projectA)).toBe(true);
  });

  it("9. customer A cannot access project B photos, answers, private location, booking, or activity", () => {
    expect(customerCanReadRelatedRecord(customerA, projectB)).toBe(false);
    expect(customerCanReadRelatedRecord(customerA, projectA)).toBe(true);
  });

  it("10. customer B gets the same isolation from customer A", () => {
    expect(filterCustomerProjectList(customerB, [projectA, projectB]).map((row) => row.id)).toEqual(["proj-b"]);
    expect(customerProjectRouteAccess(customerB, projectA)).toBe("not_found");
    expect(customerCanEditProject(customerB, projectA)).toBe(false);
    expect(customerCanCancelProject(customerB, projectA)).toBe(false);
    expect(customerCanReadRelatedRecord(customerB, projectA)).toBe(false);
  });

  it("11. contractor authorization continues to work under marketplace rules", () => {
    expect(
      contractorCanReadOpportunityProject(contractor, projectA, {
        project_id: "proj-a",
        contractor_profile_id: "pro-1",
        status: "AVAILABLE",
      }),
    ).toBe(true);
    expect(
      contractorCanReadOpportunityProject(contractor, projectB, {
        project_id: "proj-b",
        contractor_profile_id: "pro-9",
        status: "AVAILABLE",
      }),
    ).toBe(false);
    expect(customerCanListProject(contractor, projectA)).toBe(false);
    expect(customerFacingBrowseExposesPrivateProjects()).toBe(false);
  });

  it("12. admin authorization continues working where intended", () => {
    expect(adminCanReadAnyProject(admin)).toBe(true);
    expect(customerCanReadProject(admin, projectA)).toBe(true);
    expect(customerCanReadProject(admin, projectB)).toBe(true);
    expect(customerCanListProject(admin, projectB)).toBe(true);
  });
});
