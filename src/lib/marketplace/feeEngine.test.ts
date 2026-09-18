import { describe, expect, it } from "vitest";
import {
  CONNECTION_FEE_CENTS,
  ORIGINAL_FEE_BRACKETS,
  REPEAT_FEE_BRACKETS,
  billableAmountCents,
  computeMarketplaceFee,
  feeBasisCents,
  progressiveFeeCentsFromBrackets,
} from "./feeEngine";

function flatFee(amountCents: number, approvedDeltas: number[] = []) {
  return computeMarketplaceFee({
    amount_cents: feeBasisCents(amountCents, approvedDeltas),
    kind: "ORIGINAL",
  });
}

function repeat(amountCents: number) {
  return computeMarketplaceFee({ amount_cents: amountCents, kind: "REPEAT" });
}

describe("flat $4.99 Connection Fee (current model)", () => {
  it("charges flat $4.99 (499 cents) for $250 project", () => {
    const fee = flatFee(25_000);
    expect(fee.fee_cents).toBe(CONNECTION_FEE_CENTS);
    expect(fee.fee_cents).toBe(499);
    expect(fee.contractor_earnings_cents).toBe(24_501);
    expect(fee.charges_live).toBe(false);
    expect(fee.payments_live).toBe(false);
    expect(fee.brackets).toEqual([]);
  });

  it("charges flat $4.99 for $100 project", () => {
    const fee = flatFee(10_000);
    expect(fee.fee_cents).toBe(499);
    expect(fee.contractor_earnings_cents).toBe(9_501);
  });

  it("charges flat $4.99 for $1,000 project", () => {
    const fee = flatFee(100_000);
    expect(fee.fee_cents).toBe(499);
    expect(fee.contractor_earnings_cents).toBe(99_501);
  });

  it("charges flat $4.99 for $10,000 project", () => {
    const fee = flatFee(1_000_000);
    expect(fee.fee_cents).toBe(499);
    expect(fee.contractor_earnings_cents).toBe(999_501);
  });

  it("charges flat $4.99 for $100,000 project", () => {
    const fee = flatFee(10_000_000);
    expect(fee.fee_cents).toBe(499);
    expect(fee.contractor_earnings_cents).toBe(9_999_501);
  });

  it("does not charge when amount is $0", () => {
    const fee = flatFee(0);
    expect(fee.fee_cents).toBe(0);
    expect(fee.contractor_earnings_cents).toBe(0);
  });

  it("uses CONNECTION_FEE_CENTS constant value", () => {
    expect(CONNECTION_FEE_CENTS).toBe(499);
    const fee = flatFee(50_000);
    expect(fee.fee_cents).toBe(CONNECTION_FEE_CENTS);
  });

  it("fee does not vary with project value - always $4.99", () => {
    const small = flatFee(5_000);
    const medium = flatFee(500_000);
    const large = flatFee(5_000_000);
    expect(small.fee_cents).toBe(499);
    expect(medium.fee_cents).toBe(499);
    expect(large.fee_cents).toBe(499);
    expect(small.fee_cents).toBe(medium.fee_cents);
    expect(medium.fee_cents).toBe(large.fee_cents);
  });

  it("never recalculates a locked snapshot when live model changes", () => {
    const snapshot = computeMarketplaceFee({
      amount_cents: 100_000,
      kind: "ORIGINAL",
      brackets: ORIGINAL_FEE_BRACKETS,
      min_fee_cents: 1_500,
      max_fee_cents: 99_900,
      version: 1,
    });
    const current = flatFee(100_000);
    expect(snapshot.fee_cents).toBe(7_500);
    expect(current.fee_cents).toBe(499);
    expect(snapshot.version).not.toBe(current.version);
  });
});

