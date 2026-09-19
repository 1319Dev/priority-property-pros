import { describe, expect, it } from "vitest";
import { canClientSetEstimateStatus } from "./flows";
import {
  acceptanceCascade,
  applyViewTracking,
  canCustomerDeclineFrom,
  canCustomerSelectFrom,
  canDeleteEstimate,
  canDeleteFrom,
  canMarkEstimateViewed,
  canSubmitFrom,
  canTransitionEstimate,
  canWithdrawFrom,
  cannotForgeAccepted,
  contractorCanReadEstimate,
  contractorEstimateDestructiveAction,
  contractorEstimateStatusDetail,
  contractorEstimateStatusLabel,
  contractorEstimateUiStatus,
  contractorNotSelectedDetail,
  DELETE_ESTIMATE_BODY,
  estimateStatusUnlocksContact,
  firstViewedPreserved,
  individualDecline,
  LIFECYCLE_EVENTS,
  lifecyclePayloadLeaksContact,
  resolveConcurrentAccept,
  rivalIdentityLeaked,
  shouldMarkEstimateViewed,
  submitTargetStatus,
  WITHDRAW_ESTIMATE_BODY,
  type ViewTracking,
} from "./estimateLifecycle";
import { estimateVisibleToCustomer } from "./privacy";

const sent: ViewTracking = {
  status: "SENT",
  first_viewed_at: null,
  last_viewed_at: null,
  view_count: 0,
};

const ownerView = {
  authUserId: "cust-1",
  accountType: "CUSTOMER" as const,
  projectCustomerId: "cust-1",
  estimateProjectId: "p1",
  requestedProjectId: "p1",
  estimateContractorProfileId: "pro-1",
  actorContractorProfileId: null,
  source: "detail" as const,
};

describe("SENT vs VIEWED rules", () => {
  it("submit from DRAFT goes to SENT, never VIEWED", () => {
    expect(submitTargetStatus("DRAFT")).toBe("SENT");
    expect(canSubmitFrom("DRAFT")).toBe(true);
    expect(canTransitionEstimate("DRAFT", "SENT", "submit_estimate")).toBe(true);
    expect(canTransitionEstimate("DRAFT", "VIEWED", "submit_estimate")).toBe(false);
  });

  it("legacy SUBMITTED is treated as sent, not viewed", () => {
    expect(contractorEstimateUiStatus("SUBMITTED")).toBe("sent");
    expect(contractorEstimateUiStatus("SENT")).toBe("sent");
    expect(contractorEstimateStatusLabel("SENT")).toMatch(/awaiting customer review/i);
    expect(canCustomerSelectFrom("SUBMITTED")).toBe(true);
  });

  it("list load and dashboard prefetch do not mark VIEWED", () => {
    expect(shouldMarkEstimateViewed("list")).toBe(false);
    expect(shouldMarkEstimateViewed("prefetch")).toBe(false);
    expect(shouldMarkEstimateViewed("dashboard")).toBe(false);
    expect(shouldMarkEstimateViewed("admin")).toBe(false);
    expect(shouldMarkEstimateViewed("contractor")).toBe(false);
    expect(applyViewTracking(sent, "2026-09-17T12:00:00.000Z", "list")).toEqual(sent);
    expect(applyViewTracking(sent, "2026-09-17T12:00:00.000Z", "prefetch").status).toBe("SENT");
    expect(canMarkEstimateViewed({ ...ownerView, source: "list" }).ok).toBe(false);
  });

  it("meaningful estimate DETAIL open marks VIEWED and never regresses to SENT", () => {
    expect(shouldMarkEstimateViewed("detail")).toBe(true);
    const viewed = applyViewTracking(sent, "2026-09-17T12:00:00.000Z", "detail");
    expect(viewed.status).toBe("VIEWED");
    expect(viewed.first_viewed_at).toBe("2026-09-17T12:00:00.000Z");
    expect(viewed.last_viewed_at).toBe("2026-09-17T12:00:00.000Z");
    expect(viewed.view_count).toBe(1);
    expect(canTransitionEstimate("VIEWED", "SENT", "mark_estimate_viewed")).toBe(false);
    expect(canTransitionEstimate("VIEWED", "SUBMITTED", "submit_estimate")).toBe(false);
    expect(canMarkEstimateViewed(ownerView).ok).toBe(true);
  });

  it("rejects contractor, other customers, and admin tooling as VIEWED", () => {
    expect(canMarkEstimateViewed({ ...ownerView, authUserId: null }).ok).toBe(false);
    expect(canMarkEstimateViewed({ ...ownerView, accountType: "CONTRACTOR" }).ok).toBe(false);
    expect(canMarkEstimateViewed({ ...ownerView, accountType: "ADMIN", isAdmin: true }).ok).toBe(false);
    expect(canMarkEstimateViewed({ ...ownerView, authUserId: "cust-2", projectCustomerId: "cust-1" }).ok).toBe(false);
    expect(canMarkEstimateViewed({ ...ownerView, actorContractorProfileId: "pro-1" }).ok).toBe(false);
    expect(canMarkEstimateViewed({ ...ownerView, requestedProjectId: "other-project" }).ok).toBe(false);
  });
});

