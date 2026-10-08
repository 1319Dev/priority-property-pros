-- Fix: "column reference \"reviewer_role\" is ambiguous" (42702) in submit_booking_review.
-- The plpgsql local variable `reviewer_role` shadows booking_reviews.reviewer_role in the
-- EXISTS check. Rename the variable to v_reviewer_role. Signature, return shape
-- (jsonb key 'reviewer_role'), SECURITY DEFINER, search_path, owner and grants unchanged.
CREATE OR REPLACE FUNCTION public.submit_booking_review(p_booking_id uuid, p_rating integer, p_body text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
  rid uuid;
  v_reviewer_role text;
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

  v_reviewer_role := CASE WHEN is_customer THEN 'CUSTOMER' ELSE 'CONTRACTOR' END;

  IF EXISTS (
    SELECT 1
    FROM public.booking_reviews r
    WHERE r.booking_id = b.id
      AND r.reviewer_role = v_reviewer_role
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
    v_reviewer_role
  )
  RETURNING id INTO rid;

  PERFORM public.write_booking_event(
    b.id,
    'review.submitted',
    jsonb_build_object('review_id', rid, 'rating', p_rating, 'reviewer_role', v_reviewer_role)
  );
  RETURN jsonb_build_object(
    'review_id', rid,
    'verified', true,
    'reviewer_role', v_reviewer_role,
    'mutually_hired', true
  );
END;
$function$;
