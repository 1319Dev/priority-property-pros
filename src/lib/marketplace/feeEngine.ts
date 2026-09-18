import type { FeeScheduleKind, FeeBracket, MarketplaceFeePreview } from "./types";

/**
 * Flat Connection Fee: $4.99 per legitimate new connection.
 * Applies to ALL new connections regardless of project value.
 */
export const CONNECTION_FEE_CENTS = 499;

/**
 * @deprecated Historical progressive brackets - no longer actively used.
 * Kept for reference and historical data only.
 * First $500 at 8%, next $2,000 at 7%, next $7,500 at 5%, next $15,000 at 3.5%, remainder at 2.5%.
 */
export const ORIGINAL_FEE_BRACKETS: FeeBracket[] = [
  { min_amount_cents: 0, max_amount_cents: 50_000, rate_bps: 800 },
  { min_amount_cents: 50_000, max_amount_cents: 250_000, rate_bps: 700 },
  { min_amount_cents: 250_000, max_amount_cents: 1_000_000, rate_bps: 500 },
  { min_amount_cents: 1_000_000, max_amount_cents: 2_500_000, rate_bps: 350 },
  { min_amount_cents: 2_500_000, max_amount_cents: null, rate_bps: 250 },
];

/**
 * @deprecated Historical repeat brackets - no longer actively used.
 */
export const REPEAT_FEE_BRACKETS: FeeBracket[] = [
  { min_amount_cents: 0, max_amount_cents: null, rate_bps: 200 },
];

/**
 * @deprecated Historical min/max values - no longer actively used for flat fee model.
 */
export const ORIGINAL_MIN_FEE_CENTS = 1_500;
export const ORIGINAL_MAX_FEE_CENTS = 99_900;
export const REPEAT_MIN_FEE_CENTS = 1_000;
export const REPEAT_MAX_FEE_CENTS = 50_000;
export const DEFAULT_RELATIONSHIP_PROTECTION_MONTHS = 12;

/**
 * @deprecated Historical progressive calculation - kept for backward compatibility only.
 * Current model uses flat CONNECTION_FEE_CENTS.
 * Mirrors public.progressive_fee_cents_from_brackets (integer cents, round half away from 0).
 */
export function progressiveFeeCentsFromBrackets(amountCents: number, brackets: FeeBracket[]): number {
  const amount = Number.isFinite(amountCents) ? Math.max(0, Math.trunc(amountCents)) : 0;
  let fee = 0;
  for (const bracket of brackets) {
    const high = bracket.max_amount_cents ?? Number.POSITIVE_INFINITY;
    const slice = Math.max(0, Math.min(amount, high) - bracket.min_amount_cents);
    if (slice <= 0) continue;
    fee += Math.round((slice * bracket.rate_bps) / 10000);
  }
  return fee;
}

export function applyFeeMinMax(rawFeeCents: number, minFeeCents: number, maxFeeCents: number, amountCents: number): number {
  if (amountCents <= 0) return 0;
  return Math.min(maxFeeCents, Math.max(minFeeCents, rawFeeCents));
}

