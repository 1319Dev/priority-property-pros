/** Public pricing copy. Marketing-only — do not import payment internals or flip live flags. */

import {
  CONNECTION_FEE_CENTS,
  ORIGINAL_FEE_BRACKETS,
  formatUsdFromFeeCents,
  publicFeeBracketsFromConfig,
} from "../lib/marketplace/feeEngine";

export const PRICING_PATH = "/pricing";

export const SEE_PRICING_LABEL = "See pricing";

export const SIGNUP_FEE = "$9.99";

export const SIGNUP_FEE_SHORT = "$9.99 one-time signup fee";

export const SIGNUP_FEE_NOT_MONTHLY =
  "This is a one-time $9.99 signup fee, not $9.99/month. There is no monthly charge to keep an account.";

/** Flat Connection Fee: $4.99 per legitimate new connection */
export const CONNECTION_FEE = "$4.99";
export const CONNECTION_FEE_DESCRIPTION = "$4.99 flat Connection Fee per legitimate new connection";

export const CONTRACTOR_VALUE_HEADLINE = "No lead fees. No bid fees. Pay $4.99 when you connect.";

export const CONTRACTOR_VALUE_POINTS = [
  "See matched nearby opportunities — not a purchased phone list.",
  "Review the job, then submit and track estimates.",
  "Browse and submit estimates with no upfront lead fees or bid fees.",
  "When a homeowner selects you, accept the connection and pay $4.99.",
  "After you're connected through PPP, communicate and arrange project payment directly with the homeowner.",
  "Keep a marketplace profile and earn PPP reviews from completed jobs.",
] as const;

export const HOMEPAGE_SIGNUP_HEADLINE =
  "Join Priority Property Pros for a one-time $9.99 signup fee.";

export const HOMEPAGE_SIGNUP_SUPPORTING =
  "No monthly homeowner subscription. Post projects, compare estimates, and choose the pro that's right for your project.";

export const PRICING_HOMEPAGE_LINE = HOMEPAGE_SIGNUP_HEADLINE;

export const CONTRACTOR_SIGNUP_HEADLINE = "Get started for a one-time $9.99 signup fee.";

export const CONTRACTOR_SIGNUP_SUPPORTING =
  "Choose our $0/month Free plan and pay $4.99 when you connect. Priority Pro is Coming Soon and is not available to purchase yet.";

export const PRICING_PAGE_TITLE = "Simple, honest pricing.";

export const PRICING_PAGE_INTRO =
  "Everyone pays a one-time $9.99 signup fee to create an account — not $9.99 a month. Homeowners have no monthly subscription and no PPP Connection Fee when hiring. Pros stay on a $0/month Free plan and pay $4.99 when connected to a homeowner.";

export const HOMEOWNER_PRICING_SUMMARY =
  "A one-time $9.99 account signup. No monthly homeowner subscription. No PPP Connection Fee when you hire. After you're connected through PPP, you pay the pro directly for the work.";

export const PRO_PRICING_SUMMARY =
  "A one-time $9.99 account signup. Stay on the $0/month Free plan and pay $4.99 when a homeowner selects you. Priority Pro is Coming Soon at $49/month or $499/year and also uses a $4.99 Connection Fee.";

export const FREE_PLAN_NAME = "Free plan";
export const FREE_PLAN_PRICE = "$0/month";
export const FREE_PLAN_DETAIL =
  "After the one-time $9.99 signup, the Free plan is $0/month. You pay $4.99 when you're connected — not a monthly platform subscription.";

export const PRIORITY_PRO_NAME = "Priority Pro";
export const PRIORITY_PRO_STATUS = "Coming Soon";
export const PRIORITY_PRO_PRICE_MONTH = "$49/month";
export const PRIORITY_PRO_PRICE_YEAR = "$499/year";
export const PRIORITY_PRO_FEE_RATE = "$4.99";
export const PRIORITY_PRO_DETAIL =
  "Priority Pro is Coming Soon at $49/month or $499/year, also with a $4.99 Connection Fee when you're connected. It is not live and cannot be purchased in this product.";

export const NO_PAY_TO_WIN =
  "There is no pay-to-win ranking. Paying the activation fee or a Connection Fee does not buy a higher public listing.";