describe("first_viewed_at is preserved", () => {
  it("keeps the original first_viewed_at on repeat detail opens", () => {
    const first = applyViewTracking(sent, "2026-09-17T12:00:00.000Z", "detail");
    const second = applyViewTracking(first, "2026-09-17T18:00:00.000Z", "detail");
    expect(second.first_viewed_at).toBe("2026-09-17T12:00:00.000Z");
    expect(second.last_viewed_at).toBe("2026-09-17T18:00:00.000Z");
    expect(second.view_count).toBe(2);
    expect(second.status).toBe("VIEWED");
    expect(firstViewedPreserved(first.first_viewed_at, second.first_viewed_at)).toBe(true);
  });
});

describe("acceptance cascade", () => {
  it("accepts the winner and marks other active estimates Not Selected with another-pro reason", () => {
    const result = acceptanceCascade("e2", [
      { id: "e1", status: "VIEWED" },
      { id: "e2", status: "SENT" },
      { id: "e3", status: "REVISED" },
      { id: "e4", status: "WITHDRAWN" },
    ]);
    expect(result.find((r) => r.id === "e2")?.status).toBe("ACCEPTED");
    expect(result.find((r) => r.id === "e1")?.status).toBe("DECLINED");
    expect(result.find((r) => r.id === "e1")?.decline_reason).toBe("ANOTHER_ESTIMATE_ACCEPTED");
    expect(result.find((r) => r.id === "e3")?.status).toBe("DECLINED");
    expect(result.find((r) => r.id === "e4")?.status).toBe("WITHDRAWN");
    expect(result.find((r) => r.id === "e4")?.decline_reason).toBeUndefined();
  });

  it("does not reveal which rival won or their pricing", () => {
    expect(rivalIdentityLeaked({})).toBe(false);
    expect(rivalIdentityLeaked({ winner_id: "other-pro" })).toBe(true);
    expect(rivalIdentityLeaked({ rival_price_cents: 9900 })).toBe(true);
    expect(contractorEstimateStatusDetail("DECLINED", "ANOTHER_ESTIMATE_ACCEPTED")).toBe(
      "The customer selected another pro for this project.",
    );
    expect(contractorEstimateStatusDetail("ACCEPTED")).toBe("The customer selected your estimate.");
    expect(contractorEstimateStatusLabel("DECLINED")).toBe("Not Selected");
  });
});

