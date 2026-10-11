-- Fix PL/pgSQL name collision in public.cancel_customer_project(uuid, boolean).
-- Variable `b` (type public.bookings) collided with table alias `b`, so
-- `b.project_id` was ambiguous (Postgres: column reference "b.project_id" is ambiguous).
-- Behavior, helpers, status enums, and signature are unchanged.
-- Grants remain those from 20260920000003_phase5a_privacy_rls.sql
-- (REVOKE PUBLIC/anon; GRANT EXECUTE TO authenticated). CREATE OR REPLACE
-- with the same signature preserves existing ACLs.

CREATE OR REPLACE FUNCTION public.cancel_customer_project(p_project_id uuid, p_confirm boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.projects;
  v_participation boolean;
  v_opps integer;
  v_action text;
  v_booking public.bookings;
BEGIN
  PERFORM public.ppp_set_rpc('cancel_customer_project');
  SELECT * INTO p FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;
  IF p.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the project owner';
  END IF;
  IF public.project_protected_booking_exists(p.id) THEN
    RAISE EXCEPTION 'confirmed or in-progress jobs cannot be deleted';
  END IF;
  IF p.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'this project is already cancelled';
  END IF;

  v_participation := public.project_has_participation(p.id);
  v_opps := public.project_opportunity_count(p.id);

  IF EXISTS (SELECT 1 FROM public.bookings bk WHERE bk.project_id = p.id) THEN
    v_action := 'cancel';
  ELSIF p.status = 'DRAFT' AND NOT v_participation AND v_opps = 0 THEN
    v_action := 'delete';
  ELSIF NOT v_participation AND v_opps = 0 AND p.status <> 'CONTRACTOR_SELECTED' THEN
    v_action := 'delete';
  ELSE
    v_action := 'cancel';
  END IF;

  IF NOT coalesce(p_confirm, false) THEN
    RETURN jsonb_build_object(
      'needs_confirmation', true,
      'action', v_action,
      'project_id', p.id
    );
  END IF;

  IF v_action = 'delete' THEN
    DELETE FROM public.projects WHERE id = p.id;
    PERFORM public.write_audit_log(auth.uid(), 'project.deleted', 'project', p.id, jsonb_build_object('status', p.status));
    RETURN jsonb_build_object('ok', true, 'action', 'deleted', 'project_id', p.id);
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE project_id = p.id
    AND status IN ('PENDING', 'AWAITING_PAYMENT')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.bookings
    SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'customer_cancelled_project'
    WHERE id = v_booking.id;
    PERFORM public.write_booking_event(v_booking.id, 'booking.cancelled', jsonb_build_object('reason', 'customer_cancelled_project'));
    UPDATE public.estimates
    SET status = 'SUBMITTED'
    WHERE id = v_booking.estimate_id AND status = 'ACCEPTED';
  END IF;

  UPDATE public.opportunities
  SET status = 'CLOSED'
  WHERE project_id = p.id
    AND status IN ('AVAILABLE', 'ACCEPTED');

  UPDATE public.projects
  SET
    status = 'CANCELLED',
    cancelled_at = now(),
    cancel_reason = CASE
      WHEN p.status = 'CONTRACTOR_SELECTED' THEN 'customer_cancelled_after_selection'
      WHEN v_participation THEN 'customer_cancelled_with_participation'
      ELSE 'customer_withdrew'
    END
  WHERE id = p.id;

  PERFORM public.insert_project_notice(
    p.id,
    'BOTH',
    'PROJECT_CANCELLED',
    'Project cancelled',
    'This project was cancelled by the customer. It is no longer an active opportunity.'
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'project.cancelled',
    'project',
    p.id,
    jsonb_build_object('from_status', p.status, 'relationship_created', false)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'cancelled',
    'project_id', p.id,
    'relationship_created', false
  );
END;
$$;
