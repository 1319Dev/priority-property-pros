/** Public pricing copy. Marketing-only — do not import payment internals or flip live flags. */

export const PRICING_PATH = "/pricing";

export const SEE_PRICING_LABEL = "See pricing";

export const SIGNUP_FEE = "$9.99";

export const SIGNUP_FEE_SHORT = "$9.99 one-time signup fee";

export const SIGNUP_FEE_NOT_MONTHLY =
  "This is a one-time $9.99 signup fee, not $9.99/month. There is no monthly charge to keep an account.";

export const HOMEPAGE_SIGNUP_HEADLINE =
  "Join Priority Property Pros for a one-time $9.99 signup fee.";

export const HOMEPAGE_SIGNUP_SUPPORTING =
  "No monthly homeowner subscription. Post projects, compare estimates, and choose the pro that’s right for your project.";

export const PRICING_HOMEPAGE_LINE = HOMEPAGE_SIGNUP_HEADLINE;

export const CONTRACTOR_SIGNUP_HEADLINE = "Get started for a one-time $9.99 signup fee.";

export const CONTRACTOR_SIGNUP_SUPPORTING =
  "Choose our $0/month Free plan and pay marketplace fees when you’re hired, or upgrade to Priority Pro for lower marketplace fees.";

export const PRICING_PAGE_TITLE = "Simple, honest pricing.";

export const PRICING_PAGE_INTRO =
  "Everyone pays a one-time $9.99 signup fee to create an account — not $9.99 a month. Homeowners have no monthly subscription and no PPP marketplace fee when hiring. Pros choose a $0/month Free plan and pay a marketplace fee only when hired.";

export const HOMEOWNER_PRICING_SUMMARY =
  "A one-time $9.99 account signup. No monthly homeowner subscription. No PPP marketplace fee when you hire. You pay the pro for the work.";

export const PRO_PRICING_SUMMARY =
  "A one-time $9.99 account signup. Stay on the $0/month Free plan and pay a marketplace fee when a homeowner hires you. Hire-again jobs are a flat 2%. Priority Pro is planned at $49/month or $499/year with a 2% marketplace fee.";

export const FREE_PLAN_NAME = "Free plan";
export const FREE_PLAN_PRICE = "$0/month";
export const FREE_PLAN_DETAIL =
  "After the one-time $9.99 signup, the Free plan is $0/month. You pay a marketplace fee when you’re hired — not a monthly platform subscription.";

export const PRIORITY_PRO_NAME = "Priority Pro";
export const PRIORITY_PRO_STATUS = "Planned";
export const PRIORITY_PRO_PRICE_MONTH = "$49/month";
export const PRIORITY_PRO_PRICE_YEAR = "$499/year";
export const PRIORITY_PRO_FEE_RATE = "2%";
export const PRIORITY_PRO_DETAIL =
  "Priority Pro is planned at $49/month or $499/year, with a 2% marketplace fee when you’re hired. It is not live yet.";

export const CUSTOMER_SIGNUP_LEDE =
  "Join Priority Property Pros for a one-time $9.99 signup fee. Not $9.99/month. No monthly homeowner subscription, and no PPP marketplace fee when you hire.";

export const CONTRACTOR_SIGNUP_LEDE =
  "Get started for a one-time $9.99 signup fee — not $9.99/month. Choose our $0/month Free plan and pay marketplace fees when you’re hired, or upgrade to Priority Pro for lower marketplace fees.";

export const VERIFIER_SIGNUP_LEDE =
  "Get started for a one-time $9.99 signup fee. This is not a monthly subscription.";

export const SIGNUP_ROLE_LEDE =
  "Get started for a one-time $9.99 signup fee. Not $9.99 a month. No monthly subscription to keep your account.";

export const SIGN_IN_CREATE_ACCOUNT_NOTE = "$9.99 one-time signup fee — not a monthly subscription.";

export const CUSTOMER_DASHBOARD_PRICING_NOTE =
  "No monthly homeowner subscription. There is no PPP marketplace fee when you hire.";

export const PRO_DASHBOARD_PRICING_NOTE =
  "After the one-time $9.99 signup, the Free plan is $0/month. You pay a marketplace fee when hired. Priority Pro is planned at $49/month or $499/year with a 2% marketplace fee.";

export const FEE_WHEN_HIRED_SENTENCE =
  "Fees are calculated on the job amount when the pro is hired.";

export const ORIGINAL_FEE_INTRO =
  "The first time a homeowner hires a pro, the fee is progressive: each portion of the job amount has its own rate. Bigger jobs pay a lower rate on the upper portion.";

export const ORIGINAL_FEE_BRACKETS_PUBLIC = [
  { range: "$0–$499.99", rate: "8%" },
  { range: "$500–$2,499.99", rate: "7%" },
  { range: "$2,500–$9,999.99", rate: "5%" },
  { range: "$10,000–$24,999.99", rate: "3.5%" },
  { range: "$25,000+", rate: "2.5%" },
] as const;

export const ORIGINAL_MIN_FEE = "$15";
export const ORIGINAL_MAX_FEE = "$1,500";

export const REPEAT_FEE_INTRO =
  "If that same homeowner hires the same pro again, the fee is a flat 2% of the job amount.";

export const REPEAT_FEE_RATE = "2%";
export const REPEAT_MIN_FEE = "$10";
export const REPEAT_MAX_FEE = "$500";

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
      "Priority Pro is planned at $49/month or $499/year, with a 2% marketplace fee when you’re hired. It is not live yet.",
  },
] as const;
