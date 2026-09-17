-- select_estimate cascade + list RPCs, RLS for SENT/VIEWED, grants.
-- Keeps Phase 4A PENDING booking creation. payments_live / charges_live stay false.

CREATE OR REPLACE FUNCTION public.select_estimate(p_project_id uuid, p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  est public.estimates;
  v_repeat boolean;
  v_kind public.fee_schedule_kind;
  v_schedule uuid;
  preview jsonb;
  ttl integer;
  bid uuid;
  other_row public.estimates;
BEGIN
  PERFORM public.ppp_set_rpc('select_estimate');
  PERFORM public.expire_stale_pending_bookings();

  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the project owner';
  END IF;
  IF proj.status = 'CONTRACTOR_SELECTED' THEN
    RAISE EXCEPTION 'a contractor is already selected';
  END IF;

  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id FOR UPDATE;
  IF NOT FOUND OR est.project_id <> p_project_id THEN
    RAISE EXCEPTION 'estimate not found on this project';
  END IF;
  IF est.status NOT IN ('SUBMITTED', 'SENT', 'REVISED', 'VIEWED') THEN
    RAISE EXCEPTION 'only submitted estimates can be selected';
  END IF;

  UPDATE public.estimates
  SET status = 'ACCEPTED', accepted_at = now()
  WHERE id = est.id;

  PERFORM public.write_estimate_event(est.id, 'estimate.accepted', jsonb_build_object('status', 'ACCEPTED'));
  PERFORM public.enqueue_notification(
    public.contractor_owner_profile_id(est.contractor_profile_id),
    'estimate.accepted',
    'Your estimate was accepted',
    'The customer selected your estimate.',
    'estimates',
    est.id,
    jsonb_build_object('project_id', est.project_id)
  );

  FOR other_row IN
    SELECT * FROM public.estimates
    WHERE project_id = p_project_id
      AND id <> est.id
      AND status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED')
    FOR UPDATE
  LOOP
    UPDATE public.estimates
    SET status = 'DECLINED', declined_at = now()
    WHERE id = other_row.id;
    PERFORM public.write_estimate_event(
      other_row.id,
      'estimate.declined',
      jsonb_build_object('reason', 'not_selected_cascade')
    );
    IF other_row.status <> 'DRAFT' THEN
      PERFORM public.enqueue_notification(
        public.contractor_owner_profile_id(other_row.contractor_profile_id),
        'estimate.declined',
        'Not selected',
        'The customer selected another pro for this project.',
        'estimates',
        other_row.id,
        jsonb_build_object('project_id', p_project_id, 'reason', 'not_selected_cascade')
      );
    END IF;
  END LOOP;

  UPDATE public.opportunities
  SET status = CASE
    WHEN contractor_profile_id = est.contractor_profile_id THEN status
    ELSE 'CLOSED'
  END
  WHERE project_id = p_project_id
    AND status IN ('AVAILABLE', 'ACCEPTED');

  v_repeat := public.pair_has_completed_booking(proj.customer_id, est.contractor_profile_id);
  v_kind := CASE WHEN v_repeat THEN 'REPEAT'::public.fee_schedule_kind ELSE 'ORIGINAL'::public.fee_schedule_kind END;
  v_schedule := public.current_fee_schedule_id(v_kind);
  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'no active fee schedule';
  END IF;
  preview := public.compute_fee(est.total_cents, v_schedule);
  ttl := coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'booking_pending_ttl_hours'),
    168
  );

  INSERT INTO public.bookings (
    project_id,
    estimate_id,
    customer_id,
    contractor_profile_id,
    status,
    amount_cents,
    approved_delta_cents,
    billable_amount_cents,
    is_repeat,
    fee_kind,
    fee_schedule_id,
    fee_schedule_version,
    fee_cents,
    contractor_earnings_cents,
    customer_amount_cents,
    fee_locked,
    payments_live,
    charges_live,
    expires_at
  ) VALUES (
    p_project_id,
    est.id,
    proj.customer_id,
    est.contractor_profile_id,
    'PENDING',
    est.total_cents,
    0,
    est.total_cents,
    v_repeat,
    v_kind,
    v_schedule,
    (preview->>'version')::integer,
    (preview->>'fee_cents')::integer,
    (preview->>'contractor_earnings_cents')::integer,
    est.total_cents,
    false,
    false,
    false,
    now() + make_interval(hours => ttl)
  )
  RETURNING id INTO bid;

  UPDATE public.projects
  SET
    status = 'CONTRACTOR_SELECTED',
    selected_estimate_id = est.id,
    selected_contractor_profile_id = est.contractor_profile_id,
    selected_booking_id = bid,
    selected_at = now()
  WHERE id = p_project_id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'estimate.selected',
    'projects',
    p_project_id,
    jsonb_build_object(
      'estimate_id', est.id,
      'booking_id', bid,
      'booking_status', 'PENDING',
      'contractor_profile_id', est.contractor_profile_id,
      'is_repeat', v_repeat,
      'charges_live', false,
      'payments_live', false
    )
  );
  PERFORM public.write_booking_event(
    bid,
    'booking.created',
    jsonb_build_object('status', 'PENDING', 'is_repeat', v_repeat, 'preview', preview)
  );

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'estimate_id', est.id,
    'booking_id', bid,
    'status', 'CONTRACTOR_SELECTED',
    'booking_status', 'PENDING',
    'is_repeat', v_repeat,
    'fee_kind', v_kind,
    'fee_preview', preview,
    'charges_live', false,
    'payments_live', false,
    'message', 'Payment coming soon — booking cannot be confirmed in production yet'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_estimates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
