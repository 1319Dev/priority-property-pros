import { REPEAT_FEE_BRACKETS, REPEAT_MAX_FEE_CENTS, REPEAT_MIN_FEE_CENTS, computeMarketplaceFee } from "../marketplace/feeEngine";
import type { FeeScheduleKind, MarketplaceFeePreview } from "../marketplace/types";

export const CONTRACTOR_PLAN_IDS = ["FREE", "PRIORITY_PRO"] as const;
export type ContractorPlanId = (typeof CONTRACTOR_PLAN_IDS)[number];

export const FREE_PLAN_MONTHLY_CENTS = 0;
export const FREE_PLAN_YEARLY_CENTS = 0;

export const PRIORITY_PRO_MONTHLY_CENTS = 4_900;
export const PRIORITY_PRO_YEARLY_CENTS = 49_900;

export const PRIORITY_PRO_MONTHLY_USD = "$49";
export const PRIORITY_PRO_YEARLY_USD = "$499";

export const PRIORITY_PRO_MARKETPLACE_FEE_BPS = 200;
export const PRIORITY_PRO_MARKETPLACE_FEE_RATE = "2%";

export const CONTRACTOR_PLANS = {
  FREE: {
    id: "FREE" as const,
    name: "Free",
    monthly_cents: FREE_PLAN_MONTHLY_CENTS,
    yearly_cents: FREE_PLAN_YEARLY_CENTS,
    monthly_label: "$0/month",
    yearly_label: "$0/year",
    first_job_fee: "Existing sliding marketplace fee",
    repeat_job_fee: "2%",
  },
  PRIORITY_PRO: {
    id: "PRIORITY_PRO" as const,
    name: "Priority Pro",
    monthly_cents: PRIORITY_PRO_MONTHLY_CENTS,
    yearly_cents: PRIORITY_PRO_YEARLY_CENTS,
    monthly_label: "$49/month",
    yearly_label: "$499/year",
    first_job_fee: "2%",
    repeat_job_fee: "2%",
  },
} as const;

/** Priority Pro uses a flat 2% marketplace fee on first-time and repeat jobs. */
export function computeMarketplaceFeeForPlan(
  plan: ContractorPlanId,
  input: { amount_cents: number; kind?: FeeScheduleKind },
): MarketplaceFeePreview {
  if (plan === "PRIORITY_PRO") {
    return computeMarketplaceFee({
      amount_cents: input.amount_cents,
      kind: input.kind ?? "ORIGINAL",
      brackets: REPEAT_FEE_BRACKETS,
      min_fee_cents: REPEAT_MIN_FEE_CENTS,
      max_fee_cents: REPEAT_MAX_FEE_CENTS,
    });
  }
  return computeMarketplaceFee({
    amount_cents: input.amount_cents,
    kind: input.kind ?? "ORIGINAL",
  });
}
