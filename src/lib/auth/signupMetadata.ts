import type { SignUpInput } from "./types";
import { sanitizeSignupAccountType } from "./roles";

/** Metadata sent at signup. ADMIN is stripped even if a client forges the payload. */
export function buildSignupMetadata(input: SignUpInput): Record<string, string> {
  const accountType = sanitizeSignupAccountType(input.accountType);
  return {
    account_type: accountType,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    phone: (input.phone ?? "").trim(),
    accepted_terms: input.acceptedTerms ? "true" : "false",
    business_name: (input.businessName ?? "").trim(),
    primary_trade: (input.primaryTrade ?? "").trim(),
    service_area: (input.serviceArea ?? "").trim(),
    coverage_area: (input.coverageArea ?? "").trim(),
    bio: (input.bio ?? "").trim(),
    user_agent: typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 180),
  };
}
