/** Public marketplace fee copy. Keep this marketing-only — do not import payment internals. */

export const PRICING_PATH = "/pricing";

export const SEE_PRICING_LABEL = "See pricing";

export const PRICING_HOMEPAGE_LINE =
  "Free for homeowners. Free to join for pros. Pros pay a marketplace fee only when hired.";

export const PRICING_PAGE_TITLE = "Simple marketplace pricing.";

export const PRICING_PAGE_INTRO =
  "Accounts are free. Homeowners pay the pro for the job. Pros pay a marketplace fee only when hired — not a homeowner platform fee.";

export const HOMEOWNER_PRICING_SUMMARY =
  "Your account is free. You pay the pro for the work. There is no homeowner platform fee.";

export const PRO_PRICING_SUMMARY =
  "Joining is free. When a homeowner hires you, you pay a marketplace fee on that job. Homeowners do not pay a platform fee.";

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
