/** Public pricing copy. Marketing-only — do not import payment internals or flip live flags. */

import {
  ORIGINAL_FEE_BRACKETS,
  ORIGINAL_MAX_FEE_CENTS,
  ORIGINAL_MIN_FEE_CENTS,
  REPEAT_FEE_BRACKETS,
  REPEAT_MAX_FEE_CENTS,
  REPEAT_MIN_FEE_CENTS,
  formatPublicFeeRate,
  formatUsdFromFeeCents,
  publicFeeBracketsFromConfig,
} from "../lib/marketplace/feeEngine";

export const PRICING_PATH = "/pricing";

export const SEE_PRICING_LABEL = "See pricing";

export const SIGNUP_FEE = "$9.99";

export const SIGNUP_FEE_SHORT = "$9.99 one-time signup fee";

export const SIGNUP_FEE_NOT_MONTHLY =
  "This is a one-time $9.99 signup fee, not $9.99/month. There is no monthly charge to keep an account.";

export const CONTRACTOR_VALUE_HEADLINE = "Don’t pay for leads. Pay when you win the job.";

export const CONTRACTOR_VALUE_POINTS = [
  "See matched nearby opportunities — not a purchased phone list.",
  "Review the job, then submit and track estimates.",
  "Homeowners hire through a clear workflow, with project tools after the job starts.",
  "Keep a marketplace profile and earn PPP reviews from completed jobs.",
  "Private contact is shared after you are connected through Priority Property Pros.",
  "No per-lead fee. No fee merely to send an estimate. A marketplace fee applies when you are hired, according to your plan.",
] as const;

export const HOMEPAGE_SIGNUP_HEADLINE =
  "Join Priority Property Pros for a one-time $9.99 signup fee.";

export const HOMEPAGE_SIGNUP_SUPPORTING =
  "No monthly homeowner subscription. Post projects, compare estimates, and choose the pro that’s right for your project.";

export const PRICING_HOMEPAGE_LINE = HOMEPAGE_SIGNUP_HEADLINE;

export const CONTRACTOR_SIGNUP_HEADLINE = "Get started for a one-time $9.99 signup fee.";

export const CONTRACTOR_SIGNUP_SUPPORTING =
  "Choose our $0/month Free plan and pay marketplace fees when you’re hired. Priority Pro is Coming Soon at a lower hired-job fee and is not available to purchase yet.";

export const PRICING_PAGE_TITLE = "Simple, honest pricing.";

export const PRICING_PAGE_INTRO =
  "Everyone pays a one-time $9.99 signup fee to create an account — not $9.99 a month. Homeowners have no monthly subscription and no PPP marketplace fee when hiring. Pros stay on a $0/month Free plan and pay a marketplace fee only when hired.";

export const HOMEOWNER_PRICING_SUMMARY =
  "A one-time $9.99 account signup. No monthly homeowner subscription. No PPP marketplace fee when you hire. You pay the pro for the work.";

export const PRO_PRICING_SUMMARY =
  "A one-time $9.99 account signup. Stay on the $0/month Free plan and pay a marketplace fee when a homeowner hires you. Hire-again jobs are a flat 2%. Priority Pro is Coming Soon at $49/month or $499/year with a 2% marketplace fee.";

export const FREE_PLAN_NAME = "Free plan";
export const FREE_PLAN_PRICE = "$0/month";
export const FREE_PLAN_DETAIL =
  "After the one-time $9.99 signup, the Free plan is $0/month. You pay a marketplace fee when you’re hired — not a monthly platform subscription.";

export const PRIORITY_PRO_NAME = "Priority Pro";
export const PRIORITY_PRO_STATUS = "Coming Soon";
export const PRIORITY_PRO_PRICE_MONTH = "$49/month";
export const PRIORITY_PRO_PRICE_YEAR = "$499/year";
export const PRIORITY_PRO_FEE_RATE = "2%";
export const PRIORITY_PRO_DETAIL =
  "Priority Pro is Coming Soon at $49/month or $499/year, with a 2% marketplace fee when you’re hired. It is not live and cannot be purchased in this product.";

export const NO_PAY_TO_WIN =
  "There is no pay-to-win ranking. Paying the activation fee or a marketplace fee does not buy a higher public listing.";

export const CUSTOMER_SIGNUP_LEDE =
  "Join Priority Property Pros for a one-time $9.99 signup fee. Not $9.99/month. No monthly homeowner subscription, and no PPP marketplace fee when you hire.";

