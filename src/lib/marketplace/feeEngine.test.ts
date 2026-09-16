import { describe, expect, it } from "vitest";
import {
  ORIGINAL_FEE_BRACKETS,
  REPEAT_FEE_BRACKETS,
  billableAmountCents,
  computeMarketplaceFee,
  feeBasisCents,
  progressiveFeeCentsFromBrackets,
} from "./feeEngine";

function original(amountCents: number, approvedDeltas: number[] = []) {
  return computeMarketplaceFee({
    amount_cents: feeBasisCents(amountCents, approvedDeltas),
    kind: "ORIGINAL",
  });
}

function repeat(amountCents: number) {
  return computeMarketplaceFee({ amount_cents: amountCents, kind: "REPEAT" });
}

describe("progressive ORIGINAL fee engine (integer cents)", () => {
  it("applies 8% on $250 and stays above the $15 minimum", () => {
    const fee = original(25_000);
    expect(fee.brackets).toEqual([{ min_amount_cents: 0, max_amount_cents: 50_000, rate_bps: 800, slice_cents: 25_000, fee_cents: 2_000 }]);
    expect(fee.raw_fee_cents).toBe(2_000);
    expect(fee.fee_cents).toBe(2_000);
    expect(fee.contractor_earnings_cents).toBe(23_000);
    expect(fee.charges_live).toBe(false);
    expect(fee.payments_live).toBe(false);
  });

  it("prices $500 as the first $500 at 8%", () => {
    const fee = original(50_000);
    expect(fee.fee_cents).toBe(4_000);
    expect(fee.min_applied).toBe(false);
    expect(fee.max_applied).toBe(false);
  });

  it("splits $1,000 across 8% and 7% brackets", () => {
    const fee = original(100_000);
    expect(fee.brackets.map((row) => row.fee_cents)).toEqual([4_000, 3_500]);
    expect(fee.fee_cents).toBe(7_500);
  });

  it("prices $2,500 as $40 + $140", () => {
    expect(original(250_000).fee_cents).toBe(18_000);
  });

  it("prices $5,000 as $40 + $140 + $125", () => {
    expect(original(500_000).fee_cents).toBe(30_500);
  });

  it("prices $10,000 as $40 + $140 + $375", () => {
    expect(original(1_000_000).fee_cents).toBe(55_500);
  });

  it("prices $25,000 as $555 + $525", () => {
    expect(original(2_500_000).fee_cents).toBe(108_000);
  });

  it("caps $50,000 and $100,000 at $1,500", () => {
    const fifty = original(5_000_000);
    expect(fifty.raw_fee_cents).toBe(170_500);
    expect(fifty.fee_cents).toBe(150_000);
    expect(fifty.max_applied).toBe(true);
    const hundred = original(10_000_000);
    expect(hundred.raw_fee_cents).toBe(295_500);
    expect(hundred.fee_cents).toBe(150_000);
  });

  it("applies the $15 minimum on a $100 job", () => {
    const fee = original(10_000);
    expect(fee.raw_fee_cents).toBe(800);
    expect(fee.fee_cents).toBe(1_500);
    expect(fee.min_applied).toBe(true);
  });

  it("does not charge a $0 amount even with a minimum", () => {
    expect(original(0).fee_cents).toBe(0);
  });

  it("never recalculates a locked snapshot when live brackets change", () => {
    const snapshot = computeMarketplaceFee({
      amount_cents: 100_000,
      kind: "ORIGINAL",
      brackets: ORIGINAL_FEE_BRACKETS,
      version: 1,
    });
    const laterSchedule = computeMarketplaceFee({
      amount_cents: 100_000,
      kind: "ORIGINAL",
      brackets: [{ min_amount_cents: 0, max_amount_cents: null, rate_bps: 1000 }],
      min_fee_cents: 1_500,
      max_fee_cents: 150_000,
      version: 2,
    });
    expect(snapshot.fee_cents).toBe(7_500);
    expect(laterSchedule.fee_cents).toBe(10_000);
    expect(snapshot.version).not.toBe(laterSchedule.version);
  });
});

describe("REPEAT fee engine", () => {
  it("uses 2% with a $10 minimum and $500 maximum", () => {
    expect(repeat(25_000).fee_cents).toBe(1_000);
    expect(repeat(50_000).fee_cents).toBe(1_000);
    expect(repeat(100_000).fee_cents).toBe(2_000);
    expect(repeat(250_000).fee_cents).toBe(5_000);
    expect(repeat(500_000).fee_cents).toBe(10_000);
    expect(repeat(1_000_000).fee_cents).toBe(20_000);
    expect(repeat(2_500_000).fee_cents).toBe(50_000);
    expect(repeat(5_000_000).fee_cents).toBe(50_000);
    expect(repeat(10_000_000).max_applied).toBe(true);
    expect(repeat(10_000_000).fee_cents).toBe(50_000);
  });

  it("does not share ORIGINAL brackets", () => {
    expect(REPEAT_FEE_BRACKETS).toHaveLength(1);
    expect(REPEAT_FEE_BRACKETS[0].rate_bps).toBe(200);
  });
});

describe("change-order fee basis and caps", () => {
  it("counts only approved positive deltas toward ORIGINAL fee, with one shared cap", () => {
    const base = original(250_000);
    expect(base.fee_cents).toBe(18_000);
    const withCo = original(250_000, [100_000]);
    expect(feeBasisCents(250_000, [100_000])).toBe(350_000);
    expect(withCo.fee_cents).toBe(23_000);
    const capped = original(10_000_000, [500_000]);
    expect(capped.fee_cents).toBe(150_000);
    expect(billableAmountCents(10_000_000, [500_000, -20_000])).toBe(10_480_000);
    expect(feeBasisCents(10_000_000, [500_000, -20_000])).toBe(10_500_000);
  });

  it("does not reset the cap per change order", () => {
    const first = original(5_000_000, [1_000_000]);
    const second = original(5_000_000, [1_000_000, 1_000_000]);
    expect(first.fee_cents).toBe(150_000);
    expect(second.fee_cents).toBe(150_000);
  });
});

describe("progressiveFeeCentsFromBrackets", () => {
  it("returns 0 for empty or negative amounts", () => {
    expect(progressiveFeeCentsFromBrackets(-1, ORIGINAL_FEE_BRACKETS)).toBe(0);
    expect(progressiveFeeCentsFromBrackets(Number.NaN, ORIGINAL_FEE_BRACKETS)).toBe(0);
  });
});
