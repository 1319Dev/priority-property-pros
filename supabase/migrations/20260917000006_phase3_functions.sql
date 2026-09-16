-- Phase 3 marketplace functions, status logging, total validation, matching, RPCs.
-- SECURITY DEFINER RPCs always check auth.uid() and never charge money.

CREATE OR REPLACE FUNCTION public.ppp_set_rpc(p_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('ppp.rpc', p_name, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ppp_rpc_is(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('ppp.rpc', true) = p_name;
$$;

CREATE OR REPLACE FUNCTION public.current_contractor_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.id
  FROM public.contractor_profiles cp
  WHERE cp.profile_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_contractor_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_contractor_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.customer_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_project_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.contractor_has_open_opportunity(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.project_id = p_project_id
      AND o.contractor_profile_id = public.current_contractor_profile_id()
      AND o.status IN ('AVAILABLE', 'ACCEPTED')
  );
$$;

REVOKE ALL ON FUNCTION public.contractor_has_open_opportunity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contractor_has_open_opportunity(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.contractor_is_selected_on_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.selected_contractor_profile_id = public.current_contractor_profile_id()
      AND p.status = 'CONTRACTOR_SELECTED'
  );
$$;

REVOKE ALL ON FUNCTION public.contractor_is_selected_on_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contractor_is_selected_on_project(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_project_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.project_status_history (project_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.project_status_history (project_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_record_status
  AFTER INSERT OR UPDATE OF status ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.record_project_status_history();

CREATE OR REPLACE FUNCTION public.recompute_project_completeness(p_project_id uuid)
RETURNS public.project_completeness
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  photo_count integer;
  required_total integer;
  required_answered integer;
  loc public.project_private_locations;
  result public.project_completeness;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN 'MORE_INFO_NEEDED';
  END IF;

  SELECT count(*) INTO photo_count
  FROM public.project_photos
  WHERE project_id = p_project_id;

  SELECT * INTO loc
  FROM public.project_private_locations
  WHERE project_id = p_project_id;

  SELECT count(*) INTO required_total
  FROM public.service_questions q
  WHERE q.category_id = proj.category_id
    AND q.is_active
    AND q.is_required;

  SELECT count(*) INTO required_answered
  FROM public.project_answers a
  JOIN public.service_questions q ON q.id = a.question_id
  WHERE a.project_id = p_project_id
    AND q.category_id = proj.category_id
    AND q.is_active
    AND q.is_required
    AND (
      nullif(btrim(coalesce(a.answer_text, '')), '') IS NOT NULL
      OR a.answer_json IS NOT NULL
    );

  IF length(btrim(proj.title)) < 4
     OR proj.category_id IS NULL
     OR public.normalize_zip(proj.zip_code) IS NULL THEN
    result := 'MORE_INFO_NEEDED';
  ELSIF photo_count >= 1
     AND length(btrim(proj.description)) >= 20
     AND coalesce(proj.city, '') <> ''
     AND coalesce(proj.state, '') <> ''
     AND proj.timing IS NOT NULL
     AND (proj.budget_min_cents IS NOT NULL OR proj.budget_max_cents IS NOT NULL)
     AND coalesce(loc.street_line1, '') <> ''
     AND required_answered >= required_total THEN
    result := 'HIGH';
  ELSE
    result := 'MEDIUM';
  END IF;

  UPDATE public.projects
  SET completeness = result
  WHERE id = p_project_id
    AND completeness IS DISTINCT FROM result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_project_completeness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN
    pid := coalesce(NEW.id, OLD.id);
  ELSE
    pid := coalesce(NEW.project_id, OLD.project_id);
  END IF;
  PERFORM public.recompute_project_completeness(pid);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_touch_completeness
  AFTER INSERT OR UPDATE OF title, description, category_id, city, state, zip_code, timing, budget_min_cents, budget_max_cents
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_project_completeness();

CREATE TRIGGER project_photos_touch_completeness
  AFTER INSERT OR DELETE ON public.project_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_project_completeness();

CREATE TRIGGER project_answers_touch_completeness
  AFTER INSERT OR UPDATE OR DELETE ON public.project_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_project_completeness();

CREATE TRIGGER project_private_locations_touch_completeness
  AFTER INSERT OR UPDATE OR DELETE ON public.project_private_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_project_completeness();

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
     OR public.is_admin()
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'DRAFT' THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
      RAISE EXCEPTION 'project owner cannot change after create';
    END IF;
    IF NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.selected_estimate_id IS DISTINCT FROM OLD.selected_estimate_id
       OR NEW.selected_contractor_profile_id IS DISTINCT FROM OLD.selected_contractor_profile_id THEN
      RAISE EXCEPTION 'posted projects cannot change category, status, or selection from the client';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_protect_posted
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_posted_project();

CREATE OR REPLACE FUNCTION public.normalize_estimate_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.line_total_cents := round(NEW.quantity * NEW.unit_cents)::integer;
  RETURN NEW;
END;
$$;

CREATE TRIGGER estimate_items_normalize
  BEFORE INSERT OR UPDATE OF quantity, unit_cents, line_total_cents
  ON public.estimate_items
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_estimate_item();

CREATE OR REPLACE FUNCTION public.recompute_estimate_totals(p_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal integer;
  v_bps integer;
  v_fee integer;
BEGIN
  SELECT coalesce(sum(line_total_cents), 0)
  INTO v_subtotal
  FROM public.estimate_items
  WHERE estimate_id = p_estimate_id;

  v_bps := public.current_fee_bps();
  v_fee := public.fee_cents_from_total(v_subtotal, v_bps);

  UPDATE public.estimates
  SET
    subtotal_cents = v_subtotal,
    total_cents = v_subtotal,
    fee_bps = v_bps,
    fee_cents = v_fee,
    contractor_earnings_cents = v_subtotal - v_fee
  WHERE id = p_estimate_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_estimate_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_estimate_totals(coalesce(NEW.estimate_id, OLD.estimate_id));
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER estimate_items_touch_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.estimate_items
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_estimate_totals();

CREATE OR REPLACE FUNCTION public.location_matches(
  p_zip text,
  p_lat numeric,
  p_lng numeric,
  p_area public.contractor_service_areas
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  zip text := public.normalize_zip(p_zip);
  miles numeric;
  area_zip text := public.normalize_zip(p_area.center_zip);
  normalized_zips text[];
BEGIN
  SELECT coalesce(array_agg(public.normalize_zip(z)), '{}')
  INTO normalized_zips
  FROM unnest(p_area.zip_codes) AS z;

  IF zip IS NOT NULL AND zip = ANY (normalized_zips) THEN
    RETURN true;
  END IF;

  IF zip IS NOT NULL AND area_zip IS NOT NULL AND zip = area_zip THEN
    RETURN true;
  END IF;

  IF p_area.mode IN ('RADIUS', 'ZIPS_AND_RADIUS')
     AND p_area.radius_miles IS NOT NULL THEN
    miles := public.haversine_miles(p_lat, p_lng, p_area.center_lat, p_area.center_lng);
    IF miles IS NOT NULL AND miles <= p_area.radius_miles THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_project(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  loc public.project_private_locations;
  ttl integer;
  inserted integer := 0;
BEGIN
  SELECT * INTO STRICT proj FROM public.projects WHERE id = p_project_id;
  SELECT * INTO loc FROM public.project_private_locations WHERE project_id = p_project_id;
  ttl := coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'opportunity_ttl_hours'),
    168
  );

  INSERT INTO public.matches (project_id, contractor_profile_id, score, reasons)
  SELECT
    proj.id,
    cp.id,
    (
      40
      + CASE WHEN cs.category_id IS NOT NULL THEN 30 ELSE 0 END
      + CASE WHEN p.account_status = 'ACTIVE' THEN 15 ELSE 0 END
      + CASE WHEN cp.approval_status = 'APPROVED' THEN 15 ELSE 0 END
    ),
    jsonb_build_array('category', 'location', 'account', 'approval', 'availability', 'job_size')
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  JOIN public.contractor_services cs
    ON cs.contractor_profile_id = cp.id
   AND cs.category_id = proj.category_id
  JOIN public.service_categories cat ON cat.id = proj.category_id
  WHERE p.account_type = 'CONTRACTOR'
    AND p.account_status = 'ACTIVE'
    AND cp.approval_status = 'APPROVED'
    AND cp.accepting_work = true
    AND proj.category_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.contractor_service_areas a
      WHERE a.contractor_profile_id = cp.id
        AND public.location_matches(proj.zip_code, loc.lat, loc.lng, a)
    )
    AND (
      cp.min_job_cents IS NULL
      OR proj.budget_max_cents IS NULL
      OR proj.budget_max_cents >= cp.min_job_cents
    )
    AND (
      cp.max_job_cents IS NULL
      OR proj.budget_min_cents IS NULL
      OR proj.budget_min_cents <= cp.max_job_cents
    )
    AND (
      NOT cat.requires_verified_credential
      OR EXISTS (
        SELECT 1
        FROM public.contractor_credentials cr
        WHERE cr.contractor_profile_id = cp.id
          AND cr.status = 'VERIFIED'
          AND (cr.expires_at IS NULL OR cr.expires_at >= CURRENT_DATE)
      )
    )
  ON CONFLICT (project_id, contractor_profile_id) DO NOTHING;

  INSERT INTO public.opportunities (
    project_id,
    contractor_profile_id,
    match_id,
    status,
    expires_at
  )
  SELECT
    m.project_id,
    m.contractor_profile_id,
    m.id,
    'AVAILABLE',
    now() + make_interval(hours => ttl)
  FROM public.matches m
  WHERE m.project_id = p_project_id
  ON CONFLICT (project_id, contractor_profile_id) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.match_project(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.post_project(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  matched integer;
  next_status public.project_status;
BEGIN
  PERFORM public.ppp_set_rpc('post_project');

  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not the project owner';
  END IF;
  IF proj.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'only drafts can be posted';
  END IF;
  IF length(btrim(proj.title)) < 4 OR proj.category_id IS NULL OR public.normalize_zip(proj.zip_code) IS NULL THEN
    RAISE EXCEPTION 'title, category, and ZIP are required to post';
  END IF;

  UPDATE public.projects
  SET status = 'POSTED', posted_at = now()
  WHERE id = p_project_id;

  UPDATE public.projects
  SET status = 'MATCHING'
  WHERE id = p_project_id;

  matched := public.match_project(p_project_id);

  IF EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.project_id = p_project_id AND o.status = 'AVAILABLE'
  ) THEN
    next_status := 'CONTRACTORS_RESPONDING';
  ELSE
    next_status := 'MATCHING';
  END IF;

  UPDATE public.projects SET status = next_status WHERE id = p_project_id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'project.posted',
    'projects',
    p_project_id,
    jsonb_build_object('matched', matched, 'status', next_status)
  );

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'status', next_status,
    'opportunities_created', matched
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_project(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_opportunity(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opp public.opportunities;
  slot smallint;
  taken integer;
BEGIN
  PERFORM public.ppp_set_rpc('accept_opportunity');

  SELECT * INTO opp FROM public.opportunities WHERE id = p_opportunity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity not found';
  END IF;
  IF opp.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your opportunity';
  END IF;

  -- Serialize accepts for this project; unique slot PK is the race-safe cap.
  PERFORM 1 FROM public.projects WHERE id = opp.project_id FOR UPDATE;

  SELECT * INTO opp FROM public.opportunities WHERE id = p_opportunity_id;
  IF opp.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'opportunity is not available';
  END IF;
  IF opp.expires_at IS NOT NULL AND opp.expires_at < now() THEN
    UPDATE public.opportunities SET status = 'EXPIRED' WHERE id = opp.id AND status = 'AVAILABLE';
    RAISE EXCEPTION 'opportunity has expired';
  END IF;

  IF (SELECT status FROM public.projects WHERE id = opp.project_id) = 'CONTRACTOR_SELECTED' THEN
    RAISE EXCEPTION 'contractor already selected';
  END IF;

  SELECT count(*) INTO taken
  FROM public.opportunity_slots
  WHERE project_id = opp.project_id;

  IF taken >= 3 THEN
    UPDATE public.opportunities
    SET status = 'CLOSED'
    WHERE project_id = opp.project_id
      AND status = 'AVAILABLE';
    RAISE EXCEPTION 'this project already has 3 participating contractors';
  END IF;

  SELECT s INTO slot
  FROM generate_series(1, 3) AS s
  WHERE s NOT IN (
    SELECT slot_number FROM public.opportunity_slots WHERE project_id = opp.project_id
  )
  ORDER BY s
  LIMIT 1;

  BEGIN
    INSERT INTO public.opportunity_slots (
      project_id, slot_number, opportunity_id, contractor_profile_id
    ) VALUES (
      opp.project_id, slot, opp.id, opp.contractor_profile_id
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'this project already has 3 participating contractors';
  END;

  UPDATE public.opportunities
  SET status = 'ACCEPTED', responded_at = now()
  WHERE id = opp.id;

  UPDATE public.projects
  SET status = 'CONTRACTORS_RESPONDING'
  WHERE id = opp.project_id
    AND status IN ('POSTED', 'MATCHING', 'CONTRACTORS_RESPONDING');

  SELECT count(*) INTO taken
  FROM public.opportunity_slots
  WHERE project_id = opp.project_id;

  IF taken >= 3 THEN
    UPDATE public.opportunities
    SET status = 'CLOSED'
    WHERE project_id = opp.project_id
      AND status = 'AVAILABLE';
  END IF;

  PERFORM public.write_audit_log(
    auth.uid(),
    'opportunity.accepted',
    'opportunities',
    opp.id,
    jsonb_build_object('project_id', opp.project_id, 'slot', slot)
  );

  RETURN jsonb_build_object(
    'opportunity_id', opp.id,
    'slot', slot,
    'participating', taken
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_opportunity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_opportunity(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pass_opportunity(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opp public.opportunities;
BEGIN
  SELECT * INTO opp FROM public.opportunities WHERE id = p_opportunity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity not found';
  END IF;
  IF opp.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your opportunity';
  END IF;
  IF opp.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'opportunity is not available';
  END IF;

  UPDATE public.opportunities
  SET status = 'PASSED', responded_at = now()
  WHERE id = opp.id;

  RETURN jsonb_build_object('opportunity_id', opp.id, 'status', 'PASSED');
END;
$$;

REVOKE ALL ON FUNCTION public.pass_opportunity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pass_opportunity(uuid) TO authenticated;

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
  IF est.status NOT IN ('DRAFT', 'SUBMITTED', 'REVISED') THEN
    RAISE EXCEPTION 'estimate cannot be submitted from status %', est.status;
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

  next_status := CASE WHEN est.status = 'DRAFT' THEN 'SUBMITTED' ELSE 'REVISED' END;

  UPDATE public.estimates
  SET status = next_status, submitted_at = now()
  WHERE id = est.id;

  UPDATE public.projects
  SET status = 'ESTIMATES_AVAILABLE'
  WHERE id = est.project_id
    AND status IN ('MATCHING', 'CONTRACTORS_RESPONDING', 'ESTIMATES_AVAILABLE');

  PERFORM public.write_audit_log(
    auth.uid(),
    'estimate.submitted',
    'estimates',
    est.id,
    jsonb_build_object(
      'total_cents', est.total_cents,
      'fee_cents', est.fee_cents,
      'charges_live', false
    )
  );

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

REVOKE ALL ON FUNCTION public.submit_estimate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_estimate(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_estimate(p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  est public.estimates;
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
  IF est.status NOT IN ('DRAFT', 'SUBMITTED', 'REVISED') THEN
    RAISE EXCEPTION 'estimate cannot be withdrawn';
  END IF;

  UPDATE public.estimates
  SET status = 'WITHDRAWN', withdrawn_at = now()
  WHERE id = est.id;

  RETURN jsonb_build_object('estimate_id', est.id, 'status', 'WITHDRAWN');
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_estimate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_estimate(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.select_estimate(p_project_id uuid, p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  est public.estimates;
BEGIN
  PERFORM public.ppp_set_rpc('select_estimate');

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
  IF est.status NOT IN ('SUBMITTED', 'REVISED') THEN
    RAISE EXCEPTION 'only submitted estimates can be selected';
  END IF;

  UPDATE public.estimates
  SET status = 'ACCEPTED'
  WHERE id = est.id;

  UPDATE public.estimates
  SET status = 'DECLINED'
  WHERE project_id = p_project_id
    AND id <> est.id
    AND status IN ('DRAFT', 'SUBMITTED', 'REVISED');

  UPDATE public.opportunities
  SET status = CASE
    WHEN contractor_profile_id = est.contractor_profile_id THEN status
    ELSE 'CLOSED'
  END
  WHERE project_id = p_project_id
    AND status IN ('AVAILABLE', 'ACCEPTED');

  UPDATE public.projects
  SET
    status = 'CONTRACTOR_SELECTED',
    selected_estimate_id = est.id,
    selected_contractor_profile_id = est.contractor_profile_id,
    selected_at = now()
  WHERE id = p_project_id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'estimate.selected',
    'projects',
    p_project_id,
    jsonb_build_object(
      'estimate_id', est.id,
      'contractor_profile_id', est.contractor_profile_id,
      'charges_live', false
    )
  );

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'estimate_id', est.id,
    'status', 'CONTRACTOR_SELECTED',
    'charges_live', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.select_estimate(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.select_estimate(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_estimate_questions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.asked_by_contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
       AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'only the asking contractor can create this question';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = NEW.opportunity_id
        AND o.project_id = NEW.project_id
        AND o.contractor_profile_id = NEW.asked_by_contractor_profile_id
        AND o.status = 'ACCEPTED'
    ) THEN
      RAISE EXCEPTION 'pre-estimate questions require an accepted opportunity';
    END IF;
    NEW.answer_text := NULL;
    NEW.answered_at := NULL;
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF public.is_project_owner(OLD.project_id) THEN
    IF NEW.prompt IS DISTINCT FROM OLD.prompt
       OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
       OR NEW.asked_by_contractor_profile_id IS DISTINCT FROM OLD.asked_by_contractor_profile_id THEN
      RAISE EXCEPTION 'customers may only answer questions';
    END IF;
    IF NEW.answer_text IS DISTINCT FROM OLD.answer_text THEN
      NEW.answered_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.asked_by_contractor_profile_id = public.current_contractor_profile_id() THEN
    IF OLD.answered_at IS NOT NULL THEN
      RAISE EXCEPTION 'cannot edit a question after it has been answered';
    END IF;
    IF NEW.answer_text IS DISTINCT FROM OLD.answer_text
       OR NEW.answered_at IS DISTINCT FROM OLD.answered_at THEN
      RAISE EXCEPTION 'contractors cannot write the customer answer';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'not authorized to change this question';
END;
$$;

CREATE TRIGGER estimate_questions_protect
  BEFORE INSERT OR UPDATE ON public.estimate_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_estimate_questions();
