import { describe, expect, it } from "vitest";
import { canClientSetEstimateStatus } from "./flows";
import {
  acceptanceCascade,
  applyViewTracking,
  canCustomerDeclineFrom,
  canCustomerSelectFrom,
  canSubmitFrom,
  canTransitionEstimate,
  cannotForgeAccepted,
  contractorCanReadEstimate,
  contractorEstimateStatusDetail,
  contractorEstimateStatusLabel,
  contractorEstimateUiStatus,
  firstViewedPreserved,
  rivalIdentityLeaked,
  shouldMarkEstimateViewed,
  submitTargetStatus,
  type ViewTracking,
} from "./estimateLifecycle";
import { estimateVisibleToCustomer } from "./privacy";

const sent: ViewTracking = {
  status: "SENT",
  first_viewed_at: null,
  last_viewed_at: null,
  view_count: 0,
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
    expect(applyViewTracking(sent, "2026-09-17T12:00:00.000Z", "list")).toEqual(sent);
    expect(applyViewTracking(sent, "2026-09-17T12:00:00.000Z", "prefetch").status).toBe("SENT");
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
  it("accepts the winner and marks other active estimates Not Selected", () => {
    const result = acceptanceCascade("e2", [
      { id: "e1", status: "VIEWED" },
      { id: "e2", status: "SENT" },
      { id: "e3", status: "REVISED" },
      { id: "e4", status: "WITHDRAWN" },
    ]);
    expect(result.find((r) => r.id === "e2")?.status).toBe("ACCEPTED");
    expect(result.find((r) => r.id === "e1")?.status).toBe("DECLINED");
    expect(result.find((r) => r.id === "e3")?.status).toBe("DECLINED");
    expect(result.find((r) => r.id === "e4")?.status).toBe("WITHDRAWN");
  });

  it("does not reveal which rival won or their pricing", () => {
    expect(rivalIdentityLeaked({})).toBe(false);
    expect(rivalIdentityLeaked({ winner_id: "other-pro" })).toBe(true);
    expect(rivalIdentityLeaked({ rival_price_cents: 9900 })).toBe(true);
    expect(contractorEstimateStatusDetail("DECLINED")).toBe(
      "The customer selected another pro for this project.",
    );
    expect(contractorEstimateStatusDetail("ACCEPTED")).toBe("The customer selected your estimate.");
    expect(contractorEstimateStatusLabel("DECLINED")).toBe("Not Selected");
  });
});

describe("cannot forge ACCEPTED", () => {
  it("blocks client status writes including contractor self-accept", () => {
    expect(canClientSetEstimateStatus("DRAFT", "ACCEPTED")).toBe(false);
    expect(canClientSetEstimateStatus("SENT", "ACCEPTED")).toBe(false);
    expect(canClientSetEstimateStatus("SUBMITTED", "ACCEPTED")).toBe(false);
    expect(canClientSetEstimateStatus("VIEWED", "ACCEPTED")).toBe(false);
    expect(cannotForgeAccepted("CONTRACTOR", "ACCEPTED")).toBe(true);
    expect(cannotForgeAccepted("CUSTOMER", "ACCEPTED")).toBe(false);
    expect(canTransitionEstimate("SENT", "ACCEPTED", "client_patch")).toBe(false);
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
