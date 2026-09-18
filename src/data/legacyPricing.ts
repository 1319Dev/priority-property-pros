/**
 * LEGACY marketplace-fee copy removed from active UI.
 * Historical progressive % schedules remain in the database and feeEngine.ts.
 * Do not import these strings into public pages.
 */
export const LEGACY_ORIGINAL_FEE_BRACKETS_PUBLIC = [
  { range: "$0–$499.99", rate: "8%" },
  { range: "$500–$2,499.99", rate: "7%" },
  { range: "$2,500–$9,999.99", rate: "5%" },
  { range: "$10,000–$24,999.99", rate: "3.5%" },
  { range: "$25,000+", rate: "2.5%" },
] as const;

export const LEGACY_PRIORITY_PRO_PRICE_MONTH = "$49/month";
export const LEGACY_PRIORITY_PRO_PRICE_YEAR = "$499/year";
export const LEGACY_PRIORITY_PRO_FEE_RATE = "2%";
export const LEGACY_PAY_WHEN_HIRED = "pay when you win";
