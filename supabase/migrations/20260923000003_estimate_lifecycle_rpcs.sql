-- Estimate submit/view/decline/select + contractor list RPCs.
-- Additive. select_estimate still creates a PENDING booking. Payments stay off.

CREATE OR REPLACE FUNCTION public.forbid_estimate_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'estimate_events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS estimate_events_forbid_update ON public.estimate_events;
CREATE TRIGGER estimate_events_forbid_update
  BEFORE UPDATE ON public.estimate_events
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_estimate_event_mutation();

DROP TRIGGER IF EXISTS estimate_events_forbid_delete ON public.estimate_events;
CREATE TRIGGER estimate_events_forbid_delete
  BEFORE DELETE ON public.estimate_events
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_estimate_event_mutation();

CREATE OR REPLACE FUNCTION public.submit_estimate(p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  est public.estimates;
  item_count integer;
  next_status public.estimate_status;
  proj public.projects;
  was_first boolean;
BEGIN
  PERFORM public.ppp_set_rpc('submit_estimate');

  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate not found';
  END IF;
  IF est.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your estimate';
  END IF;
  IF est.status NOT IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED') THEN
    RAISE EXCEPTION 'estimate cannot be submitted from status %', est.status;
  END IF;
  IF public.text_contains_contact_info(est.notes) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = est.opportunity_id
      AND o.status = 'ACCEPTED'
  ) THEN
    RAISE EXCEPTION 'only accepted opportunities may submit estimates';
  END IF;

  SELECT count(*) INTO item_count FROM public.estimate_items WHERE estimate_id = est.id;
  IF item_count < 1 THEN
    RAISE EXCEPTION 'add at least one line item';
  END IF;

  PERFORM public.recompute_estimate_totals(est.id);
  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id;

  IF est.total_cents <= 0
     OR est.total_cents <> est.subtotal_cents
     OR est.fee_cents <> public.fee_cents_from_total(est.total_cents, est.fee_bps)
     OR est.contractor_earnings_cents <> est.total_cents - est.fee_cents THEN
    RAISE EXCEPTION 'estimate totals failed validation';
  END IF;

  was_first := est.status = 'DRAFT';
  next_status := CASE WHEN est.status = 'DRAFT' THEN 'SENT' ELSE 'REVISED' END;

  UPDATE public.estimates
  SET status = next_status, submitted_at = now()
  WHERE id = est.id;

  UPDATE public.projects
  SET status = 'ESTIMATES_AVAILABLE'
  WHERE id = est.project_id
    AND status IN ('MATCHING', 'CONTRACTORS_RESPONDING', 'ESTIMATES_AVAILABLE');

  SELECT * INTO proj FROM public.projects WHERE id = est.project_id;

  PERFORM public.write_estimate_event(
    est.id,
    CASE WHEN was_first THEN 'estimate.submitted' ELSE 'estimate.revised' END,
    jsonb_build_object('status', next_status, 'total_cents', est.total_cents)
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'estimate.submitted',
    'estimates',
    est.id,
    jsonb_build_object(
      'total_cents', est.total_cents,
      'fee_cents', est.fee_cents,
      'status', next_status,
      'charges_live', false
    )
  );

  IF was_first THEN
    PERFORM public.enqueue_notification(
      proj.customer_id,
      'estimate.received',
      'New estimate received',
      'A contractor sent an estimate for your project.',
      'estimates',
      est.id,
      jsonb_build_object('project_id', est.project_id)
    );
  ELSE
    PERFORM public.enqueue_notification(
      proj.customer_id,
      'estimate.updated',
      'Estimate updated',
      'A contractor updated an estimate on your project.',
      'estimates',
      est.id,
      jsonb_build_object('project_id', est.project_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'estimate_id', est.id,
    'status', next_status,
    'total_cents', est.total_cents,
    'fee_cents', est.fee_cents,
    'contractor_earnings_cents', est.contractor_earnings_cents,
    'charges_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_estimate(p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  est public.estimates;
  proj public.projects;
BEGIN
  PERFORM public.ppp_set_rpc('withdraw_estimate');
  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate not found';
  END IF;
  IF est.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your estimate';
  END IF;
  IF est.status NOT IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED') THEN
    RAISE EXCEPTION 'estimate cannot be withdrawn';
  END IF;

  UPDATE public.estimates
  SET status = 'WITHDRAWN', withdrawn_at = now()
  WHERE id = est.id;

  SELECT * INTO proj FROM public.projects WHERE id = est.project_id;
  PERFORM public.write_estimate_event(est.id, 'estimate.withdrawn', jsonb_build_object('status', 'WITHDRAWN'));
  IF est.status <> 'DRAFT' THEN
    PERFORM public.enqueue_notification(
      proj.customer_id,
      'estimate.withdrawn',
      'Estimate withdrawn',
      'A contractor withdrew an estimate on your project.',
      'estimates',
      est.id,
      jsonb_build_object('project_id', est.project_id)
    );
  END IF;

  RETURN jsonb_build_object('estimate_id', est.id, 'status', 'WITHDRAWN');
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_estimate_viewed(p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  est public.estimates;
  proj public.projects;
  was_first boolean;
  next_status public.estimate_status;
BEGIN
  PERFORM public.ppp_set_rpc('mark_estimate_viewed');

  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate not found';
  END IF;
  SELECT * INTO proj FROM public.projects WHERE id = est.project_id FOR UPDATE;
  IF proj.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the project owner';
  END IF;
  IF est.status NOT IN ('SUBMITTED', 'SENT', 'REVISED', 'VIEWED') THEN
    RAISE EXCEPTION 'estimate is not viewable';
  END IF;

  was_first := est.first_viewed_at IS NULL;
  next_status := CASE
    WHEN est.status IN ('SUBMITTED', 'SENT', 'REVISED') THEN 'VIEWED'::public.estimate_status
    ELSE est.status
  END;

  UPDATE public.estimates
  SET
    status = next_status,
    first_viewed_at = coalesce(first_viewed_at, now()),
    last_viewed_at = now(),
    view_count = view_count + 1
  WHERE id = est.id
  RETURNING * INTO est;

  PERFORM public.write_estimate_event(
    est.id,
    'estimate.viewed',
    jsonb_build_object('first', was_first, 'view_count', est.view_count, 'status', est.status)
  );

  IF was_first THEN
    PERFORM public.enqueue_notification(
      public.contractor_owner_profile_id(est.contractor_profile_id),
      'estimate.viewed',
      'Your estimate was viewed',
      'The customer opened your estimate.',
      'estimates',
      est.id,
      jsonb_build_object('project_id', est.project_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'estimate_id', est.id,
    'status', est.status,
    'first_viewed_at', est.first_viewed_at,
    'last_viewed_at', est.last_viewed_at,
    'view_count', est.view_count,
    'first_view', was_first
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_estimate(p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  est public.estimates;
  proj public.projects;
BEGIN
  PERFORM public.ppp_set_rpc('decline_estimate');

  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate not found';
  END IF;
  SELECT * INTO proj FROM public.projects WHERE id = est.project_id FOR UPDATE;
  IF proj.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the project owner';
  END IF;
  IF est.status NOT IN ('SUBMITTED', 'SENT', 'REVISED', 'VIEWED') THEN
    RAISE EXCEPTION 'estimate cannot be declined from status %', est.status;
  END IF;

  UPDATE public.estimates
  SET status = 'DECLINED', declined_at = now()
  WHERE id = est.id;

  PERFORM public.write_estimate_event(
    est.id,
    'estimate.declined',
    jsonb_build_object('reason', 'customer_declined')
  );
  PERFORM public.enqueue_notification(
    public.contractor_owner_profile_id(est.contractor_profile_id),
    'estimate.declined',
    'Not selected',
    'The customer declined this estimate.',
    'estimates',
    est.id,
    jsonb_build_object('project_id', est.project_id, 'reason', 'customer_declined')
  );

  RETURN jsonb_build_object('estimate_id', est.id, 'status', 'DECLINED');
END;
$$;

COMMENT ON FUNCTION public.mark_estimate_viewed(uuid) IS
  'Customer DETAIL open only. List/prefetch must not call this. Sets first_viewed_at once.';
COMMENT ON FUNCTION public.submit_estimate(uuid) IS
  'Submit moves DRAFT → SENT (not VIEWED). Later submits become REVISED.';