BEGIN
  cid := public.current_contractor_profile_id();
  IF cid IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a contractor';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(item ORDER BY coalesce(item->>'submitted_at', item->>'created_at') DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', e.id,
        'project_id', e.project_id,
        'opportunity_id', e.opportunity_id,
        'project_title', p.title,
        'status', e.status,
        'total_cents', e.total_cents,
        'submitted_at', e.submitted_at,
        'first_viewed_at', e.first_viewed_at,
        'last_viewed_at', e.last_viewed_at,
        'view_count', e.view_count,
        'accepted_at', e.accepted_at,
        'declined_at', e.declined_at,
        'withdrawn_at', e.withdrawn_at,
        'created_at', e.created_at
      ) AS item
      FROM public.estimates e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.contractor_profile_id = cid
    ) q
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_notifications()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(row_to_json(n)::jsonb ORDER BY n.created_at DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT id, kind, title, body, entity_type, entity_id, payload, channel, read_at, created_at
    FROM public.notifications
    WHERE recipient_profile_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT 50
  ) n;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n public.notifications;
BEGIN
  SELECT * INTO n FROM public.notifications WHERE id = p_notification_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'notification not found'; END IF;
  IF n.recipient_profile_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your notification';
  END IF;
  UPDATE public.notifications SET read_at = coalesce(read_at, now()) WHERE id = n.id
  RETURNING * INTO n;
  RETURN jsonb_build_object('id', n.id, 'read_at', n.read_at);
END;
$$;

DROP POLICY IF EXISTS estimates_select_visible ON public.estimates;
CREATE POLICY estimates_select_visible
  ON public.estimates FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
    OR (
      public.is_project_owner(project_id)
      AND status IN ('SUBMITTED', 'SENT', 'REVISED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED')
    )
  );

DROP POLICY IF EXISTS estimate_items_select_via_estimate ON public.estimate_items;
CREATE POLICY estimate_items_select_via_estimate
  ON public.estimate_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND (
          e.contractor_profile_id = public.current_contractor_profile_id()
          OR public.is_admin()
          OR (
            public.is_project_owner(e.project_id)
            AND e.status IN ('SUBMITTED', 'SENT', 'REVISED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED')
          )
        )
    )
  );

DROP POLICY IF EXISTS estimate_items_write_own_open ON public.estimate_items;
CREATE POLICY estimate_items_write_own_open
  ON public.estimate_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND e.contractor_profile_id = public.current_contractor_profile_id()
        AND e.status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED')
    )
  );

