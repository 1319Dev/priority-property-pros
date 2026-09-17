-- Phase 5A RPCs: owner edit, delete/cancel, list-own isolation.
-- Additive. Stripe remains paused.

CREATE OR REPLACE FUNCTION public.protect_posted_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('post_project')
     OR public.ppp_rpc_is('select_estimate')
     OR public.ppp_rpc_is('submit_estimate')
     OR public.ppp_rpc_is('accept_opportunity')
     OR public.ppp_rpc_is('update_customer_project')
     OR public.ppp_rpc_is('cancel_customer_project')
     OR public.ppp_rpc_is('delete_customer_project')
     OR public.ppp_rpc_is('cancel_pending_booking')
     OR public.is_admin()
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'DRAFT' THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
      RAISE EXCEPTION 'project owner cannot change after create';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.selected_estimate_id IS DISTINCT FROM OLD.selected_estimate_id
       OR NEW.selected_contractor_profile_id IS DISTINCT FROM OLD.selected_contractor_profile_id
       OR NEW.selected_booking_id IS DISTINCT FROM OLD.selected_booking_id
       OR NEW.scope_revision IS DISTINCT FROM OLD.scope_revision
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN
      RAISE EXCEPTION 'posted projects cannot change status, selection, or cancellation from the client';
    END IF;
    IF NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.city IS DISTINCT FROM OLD.city
       OR NEW.state IS DISTINCT FROM OLD.state
       OR NEW.zip_code IS DISTINCT FROM OLD.zip_code THEN
      RAISE EXCEPTION 'material project edits must go through update_customer_project';
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.timing IS DISTINCT FROM OLD.timing
       OR NEW.preferred_date IS DISTINCT FROM OLD.preferred_date
       OR NEW.budget_min_cents IS DISTINCT FROM OLD.budget_min_cents
       OR NEW.budget_max_cents IS DISTINCT FROM OLD.budget_max_cents THEN
      RAISE EXCEPTION 'posted project edits must go through update_customer_project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_estimate_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
     OR NEW.contractor_profile_id IS DISTINCT FROM OLD.contractor_profile_id THEN
    RAISE EXCEPTION 'estimate ownership cannot change';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      public.ppp_rpc_is('submit_estimate')
      OR public.ppp_rpc_is('withdraw_estimate')
      OR public.ppp_rpc_is('select_estimate')
      OR public.ppp_rpc_is('update_customer_project')
      OR public.ppp_rpc_is('cancel_customer_project')
      OR public.ppp_rpc_is('cancel_pending_booking')
    ) THEN
      RAISE EXCEPTION 'estimate status can only change through submit, withdraw, select, or owner scope/cancel RPCs';
    END IF;
  END IF;

  IF (
    NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
    OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
    OR NEW.fee_cents IS DISTINCT FROM OLD.fee_cents
    OR NEW.fee_bps IS DISTINCT FROM OLD.fee_bps
    OR NEW.contractor_earnings_cents IS DISTINCT FROM OLD.contractor_earnings_cents
  ) AND NOT (
    public.ppp_rpc_is('recompute_estimate_totals')
    OR public.ppp_rpc_is('submit_estimate')
  ) THEN
    RAISE EXCEPTION 'estimate money columns are computed in the database';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_project_answers_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  st public.project_status;
BEGIN
  IF public.ppp_rpc_is('update_customer_project')
     OR public.ppp_rpc_is('cancel_customer_project')
     OR public.is_admin()
     OR auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  pid := COALESCE(NEW.project_id, OLD.project_id);
  SELECT status INTO st FROM public.projects WHERE id = pid;
  IF st IS NULL OR st = 'DRAFT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF public.project_protected_booking_exists(pid) OR st = 'CONTRACTOR_SELECTED' OR st = 'CANCELLED' THEN
    RAISE EXCEPTION 'project answers cannot change after selection, confirmation, or cancellation';
  END IF;
  IF public.project_has_participation(pid) THEN
    PERFORM public.apply_material_scope_change(pid, 'answers');
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS project_answers_protect_scope ON public.project_answers;
CREATE TRIGGER project_answers_protect_scope
  AFTER INSERT OR UPDATE OR DELETE ON public.project_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_project_answers_scope();

CREATE OR REPLACE FUNCTION public.protect_project_photos_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  st public.project_status;
BEGIN
  IF public.ppp_rpc_is('update_customer_project')
     OR public.ppp_rpc_is('cancel_customer_project')
     OR public.is_admin()
     OR auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  pid := COALESCE(NEW.project_id, OLD.project_id);
  SELECT status INTO st FROM public.projects WHERE id = pid;
  IF st IS NULL OR st = 'DRAFT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF public.project_protected_booking_exists(pid) OR st = 'CONTRACTOR_SELECTED' OR st = 'CANCELLED' THEN
    RAISE EXCEPTION 'photos cannot change after selection, confirmation, or cancellation';
  END IF;
  IF public.project_has_participation(pid) THEN
    PERFORM public.apply_material_scope_change(pid, 'photos');
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS project_photos_protect_scope ON public.project_photos;
CREATE TRIGGER project_photos_protect_scope
  AFTER INSERT OR DELETE ON public.project_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_project_photos_scope();

