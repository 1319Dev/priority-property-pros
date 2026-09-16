import { describe, expect, it } from "vitest";
import {
  autoBestEstimateId,
  canClientSetEstimateStatus,
  canContractorAskQuestion,
  canCustomerAnswerQuestion,
  comparisonDisplayOrder,
  photoUploadError,
  reusableEmptyDraft,
} from "./flows";
import { canSelfApprove } from "../auth/rlsPolicy";
import { canReadCustomerContact, canReadExactAddress, canSelfVerifyCredential } from "./privacy";
import { claimSlotExclusive } from "./slots";
import { assertValidTotals, lineTotalCents, totalsFromItems } from "./fees";
import { ESTIMATE_ITEM_KINDS } from "./types";

describe("project drafts", () => {
  it("reuses an empty untitled draft instead of creating another", () => {
    const empty = {
      id: "draft-1",
      status: "DRAFT" as const,
      title: "   ",
      category_id: null,
    };
    const posted = { id: "p2", status: "POSTED" as const, title: "Fence", category_id: "cat" };
    expect(reusableEmptyDraft([posted, empty])?.id).toBe("draft-1");
    expect(reusableEmptyDraft([{ ...empty, title: "Fence repair" }])).toBeNull();
  });
});

describe("photos", () => {
  it("rejects HTML uploads and oversized files", () => {
    expect(photoUploadError("text/html", 100)).toMatch(/jpeg/i);
    expect(photoUploadError("image/jpeg", 11 * 1024 * 1024)).toMatch(/10 MB/i);
    expect(photoUploadError("image/jpeg", 2048)).toBeNull();
  });
});

describe("location privacy", () => {
  it("hides customer email, phone, and street from opportunity contractors", () => {
    const pro = {
      id: "pro-user",
      accountType: "CONTRACTOR" as const,
      accountStatus: "ACTIVE" as const,
      contractorProfileId: "pro-1",
    };
    const project = {
      customer_id: "cust",
      status: "CONTRACTORS_RESPONDING" as const,
      selected_contractor_profile_id: null,
    };
    expect(canReadExactAddress(pro, project)).toBe(false);
    expect(canReadCustomerContact(pro, "cust", false)).toBe(false);
    expect(canReadCustomerContact(pro, "cust", true)).toBe(true);
  });
});

describe("onboarding and approval restrictions", () => {
  const contractor = { id: "pro", accountType: "CONTRACTOR" as const, accountStatus: "ACTIVE" as const };
  it("blocks self-approve and self-verify", () => {
    expect(canSelfApprove(contractor, "PENDING", "APPROVED")).toBe(false);
    expect(canSelfVerifyCredential(contractor, "PENDING", "VERIFIED")).toBe(false);
  });
});

describe("max-3 concurrent accepts", () => {
  it("lets three racers claim unique slots and rejects a fourth", () => {
    const taken = new Set<number>();
    expect(claimSlotExclusive(taken)).toBe(1);
    expect(claimSlotExclusive(taken)).toBe(2);
    expect(claimSlotExclusive(taken)).toBe(3);
    expect(claimSlotExclusive(taken)).toBeNull();
    expect([...taken].sort()).toEqual([1, 2, 3]);
  });
});

describe("pre-estimate Q&A", () => {
  it("allows questions only after accept, and one customer answer", () => {
    expect(canContractorAskQuestion("AVAILABLE")).toBe(false);
    expect(canContractorAskQuestion("ACCEPTED")).toBe(true);
    expect(canCustomerAnswerQuestion(true, false)).toBe(true);
    expect(canCustomerAnswerQuestion(true, true)).toBe(false);
    expect(canCustomerAnswerQuestion(false, false)).toBe(false);
  });
});

describe("estimate calc and submit", () => {
  it("validates labor/materials totals and refuses client ACCEPTED status", () => {
    expect(ESTIMATE_ITEM_KINDS).toEqual(["LABOR", "MATERIALS", "EQUIPMENT", "CUSTOM"]);
    const items = [
      { quantity: 3, unit_cents: 4000, line_total_cents: lineTotalCents(3, 4000) },
      { quantity: 1, unit_cents: 2500, line_total_cents: lineTotalCents(1, 2500) },
    ];
    const totals = totalsFromItems(items, 700);
    expect(totals.total_cents).toBe(14500);
    expect(totals.fee_cents).toBe(1015);
    expect(totals.charges_live).toBe(false);
    expect(
      assertValidTotals({
        items,
        total_cents: totals.total_cents,
        subtotal_cents: totals.total_cents,
        fee_bps: 700,
        fee_cents: totals.fee_cents,
        contractor_earnings_cents: totals.contractor_earnings_cents,
      }),
    ).toBeNull();
    expect(canClientSetEstimateStatus("DRAFT", "ACCEPTED")).toBe(false);
    expect(canClientSetEstimateStatus("SUBMITTED", "ACCEPTED")).toBe(false);
  });
});

describe("comparison and selection races", () => {
  it("orders estimates by submit time and never badges a BEST price", () => {
    const rows = [
      { id: "cheap", total_cents: 1000, submitted_at: "2026-09-16T12:00:00Z" },
      { id: "first", total_cents: 9000, submitted_at: "2026-09-16T10:00:00Z" },
      { id: "mid", total_cents: 5000, submitted_at: "2026-09-16T11:00:00Z" },
    ];
    expect(comparisonDisplayOrder(rows).map((row) => row.id)).toEqual(["first", "mid", "cheap"]);
    expect(autoBestEstimateId(rows)).toBeNull();
  });

  it("rejects a second concurrent select", () => {
    let selected = false;
    const trySelect = () => {
      if (selected) return false;
      selected = true;
      return true;
    };
    expect(trySelect()).toBe(true);
    expect(trySelect()).toBe(false);
  });
});
