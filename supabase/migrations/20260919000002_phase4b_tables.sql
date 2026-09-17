-- Phase 4B financial tables. Additive / non-destructive.
-- Integer cents. No bank numbers, SSNs, ID docs, or KYC payloads.

CREATE TABLE public.contractor_stripe_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL UNIQUE REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  status public.connect_account_status NOT NULL DEFAULT 'NOT_STARTED',
  details_submitted boolean NOT NULL DEFAULT false,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  disabled_reason text,
  stripe_mode text NOT NULL DEFAULT 'test',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_stripe_accounts_test_mode CHECK (stripe_mode = 'test')
);

CREATE TRIGGER contractor_stripe_accounts_set_updated_at
  BEFORE UPDATE ON public.contractor_stripe_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX contractor_stripe_accounts_status_idx
  ON public.contractor_stripe_accounts (status);

COMMENT ON TABLE public.contractor_stripe_accounts IS
  'Stripe Connect Express account mapping. Status is synced server-side from capabilities. No KYC payloads.';

CREATE TABLE public.payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings (id) ON DELETE CASCADE,
  guidance public.payment_guidance_band NOT NULL,
  total_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_schedules_total_nonneg CHECK (total_cents >= 0),
  CONSTRAINT payment_schedules_usd CHECK (currency = 'usd')
);

CREATE TRIGGER payment_schedules_set_updated_at
  BEFORE UPDATE ON public.payment_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payment_schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.payment_schedules (id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  kind public.payment_schedule_item_kind NOT NULL,
  sequence integer NOT NULL,
  amount_cents integer NOT NULL,
  description text NOT NULL,
  status public.payment_schedule_item_status NOT NULL DEFAULT 'SCHEDULED',
  due_now boolean NOT NULL DEFAULT false,
  due_condition text,
  due_at timestamptz,
  requires_customer_approval boolean NOT NULL DEFAULT false,
  contractor_completed_at timestamptz,
  contractor_completed_by uuid REFERENCES public.profiles (id),
  customer_approved_at timestamptz,
  customer_approved_by uuid REFERENCES public.profiles (id),
  paid_at timestamptz,
  failed_at timestamptz,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  stripe_charge_id text,
  ledger_entry_id uuid,
  change_order_id uuid REFERENCES public.change_orders (id) ON DELETE SET NULL,
  payment_method_kind public.payment_method_kind,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_schedule_items_amount_nonneg CHECK (amount_cents >= 0),
  CONSTRAINT payment_schedule_items_sequence_positive CHECK (sequence >= 1),
  UNIQUE (schedule_id, sequence)
);

CREATE TRIGGER payment_schedule_items_set_updated_at
  BEFORE UPDATE ON public.payment_schedule_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX payment_schedule_items_booking_idx
  ON public.payment_schedule_items (booking_id, sequence);
CREATE INDEX payment_schedule_items_pi_idx
  ON public.payment_schedule_items (stripe_payment_intent_id);

COMMENT ON TABLE public.payment_schedule_items IS
  'First-class deposit / milestone / final / approved-CO items. Clients cannot set authoritative amounts.';

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE RESTRICT,
  schedule_item_id uuid NOT NULL REFERENCES public.payment_schedule_items (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL,
  payment_method_kind public.payment_method_kind,
  stripe_payment_intent_id text UNIQUE,
  stripe_checkout_session_id text,
  stripe_charge_id text,
  stripe_balance_transaction_id text,
  processing_cost_cents integer NOT NULL DEFAULT 0,
  stripe_mode text NOT NULL DEFAULT 'test',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_nonneg CHECK (amount_cents >= 0),
  CONSTRAINT payments_processing_nonneg CHECK (processing_cost_cents >= 0),
  CONSTRAINT payments_test_mode CHECK (stripe_mode = 'test')
);

CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX payments_booking_idx ON public.payments (booking_id, created_at);

CREATE TABLE public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'processed',
  error text,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stripe_events_type_idx ON public.stripe_events (event_type, created_at DESC);

