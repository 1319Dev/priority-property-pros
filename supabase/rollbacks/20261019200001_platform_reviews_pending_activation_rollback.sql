-- Restores auto-approve on insert and the admin UPDATE (status) grant.
-- Drops admin_moderation_step_up(). Does not restore PR #90 or PR #110 function bodies.
-- Does not change existing platform_reviews rows, booking_reviews, or payments.

DROP FUNCTION IF EXISTS public.admin_moderation_step_up();

CREATE OR REPLACE FUNCTION public.protect_platform_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'sign in to leave a review';
    END IF;

    NEW.user_id := auth.uid();
    NEW.display_name := btrim(NEW.display_name);
    NEW.body := btrim(NEW.body);
    NEW.city := NULLIF(btrim(COALESCE(NEW.city, '')), '');

    IF public.text_contains_contact_info(NEW.display_name)
       OR public.text_contains_contact_info(NEW.body)
       OR public.text_contains_contact_info(COALESCE(NEW.city, '')) THEN
      RAISE EXCEPTION '%', public.contact_info_blocked_message();
    END IF;

    IF NOT public.is_admin() OR NEW.status IS DISTINCT FROM 'PENDING' THEN
      NEW.status := 'APPROVED';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can change a platform review';
    END IF;
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can delete a platform review';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_platform_review() FROM PUBLIC, anon, authenticated;

GRANT UPDATE (status) ON TABLE public.platform_reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_platform_review_status(
  p_review_id uuid,
  p_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_row public.platform_reviews;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'status must be APPROVED or REJECTED' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'a reason between 3 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.platform_reviews
  SET status = v_status::public.platform_review_status
  WHERE id = p_review_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform review not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.write_audit_log(
    auth.uid(),
    CASE WHEN v_status = 'APPROVED' THEN 'platform_review.approved' ELSE 'platform_review.rejected' END,
    'platform_review',
    p_review_id,
    jsonb_build_object('status', v_status, 'reason', v_reason)
  );

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_set_platform_review_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_review_status(uuid, text, text) TO authenticated;
