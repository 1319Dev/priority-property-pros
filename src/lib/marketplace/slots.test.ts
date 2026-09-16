import { describe, expect, it } from "vitest";
import { claimSlotExclusive, nextOpportunitySlot } from "./slots";
import { canAcceptFourthSlot, canSelectSecondContractor } from "./privacy";

describe("atomic max-3 opportunity slots", () => {
  it("hands out slots 1, 2, then 3", () => {
    expect(nextOpportunitySlot([])).toBe(1);
    expect(nextOpportunitySlot([1])).toBe(2);
    expect(nextOpportunitySlot([1, 2])).toBe(3);
    expect(nextOpportunitySlot([1, 2, 3])).toBeNull();
  });

  it("lets the first racer take the last slot and denies the second", () => {
    const taken = new Set([1, 2]);
    expect(claimSlotExclusive(taken)).toBe(3);
    expect(claimSlotExclusive(taken)).toBeNull();
    expect(canAcceptFourthSlot(taken.size)).toBe(false);
  });

  it("fills a hole if a middle slot is free", () => {
    expect(nextOpportunitySlot([1, 3])).toBe(2);
  });
});

describe("atomic contractor selection", () => {
  it("allows the first select and rejects a second select", () => {
    expect(canSelectSecondContractor(false)).toBe(true);
    expect(canSelectSecondContractor(true)).toBe(false);
  });
});
