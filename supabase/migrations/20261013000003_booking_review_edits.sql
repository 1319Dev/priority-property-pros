-- Authors can see and edit the booking review they already posted.
-- Does not change card charges, fee amounts, payment records, matching, hiring,
-- contact-unlock entitlement, booking_reviews RLS, or the public rating views.
-- Does not rewrite existing rating or body values.
--
-- Edit window (single setting): platform_settings.booking_review_edit_window_days.
-- Default 30. Negative means unlimited. 0 closes edits immediately.
-- A missing row is treated as 30 inside update_booking_review.
--
-- One review per author per booking is already UNIQUE (booking_id, reviewer_role).
-- Live data was checked before this file: 1 booking_reviews row, 0 duplicate
-- (booking_id, reviewer_role) groups. This migration does not add another constraint.

INSERT INTO public.platform_settings (key, value_int, description)
VALUES (
  'booking_review_edit_window_days',
  30,
  'Days after booking_reviews.created_at that the author may edit. Negative means unlimited. 0 closes edits immediately. Missing row is treated as 30.'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.booking_reviews
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Metadata only. Rating and body stay as posted.
UPDATE public.booking_reviews
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE public.booking_reviews
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

COMMENT ON COLUMN public.booking_reviews.updated_at IS
  'Last write time. Backfilled to created_at for reviews posted before edits existed. Not an edit by itself.';
COMMENT ON COLUMN public.booking_reviews.edited_at IS
  'Set only when the author changes rating or body through update_booking_review. Null means never edited.';

CREATE OR REPLACE FUNCTION public.update_booking_review(
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
  v_review public.booking_reviews;
  v_reviewer_role text;
  v_body text;
  v_days integer;
  is_customer boolean;
  is_contractor boolean;
BEGIN
  -- Same client-write gate as submit_booking_review (protect_review_row requires ppp.rpc).
  -- Signup-fee check matches ppp_set_rpc('submit_booking_review') without editing that function.
  PERFORM set_config('ppp.rpc', 'update_booking_review', true);
  IF public.signup_fee_enabled() AND auth.uid() IS NOT NULL THEN
    PERFORM public.assert_signup_fee_paid(auth.uid());
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

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

  -- Same party mapping as submit_booking_review. The author edits only that row.
  v_reviewer_role := CASE WHEN is_customer THEN 'CUSTOMER' ELSE 'CONTRACTOR' END;
  v_body := nullif(btrim(coalesce(p_body, '')), '');

  SELECT * INTO v_review
  FROM public.booking_reviews r
  WHERE r.booking_id = b.id
    AND r.reviewer_role = v_reviewer_role
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'you have not reviewed this booking';
  END IF;

  v_days := coalesce(
    (SELECT s.value_int FROM public.platform_settings s WHERE s.key = 'booking_review_edit_window_days'),
    30
  );
  IF v_days >= 0 AND v_review.created_at + make_interval(days => v_days) < now() THEN
    RAISE EXCEPTION 'the review edit window has closed';
  END IF;

  IF v_review.rating = p_rating AND v_review.body IS NOT DISTINCT FROM v_body THEN
    RETURN jsonb_build_object(
      'review_id', v_review.id,
      'verified', v_review.is_verified,
      'reviewer_role', v_reviewer_role,
      'edited', false,
      'mutually_hired', true
    );
  END IF;

  -- New reviews are inserted with is_verified true. There is no pending queue.
  -- An edit returns the row to that same state. Public views still redact contact text.
  UPDATE public.booking_reviews
  SET
    rating = p_rating,
    body = v_body,
    is_verified = true,
    edited_at = now(),
    updated_at = now()
  WHERE id = v_review.id;

  PERFORM public.write_booking_event(
    b.id,
    'review.edited',
    jsonb_build_object(
      'review_id', v_review.id,
      'reviewer_role', v_reviewer_role,
      'old_rating', v_review.rating,
      'new_rating', p_rating,
      'old_body', v_review.body,
      'new_body', v_body
    )
  );

  PERFORM public.write_audit_log(
    auth.uid(),
    'review.edited',
    'booking_reviews',
    v_review.id,
    jsonb_build_object(
      'booking_id', b.id,
      'reviewer_role', v_reviewer_role,
      'old_rating', v_review.rating,
      'new_rating', p_rating,
      'old_body', v_review.body,
      'new_body', v_body
    )
  );

  RETURN jsonb_build_object(
    'review_id', v_review.id,
    'verified', true,
    'reviewer_role', v_reviewer_role,
    'edited', true,
    'mutually_hired', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_booking_review(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_booking_review(uuid, integer, text) TO authenticated;

COMMENT ON FUNCTION public.update_booking_review(uuid, integer, text) IS
  'Author-only edit of the caller''s booking review. Same participant, mutual-hired, and 1-5 rating checks as submit_booking_review. Sets is_verified true (the state a new review is inserted with). Contact text stays subject to contractor_public_reviews redaction. Window is platform_settings.booking_review_edit_window_days (default 30, negative = unlimited).';