export const CUSTOMER_SIGNUP_LEDE =
  "Join Priority Property Pros for a one-time $9.99 signup fee. Not $9.99/month. No monthly homeowner subscription, and no PPP Connection Fee when you hire.";

export const CONTRACTOR_SIGNUP_LEDE =
  "Get started for a one-time $9.99 signup fee — not $9.99/month. Choose our $0/month Free plan and pay $4.99 when you connect. Priority Pro is Coming Soon and is not available to purchase yet.";

export const VERIFIER_SIGNUP_LEDE =
  "Get started for a one-time $9.99 signup fee. This is not a monthly subscription.";

export const SIGNUP_ROLE_LEDE =
  "Get started for a one-time $9.99 signup fee. Not $9.99 a month. No monthly subscription to keep your account.";

export const SIGN_IN_CREATE_ACCOUNT_NOTE = "$9.99 one-time signup fee — not a monthly subscription.";

export const CUSTOMER_DASHBOARD_PRICING_NOTE =
  "No monthly homeowner subscription. There is no PPP Connection Fee when you hire.";

export const PRO_DASHBOARD_PRICING_NOTE =
  "After the one-time $9.99 signup, the Free plan is $0/month. You pay $4.99 when connected. Priority Pro is Coming Soon at $49/month or $499/year also with a $4.99 Connection Fee and cannot be purchased yet.";

export const FEE_WHEN_HIRED_SENTENCE =
  "The Connection Fee is a flat $4.99 per legitimate new connection, regardless of project value.";

/**
 * @deprecated Historical progressive brackets - no longer displayed publicly.
 * Current model uses flat $4.99 Connection Fee.
 */
export const ORIGINAL_FEE_BRACKETS_PUBLIC = publicFeeBracketsFromConfig(ORIGINAL_FEE_BRACKETS).map((row) => ({
  range: row.range,
  rate: row.rate,
}));

export const ORIGINAL_FEE_INTRO =
  "The Connection Fee is a flat $4.99 per legitimate new connection. This applies to all connections regardless of project value. Connection Fee checkout is Coming Soon — not live in this product.";

export const ORIGINAL_MIN_FEE = formatUsdFromFeeCents(CONNECTION_FEE_CENTS);
export const ORIGINAL_MAX_FEE = formatUsdFromFeeCents(CONNECTION_FEE_CENTS);

export const REPEAT_FEE_INTRO =
  "Repeat connections also use the same flat $4.99 Connection Fee. Connection Fee checkout is Coming Soon — not live in this product.";

export const REPEAT_FEE_RATE = "$4.99";
export const REPEAT_MIN_FEE = formatUsdFromFeeCents(CONNECTION_FEE_CENTS);
export const REPEAT_MAX_FEE = formatUsdFromFeeCents(CONNECTION_FEE_CENTS);

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
    feature: "Connection Fee when connected",
    free: "$4.99 flat — Coming Soon",
    priorityPro: "$4.99 flat — Coming Soon",
  },
  {
    feature: "Repeat Connection Fee",
    free: "$4.99 flat — Coming Soon",
    priorityPro: "$4.99 flat — Coming Soon",
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
    question: "Do homeowners pay a PPP Connection Fee?",
    answer:
      "No. Homeowners pay the one-time $9.99 account signup and then pay the pro directly for the job after you're connected through PPP. There is no PPP Connection Fee when hiring and no monthly homeowner subscription.",
  },
  {
    question: "What is the contractor Free plan?",
    answer:
      "After the one-time $9.99 signup, contractors can stay on the $0/month Free plan. Pay $4.99 when you are connected with a homeowner. The Free plan is a $0/month plan, distinct from the one-time signup fee.",
  },
  {
    question: "What is Priority Pro?",
    answer:
      "Priority Pro is Coming Soon at $49/month or $499/year, also with a $4.99 Connection Fee when you're connected. It is not live and cannot be purchased yet.",
  },
  {
    question: "Do I pay for leads?",
    answer:
      "No. No lead fees. No bid fees. Pay $4.99 when you connect. There is no per-lead fee and no fee merely to estimate.",
  },
  {
    question: "Does the Connection Fee vary by project size?",
    answer:
      "No. The Connection Fee is a flat $4.99 per legitimate new connection, regardless of whether the project is $100 or $100,000. It's for the marketplace service of connecting you, not a percentage of the project payment.",
  },
] as const;
