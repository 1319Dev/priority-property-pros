import { describe, expect, it } from "vitest";
import { TARGETED_PRO_NOTE } from "./customerCopy";
import {
  BLOCKED_TARGETED_PRO_NOTE,
  excludeBlockedHireAgain,
  parseBlockedContractors,
  targetedProNote,
} from "./contractorBlocks";

describe("contractor block parsing", () => {
  it("keeps the display label and drops a separate business name", () => {
    const rows = parseBlockedContractors([
      {
        id: "block-1",
        contractor_profile_id: "pro-hidden",
        display_label: "Approved Plumbing Pro",
        uses_business_name: false,
        reason: "CUSTOMER_REQUEST",
        created_at: "2026-10-02T12:00:00.000Z",
        business_name: "Hidden Plumbing LLC",
      },
      {
        id: "block-2",
        contractor_profile_id: "pro-paid",
        display_label: "Paid Fence Co.",
        uses_business_name: true,
        reason: "LOW_RATING",
        created_at: "2026-10-01T12:00:00.000Z",
      },
    ]);

    expect(rows).toEqual([
      {
        id: "block-1",
        contractorProfileId: "pro-hidden",
        displayLabel: "Approved Plumbing Pro",
        usesBusinessName: false,
        reason: "CUSTOMER_REQUEST",
        createdAt: "2026-10-02T12:00:00.000Z",
      },
      {
        id: "block-2",
        contractorProfileId: "pro-paid",
        displayLabel: "Paid Fence Co.",
        usesBusinessName: true,
        reason: "LOW_RATING",
        createdAt: "2026-10-01T12:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain("Hidden Plumbing LLC");
    expect(JSON.stringify(rows)).not.toContain("business_name");
  });

  it("drops rows that have no neutral label", () => {
    expect(parseBlockedContractors([{ id: "x", contractor_profile_id: "pro", display_label: "  " }])).toEqual([]);
    expect(parseBlockedContractors(null)).toEqual([]);
  });

  it("removes blocked pros from Hire Again and leaves everyone else", () => {
    const rows = excludeBlockedHireAgain(
      [
        { contractor_profile_id: "blocked", business_name: "Blocked Co" },
        { contractor_profile_id: "open", business_name: "Open Co" },
      ],
      ["blocked"],
    );
    expect(rows.map((row) => row.contractor_profile_id)).toEqual(["open"]);
  });

  it("hides the including-this-pro note after a block", () => {
    expect(targetedProNote(null, false)).toBeNull();
    expect(targetedProNote("pro-1", false)).toBe(TARGETED_PRO_NOTE);
    expect(targetedProNote("pro-1", true)).toBe(BLOCKED_TARGETED_PRO_NOTE);
    expect(BLOCKED_TARGETED_PRO_NOTE).not.toMatch(/business name/i);
  });
});
