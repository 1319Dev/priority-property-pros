export const PROJECT_STATUSES = [
  "DRAFT",
  "POSTED",
  "MATCHING",
  "CONTRACTORS_RESPONDING",
  "ESTIMATES_AVAILABLE",
  "CONTRACTOR_SELECTED",
  "CANCELLED",
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
  "SENT",
  "VIEWED",
  "REVISED",
  "WITHDRAWN",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "SUPERSEDED",
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

export const ESTIMATE_ITEM_KINDS = ["LABOR", "MATERIALS", "EQUIPMENT", "CUSTOM"] as const;
export type EstimateItemKind = (typeof ESTIMATE_ITEM_KINDS)[number];

export const ESTIMATE_ITEM_KIND_LABELS: Record<EstimateItemKind, string> = {
  LABOR: "Labor",
  MATERIALS: "Materials",
  EQUIPMENT: "Equipment",
  CUSTOM: "Custom",
};

export const SERVICE_AREA_MODES = ["ZIPS", "RADIUS", "ZIPS_AND_RADIUS"] as const;
export type ServiceAreaMode = (typeof SERVICE_AREA_MODES)[number];

export const QUESTION_KINDS = ["TEXT", "SINGLE_CHOICE", "MULTI_CHOICE", "BOOLEAN", "NUMBER"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const MAX_PARTICIPATING_CONTRACTORS = 3;
export const BOOKING_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "DISPUTED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const FEE_SCHEDULE_KINDS = ["ORIGINAL", "REPEAT"] as const;
export type FeeScheduleKind = (typeof FEE_SCHEDULE_KINDS)[number];

export const RELATIONSHIP_STATUSES = ["ACTIVE", "BLOCKED"] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

export const CHANGE_ORDER_STATUSES = [
  "DRAFT",
  "PROPOSED",
  "CUSTOMER_APPROVED",
  "REJECTED",
  "APPROVED",
  "CANCELLED",
] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number];

export const CONTACT_ACCESS_STATUSES = ["LOCKED", "UNLOCKED", "ADMIN_OVERRIDE"] as const;
export type ContactAccessStatus = (typeof CONTACT_ACCESS_STATUSES)[number];

export const CONTACT_GRANT_SOURCES = ["JOB_FEE_PAYMENT", "ADMIN_OVERRIDE", "SYSTEM"] as const;
export type ContactGrantSource = (typeof CONTACT_GRANT_SOURCES)[number];

export type BookingContactAccess = {
  booking_id: string;
  status: ContactAccessStatus;
  granted_at: string | null;
  granted_by: string | null;
  grant_reason: string | null;
  grant_source: ContactGrantSource;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FeeBracket = {
  min_amount_cents: number;
  max_amount_cents: number | null;
  rate_bps: number;
};

export type MarketplaceFeePreview = {
  amount_cents: number;
  raw_fee_cents: number;
  fee_cents: number;
  min_fee_cents: number;
  max_fee_cents: number;
  min_applied: boolean;
  max_applied: boolean;
  contractor_earnings_cents: number;
  customer_amount_cents: number;
  kind: FeeScheduleKind;
  schedule_id: string | null;
  version: number | null;
  brackets: Array<FeeBracket & { slice_cents: number; fee_cents: number }>;
  charges_live: false;
  payments_live: false;
  label: "preview / estimate — payments not live";
};

export const DEFAULT_FEE_BPS = 700;
export const PAYMENTS_LIVE = false;
export const CHARGES_LIVE = false;

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
  selected_booking_id?: string | null;
  posted_at: string | null;
  selected_at: string | null;
  scope_revision?: number;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
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
  kind?: EstimateItemKind;
  unit_label?: string;
};

export type FeePreview = {
  total_cents: number;
  fee_bps: number;
  fee_cents: number;
  contractor_earnings_cents: number;
  charges_live: false;
  payments_live?: false;
};

export type Booking = {
  id: string;
  project_id: string;
  estimate_id: string;
  customer_id: string;
  contractor_profile_id: string;
  status: BookingStatus;
  amount_cents: number;
  approved_delta_cents: number;
  billable_amount_cents: number;
  is_repeat: boolean;
  fee_kind: FeeScheduleKind;
  fee_schedule_id: string | null;
  fee_schedule_version: number | null;
  fee_brackets_snapshot: FeeBracket[] | null;
  min_fee_cents_snapshot: number | null;
  max_fee_cents_snapshot: number | null;
  fee_cents: number;
  contractor_earnings_cents: number;
  customer_amount_cents: number;
  fee_locked: boolean;
  fee_locked_at: string | null;
  payments_live: false;
  charges_live: false;
  expires_at: string | null;
  confirmed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  disputed_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerContractorRelationship = {
  id: string;
  customer_id: string;
  contractor_profile_id: string;
  originating_project_id: string | null;
  originating_booking_id: string | null;
  introduced_at: string;
  last_completed_booking_id: string | null;
  last_completed_at: string | null;
  status: RelationshipStatus;
  protected_until: string;
  created_at: string;
  updated_at: string;
};

export type ChangeOrder = {
  id: string;
  booking_id: string;
  created_by: string;
  created_by_role: "CUSTOMER" | "CONTRACTOR" | "ADMIN";
  description: string;
  amount_delta_cents: number;
  status: ChangeOrderStatus;
  customer_approved_at: string | null;
  customer_approved_by: string | null;
  contractor_acked_at: string | null;
  contractor_acked_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewSide = "CUSTOMER" | "CONTRACTOR";

export type BookingReview = {
  id: string;
  booking_id: string;
  customer_id: string;
  contractor_profile_id: string;
  reviewer_id: string;
  reviewer_role: ReviewSide;
  reviewee_profile_id: string;
  rating: number;
  body: string | null;
  is_verified: boolean;
  included_in_rating: boolean;
  excluded_at: string | null;
  excluded_by: string | null;
  excluded_reason: string | null;
  created_at: string;
};

export const OPEN_PROJECT_STATUSES: ProjectStatus[] = [
  "POSTED",
  "MATCHING",
  "CONTRACTORS_RESPONDING",
];

export const CUSTOMER_PROJECT_TABS = [
  { key: "drafts", label: "Drafts", statuses: ["DRAFT"] as ProjectStatus[] },
  {
    key: "active",
    label: "Active",
    statuses: ["POSTED", "MATCHING", "CONTRACTORS_RESPONDING", "ESTIMATES_AVAILABLE", "CONTRACTOR_SELECTED"] as ProjectStatus[],
  },
  { key: "completed", label: "Completed", statuses: [] as ProjectStatus[] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] as ProjectStatus[] },
] as const;

export function customerTabForStatus(status: ProjectStatus): (typeof CUSTOMER_PROJECT_TABS)[number]["key"] {
  if (status === "DRAFT") return "drafts";
  if (status === "CANCELLED") return "cancelled";
  return "active";
}