describe("flat fee boundary tests", () => {
  const cases: Array<{
    label: string;
    amount_cents: number;
    expected_fee_cents: number;
  }> = [
    { label: "$0.00", amount_cents: 0, expected_fee_cents: 0 },
    { label: "$0.01", amount_cents: 1, expected_fee_cents: 499 },
    { label: "$1.00", amount_cents: 100, expected_fee_cents: 499 },
    { label: "$4.98", amount_cents: 498, expected_fee_cents: 499 },
    { label: "$4.99", amount_cents: 499, expected_fee_cents: 499 },
    { label: "$5.00", amount_cents: 500, expected_fee_cents: 499 },
    { label: "$100.00", amount_cents: 10_000, expected_fee_cents: 499 },
    { label: "$500.00", amount_cents: 50_000, expected_fee_cents: 499 },
    { label: "$1,000.00", amount_cents: 100_000, expected_fee_cents: 499 },
    { label: "$5,000.00", amount_cents: 500_000, expected_fee_cents: 499 },
    { label: "$10,000.00", amount_cents: 1_000_000, expected_fee_cents: 499 },
    { label: "$25,000.00", amount_cents: 2_500_000, expected_fee_cents: 499 },
    { label: "$50,000.00", amount_cents: 5_000_000, expected_fee_cents: 499 },
    { label: "$100,000.00", amount_cents: 10_000_000, expected_fee_cents: 499 },
    { label: "$1,000,000.00", amount_cents: 100_000_000, expected_fee_cents: 499 },
  ];

  it.each(cases)(
    "flat fee $label always charges $4.99 (499 cents)",
    ({ amount_cents, expected_fee_cents }) => {
      const fee = flatFee(amount_cents);
      expect(fee.fee_cents).toBe(expected_fee_cents);
      expect(fee.charges_live).toBe(false);
      expect(fee.payments_live).toBe(false);
    },
  );

  it("project value does not affect fee - all non-zero amounts charged $4.99", () => {
    const tiny = flatFee(1);
    const small = flatFee(10_000);
    const large = flatFee(10_000_000);
    expect(tiny.fee_cents).toBe(499);
    expect(small.fee_cents).toBe(499);
    expect(large.fee_cents).toBe(499);
  });
});

describe("REPEAT fee also uses flat $4.99", () => {
  it("charges flat $4.99 regardless of repeat/hire-again status", () => {
    expect(repeat(25_000).fee_cents).toBe(499);
    expect(repeat(100_000).fee_cents).toBe(499);
    expect(repeat(1_000_000).fee_cents).toBe(499);
    expect(repeat(10_000_000).fee_cents).toBe(499);
  });

  it("does not share legacy ORIGINAL brackets (both use flat fee now)", () => {
    expect(REPEAT_FEE_BRACKETS).toHaveLength(1);
    expect(REPEAT_FEE_BRACKETS[0].rate_bps).toBe(200);
  });

  const cases: Array<{
    label: string;
    amount_cents: number;
    expected_fee_cents: number;
  }> = [
    { label: "$0.00", amount_cents: 0, expected_fee_cents: 0 },
    { label: "$0.01", amount_cents: 1, expected_fee_cents: 499 },
    { label: "$250.00", amount_cents: 25_000, expected_fee_cents: 499 },
    { label: "$500.00", amount_cents: 50_000, expected_fee_cents: 499 },
    { label: "$1,000.00", amount_cents: 100_000, expected_fee_cents: 499 },
    { label: "$2,500.00", amount_cents: 250_000, expected_fee_cents: 499 },
    { label: "$5,000.00", amount_cents: 500_000, expected_fee_cents: 499 },
    { label: "$10,000.00", amount_cents: 1_000_000, expected_fee_cents: 499 },
    { label: "$25,000.00", amount_cents: 2_500_000, expected_fee_cents: 499 },
    { label: "$50,000.00", amount_cents: 5_000_000, expected_fee_cents: 499 },
    { label: "$100,000.00", amount_cents: 10_000_000, expected_fee_cents: 499 },
  ];

  it.each(cases)(
    "REPEAT flat fee $label always charges $4.99 (499 cents)",
    ({ amount_cents, expected_fee_cents }) => {
      const fee = repeat(amount_cents);
      expect(fee.fee_cents).toBe(expected_fee_cents);
      expect(fee.charges_live).toBe(false);
      expect(fee.payments_live).toBe(false);
    },
  );
});

describe("change-order fee basis (flat fee model)", () => {
  it("flat $4.99 fee applies regardless of change orders", () => {
    const withoutCo = flatFee(250_000);
    expect(withoutCo.fee_cents).toBe(499);
    const withCo = flatFee(250_000, [100_000]);
    expect(feeBasisCents(250_000, [100_000])).toBe(350_000);
    expect(withCo.fee_cents).toBe(499);
    const largeCo = flatFee(10_000_000, [500_000]);
    expect(largeCo.fee_cents).toBe(499);
    expect(billableAmountCents(10_000_000, [500_000, -20_000])).toBe(10_480_000);
    expect(feeBasisCents(10_000_000, [500_000, -20_000])).toBe(10_500_000);
    expect(largeCo.fee_cents).toBe(499);
  });

  it("connection fee does not increase with change orders", () => {
    const first = flatFee(5_000_000, [1_000_000]);
    const second = flatFee(5_000_000, [1_000_000, 1_000_000]);
    expect(first.fee_cents).toBe(499);
    expect(second.fee_cents).toBe(499);
  });
});

describe("progressiveFeeCentsFromBrackets", () => {
  it("returns 0 for empty or negative amounts", () => {
    expect(progressiveFeeCentsFromBrackets(-100, ORIGINAL_FEE_BRACKETS)).toBe(0);
    expect(progressiveFeeCentsFromBrackets(0, ORIGINAL_FEE_BRACKETS)).toBe(0);
  });
});
