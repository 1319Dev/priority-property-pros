import { describe, expect, it } from "vitest";
import {
  canChangeAccountStatus,
  canChangeAccountType,
  canClientAssignAdmin,
  canInsertOwnAcceptance,
  canClientPatchApprovalFields,
  canMutateAuditLog,
  canReadOtherUsersRow,
  canReadProfile,
  canSelfApprove,
} from "./rlsPolicy";
import type { Actor } from "./rlsPolicy";

const customer: Actor = { id: "user-a", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const other: Actor = { id: "user-b", accountType: "CUSTOMER", accountStatus: "ACTIVE" };
const contractor: Actor = { id: "pro-1", accountType: "CONTRACTOR", accountStatus: "PENDING" };
const admin: Actor = { id: "admin-1", accountType: "ADMIN", accountStatus: "ACTIVE" };
const sqlEditor: Actor = { id: null, accountType: null, accountStatus: null };

describe("RLS privilege escalation (policy mirror)", () => {
  it("blocks a customer from reading another user's profile", () => {
    expect(canReadProfile(customer, "user-a")).toBe(true);
    expect(canReadOtherUsersRow(customer, "user-b")).toBe(false);
    expect(canReadOtherUsersRow(admin, "user-b")).toBe(true);
  });

  it("blocks client ADMIN elevation even if the payload asks for it", () => {
    expect(canClientAssignAdmin(customer)).toBe(false);
    expect(canChangeAccountType(customer, "CUSTOMER", "ADMIN")).toBe(false);
    expect(canChangeAccountType(contractor, "CONTRACTOR", "ADMIN")).toBe(false);
    expect(canChangeAccountType(admin, "ADMIN", "ADMIN")).toBe(true);
    expect(canChangeAccountType(sqlEditor, "CUSTOMER", "ADMIN")).toBe(true);
  });

  it("blocks owners from changing their own account_status", () => {
    expect(canChangeAccountStatus(customer, "ACTIVE", "DISABLED")).toBe(false);
    expect(canChangeAccountStatus(customer, "PENDING", "ACTIVE")).toBe(false);
    expect(canChangeAccountStatus(admin, "PENDING", "ACTIVE")).toBe(true);
  });

  it("blocks contractors and verifiers from self-approving", () => {
    expect(canSelfApprove(contractor, "PENDING", "APPROVED")).toBe(false);
    expect(canSelfApprove(admin, "PENDING", "APPROVED")).toBe(true);
    expect(canClientPatchApprovalFields(contractor)).toBe(false);
    expect(canClientPatchApprovalFields(admin)).toBe(false);
    expect(canClientPatchApprovalFields(sqlEditor)).toBe(true);
  });

  it("forbids every client role from mutating audit_logs", () => {
    expect(canMutateAuditLog()).toBe(false);
  });

  it("allows a user to insert only their own agreement acceptance", () => {
    expect(canInsertOwnAcceptance(customer, "user-a")).toBe(true);
    expect(canInsertOwnAcceptance(customer, "user-b")).toBe(false);
    expect(canInsertOwnAcceptance(other, "user-a")).toBe(false);
  });
});
