import type { FeeScheduleKind, FeeBracket, MarketplaceFeePreview } from "./types";

/** First $500 at 8%, next $2,000 at 7%, next $7,500 at 5%, next $15,000 at 3.5%, remainder at 2.5%. */
export const ORIGINAL_FEE_BRACKETS: FeeBracket[] = [
  { min_amount_cents: 0, max_amount_cents: 50_000, rate_bps: 800 },
  { min_amount_cents: 50_000, max_amount_cents: 250_000, rate_bps: 700 },
  { min_amount_cents: 250_000, max_amount_cents: 1_000_000, rate_bps: 500 },
  { min_amount_cents: 1_000_000, max_amount_cents: 2_500_000, rate_bps: 350 },
  { min_amount_cents: 2_500_000, max_amount_cents: null, rate_bps: 250 },
];

export const REPEAT_FEE_BRACKETS: FeeBracket[] = [
  { min_amount_cents: 0, max_amount_cents: null, rate_bps: 200 },
];

export const ORIGINAL_MIN_FEE_CENTS = 1_500;
export const ORIGINAL_MAX_FEE_CENTS = 150_000;
export const REPEAT_MIN_FEE_CENTS = 1_000;
export const REPEAT_MAX_FEE_CENTS = 50_000;
export const DEFAULT_RELATIONSHIP_PROTECTION_MONTHS = 12;

/** Mirrors public.progressive_fee_cents_from_brackets (integer cents, round half away from 0). */
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
  const brackets = input.brackets ?? (kind === "REPEAT" ? REPEAT_FEE_BRACKETS : ORIGINAL_FEE_BRACKETS);
  const min_fee_cents =
    input.min_fee_cents ?? (kind === "REPEAT" ? REPEAT_MIN_FEE_CENTS : ORIGINAL_MIN_FEE_CENTS);
  const max_fee_cents =
    input.max_fee_cents ?? (kind === "REPEAT" ? REPEAT_MAX_FEE_CENTS : ORIGINAL_MAX_FEE_CENTS);
  const amount_cents = Number.isFinite(input.amount_cents) ? Math.max(0, Math.trunc(input.amount_cents)) : 0;
  const raw_fee_cents = progressiveFeeCentsFromBrackets(amount_cents, brackets);
  const fee_cents = applyFeeMinMax(raw_fee_cents, min_fee_cents, max_fee_cents, amount_cents);
  const used = brackets
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

  return {
    amount_cents,
    raw_fee_cents,
    fee_cents,
    min_fee_cents,
    max_fee_cents,
    min_applied: amount_cents > 0 && raw_fee_cents < min_fee_cents,
    max_applied: amount_cents > 0 && raw_fee_cents > max_fee_cents,
    contractor_earnings_cents: Math.max(0, amount_cents - fee_cents),
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
