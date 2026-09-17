/** Public marketplace fee copy. Keep this marketing-only — do not import payment internals. */

export const PRICING_PATH = "/pricing";

export const SEE_PRICING_LABEL = "See pricing";

export const CUSTOMER_SIGNUP_FEE_SENTENCE =
  "$9.99 one-time account signup. No homeowner subscription.";

export const CONTRACTOR_SIGNUP_FEE_SENTENCE =
  "Get started for $9.99. No monthly subscription required on the Free plan. Marketplace fees apply only when you are hired.";

export const PRICING_HOMEPAGE_LINE = CUSTOMER_SIGNUP_FEE_SENTENCE;

export const PRICING_PAGE_TITLE = "Simple marketplace pricing.";

export const PRICING_PAGE_INTRO = `${CUSTOMER_SIGNUP_FEE_SENTENCE} ${CONTRACTOR_SIGNUP_FEE_SENTENCE}`;

export const HOMEOWNER_PRICING_SUMMARY = CUSTOMER_SIGNUP_FEE_SENTENCE;

export const PRO_PRICING_SUMMARY = CONTRACTOR_SIGNUP_FEE_SENTENCE;

export const FEE_WHEN_HIRED_SENTENCE =
  "Contractor marketplace fees apply only when you are hired. Homeowners do not pay a PPP marketplace fee.";

export const FREE_PLAN_MONTHLY = "$0/month";
export const PRIORITY_PRO_MONTHLY = "$49/month";
export const PRIORITY_PRO_YEARLY = "$499/year";

export const ORIGINAL_FEE_INTRO =
  "Free plan, first job with a homeowner: the fee is progressive. Each portion of the job amount has its own rate. Bigger jobs pay a lower rate on the upper portion.";

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
  "Free plan, hire-again: if that same homeowner hires the same pro again, the fee is a flat 2% of the job amount.";

export const REPEAT_FEE_RATE = "2%";
export const REPEAT_MIN_FEE = "$10";
export const REPEAT_MAX_FEE = "$500";

export const PRIORITY_PRO_FEE_INTRO =
  "Priority Pro still requires the $9.99 signup fee, then $49/month or $499/year. Marketplace fee is 2% on first-time and repeat jobs.";