describe("manual decline vs another-pro selected", () => {
  it("declines one estimate without cascading others and uses distinct copy", () => {
    const rows = [
      { id: "e1", status: "VIEWED" as const },
      { id: "e2", status: "SENT" as const },
    ];
    const after = individualDecline("e1", rows);
    expect(after.find((r) => r.id === "e1")?.status).toBe("DECLINED");
    expect(after.find((r) => r.id === "e1")?.decline_reason).toBe("CUSTOMER_DECLINED");
    expect(after.find((r) => r.id === "e2")?.status).toBe("SENT");
    expect(contractorNotSelectedDetail("CUSTOMER_DECLINED")).toBe(
      "The customer decided not to move forward with this estimate.",
    );
    expect(contractorNotSelectedDetail("ANOTHER_ESTIMATE_ACCEPTED")).toBe(
      "The customer selected another pro for this project.",
    );
    expect(contractorEstimateStatusDetail("DECLINED", null)).not.toMatch(/another pro/i);
  });
});

describe("cannot forge ACCEPTED", () => {
  it("blocks client status writes including contractor self-accept", () => {
    expect(canClientSetEstimateStatus("DRAFT", "ACCEPTED")).toBe(false);
    expect(canClientSetEstimateStatus("SENT", "ACCEPTED")).toBe(false);
    expect(canClientSetEstimateStatus("SUBMITTED", "ACCEPTED")).toBe(false);
    expect(canClientSetEstimateStatus("VIEWED", "ACCEPTED")).toBe(false);
    expect(cannotForgeAccepted("CONTRACTOR", "ACCEPTED")).toBe(true);
    expect(cannotForgeAccepted("ADMIN", "ACCEPTED")).toBe(true);
    expect(cannotForgeAccepted("CUSTOMER", "ACCEPTED")).toBe(false);
    expect(canTransitionEstimate("SENT", "ACCEPTED", "client_patch")).toBe(false);
  });
});

describe("concurrent accept is race-safe", () => {
  it("serializes two tabs: first wins, retry of same winner is idempotent, other winner conflicts", () => {
    expect(
      resolveConcurrentAccept({
        projectLockedStatus: "ESTIMATES_AVAILABLE",
        selectedEstimateId: null,
        candidateEstimateId: "e1",
      }),
    ).toBe("accepted");
    expect(
      resolveConcurrentAccept({
        projectLockedStatus: "CONTRACTOR_SELECTED",
        selectedEstimateId: "e1",
        candidateEstimateId: "e1",
      }),
    ).toBe("idempotent");
    expect(
      resolveConcurrentAccept({
        projectLockedStatus: "CONTRACTOR_SELECTED",
        selectedEstimateId: "e1",
        candidateEstimateId: "e2",
      }),
    ).toBe("conflict");
  });
});

describe("isolation between contractors", () => {
  it("lets a contractor read only their own estimate", () => {
    expect(contractorCanReadEstimate("pro-1", "pro-1")).toBe(true);
    expect(contractorCanReadEstimate("pro-1", "pro-2")).toBe(false);
    expect(contractorCanReadEstimate(null, "pro-1")).toBe(false);
  });
});

describe("customer visibility and individual decline", () => {
  it("hides drafts from customers and shows sent/viewed rows", () => {
    expect(estimateVisibleToCustomer("DRAFT")).toBe(false);
    expect(estimateVisibleToCustomer("SENT")).toBe(true);
    expect(estimateVisibleToCustomer("VIEWED")).toBe(true);
    expect(canCustomerDeclineFrom("VIEWED")).toBe(true);
    expect(canCustomerDeclineFrom("DRAFT")).toBe(false);
    expect(canCustomerDeclineFrom("ACCEPTED")).toBe(false);
  });
});