export const CONTRACTOR_SIGNUP_LEDE =
  "Get started for a one-time $9.99 signup fee — not $9.99/month. Choose our $0/month Free plan and pay marketplace fees when you’re hired. Priority Pro is Coming Soon and is not available to purchase yet.";

export const VERIFIER_SIGNUP_LEDE =
  "Get started for a one-time $9.99 signup fee. This is not a monthly subscription.";

export const SIGNUP_ROLE_LEDE =
  "Get started for a one-time $9.99 signup fee. Not $9.99 a month. No monthly subscription to keep your account.";

export const SIGN_IN_CREATE_ACCOUNT_NOTE = "$9.99 one-time signup fee — not a monthly subscription.";

export const CUSTOMER_DASHBOARD_PRICING_NOTE =
  "No monthly homeowner subscription. There is no PPP marketplace fee when you hire.";

export const PRO_DASHBOARD_PRICING_NOTE =
  "After the one-time $9.99 signup, the Free plan is $0/month. You pay a marketplace fee when hired. Priority Pro is Coming Soon at $49/month or $499/year with a 2% marketplace fee and cannot be purchased yet.";

export const FEE_WHEN_HIRED_SENTENCE =
  "Fees are calculated on the job amount when the pro is hired.";

/** Read from the configured fee engine / DB seed. Do not invent brackets. */
export const ORIGINAL_FEE_BRACKETS_PUBLIC = publicFeeBracketsFromConfig(ORIGINAL_FEE_BRACKETS).map((row) => ({
  range: row.range,
  rate: row.rate,
}));

export const ORIGINAL_FEE_INTRO =
  "The first time a homeowner hires a pro, the fee is progressive: each portion of the job amount has its own rate. Bigger jobs pay a lower rate on the upper portion.";

export const ORIGINAL_MIN_FEE = formatUsdFromFeeCents(ORIGINAL_MIN_FEE_CENTS);
export const ORIGINAL_MAX_FEE = formatUsdFromFeeCents(ORIGINAL_MAX_FEE_CENTS);

export const REPEAT_FEE_INTRO =
  "If that same homeowner hires the same pro again, the fee is a flat 2% of the job amount.";

export const REPEAT_FEE_RATE = formatPublicFeeRate(REPEAT_FEE_BRACKETS[0]?.rate_bps ?? 200);
export const REPEAT_MIN_FEE = formatUsdFromFeeCents(REPEAT_MIN_FEE_CENTS);
export const REPEAT_MAX_FEE = formatUsdFromFeeCents(REPEAT_MAX_FEE_CENTS);

export const PLAN_COMPARISON = [
  {
    feature: "Monthly plan price",
    free: "$0/month",
    priorityPro: "$49/month or $499/year — Coming Soon, not purchasable",
  },
  {
    feature: "One-time account activation",
    free: "$9.99",
    priorityPro: "$9.99",
  },
  {
    feature: "Fee to look at nearby jobs",
    free: "None",
    priorityPro: "None",
  },
  {
    feature: "Fee merely to send an estimate",
    free: "None",
    priorityPro: "None",
  },
  {
    feature: "Marketplace fee when hired (first job with that homeowner)",
    free: "Configured progressive schedule below",
    priorityPro: "2% — Coming Soon",
  },
  {
    feature: "Hire-again marketplace fee",
    free: `${REPEAT_FEE_RATE} (configured repeat schedule)`,
    priorityPro: "2%",
  },
  {
    feature: "Pay-to-win public ranking",
    free: "No",
    priorityPro: "No",
  },
] as const;

export const PRICING_FAQ = [
  {
    question: "Is the $9.99 signup fee monthly?",
    answer:
      "No. The $9.99 signup fee is one-time, not $9.99/month. There is no monthly charge to keep a homeowner or contractor account.",
  },
  {
    question: "Do homeowners pay a PPP marketplace fee?",
    answer:
      "No. Homeowners pay the one-time $9.99 account signup and then pay the pro for the job. There is no PPP marketplace fee when hiring and no monthly homeowner subscription.",
  },
  {
    question: "What is the contractor Free plan?",
    answer:
      "After the one-time $9.99 signup, contractors can stay on the $0/month Free plan. Marketplace fees apply when you are hired. The Free plan is a $0/month plan, distinct from the one-time signup fee.",
  },
  {
    question: "What is Priority Pro?",
    answer:
      "Priority Pro is Coming Soon at $49/month or $499/year, with a 2% marketplace fee when you’re hired. It is not live and cannot be purchased yet.",
  },
  {
    question: "Do I pay for leads?",
    answer:
      "No. Don’t pay for leads. Pay when you win the job. There is no per-lead fee and no fee merely to estimate.",
  },
] as const;
