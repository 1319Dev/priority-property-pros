-- Trust, reviews, disputes, deletion, and rating-suspension tables.
-- Additive. Does not enable Stripe or change payment flags.

INSERT INTO public.platform_settings (key, value_int, description)
VALUES (
  'rating_suspension_min_reviews',
  5,
  'Minimum eligible completed-job reviews before an unrounded average below 4.00 can auto-suspend. Default 5.'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS restriction_reason public.account_restriction_reason,
  ADD COLUMN IF NOT EXISTS restriction_at timestamptz,
  ADD COLUMN IF NOT EXISTS restriction_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_account_status public.account_status;

ALTER TABLE public.booking_reviews
  ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS reviewer_role public.review_side,
  ADD COLUMN IF NOT EXISTS reviewee_profile_id uuid REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS included_in_rating boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluded_by uuid REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS excluded_reason text;

UPDATE public.booking_reviews r
SET
  reviewer_id = r.customer_id,
  reviewer_role = 'CUSTOMER',
  reviewee_profile_id = cp.profile_id
FROM public.contractor_profiles cp
WHERE cp.id = r.contractor_profile_id
  AND (r.reviewer_id IS NULL OR r.reviewer_role IS NULL OR r.reviewee_profile_id IS NULL);

ALTER TABLE public.booking_reviews
  ALTER COLUMN reviewer_id SET NOT NULL,
  ALTER COLUMN reviewer_role SET NOT NULL,
  ALTER COLUMN reviewee_profile_id SET NOT NULL;

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_booking_id_key;

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_one_per_side;

ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_one_per_side UNIQUE (booking_id, reviewer_role);

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_no_self_review;

ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_no_self_review CHECK (reviewer_id <> reviewee_profile_id);

CREATE INDEX IF NOT EXISTS booking_reviews_reviewee_idx
  ON public.booking_reviews (reviewee_profile_id, included_in_rating, created_at DESC);

CREATE INDEX IF NOT EXISTS booking_reviews_reviewer_idx
  ON public.booking_reviews (reviewer_id, created_at DESC);

COMMENT ON TABLE public.booking_reviews IS
  'Two-sided verified reviews for COMPLETED PPP bookings only. One review per side per job. Public ratings use included_in_rating rows.';

CREATE TABLE IF NOT EXISTS public.profile_rating_stats (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  eligible_count integer NOT NULL DEFAULT 0,
  rating_sum integer NOT NULL DEFAULT 0,
  rating_average numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_rating_stats_count_nonneg CHECK (eligible_count >= 0),
  CONSTRAINT profile_rating_stats_sum_nonneg CHECK (rating_sum >= 0)
);

COMMENT ON TABLE public.profile_rating_stats IS
  'Server-computed unrounded averages. Clients must not invent public ratings.';

CREATE TABLE IF NOT EXISTS public.account_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  from_status public.account_status,
  to_status public.account_status NOT NULL,
  reason public.account_restriction_reason,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_lifecycle_events_profile_idx
  ON public.account_lifecycle_events (profile_id, created_at DESC);

COMMENT ON TABLE public.account_lifecycle_events IS
  'Immutable account status history for suspension, deletion, and reinstatement.';

CREATE TABLE IF NOT EXISTS public.trust_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  category public.trust_dispute_category NOT NULL,
  explanation text NOT NULL,
  disputed_review_id uuid REFERENCES public.booking_reviews (id) ON DELETE RESTRICT,
  evidence_path text,
  status public.trust_dispute_status NOT NULL DEFAULT 'OPEN',
  target_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trust_disputes_explanation_len CHECK (length(btrim(explanation)) >= 12)
);

CREATE INDEX IF NOT EXISTS trust_disputes_filer_idx ON public.trust_disputes (filer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trust_disputes_status_idx ON public.trust_disputes (status, created_at DESC);

CREATE TRIGGER trust_disputes_set_updated_at
  BEFORE UPDATE ON public.trust_disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.trust_disputes IS
  'User-filed review and rating-suspension disputes. Writes go through RPCs only.';

CREATE TABLE IF NOT EXISTS public.trust_dispute_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.trust_disputes (id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trust_dispute_events_dispute_idx
  ON public.trust_dispute_events (dispute_id, created_at);

COMMENT ON TABLE public.trust_dispute_events IS
  'Immutable dispute audit. Clients cannot update or delete rows.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dispute-evidence',
  'dispute-evidence',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;