export function computeMarketplaceFee(input: {
  amount_cents: number;
  kind?: FeeScheduleKind;
  brackets?: FeeBracket[];
  min_fee_cents?: number;
  max_fee_cents?: number;
  schedule_id?: string | null;
  version?: number | null;
}): MarketplaceFeePreview {
  const kind: FeeScheduleKind = input.kind ?? "ORIGINAL";
  const amount_cents = Number.isFinite(input.amount_cents) ? Math.max(0, Math.trunc(input.amount_cents)) : 0;
  
  // Flat $4.99 Connection Fee model: always 499 cents for any legitimate new connection
  // Project value does NOT affect the fee - it's a flat marketplace connection fee
  const fee_cents = amount_cents > 0 ? CONNECTION_FEE_CENTS : 0;
  const raw_fee_cents = fee_cents;
  
  // For backward compatibility with historical data, still support bracket-based calculation
  const brackets = input.brackets ?? (kind === "REPEAT" ? REPEAT_FEE_BRACKETS : ORIGINAL_FEE_BRACKETS);
  const min_fee_cents =
    input.min_fee_cents ?? (kind === "REPEAT" ? REPEAT_MIN_FEE_CENTS : ORIGINAL_MIN_FEE_CENTS);
  const max_fee_cents =
    input.max_fee_cents ?? (kind === "REPEAT" ? REPEAT_MAX_FEE_CENTS : ORIGINAL_MAX_FEE_CENTS);
  
  // If brackets are explicitly provided (e.g. historical snapshots), use progressive calculation
  const useBrackets = input.brackets !== undefined || input.min_fee_cents !== undefined || input.max_fee_cents !== undefined;
  let finalFeeCents = fee_cents;
  let finalRawFeeCents = raw_fee_cents;
  let used: Array<FeeBracket & { slice_cents: number; fee_cents: number }> = [];
  
  if (useBrackets) {
    // Historical progressive calculation for backward compatibility
    finalRawFeeCents = progressiveFeeCentsFromBrackets(amount_cents, brackets);
    finalFeeCents = applyFeeMinMax(finalRawFeeCents, min_fee_cents, max_fee_cents, amount_cents);
    used = brackets
      .map((bracket) => {
        const high = bracket.max_amount_cents ?? Number.POSITIVE_INFINITY;
        const slice_cents = Math.max(0, Math.min(amount_cents, high) - bracket.min_amount_cents);
        return {
          ...bracket,
          slice_cents,
          fee_cents: slice_cents > 0 ? Math.round((slice_cents * bracket.rate_bps) / 10000) : 0,
        };
      })
      .filter((row) => row.slice_cents > 0);
  } else {
    // Current flat fee model - no brackets used
    finalFeeCents = fee_cents;
    finalRawFeeCents = raw_fee_cents;
  }

  return {
    amount_cents,
    raw_fee_cents: finalRawFeeCents,
    fee_cents: finalFeeCents,
    min_fee_cents: useBrackets ? min_fee_cents : CONNECTION_FEE_CENTS,
    max_fee_cents: useBrackets ? max_fee_cents : CONNECTION_FEE_CENTS,
    min_applied: false, // Not applicable for flat fee
    max_applied: false, // Not applicable for flat fee
    contractor_earnings_cents: Math.max(0, amount_cents - finalFeeCents),
    customer_amount_cents: amount_cents,
    kind,
    schedule_id: input.schedule_id ?? null,
    version: input.version ?? null,
    brackets: used,
    charges_live: false,
    payments_live: false,
    label: "preview / estimate — payments not live",
  };
}

export function feeBasisCents(originalAmountCents: number, approvedDeltas: number[]): number {
  const positives = approvedDeltas.filter((delta) => delta > 0).reduce((sum, delta) => sum + delta, 0);
  return Math.max(0, Math.trunc(originalAmountCents) + positives);
}

export function billableAmountCents(originalAmountCents: number, approvedDeltas: number[]): number {
  return Math.max(0, Math.trunc(originalAmountCents) + approvedDeltas.reduce((sum, delta) => sum + delta, 0));
}

export function formatFeeScheduleLabel(kind: FeeScheduleKind): string {
  return kind === "REPEAT" ? "Repeat (Hire Again)" : "Original";
}

/** Public dollar range from a half-open [min, max) cent bracket. */
export function formatPublicFeeRange(minCents: number, maxCents: number | null): string {
  const format = (cents: number) => {
    const dollars = cents / 100;
    if (Number.isInteger(dollars)) return `$${dollars.toLocaleString("en-US")}`;
    return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  if (maxCents == null) return `${format(minCents)}+`;
  return `${format(minCents)}–${format(maxCents - 1)}`;
}

export function formatPublicFeeRate(rateBps: number): string {
  const pct = rateBps / 100;
  return `${pct}%`;
}

export function publicFeeBracketsFromConfig(
  brackets: FeeBracket[] = ORIGINAL_FEE_BRACKETS,
): { range: string; rate: string; min_amount_cents: number; max_amount_cents: number | null; rate_bps: number }[] {
  return brackets.map((bracket) => ({
    range: formatPublicFeeRange(bracket.min_amount_cents, bracket.max_amount_cents),
    rate: formatPublicFeeRate(bracket.rate_bps),
    min_amount_cents: bracket.min_amount_cents,
    max_amount_cents: bracket.max_amount_cents,
    rate_bps: bracket.rate_bps,
  }));
}

export function formatUsdFromFeeCents(cents: number): string {
  const dollars = cents / 100;
  if (Number.isInteger(dollars)) return `$${dollars.toLocaleString("en-US")}`;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