DROP POLICY IF EXISTS estimate_items_update_own_open ON public.estimate_items;
CREATE POLICY estimate_items_update_own_open
  ON public.estimate_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND (
          (
            e.contractor_profile_id = public.current_contractor_profile_id()
            AND e.status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED')
          )
          OR public.is_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND (
          (
            e.contractor_profile_id = public.current_contractor_profile_id()
            AND e.status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED')
          )
          OR public.is_admin()
        )
    )
  );

DROP POLICY IF EXISTS estimate_items_delete_own_open ON public.estimate_items;
CREATE POLICY estimate_items_delete_own_open
  ON public.estimate_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND (
          (
            e.contractor_profile_id = public.current_contractor_profile_id()
            AND e.status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED')
          )
          OR public.is_admin()
        )
    )
  );

DROP POLICY IF EXISTS estimate_events_select_participants ON public.estimate_events;
CREATE POLICY estimate_events_select_participants
  ON public.estimate_events FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND (
          e.contractor_profile_id = public.current_contractor_profile_id()
          OR public.is_project_owner(e.project_id)
        )
    )
  );

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS notifications_update_own_read ON public.notifications;
CREATE POLICY notifications_update_own_read
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (recipient_profile_id = auth.uid() OR public.is_admin());

REVOKE ALL ON TABLE public.estimate_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.estimate_events TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;

REVOKE ALL ON FUNCTION public.text_contains_contact_info(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.text_contains_contact_info(text) TO authenticated;
REVOKE ALL ON FUNCTION public.contact_info_blocked_message() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_info_blocked_message() TO authenticated;
REVOKE ALL ON FUNCTION public.write_estimate_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contractor_owner_profile_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_contractor_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_estimate_insert_contact() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_estimate_question_contact() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_notification_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forbid_estimate_event_mutation() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.mark_estimate_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_estimate_viewed(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.decline_estimate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_estimate(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_my_estimates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_estimates() TO authenticated;
REVOKE ALL ON FUNCTION public.list_my_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_notifications() TO authenticated;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.project_has_participation(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.project_id = p_project_id AND o.status = 'ACCEPTED'
  ) OR EXISTS (
    SELECT 1 FROM public.estimates e
    WHERE e.project_id = p_project_id
      AND e.status IN ('SUBMITTED', 'SENT', 'REVISED', 'VIEWED', 'ACCEPTED')
  );
$$;

CREATE OR REPLACE FUNCTION public.apply_material_scope_change(p_project_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.projects;
BEGIN
  PERFORM public.ppp_set_rpc('update_customer_project');
  SELECT * INTO p FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;

  UPDATE public.estimates
  SET status = 'SUPERSEDED'
  WHERE project_id = p_project_id
    AND status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED');

  UPDATE public.projects
  SET
    scope_revision = p.scope_revision + 1,
    status = CASE
      WHEN p.status IN ('ESTIMATES_AVAILABLE', 'CONTRACTORS_RESPONDING', 'MATCHING', 'POSTED')
        THEN 'CONTRACTORS_RESPONDING'::public.project_status
      ELSE p.status
    END
  WHERE id = p_project_id;

  PERFORM public.insert_project_notice(
    p_project_id,
    'BOTH',
    'SCOPE_CHANGED',
    'Project details changed',
    CASE
      WHEN p_reason = 'photos' THEN
        'The customer updated the photos. Previous estimates are out of date and need a new submission before they cover this job.'
      WHEN p_reason = 'answers' THEN
        'The customer updated the project answers. Previous estimates are out of date and need a new submission before they cover this job.'
      ELSE
        'The customer updated the job details. Previous estimates are out of date and need a new submission before they cover this job.'
    END
  );
END;
$$;

COMMENT ON FUNCTION public.list_my_estimates() IS
  'Contractor estimates list. Does not mark VIEWED.';
COMMENT ON FUNCTION public.select_estimate(uuid, uuid) IS
  'Customer hire: ACCEPTED winner; other active estimates DECLINED. Contractor cannot call this as self-accept.';
