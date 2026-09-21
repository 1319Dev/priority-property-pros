-- Mutual Hired confirmation on the booking created by select_estimate.
-- Additive. Does NOT flip payments_live, charges_live, signup_fee_enabled,
-- or connection_fee_checkout_enabled. Does NOT change $9.99 / $4.99 amounts.
-- Platform marketplace reviews (platform_reviews) stay separate.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_hired_at timestamptz,
  ADD COLUMN IF NOT EXISTS contractor_hired_at timestamptz;

COMMENT ON COLUMN public.bookings.customer_hired_at IS
  'Homeowner clicked Hired. Set only by confirm_booking_hired for the booking customer. Never cleared.';
COMMENT ON COLUMN public.bookings.contractor_hired_at IS
  'Pro clicked Hired. Set only by confirm_booking_hired for the booked contractor. Never cleared.';

CREATE INDEX IF NOT EXISTS bookings_mutual_hired_idx
  ON public.bookings (id)
  WHERE customer_hired_at IS NOT NULL AND contractor_hired_at IS NOT NULL;

ALTER TABLE public.booking_reviews
  ADD COLUMN IF NOT EXISTS reviewer_role text NOT NULL DEFAULT 'CUSTOMER';

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_reviewer_role_check;

ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_reviewer_role_check
  CHECK (reviewer_role IN ('CUSTOMER', 'CONTRACTOR'));

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_booking_id_key;

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_one_per_role;

ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_one_per_role UNIQUE (booking_id, reviewer_role);

COMMENT ON TABLE public.booking_reviews IS
  'Profile/job reviews of the other party. One CUSTOMER review and one CONTRACTOR review per booking. Allowed only after mutual Hired via submit_booking_review. Not platform_reviews.';

-- Public contractor directory still shows homeowner→pro reviews only.
CREATE OR REPLACE VIEW public.contractor_public_ratings
WITH (security_invoker = false)
AS
SELECT
  r.contractor_profile_id,
  round(avg(r.rating)::numeric, 1) AS rating_average,
  count(*)::integer AS rating_count
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
GROUP BY r.contractor_profile_id;

CREATE OR REPLACE VIEW public.contractor_public_reviews
WITH (security_invoker = false)
AS
SELECT
  r.id,
  r.contractor_profile_id,
  r.rating,
  CASE
    WHEN r.body IS NULL OR btrim(r.body) = '' OR public.text_contains_pre_hire_contact(r.body)
      THEN 'Verified PPP review.'
    WHEN char_length(regexp_replace(btrim(r.body), '\s+', ' ', 'g')) > 280
      THEN left(regexp_replace(btrim(r.body), '\s+', ' ', 'g'), 277) || '…'
    ELSE regexp_replace(btrim(r.body), '\s+', ' ', 'g')
  END AS body
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

CREATE OR REPLACE FUNCTION public.booking_is_mutually_hired(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.customer_hired_at IS NOT NULL
      AND b.contractor_hired_at IS NOT NULL
      AND b.status <> 'CANCELLED'
  );
$$;

CREATE OR REPLACE FUNCTION public.protect_booking_hired_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.customer_hired_at IS NOT NULL
     AND NEW.customer_hired_at IS DISTINCT FROM OLD.customer_hired_at THEN
    RAISE EXCEPTION 'hired confirmation cannot be cleared';
  END IF;
  IF OLD.contractor_hired_at IS NOT NULL
     AND NEW.contractor_hired_at IS DISTINCT FROM OLD.contractor_hired_at THEN
    RAISE EXCEPTION 'hired confirmation cannot be cleared';
  END IF;

  IF NEW.customer_hired_at IS DISTINCT FROM OLD.customer_hired_at
     OR NEW.contractor_hired_at IS DISTINCT FROM OLD.contractor_hired_at THEN
    IF NOT public.ppp_rpc_is('confirm_booking_hired') THEN
      RAISE EXCEPTION 'hired confirmation can only be set through confirm_booking_hired';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_protect_hired_flags ON public.bookings;
CREATE TRIGGER bookings_protect_hired_flags
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_booking_hired_flags();

