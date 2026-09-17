export const ACCOUNT_TYPES = ["CUSTOMER", "CONTRACTOR", "VERIFIER", "ADMIN"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const PUBLIC_SIGNUP_TYPES = ["CUSTOMER", "CONTRACTOR", "VERIFIER"] as const;
export type PublicSignupType = (typeof PUBLIC_SIGNUP_TYPES)[number];

export const ACCOUNT_STATUSES = [
  "ACTIVE",
  "PENDING",
  "SUSPENDED",
  "DISABLED",
  "DELETED",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ONBOARDING_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "COMPLETE",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type Profile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  avatar_url: string | null;
  account_type: AccountType;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
};

export type ContractorProfile = {
  id: string;
  profile_id: string;
  business_name: string;
  primary_trade: string | null;
  service_area: string | null;
  years_experience: number | null;
  license_number: string | null;
  insurance_carrier: string | null;
  website_url: string | null;
  bio: string | null;
  headline: string | null;
  accepting_work: boolean;
  min_job_cents: number | null;
  max_job_cents: number | null;
  onboarding_status: OnboardingStatus;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  info_requested_at: string | null;
  info_requested_by: string | null;
  info_request_message: string | null;
  identity_review_required: boolean;
  identity_review_at: string | null;
  identity_review_fields: string[];
  created_at: string;
  updated_at: string;
};

export type VerifierProfile = {
  id: string;
  profile_id: string;
  coverage_area: string | null;
  bio: string | null;
  onboarding_status: OnboardingStatus;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SignUpInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  accountType: PublicSignupType;
  acceptedTerms: boolean;
  businessName?: string;
  primaryTrade?: string;
  serviceArea?: string;
  coverageArea?: string;
  bio?: string;
};