CREATE OR REPLACE FUNCTION public.list_my_customer_projects()
RETURNS SETOF public.projects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.projects
  WHERE customer_id = auth.uid()
  ORDER BY updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_customer_project(p_project_id uuid)
RETURNS SETOF public.projects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.projects
  WHERE id = p_project_id
    AND customer_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.update_customer_project(p_project_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.projects;
  v_material boolean := false;
  v_category_change boolean := false;
  v_confirm boolean := coalesce((p_patch ->> 'confirm_material')::boolean, false);
  v_answer jsonb;
BEGIN
  PERFORM public.ppp_set_rpc('update_customer_project');
  SELECT * INTO p FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;
  IF p.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the project owner';
  END IF;
  IF p.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled projects cannot be edited';
  END IF;
  IF public.project_protected_booking_exists(p.id) THEN
    RAISE EXCEPTION 'confirmed jobs cannot be edited here — use a change order';
  END IF;
  IF p.status = 'CONTRACTOR_SELECTED' THEN
    RAISE EXCEPTION 'a contractor is already selected — cancel the pending booking before changing job details';
  END IF;

  IF p_patch ? 'category_id' AND nullif(p_patch ->> 'category_id', '') IS DISTINCT FROM p.category_id::text THEN
    v_material := true;
    v_category_change := true;
  END IF;
  IF p_patch ? 'description' AND coalesce(p_patch ->> 'description', '') IS DISTINCT FROM coalesce(p.description, '') THEN
    v_material := true;
  END IF;
  IF (p_patch ? 'city' AND coalesce(p_patch ->> 'city', '') IS DISTINCT FROM coalesce(p.city, ''))
     OR (p_patch ? 'state' AND coalesce(p_patch ->> 'state', '') IS DISTINCT FROM coalesce(p.state, ''))
     OR (p_patch ? 'zip_code' AND coalesce(p_patch ->> 'zip_code', '') IS DISTINCT FROM coalesce(p.zip_code, '')) THEN
    v_material := true;
  END IF;
  IF p_patch ? 'answers' THEN
    v_material := true;
  END IF;

  IF v_category_change AND p.status <> 'DRAFT' AND public.project_has_participation(p.id) THEN
    RAISE EXCEPTION 'the service type cannot change after contractors have already priced this job';
  END IF;

  IF p.status <> 'DRAFT' AND v_material AND public.project_has_participation(p.id) AND NOT v_confirm THEN
    RETURN jsonb_build_object(
      'needs_confirmation', true,
      'kind', 'material',
      'message', 'This changes the job contractors already priced. Existing estimates will be marked out of date and those pros will need to send a new estimate.'
    );
  END IF;

  UPDATE public.projects
  SET
    title = CASE WHEN p_patch ? 'title' THEN coalesce(p_patch ->> 'title', '') ELSE title END,
    description = CASE WHEN p_patch ? 'description' THEN coalesce(p_patch ->> 'description', '') ELSE description END,
    category_id = CASE
      WHEN p_patch ? 'category_id' THEN nullif(p_patch ->> 'category_id', '')::uuid
      ELSE category_id
    END,
    city = CASE WHEN p_patch ? 'city' THEN nullif(p_patch ->> 'city', '') ELSE city END,
    state = CASE WHEN p_patch ? 'state' THEN nullif(p_patch ->> 'state', '') ELSE state END,
    zip_code = CASE WHEN p_patch ? 'zip_code' THEN public.normalize_zip(p_patch ->> 'zip_code') ELSE zip_code END,
    timing = CASE
      WHEN p_patch ? 'timing' THEN nullif(p_patch ->> 'timing', '')::public.timing_preference
      ELSE timing
    END,
    preferred_date = CASE
      WHEN p_patch ? 'preferred_date' THEN nullif(p_patch ->> 'preferred_date', '')::date
      ELSE preferred_date
    END,
    budget_min_cents = CASE
      WHEN p_patch ? 'budget_min_cents' THEN nullif(p_patch ->> 'budget_min_cents', '')::integer
      ELSE budget_min_cents
    END,
    budget_max_cents = CASE
      WHEN p_patch ? 'budget_max_cents' THEN nullif(p_patch ->> 'budget_max_cents', '')::integer
      ELSE budget_max_cents
    END
  WHERE id = p.id;

  IF p_patch ? 'street_line1' OR p_patch ? 'street_line2' THEN
    INSERT INTO public.project_private_locations (project_id, street_line1, street_line2)
    VALUES (
      p.id,
      CASE WHEN p_patch ? 'street_line1' THEN nullif(p_patch ->> 'street_line1', '') ELSE NULL END,
      CASE WHEN p_patch ? 'street_line2' THEN nullif(p_patch ->> 'street_line2', '') ELSE NULL END
    )
    ON CONFLICT (project_id) DO UPDATE
    SET
      street_line1 = CASE
        WHEN p_patch ? 'street_line1' THEN nullif(p_patch ->> 'street_line1', '')
        ELSE public.project_private_locations.street_line1
      END,
      street_line2 = CASE
        WHEN p_patch ? 'street_line2' THEN nullif(p_patch ->> 'street_line2', '')
        ELSE public.project_private_locations.street_line2
      END;
  END IF;

  IF jsonb_typeof(p_patch -> 'answers') = 'array' THEN
    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_patch -> 'answers')
    LOOP
      INSERT INTO public.project_answers (project_id, question_id, answer_text)
      VALUES (
        p.id,
        (v_answer ->> 'question_id')::uuid,
        nullif(v_answer ->> 'answer_text', '')
      )
      ON CONFLICT (project_id, question_id) DO UPDATE
      SET answer_text = excluded.answer_text;
    END LOOP;
  END IF;

  IF p.status <> 'DRAFT' AND v_material AND public.project_has_participation(p.id) THEN
    PERFORM public.apply_material_scope_change(p.id, 'details');
    PERFORM public.write_audit_log(
      auth.uid(),
      'project.updated',
      'project',
      p.id,
      jsonb_build_object('material', true, 'status', p.status, 'estimates_invalidated', true)
    );
    RETURN jsonb_build_object(
      'project_id', p.id,
      'material', true,
      'estimates_invalidated', true,
      'ok', true
    );
  ELSIF p.status <> 'DRAFT' THEN
    PERFORM public.insert_project_notice(
      p.id,
      'CUSTOMER',
      'PROJECT_UPDATED',
      'Project updated',
      'Your project details were saved.'
    );
  END IF;

  PERFORM public.write_audit_log(
    auth.uid(),
    'project.updated',
    'project',
    p.id,
    jsonb_build_object('material', v_material, 'status', p.status)
  );

  RETURN jsonb_build_object(
    'project_id', p.id,
    'material', v_material,
    'estimates_invalidated', false,
    'ok', true
  );
