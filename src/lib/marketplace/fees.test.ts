import { describe, expect, it } from "vitest";
import { assertValidTotals, feeCentsFromTotal, previewFee, totalsFromItems } from "./fees";

describe("platform fee preview (~7%)", () => {
  it("computes 7% of $100.00 as $7.00 with $93.00 to the contractor", () => {
    expect(feeCentsFromTotal(10000, 700)).toBe(700);
    const preview = previewFee(10000, 700);
    expect(preview.fee_cents).toBe(700);
    expect(preview.contractor_earnings_cents).toBe(9300);
    expect(preview.charges_live).toBe(false);
  });

  it("rounds half up in cents like the SQL round()", () => {
    expect(feeCentsFromTotal(1, 700)).toBe(0);
    expect(feeCentsFromTotal(72, 700)).toBe(5);
    expect(feeCentsFromTotal(715, 700)).toBe(50);
  });

  it("rejects totals that do not match line items or the fee rate", () => {
    const items = [
      { quantity: 2, unit_cents: 2500, line_total_cents: 5000 },
      { quantity: 1, unit_cents: 1500, line_total_cents: 1500 },
    ];
    const good = totalsFromItems(items, 700);
    expect(
      assertValidTotals({
        items,
        total_cents: good.total_cents,
        subtotal_cents: good.total_cents,
        fee_bps: 700,
        fee_cents: good.fee_cents,
        contractor_earnings_cents: good.contractor_earnings_cents,
      }),
    ).toBeNull();
    expect(
      assertValidTotals({
        items,
        total_cents: 99999,
        subtotal_cents: good.total_cents,
        fee_bps: 700,
        fee_cents: good.fee_cents,
        contractor_earnings_cents: good.contractor_earnings_cents,
      }),
    ).toMatch(/total/i);
    expect(
      assertValidTotals({
        items: [],
        total_cents: 0,
        subtotal_cents: 0,
        fee_bps: 700,
        fee_cents: 0,
        contractor_earnings_cents: 0,
      }),
    ).toMatch(/line item/i);
  });
});