COMMENT ON TABLE public.stripe_events IS
  'Idempotency store for verified Stripe webhooks. Payload summaries omit PAN/bank/PII secrets.';

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE RESTRICT,
  entry_type public.ledger_entry_type NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  schedule_item_id uuid REFERENCES public.payment_schedule_items (id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_balance_transaction_id text,
  fee_schedule_id uuid REFERENCES public.fee_schedules (id) ON DELETE RESTRICT,
  change_order_id uuid REFERENCES public.change_orders (id) ON DELETE RESTRICT,
  refund_id uuid,
  dispute_id uuid,
  transfer_id uuid,
  actor_id uuid REFERENCES public.profiles (id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_amount_nonneg CHECK (amount_cents >= 0),
  CONSTRAINT ledger_entries_usd CHECK (currency = 'usd')
);

CREATE INDEX ledger_entries_booking_idx ON public.ledger_entries (booking_id, created_at);
CREATE INDEX ledger_entries_type_idx ON public.ledger_entries (entry_type, created_at);

COMMENT ON TABLE public.ledger_entries IS
  'Append-only PPP ledger. Corrections are new rows. Integer cents. Traceable to booking, schedule item, PI/charge, parties, fee snapshot, CO, refund, dispute, transfer.';

CREATE TABLE public.contractor_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE RESTRICT,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE RESTRICT,
  schedule_item_id uuid REFERENCES public.payment_schedule_items (id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL,
  status public.contractor_transfer_status NOT NULL DEFAULT 'PENDING',
  stripe_transfer_id text UNIQUE,
  stripe_account_id text,
  held_reason text,
  eligible_at timestamptz,
  transferred_at timestamptz,
  stripe_mode text NOT NULL DEFAULT 'test',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_transfers_amount_nonneg CHECK (amount_cents >= 0),
  CONSTRAINT contractor_transfers_test_mode CHECK (stripe_mode = 'test')
);

CREATE TRIGGER contractor_transfers_set_updated_at
  BEFORE UPDATE ON public.contractor_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX contractor_transfers_one_open_per_item
  ON public.contractor_transfers (schedule_item_id)
  WHERE schedule_item_id IS NOT NULL
    AND status IN ('PENDING', 'ELIGIBLE', 'TRANSFER_PENDING', 'TRANSFERRED', 'HELD');

CREATE INDEX contractor_transfers_contractor_idx
  ON public.contractor_transfers (contractor_profile_id, status);

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
  schedule_item_id uuid REFERENCES public.payment_schedule_items (id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  stripe_refund_id text UNIQUE,
  reason text,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refunds_amount_positive CHECK (amount_cents > 0)
);

CREATE TABLE public.stripe_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings (id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
  kind public.dispute_kind NOT NULL,
  status public.stripe_dispute_status NOT NULL DEFAULT 'NEEDS_RESPONSE',
  stripe_dispute_id text UNIQUE,
  amount_cents integer NOT NULL DEFAULT 0,
  reason text,
  evidence_due_by timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER stripe_disputes_set_updated_at
  BEFORE UPDATE ON public.stripe_disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.booking_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE RESTRICT,
  category public.cancellation_category NOT NULL,
  initiator text NOT NULL,
  reason text,
  refund_decision public.refund_decision NOT NULL DEFAULT 'PENDING_REVIEW',
  payment_state text,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_cancellations_initiator_check CHECK (
    initiator IN ('CUSTOMER', 'CONTRACTOR', 'ADMIN', 'SYSTEM', 'MUTUAL')
  )
);

CREATE INDEX booking_cancellations_booking_idx ON public.booking_cancellations (booking_id, created_at);

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_refund_fk
  FOREIGN KEY (refund_id) REFERENCES public.refunds (id) ON DELETE RESTRICT;

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_dispute_fk
  FOREIGN KEY (dispute_id) REFERENCES public.stripe_disputes (id) ON DELETE RESTRICT;

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_transfer_fk
  FOREIGN KEY (transfer_id) REFERENCES public.contractor_transfers (id) ON DELETE RESTRICT;