describe("delete draft vs withdraw sent", () => {
  const ownerDelete = {
    authUserId: "pro-user",
    accountType: "CONTRACTOR" as const,
    estimateContractorProfileId: "pro-1",
    actorContractorProfileId: "pro-1",
    status: "DRAFT" as const,
  };

  it("lets the owning contractor delete a DRAFT and blocks everyone else", () => {
    expect(canDeleteFrom("DRAFT")).toBe(true);
    expect(canDeleteEstimate(ownerDelete).ok).toBe(true);
    expect(canDeleteEstimate({ ...ownerDelete, authUserId: null }).ok).toBe(false);
    expect(canDeleteEstimate({ ...ownerDelete, authUserId: null }).reason).toBe("auth required");
    expect(canDeleteEstimate({ ...ownerDelete, accountType: "CUSTOMER" }).ok).toBe(false);
    expect(canDeleteEstimate({ ...ownerDelete, accountType: "CUSTOMER" }).reason).toBe("only the contractor");
    expect(canDeleteEstimate({ ...ownerDelete, actorContractorProfileId: "pro-2" }).ok).toBe(false);
    expect(canDeleteEstimate({ ...ownerDelete, actorContractorProfileId: "pro-2" }).reason).toBe("not your estimate");
    expect(canDeleteEstimate({ ...ownerDelete, actorContractorProfileId: null }).ok).toBe(false);
    expect(canDeleteEstimate({ ...ownerDelete, isAdmin: true, accountType: "ADMIN", actorContractorProfileId: null }).ok).toBe(
      true,
    );
  });

  it("never deletes sent or accepted estimates; withdraw remains for sent", () => {
    expect(canDeleteFrom("SENT")).toBe(false);
    expect(canDeleteFrom("SUBMITTED")).toBe(false);
    expect(canDeleteFrom("VIEWED")).toBe(false);
    expect(canDeleteFrom("ACCEPTED")).toBe(false);
    expect(canDeleteFrom("WITHDRAWN")).toBe(false);
    expect(canDeleteEstimate({ ...ownerDelete, status: "SENT" }).ok).toBe(false);
    expect(canDeleteEstimate({ ...ownerDelete, status: "SENT" }).reason).toBe("only draft estimates can be deleted");
    expect(canDeleteEstimate({ ...ownerDelete, status: "ACCEPTED" }).ok).toBe(false);
    expect(canDeleteEstimate({ ...ownerDelete, status: "ACCEPTED" }).reason).toBe("accepted estimates cannot be deleted");
    expect(canWithdrawFrom("SENT")).toBe(true);
    expect(canWithdrawFrom("VIEWED")).toBe(true);
    expect(canTransitionEstimate("SENT", "WITHDRAWN", "withdraw_estimate")).toBe(true);
    expect(canTransitionEstimate("DRAFT", "WITHDRAWN", "delete_estimate")).toBe(false);
    expect(contractorEstimateDestructiveAction("DRAFT")).toBe("delete");
    expect(contractorEstimateDestructiveAction("SENT")).toBe("withdraw");
    expect(contractorEstimateDestructiveAction("VIEWED")).toBe("withdraw");
    expect(contractorEstimateDestructiveAction("ACCEPTED")).toBeNull();
    expect(contractorEstimateDestructiveAction("WITHDRAWN")).toBeNull();
    expect(DELETE_ESTIMATE_BODY).toMatch(/permanently removed/i);
    expect(DELETE_ESTIMATE_BODY).toMatch(/withdraw those instead/i);
    expect(WITHDRAW_ESTIMATE_BODY).toMatch(/not deleted/i);
    expect(LIFECYCLE_EVENTS).not.toContain("estimate.deleted");
  });
});

describe("privacy on lifecycle payloads", () => {
  it("does not grant contact from ACCEPTED and keeps phone/email/street off event payloads", () => {
    expect(estimateStatusUnlocksContact("ACCEPTED")).toBe(false);
    expect(estimateStatusUnlocksContact("VIEWED")).toBe(false);
    expect(lifecyclePayloadLeaksContact({ project_id: "p1", reason: "CUSTOMER_DECLINED" })).toBe(false);
    expect(lifecyclePayloadLeaksContact({ phone: "404-555-0100" })).toBe(true);
    expect(lifecyclePayloadLeaksContact({ email: "a@b.com" })).toBe(true);
    expect(lifecyclePayloadLeaksContact({ street_line1: "12 Oak" })).toBe(true);
    expect(LIFECYCLE_EVENTS).toEqual(
      expect.arrayContaining([
        "estimate.submitted",
        "estimate.first_viewed",
        "estimate.accepted",
        "estimate.customer_declined",
        "estimate.not_selected",
        "estimate.withdrawn",
      ]),
    );
  });
});
