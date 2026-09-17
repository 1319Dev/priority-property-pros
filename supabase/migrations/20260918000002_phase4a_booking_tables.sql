-- Phase 4A booking, relationship, change-order, and review tables.
-- Additive / non-destructive. Does not drop Phase 3 projects, estimates, or users.

CREATE TYPE public.booking_status AS ENUM (
  'PENDING',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED'
);

CREATE TYPE public.relationship_status AS ENUM ('ACTIVE', 'BLOCKED');

CREATE TYPE public.change_order_status AS ENUM (
  'DRAFT',
  'PROPOSED',
  'CUSTOMER_APPROVED',
  'REJECTED',
  'APPROVED',
  'CANCELLED'
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE RESTRICT,
  estimate_id uuid NOT NULL REFERENCES public.estimates (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE RESTRICT,
  status public.booking_status NOT NULL DEFAULT 'PENDING',
  amount_cents integer NOT NULL,
  approved_delta_cents integer NOT NULL DEFAULT 0,
  billable_amount_cents integer NOT NULL DEFAULT 0,
  is_repeat boolean NOT NULL DEFAULT false,
  fee_kind public.fee_schedule_kind NOT NULL DEFAULT 'ORIGINAL',
  fee_schedule_id uuid REFERENCES public.fee_schedules (id),
  fee_schedule_version integer,
  fee_brackets_snapshot jsonb,
  min_fee_cents_snapshot integer,
  max_fee_cents_snapshot integer,
  fee_cents integer NOT NULL DEFAULT 0,
  contractor_earnings_cents integer NOT NULL DEFAULT 0,
  customer_amount_cents integer NOT NULL DEFAULT 0,
  fee_locked boolean NOT NULL DEFAULT false,
  fee_locked_at timestamptz,
  payments_live boolean NOT NULL DEFAULT false,
  charges_live boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  confirmed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  disputed_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_amount_nonneg CHECK (amount_cents >= 0),
  CONSTRAINT bookings_money_nonneg CHECK (
    fee_cents >= 0
    AND contractor_earnings_cents >= 0
    AND customer_amount_cents >= 0
    AND billable_amount_cents >= 0
  ),
  CONSTRAINT bookings_charges_not_live CHECK (charges_live = false),
  CONSTRAINT bookings_payments_not_live CHECK (payments_live = false)
);

CREATE TRIGGER bookings_set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX bookings_unique_estimate ON public.bookings (estimate_id);
CREATE UNIQUE INDEX bookings_one_noncancelled_per_project
  ON public.bookings (project_id)
  WHERE status <> 'CANCELLED';
CREATE INDEX bookings_customer_idx ON public.bookings (customer_id, created_at DESC);
CREATE INDEX bookings_contractor_idx ON public.bookings (contractor_profile_id, status);
CREATE INDEX bookings_status_expires_idx ON public.bookings (status, expires_at);

COMMENT ON TABLE public.bookings IS
  'Selection creates PENDING bookings. Exact address/phone/email unlock only after CONFIRMED. No live charges in Phase 4A.';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS selected_booking_id uuid REFERENCES public.bookings (id);

CREATE TABLE public.booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles (id),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_events_booking_idx ON public.booking_events (booking_id, created_at);

CREATE TABLE public.customer_contractor_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  originating_project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  originating_booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  introduced_at timestamptz NOT NULL DEFAULT now(),
  last_completed_booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  last_completed_at timestamptz,
  status public.relationship_status NOT NULL DEFAULT 'ACTIVE',
  protected_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, contractor_profile_id)
);

CREATE TRIGGER relationships_set_updated_at
  BEFORE UPDATE ON public.customer_contractor_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX relationships_customer_idx ON public.customer_contractor_relationships (customer_id, status);
CREATE INDEX relationships_contractor_idx ON public.customer_contractor_relationships (contractor_profile_id, status);

COMMENT ON TABLE public.customer_contractor_relationships IS
  'Created on first CONFIRMED booking. Protected period is server-configurable months. Hire Again / repeat pricing uses completed history, not the protected window.';

CREATE TABLE public.change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles (id),
  created_by_role text NOT NULL,
  description text NOT NULL,
  amount_delta_cents integer NOT NULL,
  status public.change_order_status NOT NULL DEFAULT 'PROPOSED',
  customer_approved_at timestamptz,
  customer_approved_by uuid REFERENCES public.profiles (id),
  contractor_acked_at timestamptz,
  contractor_acked_by uuid REFERENCES public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_orders_role_check CHECK (created_by_role IN ('CUSTOMER', 'CONTRACTOR', 'ADMIN')),
  CONSTRAINT change_orders_description_len CHECK (length(btrim(description)) >= 3)
);

CREATE TRIGGER change_orders_set_updated_at
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX change_orders_booking_idx ON public.change_orders (booking_id, created_at);

CREATE TABLE public.booking_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  rating smallint NOT NULL,
  body text,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_reviews_rating_range CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX booking_reviews_contractor_idx ON public.booking_reviews (contractor_profile_id, created_at DESC);

COMMENT ON TABLE public.booking_reviews IS
  'Verified reviews may be created only for COMPLETED PPP bookings via submit_booking_review.';
