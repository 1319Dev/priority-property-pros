-- New marketplace testimonials stay PENDING until an admin approves them.
-- Only an activated account (signup_fee_status PAID or NOT_REQUIRED) may insert.
-- Existing rows are not updated: an APPROVED review stays APPROVED.
-- Rejecting requires a reason. Status changes go through admin_set_platform_review_status,
-- which writes audit_logs. Direct client updates are revoked.
-- Does not change booking_reviews, card charges, fee amounts, or hiring.

CREATE OR REPLACE FUNCTION public.protect_platform_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee text;
  v_reason text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'sign in to leave a review';
    END IF;

    SELECT p.signup_fee_status::text INTO v_fee
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_fee IS NULL OR v_fee NOT IN ('PAID', 'NOT_REQUIRED') THEN
      RAISE EXCEPTION 'account activation is required before leaving a platform review'
        USING ERRCODE = '42501';
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

    -- Every new submission waits for admin approval. Do not auto-approve.
    NEW.status := 'PENDING';
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can change a platform review';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND coalesce(current_setting('ppp.platform_review_rpc', true), '')
           IS DISTINCT FROM 'admin_set_platform_review_status' THEN
      RAISE EXCEPTION 'platform review decisions require admin_set_platform_review_status'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'REJECTED' AND OLD.status IS DISTINCT FROM 'REJECTED' THEN
      v_reason := btrim(coalesce(current_setting('ppp.platform_review_reason', true), ''));
      IF char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
        RAISE EXCEPTION 'a reason between 3 and 500 characters is required'
          USING ERRCODE = '22023';
      END IF;
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

COMMENT ON FUNCTION public.protect_platform_review() IS
  'Inserts require auth.uid() and signup_fee_status PAID or NOT_REQUIRED, then force PENDING. Does not rewrite existing rows. Status changes require admin_set_platform_review_status. Reject requires a 3-500 character reason. Contact text is still blocked.';

DROP TRIGGER IF EXISTS platform_reviews_protect ON public.platform_reviews;
CREATE TRIGGER platform_reviews_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_platform_review();

-- Clients, including admins, cannot flip status without the audited RPC.
REVOKE UPDATE ON TABLE public.platform_reviews FROM PUBLIC, anon, authenticated;

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

  PERFORM set_config('ppp.platform_review_rpc', 'admin_set_platform_review_status', true);
  PERFORM set_config('ppp.platform_review_reason', v_reason, true);

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

COMMENT ON FUNCTION public.admin_set_platform_review_status(uuid, text, text) IS
  'Admin-only. Approve or reject a platform review. Both require a trimmed reason of 3 to 500 characters. Reject is also enforced by protect_platform_review. Writes platform_review.approved or platform_review.rejected to audit_logs. Does not delete the row and does not change other reviews.';

REVOKE ALL ON FUNCTION public.admin_set_platform_review_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_review_status(uuid, text, text) TO authenticated;