END;
$$;

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
  b public.bookings;
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

  IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.project_id = p.id) THEN
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

  SELECT * INTO b
  FROM public.bookings
  WHERE project_id = p.id
    AND status IN ('PENDING', 'AWAITING_PAYMENT')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.bookings
    SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'customer_cancelled_project'
    WHERE id = b.id;
    PERFORM public.write_booking_event(b.id, 'booking.cancelled', jsonb_build_object('reason', 'customer_cancelled_project'));
    UPDATE public.estimates
    SET status = 'SUBMITTED'
    WHERE id = b.estimate_id AND status = 'ACCEPTED';
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

-- Pending booking cancel also restores the project so the owner can pick another pro
-- or cancel the project. Selection never creates a relationship.
CREATE OR REPLACE FUNCTION public.cancel_pending_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  remaining integer;
BEGIN
  PERFORM public.ppp_set_rpc('cancel_pending_booking');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the booking customer';
  END IF;
  IF b.status NOT IN ('PENDING', 'AWAITING_PAYMENT') THEN
    RAISE EXCEPTION 'only pending bookings can be cancelled here';
  END IF;
  UPDATE public.bookings
  SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'customer_cancelled'
  WHERE id = b.id;
  PERFORM public.write_booking_event(b.id, 'booking.cancelled', jsonb_build_object('reason', 'customer_cancelled'));

  UPDATE public.estimates
  SET status = 'SUBMITTED'
  WHERE id = b.estimate_id AND status = 'ACCEPTED';

  SELECT count(*) INTO remaining
  FROM public.estimates
  WHERE project_id = b.project_id
    AND status IN ('SUBMITTED', 'REVISED');

  UPDATE public.projects
  SET
    status = CASE WHEN remaining > 0 THEN 'ESTIMATES_AVAILABLE'::public.project_status ELSE 'CONTRACTORS_RESPONDING'::public.project_status END,
    selected_estimate_id = NULL,
    selected_contractor_profile_id = NULL,
    selected_booking_id = NULL,
    selected_at = NULL
  WHERE id = b.project_id
    AND status = 'CONTRACTOR_SELECTED';

  PERFORM public.insert_project_notice(
    b.project_id,
    'BOTH',
    'SELECTION_CANCELLED',
    'Selection cancelled',
    'The pending booking was cancelled. The exact address was never shared, and no hire was created.'
  );

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', 'CANCELLED',
    'relationship_created', false,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;
