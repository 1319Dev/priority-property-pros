import { DEFAULT_FEE_BPS, type FeePreview } from "./types";

/** Integer cents fee from basis points. Mirrors public.fee_cents_from_total. */
export function feeCentsFromTotal(totalCents: number, feeBps: number = DEFAULT_FEE_BPS): number {
  if (!Number.isFinite(totalCents) || totalCents < 0) return 0;
  return Math.round((totalCents * feeBps) / 10000);
}

export function lineTotalCents(quantity: number, unitCents: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (!Number.isFinite(unitCents) || unitCents < 0) return 0;
  return Math.round(quantity * unitCents);
}

export function previewFee(
  totalCents: number,
  feeBps: number = DEFAULT_FEE_BPS,
): FeePreview {
  const fee_cents = feeCentsFromTotal(totalCents, feeBps);
  return {
    total_cents: Math.max(0, Math.trunc(totalCents) || 0),
    fee_bps: feeBps,
    fee_cents,
    contractor_earnings_cents: Math.max(0, (Math.trunc(totalCents) || 0) - fee_cents),
    charges_live: false,
  };
}

export function totalsFromItems(
  items: { quantity: number; unit_cents: number }[],
  feeBps: number = DEFAULT_FEE_BPS,
): FeePreview & { item_count: number } {
  const total = items.reduce((sum, item) => sum + lineTotalCents(item.quantity, item.unit_cents), 0);
  return { ...previewFee(total, feeBps), item_count: items.length };
}

export function assertValidTotals(input: {
  items: { quantity: number; unit_cents: number; line_total_cents?: number }[];
  total_cents: number;
  subtotal_cents: number;
  fee_bps: number;
  fee_cents: number;
  contractor_earnings_cents: number;
}): string | null {
  if (input.items.length < 1) return "add at least one line item";
  const computed = totalsFromItems(input.items, input.fee_bps);
  for (const item of input.items) {
    if (item.line_total_cents != null && item.line_total_cents !== lineTotalCents(item.quantity, item.unit_cents)) {
      return "line totals must equal quantity × unit price";
    }
  }
  if (input.total_cents !== computed.total_cents) return "total does not match line items";
  if (input.subtotal_cents !== input.total_cents) return "subtotal must equal total";
  if (input.fee_cents !== computed.fee_cents) return "fee does not match platform rate";
  if (input.contractor_earnings_cents !== computed.contractor_earnings_cents) {
    return "contractor earnings must equal total minus fee";
  }
  if (input.total_cents <= 0) return "total must be greater than zero";
  return null;
}

export function formatUsdFromCents(cents: number): string {
  const value = (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  return value;
}
