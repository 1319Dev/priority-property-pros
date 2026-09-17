-- Contractor Manage Profile + estimate lifecycle tracking.
-- Additive. Does not enable Stripe / payments_live / charges_live / signup_fee_enabled.
-- Does not drop onboarding data, estimates, or users.
-- Privacy: phone/email/address stay gated. Estimate notes are not a contact-exchange channel.

ALTER TYPE public.estimate_status ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE public.estimate_status ADD VALUE IF NOT EXISTS 'VIEWED';

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_flagged_at timestamptz;

ALTER TABLE public.estimates
  DROP CONSTRAINT IF EXISTS estimates_view_count_nonneg;
ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_view_count_nonneg CHECK (view_count >= 0);

COMMENT ON COLUMN public.estimates.first_viewed_at IS
  'Server timestamp of the first meaningful customer DETAIL open. List/prefetch never writes this.';
COMMENT ON COLUMN public.estimates.last_viewed_at IS
  'Server timestamp of the most recent customer DETAIL open. Never written by the client.';
COMMENT ON COLUMN public.estimates.view_count IS
  'Count of meaningful DETAIL opens. Repeat views increment this but do not re-notify.';

ALTER TABLE public.contractor_profiles
  ADD COLUMN IF NOT EXISTS identity_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_review_fields text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.contractor_profiles.identity_review_required IS
  'Set when the contractor changes license/insurance identity fields. Does not strip APPROVED.';

CREATE TABLE IF NOT EXISTS public.estimate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_events_estimate_idx
  ON public.estimate_events (estimate_id, created_at DESC);

COMMENT ON TABLE public.estimate_events IS
  'Append-only estimate history: submitted/viewed/accepted/declined/withdrawn with server timestamps.';

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  entity_type text NOT NULL DEFAULT 'estimates',
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel text NOT NULL DEFAULT 'in_app',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_channel_in_app CHECK (channel = 'in_app')
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON public.notifications (recipient_profile_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_once_per_entity
  ON public.notifications (recipient_profile_id, kind, entity_id)
  WHERE kind IN ('estimate.viewed', 'estimate.accepted', 'estimate.declined', 'estimate.withdrawn')
    AND entity_id IS NOT NULL;

COMMENT ON TABLE public.notifications IS
  'In-app events first. Unique on first VIEWED / ACCEPTED / DECLINED / WITHDRAWN per recipient+estimate so repeat views do not spam.';

ALTER TABLE public.estimate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
