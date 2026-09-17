/** Phase 4B Stripe Connect TEST-MODE types. Live charges stay off. */

export const STRIPE_MODES = ["test", "live"] as const;
export type StripeMode = (typeof STRIPE_MODES)[number];

export const CONNECT_ACCOUNT_STATUSES = [
  "NOT_STARTED",
  "ONBOARDING",
  "RESTRICTED",
  "READY",
  "DISABLED",
] as const;
export type ConnectAccountStatus = (typeof CONNECT_ACCOUNT_STATUSES)[number];

export const PAYMENT_SCHEDULE_ITEM_KINDS = [
  "BOOKING_DEPOSIT",
  "MILESTONE",
  "FINAL_PAYMENT",
  "APPROVED_CHANGE_ORDER",
] as const;
export type PaymentScheduleItemKind = (typeof PAYMENT_SCHEDULE_ITEM_KINDS)[number];

export const PAYMENT_SCHEDULE_ITEM_STATUSES = [
  "SCHEDULED",
  "DUE",
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;
export type PaymentScheduleItemStatus = (typeof PAYMENT_SCHEDULE_ITEM_STATUSES)[number];

export const PAYMENT_METHOD_KINDS = ["CARD", "US_BANK_ACCOUNT"] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

export const LEDGER_ENTRY_TYPES = [
  "CUSTOMER_PAYMENT_GROSS",
  "PROCESSING_COST",
  "MARKETPLACE_FEE",
  "CONTRACTOR_GROSS",
  "REFUND",
  "DISPUTE_HOLD",
  "DISPUTE_RELEASE",
  "DISPUTE_LOSS",
  "TRANSFER",
  "TRANSFER_REVERSAL",
  "PAYOUT",
  "ADJUSTMENT",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const TRANSFER_STATUSES = [
  "PENDING",
  "ELIGIBLE",
  "TRANSFER_PENDING",
  "TRANSFERRED",
  "HELD",
  "REVERSED",
  "FAILED",
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const CANCELLATION_CATEGORIES = [
  "BEFORE_PAYMENT",
  "AFTER_DEPOSIT_BEFORE_WORK",
  "AFTER_WORK_STARTED",
  "AFTER_MILESTONE_PAYMENT",
  "CONTRACTOR_CANCELLED",
  "CUSTOMER_CANCELLED",
  "MUTUAL",
] as const;
export type CancellationCategory = (typeof CANCELLATION_CATEGORIES)[number];

export const REFUND_DECISIONS = ["PENDING_REVIEW", "NONE", "FULL", "PARTIAL", "DENIED"] as const;
export type RefundDecision = (typeof REFUND_DECISIONS)[number];

export const DISPUTE_KINDS = ["STRIPE_CHARGEBACK", "PPP_PROJECT"] as const;
export type DisputeKind = (typeof DISPUTE_KINDS)[number];

export const DISPUTE_STATUSES = [
  "NEEDS_RESPONSE",
  "UNDER_REVIEW",
  "WON",
  "LOST",
  "CLOSED",
  "HELD",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const PAYMENT_GUIDANCE_BANDS = ["FULL_PAY_ALLOWED", "DEPOSIT_PLUS_REMAINING", "MILESTONES_PREFERRED"] as const;
export type PaymentGuidanceBand = (typeof PAYMENT_GUIDANCE_BANDS)[number];

export const DEFAULT_PAYMENT_POLICY = {
  full_pay_max_cents: 100_000,
  structured_milestones_min_cents: 500_000,
  default_deposit_bps: 2_500,
  max_deposit_bps: 2_500,
  charges_live: false as const,
  payments_live: false as const,
  stripe_mode: "test" as const,
};

export type PaymentPolicy = typeof DEFAULT_PAYMENT_POLICY;

export type PaymentScheduleItemDraft = {
  kind: PaymentScheduleItemKind;
  sequence: number;
  amount_cents: number;
  description: string;
  due_now: boolean;
  requires_customer_approval: boolean;
  due_condition: string;
};

export type PaymentSchedulePlan = {
  guidance: PaymentGuidanceBand;
  items: PaymentScheduleItemDraft[];
  total_cents: number;
  amount_due_now_cents: number;
  charges_live: false;
  payments_live: false;
  stripe_mode: "test";
};

export type LedgerDraft = {
  entry_type: LedgerEntryType;
  amount_cents: number;
  currency: "usd";
  booking_id: string;
  schedule_item_id: string | null;
  payment_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_balance_transaction_id: string | null;
  fee_schedule_id: string | null;
  change_order_id: string | null;
  refund_id: string | null;
  dispute_id: string | null;
  transfer_id: string | null;
  note: string;
};

export type ConnectAccountSnapshot = {
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  disabled?: boolean;
  currently_due: string[];
  transfers_capability: "active" | "pending" | "inactive" | "unrequested";
};

export type StripeLikeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

export type ProcessedStripeEvent = {
  stripe_event_id: string;
  type: string;
  status: "processed" | "duplicate" | "ignored" | "failed";
  effects: string[];
};

export type ContractorStripeAccount = {
  id: string;
  contractor_profile_id: string;
  stripe_account_id: string;
  status: ConnectAccountStatus;
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  disabled_reason: string | null;
  stripe_mode: "test";
  created_at: string;
  updated_at: string;
};

export type PaymentSchedule = {
  id: string;
  booking_id: string;
  guidance: PaymentGuidanceBand;
  total_cents: number;
  currency: "usd";
  created_at: string;
  updated_at: string;
};

export type PaymentScheduleItem = {
  id: string;
  schedule_id: string;
  booking_id: string;
  kind: PaymentScheduleItemKind;
  sequence: number;
  amount_cents: number;
  description: string;
  status: PaymentScheduleItemStatus;
  due_now: boolean;
  due_condition: string | null;
  due_at: string | null;
  requires_customer_approval: boolean;
  contractor_completed_at: string | null;
  customer_approved_at: string | null;
  paid_at: string | null;
  failed_at: string | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_charge_id: string | null;
  ledger_entry_id: string | null;
  change_order_id: string | null;
  payment_method_kind: PaymentMethodKind | null;
  created_at: string;
  updated_at: string;
};

export type LedgerEntry = {
  id: string;
  booking_id: string;
  entry_type: LedgerEntryType;
  amount_cents: number;
  currency: "usd";
  schedule_item_id: string | null;
  payment_id: string | null;
  created_at: string;
};

export type ContractorTransfer = {
  id: string;
  booking_id: string;
  contractor_profile_id: string;
  schedule_item_id: string | null;
  amount_cents: number;
  status: TransferStatus;
  stripe_transfer_id: string | null;
  stripe_account_id: string | null;
  held_reason: string | null;
  created_at: string;
  updated_at: string;
};
