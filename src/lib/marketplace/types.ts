export const PROJECT_STATUSES = [
  "DRAFT",
  "POSTED",
  "MATCHING",
  "CONTRACTORS_RESPONDING",
  "ESTIMATES_AVAILABLE",
  "CONTRACTOR_SELECTED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_COMPLETENESS = ["HIGH", "MEDIUM", "MORE_INFO_NEEDED"] as const;
export type ProjectCompleteness = (typeof PROJECT_COMPLETENESS)[number];

export const TIMING_PREFERENCES = [
  "ASAP",
  "WITHIN_A_WEEK",
  "WITHIN_A_MONTH",
  "SPECIFIC_DATE",
  "FLEXIBLE",
] as const;
export type TimingPreference = (typeof TIMING_PREFERENCES)[number];

export const OPPORTUNITY_STATUSES = [
  "AVAILABLE",
  "ACCEPTED",
  "PASSED",
  "EXPIRED",
  "CLOSED",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const ESTIMATE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "REVISED",
  "WITHDRAWN",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const CREDENTIAL_STATUSES = [
  "NOT_SUBMITTED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const SERVICE_AREA_MODES = ["ZIPS", "RADIUS", "ZIPS_AND_RADIUS"] as const;
export type ServiceAreaMode = (typeof SERVICE_AREA_MODES)[number];

export const QUESTION_KINDS = ["TEXT", "SINGLE_CHOICE", "MULTI_CHOICE", "BOOLEAN", "NUMBER"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const MAX_PARTICIPATING_CONTRACTORS = 3;
export const DEFAULT_FEE_BPS = 700;

export const WIZARD_STEPS = [
  { id: 1, key: "need", label: "Need" },
  { id: 2, key: "category", label: "Category" },
  { id: 3, key: "photos", label: "Photos" },
  { id: 4, key: "questions", label: "Questions" },
  { id: 5, key: "location", label: "Location" },
  { id: 6, key: "when", label: "When" },
  { id: 7, key: "budget", label: "Budget" },
  { id: 8, key: "review", label: "Review" },
] as const;

export type ServiceCategory = {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  sort_order: number;
  is_active: boolean;
  is_regulated: boolean;
  requires_verified_credential: boolean;
};

export type ServiceQuestion = {
  id: string;
  category_id: string;
  prompt: string;
  help_text: string | null;
  kind: QuestionKind;
  options: string[];
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
};

export type Project = {
  id: string;
  customer_id: string;
  category_id: string | null;
  title: string;
  description: string;
  status: ProjectStatus;
  completeness: ProjectCompleteness;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  timing: TimingPreference | null;
  preferred_date: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  draft_step: number;
  selected_contractor_profile_id: string | null;
  selected_estimate_id: string | null;
  posted_at: string | null;
  selected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectPrivateLocation = {
  project_id: string;
  street_line1: string | null;
  street_line2: string | null;
  lat: number | null;
  lng: number | null;
};

export type EstimateItemInput = {
  label: string;
  quantity: number;
  unit_cents: number;
};

export type FeePreview = {
  total_cents: number;
  fee_bps: number;
  fee_cents: number;
  contractor_earnings_cents: number;
  charges_live: false;
};

export const OPEN_PROJECT_STATUSES: ProjectStatus[] = [
  "POSTED",
  "MATCHING",
  "CONTRACTORS_RESPONDING",
];

export const CUSTOMER_PROJECT_TABS = [
  { key: "drafts", label: "Drafts", statuses: ["DRAFT"] as ProjectStatus[] },
  { key: "open", label: "Open", statuses: OPEN_PROJECT_STATUSES },
  { key: "estimates", label: "Estimates Available", statuses: ["ESTIMATES_AVAILABLE"] as ProjectStatus[] },
  {
    key: "selected",
    label: "Contractor Selected",
    statuses: ["CONTRACTOR_SELECTED"] as ProjectStatus[],
  },
] as const;

export function customerTabForStatus(status: ProjectStatus): (typeof CUSTOMER_PROJECT_TABS)[number]["key"] {
  for (const tab of CUSTOMER_PROJECT_TABS) {
    if ((tab.statuses as readonly ProjectStatus[]).includes(status)) return tab.key;
  }
  return "open";
}