-- Do not expire a pending booking once either party has started Hired confirmation.
CREATE OR REPLACE FUNCTION public.expire_stale_pending_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('expire_stale_pending_bookings');
  END IF;
  UPDATE public.bookings
  SET
    status = 'CANCELLED',
    cancelled_at = now(),
    cancel_reason = coalesce(cancel_reason, 'expired_pending')
  WHERE status IN ('PENDING', 'AWAITING_PAYMENT')
    AND expires_at IS NOT NULL
    AND expires_at < now()
    AND customer_hired_at IS NULL
    AND contractor_hired_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_booking_hired(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  is_customer boolean;
  is_contractor boolean;
  already boolean := false;
  mutually boolean;
  hired_status text;
BEGIN
  PERFORM public.ppp_set_rpc('confirm_booking_hired');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;
  IF b.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled bookings cannot be marked hired';
  END IF;

  is_customer := b.customer_id IS NOT DISTINCT FROM auth.uid();
  is_contractor := b.contractor_profile_id IS NOT DISTINCT FROM public.current_contractor_profile_id();

  IF NOT is_customer AND NOT is_contractor AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a booking participant';
  END IF;
  IF public.is_admin() AND NOT is_customer AND NOT is_contractor THEN
    RAISE EXCEPTION 'only the homeowner or booked pro can confirm Hired';
  END IF;
  IF is_customer AND is_contractor THEN
    RAISE EXCEPTION 'only the homeowner or booked pro can confirm Hired';
  END IF;

  IF is_customer THEN
    IF b.customer_hired_at IS NOT NULL THEN
      already := true;
    ELSE
      UPDATE public.bookings
      SET customer_hired_at = now()
      WHERE id = b.id
      RETURNING * INTO b;
      PERFORM public.write_booking_event(
        b.id,
        'hire.customer_confirmed',
        jsonb_build_object(
          'customer_hired_at', b.customer_hired_at,
          'contractor_hired_at', b.contractor_hired_at
        )
      );
    END IF;
  ELSIF is_contractor THEN
    IF b.contractor_hired_at IS NOT NULL THEN
      already := true;
    ELSE
      UPDATE public.bookings
      SET contractor_hired_at = now()
      WHERE id = b.id
      RETURNING * INTO b;
      PERFORM public.write_booking_event(
        b.id,
        'hire.contractor_confirmed',
        jsonb_build_object(
          'customer_hired_at', b.customer_hired_at,
          'contractor_hired_at', b.contractor_hired_at
        )
      );
    END IF;
  END IF;

  mutually := b.customer_hired_at IS NOT NULL AND b.contractor_hired_at IS NOT NULL;
  hired_status := CASE
    WHEN mutually THEN 'HIRED'
    WHEN b.customer_hired_at IS NOT NULL THEN 'WAITING_FOR_PRO'
    WHEN b.contractor_hired_at IS NOT NULL THEN 'WAITING_FOR_HOMEOWNER'
    ELSE 'IDLE'
  END;

  IF mutually AND NOT already THEN
    PERFORM public.write_booking_event(
      b.id,
      'hire.mutual',
      jsonb_build_object(
        'customer_hired_at', b.customer_hired_at,
        'contractor_hired_at', b.contractor_hired_at
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'customer_hired_at', b.customer_hired_at,
    'contractor_hired_at', b.contractor_hired_at,
    'mutually_hired', mutually,
    'status', hired_status,
    'idempotent', already,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_booking_review(
  p_booking_id uuid,
  p_rating integer,
  p_body text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  rid uuid;
  reviewer_role text;
  is_customer boolean;
  is_contractor boolean;
BEGIN
  PERFORM public.ppp_set_rpc('submit_booking_review');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  is_customer := b.customer_id IS NOT DISTINCT FROM auth.uid();
  is_contractor := b.contractor_profile_id IS NOT DISTINCT FROM public.current_contractor_profile_id();

  IF NOT is_customer AND NOT is_contractor THEN
    RAISE EXCEPTION 'only booking participants can review after mutual hire';
  END IF;
  IF b.status IN ('CANCELLED', 'DISPUTED') THEN
    RAISE EXCEPTION 'reviews require mutual hired confirmation';
  END IF;
  IF b.customer_hired_at IS NULL OR b.contractor_hired_at IS NULL THEN
    RAISE EXCEPTION 'reviews require mutual hired confirmation';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'rating must be 1 through 5';
  END IF;

  reviewer_role := CASE WHEN is_customer THEN 'CUSTOMER' ELSE 'CONTRACTOR' END;

  IF EXISTS (
    SELECT 1
    FROM public.booking_reviews r
    WHERE r.booking_id = b.id
      AND r.reviewer_role = reviewer_role
  ) THEN
    RAISE EXCEPTION 'you already reviewed this booking';
  END IF;

  INSERT INTO public.booking_reviews (
    booking_id, customer_id, contractor_profile_id, rating, body, is_verified, reviewer_role
  ) VALUES (
    b.id,
    b.customer_id,
    b.contractor_profile_id,
    p_rating,
    nullif(btrim(coalesce(p_body, '')), ''),
    true,
    reviewer_role
  )
  RETURNING id INTO rid;

  PERFORM public.write_booking_event(
    b.id,
    'review.submitted',
    jsonb_build_object('review_id', rid, 'rating', p_rating, 'reviewer_role', reviewer_role)
  );
  RETURN jsonb_build_object(
    'review_id', rid,
    'verified', true,
    'reviewer_role', reviewer_role,
    'mutually_hired', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.protect_booking_hired_flags() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_is_mutually_hired(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_booking_hired(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.booking_is_mutually_hired(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_hired(uuid) TO authenticated;

GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;
GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;
REVOKE ALL ON TABLE public.booking_reviews FROM anon;

COMMENT ON FUNCTION public.confirm_booking_hired(uuid) IS
  'Homeowner or booked pro stamps only their own hired timestamp. Idempotent. Cannot clear. Mutual Hired unlocks profile reviews. Does not flip payment flags or grant contact.';
COMMENT ON FUNCTION public.booking_is_mutually_hired(uuid) IS
  'True when both customer_hired_at and contractor_hired_at are set and the booking is not cancelled.';
COMMENT ON FUNCTION public.submit_booking_review(uuid, integer, text) IS
  'Either booking participant may review the other after mutual Hired. One review per role. Platform marketplace reviews are separate.';
COMMENT ON FUNCTION public.expire_stale_pending_bookings() IS
  'Expires unpaid pending bookings. Skips rows where either party has already confirmed Hired.';
