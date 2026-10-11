-- Admin approve/reject for platform reviews requires a reason and writes audit_logs.
-- The existing UPDATE grant and protect_platform_review trigger stay as they are.

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

COMMENT ON FUNCTION public.admin_set_platform_review_status(uuid, text, text) IS
  'Admin-only platform review decision. Approve and reject both require a trimmed reason of 3 to 500 characters. Writes platform_review.approved or platform_review.rejected to audit_logs with status and reason only. Does not replace the existing admin UPDATE grant.';

REVOKE ALL ON FUNCTION public.admin_set_platform_review_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_review_status(uuid, text, text) TO authenticated;
