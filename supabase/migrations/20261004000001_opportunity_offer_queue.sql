-- Top-3 live opportunity offers with skip backfill and fairness rotation.
-- Additive. Does not enable Stripe, flip payments_live/charges_live, or change $9.99 / $4.99 fees.
-- Do NOT apply to production from this PR.
--
-- Model
--   matches = full ranked eligible queue (persisted; regenerable).
--   Live offer positions = max 3 minus participating (opportunity_slots).
--   AVAILABLE opportunities occupy those positions until accept, pass, expire, or close.
--   opportunity_slots remain the race-safe accept/participate cap (not "who was offered").
--   On PASS: mark PASSED (cannot reclaim; unique project+contractor) and immediately
--   fill one new AVAILABLE from the next unused eligible match.
--   If the ranked queue is exhausted, the offer slot stays empty until match_project
--   is run again (post, or a later rematch). Newly eligible contractors are not offered
--   on pass unless matching is re-run.
--
-- Fairness (same ranking for initial top-3 and skip-backfill)
--   Hard filters first (service area, category, ACTIVE+APPROVED, accepting_work, job size,
--   verified credential when required). Never offer out-of-area or otherwise ineligible.
--   Fit score rewards ZIP match, closer radius, verified credentials, years.
--   Fairness penalty (capped at 24) subtracts for recent offers in the same category
--   (14 days), other recent offers, and currently open AVAILABLE offers.
--   Rank = (fit score - penalty) DESC, oldest/never last_offered, contractor id.
--   Cap keeps fairness rotating similar-quality pros without sending jobs to bad fits.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS rank_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.matches.rank_order IS
  '1 = first in the offer queue. Recomputed by rank_project_matches from fit score minus fairness penalty, then last-offered, then contractor id. Not the participate slot.';

CREATE INDEX IF NOT EXISTS matches_project_rank_idx
  ON public.matches (project_id, rank_order);

INSERT INTO public.platform_settings (key, value_int, description)
VALUES
  (
    'offer_fairness_lookback_days',
    14,
    'Recent-offer window used to rotate first looks among similarly suited contractors.'
  )
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.contractor_eligible_for_project(
  p_project_id uuid,
  p_contractor_profile_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  loc_lat numeric;
  loc_lng numeric;
  cp public.contractor_profiles;
  acct public.profiles;
  cat public.service_categories;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR proj.category_id IS NULL THEN
    RETURN false;
  END IF;
  IF proj.status IN ('DRAFT', 'CANCELLED', 'CONTRACTOR_SELECTED') THEN
    RETURN false;
  END IF;

  SELECT lat, lng INTO loc_lat, loc_lng
  FROM public.project_private_locations
  WHERE project_id = p_project_id;
  SELECT * INTO cp FROM public.contractor_profiles WHERE id = p_contractor_profile_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  SELECT * INTO acct FROM public.profiles WHERE id = cp.profile_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  SELECT * INTO cat FROM public.service_categories WHERE id = proj.category_id;

  IF acct.account_type IS DISTINCT FROM 'CONTRACTOR' THEN
    RETURN false;
  END IF;
  IF acct.account_status IS DISTINCT FROM 'ACTIVE' THEN
    RETURN false;
  END IF;
  IF cp.approval_status IS DISTINCT FROM 'APPROVED' THEN
    RETURN false;
  END IF;
  IF cp.accepting_work IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contractor_services cs
    WHERE cs.contractor_profile_id = cp.id
      AND cs.category_id = proj.category_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contractor_service_areas a
    WHERE a.contractor_profile_id = cp.id
      AND public.location_matches(proj.zip_code, loc_lat, loc_lng, a)
  ) THEN
    RETURN false;
  END IF;

  IF cp.min_job_cents IS NOT NULL
     AND proj.budget_max_cents IS NOT NULL
     AND proj.budget_max_cents < cp.min_job_cents THEN
    RETURN false;
  END IF;
  IF cp.max_job_cents IS NOT NULL
     AND proj.budget_min_cents IS NOT NULL
     AND proj.budget_min_cents > cp.max_job_cents THEN
    RETURN false;
  END IF;

  IF cat.requires_verified_credential
     AND NOT EXISTS (
       SELECT 1
       FROM public.contractor_credentials cr
       WHERE cr.contractor_profile_id = cp.id
         AND cr.status = 'VERIFIED'
         AND (cr.expires_at IS NULL OR cr.expires_at >= CURRENT_DATE)
     ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_contractor_fit_score(
  p_project_id uuid,
  p_contractor_profile_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  loc_lat numeric;
  loc_lng numeric;
  cp public.contractor_profiles;
  acct public.profiles;
  score integer := 0;
  zip_exact boolean := false;
  area public.contractor_service_areas;
  miles numeric;
  best_radius integer := 0;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT lat, lng INTO loc_lat, loc_lng
  FROM public.project_private_locations
  WHERE project_id = p_project_id;
  SELECT * INTO cp FROM public.contractor_profiles WHERE id = p_contractor_profile_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT * INTO acct FROM public.profiles WHERE id = cp.profile_id;

  IF EXISTS (
    SELECT 1
    FROM public.contractor_services cs
    WHERE cs.contractor_profile_id = cp.id
      AND cs.category_id = proj.category_id
  ) THEN
    score := score + 30;
  END IF;
  IF acct.account_status = 'ACTIVE' THEN
    score := score + 15;
  END IF;
  IF cp.approval_status = 'APPROVED' THEN
    score := score + 15;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_service_areas a
    WHERE a.contractor_profile_id = cp.id
      AND public.normalize_zip(proj.zip_code) IS NOT NULL
      AND (
        public.normalize_zip(proj.zip_code) = public.normalize_zip(a.center_zip)
        OR public.normalize_zip(proj.zip_code) = ANY (
          SELECT public.normalize_zip(z) FROM unnest(a.zip_codes) AS z
        )
      )
  ) INTO zip_exact;

  IF zip_exact THEN
    score := score + 20;
  ELSE
    FOR area IN
      SELECT *
      FROM public.contractor_service_areas a
      WHERE a.contractor_profile_id = cp.id
        AND a.mode IN ('RADIUS', 'ZIPS_AND_RADIUS')
        AND a.radius_miles IS NOT NULL
    LOOP
      miles := public.haversine_miles(loc_lat, loc_lng, area.center_lat, area.center_lng);
      IF miles IS NOT NULL AND miles <= area.radius_miles THEN
        IF miles <= (area.radius_miles / 2.0) THEN
          best_radius := GREATEST(best_radius, 12);
        ELSE
          best_radius := GREATEST(best_radius, 8);
        END IF;
      END IF;
    END LOOP;
    score := score + best_radius;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contractor_credentials cr
    WHERE cr.contractor_profile_id = cp.id
      AND cr.status = 'VERIFIED'
      AND (cr.expires_at IS NULL OR cr.expires_at >= CURRENT_DATE)
  ) THEN
    score := score + 10;
  END IF;

  score := score + LEAST(GREATEST(coalesce(cp.years_experience, 0), 0), 10);

  IF cp.min_job_cents IS NOT NULL OR cp.max_job_cents IS NOT NULL THEN
    score := score + 5;
  END IF;

  RETURN score;
END;
$$;

CREATE OR REPLACE FUNCTION public.contractor_offer_fairness_penalty(
  p_contractor_profile_id uuid,
  p_category_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lookback integer;
  since timestamptz;
  same_cat integer := 0;
  overall integer := 0;
  open_available integer := 0;
  other integer := 0;
  raw integer;
BEGIN
  lookback := coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'offer_fairness_lookback_days'),
    14
  );
  since := now() - make_interval(days => GREATEST(lookback, 1));

  SELECT count(*) INTO overall
  FROM public.opportunities o
  WHERE o.contractor_profile_id = p_contractor_profile_id
    AND o.available_at >= since;

  SELECT count(*) INTO same_cat
  FROM public.opportunities o
  JOIN public.projects p ON p.id = o.project_id
  WHERE o.contractor_profile_id = p_contractor_profile_id
    AND o.available_at >= since
    AND p.category_id IS NOT DISTINCT FROM p_category_id;

  SELECT count(*) INTO open_available
  FROM public.opportunities o
  WHERE o.contractor_profile_id = p_contractor_profile_id
    AND o.status = 'AVAILABLE'
    AND (o.expires_at IS NULL OR o.expires_at > now());

  other := GREATEST(overall - same_cat, 0);
  raw := (same_cat * 8) + (open_available * 4) + (other * 2);
  RETURN LEAST(24, GREATEST(raw, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.rank_project_matches(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat uuid;
BEGIN
  SELECT category_id INTO cat FROM public.projects WHERE id = p_project_id;
  WITH scored AS (
    SELECT
      m.id,
      m.contractor_profile_id,
      (
        m.score
        - public.contractor_offer_fairness_penalty(m.contractor_profile_id, cat)
      ) AS effective,
      (
        SELECT max(o.available_at)
        FROM public.opportunities o
        WHERE o.contractor_profile_id = m.contractor_profile_id
      ) AS last_offered_at
    FROM public.matches m
    WHERE m.project_id = p_project_id
  ),
  ordered AS (
    SELECT
      id,
      row_number() OVER (
        ORDER BY
          effective DESC,
          last_offered_at ASC NULLS FIRST,
          contractor_profile_id ASC
      ) AS rn
    FROM scored
  )
  UPDATE public.matches m
  SET rank_order = ordered.rn
  FROM ordered
  WHERE m.id = ordered.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fill_project_opportunity_offers(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  cap integer;
  participating integer;
  live_available integer;
  needed integer;
  ttl integer;
  reopened integer := 0;
  inserted integer := 0;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  IF proj.status IN ('DRAFT', 'CANCELLED', 'CONTRACTOR_SELECTED') THEN
    RETURN 0;
  END IF;

  UPDATE public.opportunities
  SET status = 'EXPIRED'
  WHERE project_id = p_project_id
    AND status = 'AVAILABLE'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  cap := coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'max_participating_contractors'),
    3
  );
  SELECT count(*) INTO participating
  FROM public.opportunity_slots
  WHERE project_id = p_project_id;
  IF participating >= cap THEN
    RETURN 0;
  END IF;

  PERFORM public.rank_project_matches(p_project_id);

  SELECT count(*) INTO live_available
  FROM public.opportunities
  WHERE project_id = p_project_id
    AND status = 'AVAILABLE';
  needed := cap - participating - live_available;
  IF needed <= 0 THEN
    RETURN 0;
  END IF;

  ttl := coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'opportunity_ttl_hours'),
    168
  );

  -- Prefer previously offered-then-CLOSED (capacity) over brand-new unused contractors.
  -- Never reopen PASSED / EXPIRED. Unique (project, contractor) still prevents a second row.
  WITH pick AS (
    SELECT o.id
    FROM public.opportunities o
    LEFT JOIN public.matches m
      ON m.project_id = o.project_id
     AND m.contractor_profile_id = o.contractor_profile_id
    WHERE o.project_id = p_project_id
      AND o.status = 'CLOSED'
      AND (o.expires_at IS NULL OR o.expires_at > now())
      AND public.contractor_eligible_for_project(p_project_id, o.contractor_profile_id)
    ORDER BY coalesce(m.rank_order, 2147483647), o.contractor_profile_id
    LIMIT needed
  )
  UPDATE public.opportunities o
  SET status = 'AVAILABLE'
  FROM pick
  WHERE o.id = pick.id;

  GET DIAGNOSTICS reopened = ROW_COUNT;
  needed := needed - reopened;
  inserted := reopened;

  IF needed > 0 THEN
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
      AND public.contractor_eligible_for_project(p_project_id, m.contractor_profile_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.opportunities o
        WHERE o.project_id = p_project_id
          AND o.contractor_profile_id = m.contractor_profile_id
      )
    ORDER BY m.rank_order ASC, m.score DESC, m.contractor_profile_id ASC
    LIMIT needed
    ON CONFLICT (project_id, contractor_profile_id) DO NOTHING;

    GET DIAGNOSTICS needed = ROW_COUNT;
    inserted := inserted + needed;
  END IF;

  IF inserted > 0 AND proj.status IN ('POSTED', 'MATCHING') THEN
    UPDATE public.projects
    SET status = 'CONTRACTORS_RESPONDING'
    WHERE id = p_project_id
      AND status IN ('POSTED', 'MATCHING');
  END IF;

  RETURN inserted;
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
BEGIN
  SELECT * INTO STRICT proj FROM public.projects WHERE id = p_project_id FOR UPDATE;

  INSERT INTO public.matches (project_id, contractor_profile_id, score, reasons)
  SELECT
    proj.id,
    cp.id,
    public.project_contractor_fit_score(proj.id, cp.id),
    jsonb_build_array('category', 'location', 'account', 'approval', 'availability', 'job_size')
  FROM public.contractor_profiles cp
  WHERE public.contractor_eligible_for_project(proj.id, cp.id)
  ON CONFLICT (project_id, contractor_profile_id) DO UPDATE
  SET
    score = EXCLUDED.score,
    reasons = EXCLUDED.reasons
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.project_id = EXCLUDED.project_id
      AND o.contractor_profile_id = EXCLUDED.contractor_profile_id
  );

  PERFORM public.rank_project_matches(p_project_id);
  RETURN public.fill_project_opportunity_offers(p_project_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pass_opportunity(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opp public.opportunities;
  backfilled integer := 0;
BEGIN
  PERFORM public.ppp_set_rpc('pass_opportunity');

  SELECT * INTO opp FROM public.opportunities WHERE id = p_opportunity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity not found';
  END IF;
  IF opp.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your opportunity';
  END IF;

  PERFORM 1 FROM public.projects WHERE id = opp.project_id FOR UPDATE;

  SELECT * INTO opp FROM public.opportunities WHERE id = p_opportunity_id;
  IF opp.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'opportunity is not available';
  END IF;
  IF opp.expires_at IS NOT NULL AND opp.expires_at < now() THEN
    UPDATE public.opportunities
    SET status = 'EXPIRED'
    WHERE id = opp.id AND status = 'AVAILABLE';
    RAISE EXCEPTION 'opportunity has expired';
  END IF;

  UPDATE public.opportunities
  SET status = 'PASSED', responded_at = now()
  WHERE id = opp.id;

  backfilled := public.fill_project_opportunity_offers(opp.project_id);

  PERFORM public.write_audit_log(
    auth.uid(),
    'opportunity.passed',
    'opportunities',
    opp.id,
    jsonb_build_object(
      'project_id', opp.project_id,
      'backfilled', backfilled
    )
  );

  RETURN jsonb_build_object(
    'opportunity_id', opp.id,
    'status', 'PASSED',
    'backfilled', backfilled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.contractor_end_job(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opp public.opportunities;
  proj public.projects;
  contractor_id uuid;
  conn public.project_connections;
  est record;
  active_booking public.bookings;
  connection_status public.project_connection_status;
  opportunity_status public.opportunity_status;
  released_connection_slot boolean := false;
  released_opportunity_slot boolean := false;
  withdrew_estimates integer := 0;
  already_ended boolean := false;
  backfilled integer := 0;
BEGIN
  PERFORM public.ppp_set_rpc('contractor_end_job');
  PERFORM public.expire_stale_connection_reservations();

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  contractor_id := public.current_contractor_profile_id();
  IF contractor_id IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'only a contractor can end a job';
  END IF;

  SELECT * INTO opp FROM public.opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity not found';
  END IF;
  IF opp.contractor_profile_id IS DISTINCT FROM contractor_id
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your opportunity';
  END IF;

  SELECT * INTO proj FROM public.projects WHERE id = opp.project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;

  SELECT * INTO conn
  FROM public.project_connections
  WHERE project_id = opp.project_id
    AND contractor_profile_id = opp.contractor_profile_id
    AND status IN ('INITIATED', 'RESERVED', 'PAYMENT_DISABLED', 'PAID', 'COMPLETED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  SELECT * INTO active_booking
  FROM public.bookings
  WHERE project_id = opp.project_id
    AND contractor_profile_id = opp.contractor_profile_id
    AND status IN ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS')
  ORDER BY created_at DESC
  LIMIT 1;

  IF active_booking.id IS NOT NULL AND (conn.id IS NULL OR conn.status IS DISTINCT FROM 'PAID') THEN
    RAISE EXCEPTION 'this job is already in a booking — complete it from Bookings';
  END IF;

  IF opp.status IN ('PASSED', 'EXPIRED', 'CLOSED')
     AND (conn.id IS NULL OR conn.status IN ('CANCELLED', 'COMPLETED', 'EXPIRED', 'FAILED')) THEN
    already_ended := true;
  END IF;

  -- Hired contractor with a paid connection: complete only. Keep hire + #14.
  IF active_booking.id IS NOT NULL AND conn.status = 'PAID' THEN
    UPDATE public.project_connections
    SET status = 'COMPLETED', completed_at = now(), updated_at = now()
    WHERE id = conn.id;
    PERFORM public.write_connection_event(
      conn.id,
      'connection.completed',
      jsonb_build_object('project_id', opp.project_id, 'via', 'contractor_end_job', 'contact_unlocked', false)
    );
    RETURN jsonb_build_object(
      'opportunity_id', opp.id,
      'opportunity_status', opp.status,
      'connection_id', conn.id,
      'connection_status', 'COMPLETED',
      'released_connection_slot', false,
      'released_opportunity_slot', false,
      'withdrew_estimates', 0,
      'contact_unlocked', false,
      'paid', true,
      'already_ended', false,
      'payments_live', false,
      'charges_live', false,
      'backfilled', 0
    );
  END IF;

  IF already_ended THEN
    RETURN jsonb_build_object(
      'opportunity_id', opp.id,
      'opportunity_status', opp.status,
      'connection_id', conn.id,
      'connection_status', conn.status,
      'released_connection_slot', false,
      'released_opportunity_slot', false,
      'withdrew_estimates', 0,
      'contact_unlocked', false,
      'paid', false,
      'already_ended', true,
      'payments_live', false,
      'charges_live', false,
      'backfilled', 0
    );
  END IF;

  IF opp.status NOT IN ('AVAILABLE', 'ACCEPTED') THEN
    RAISE EXCEPTION 'opportunity cannot be ended';
  END IF;

  -- Unpaid occupying rows: cancel and free the max-3 slot. No #14 row is created or granted.
  IF conn.id IS NOT NULL AND conn.status IN ('INITIATED', 'RESERVED', 'PAYMENT_DISABLED') THEN
    UPDATE public.connection_checkout_sessions
    SET status = 'EXPIRED', updated_at = now()
    WHERE connection_id = conn.id
      AND status = 'OPEN';
    DELETE FROM public.connection_slots WHERE connection_id = conn.id;
    released_connection_slot := true;
    UPDATE public.project_connections
    SET
      status = 'CANCELLED',
      cancelled_at = now(),
      reservation_slot = NULL,
      updated_at = now()
    WHERE id = conn.id;
    connection_status := 'CANCELLED';
    PERFORM public.write_connection_event(
      conn.id,
      'connection.cancelled',
      jsonb_build_object(
        'project_id', opp.project_id,
        'via', 'contractor_end_job',
        'released', true,
        'contact_unlocked', false
      )
    );
  ELSIF conn.id IS NOT NULL AND conn.status = 'PAID' THEN
    UPDATE public.project_connections
    SET status = 'COMPLETED', completed_at = now(), updated_at = now()
    WHERE id = conn.id;
    connection_status := 'COMPLETED';
    PERFORM public.write_connection_event(
      conn.id,
      'connection.completed',
      jsonb_build_object('project_id', opp.project_id, 'via', 'contractor_end_job', 'contact_unlocked', false)
    );
  ELSIF conn.id IS NOT NULL THEN
    connection_status := conn.status;
  END IF;

  -- Withdraw open estimates (history kept). Skip ACCEPTED hire estimates.
  FOR est IN
    SELECT id
    FROM public.estimates
    WHERE opportunity_id = opp.id
      AND contractor_profile_id = opp.contractor_profile_id
      AND status IN ('DRAFT', 'SUBMITTED', 'SENT', 'REVISED', 'VIEWED')
  LOOP
    PERFORM public.withdraw_estimate(est.id);
    withdrew_estimates := withdrew_estimates + 1;
  END LOOP;
  PERFORM public.ppp_set_rpc('contractor_end_job');

  IF opp.status = 'ACCEPTED' THEN
    DELETE FROM public.opportunity_slots WHERE opportunity_id = opp.id;
    released_opportunity_slot := FOUND;
  END IF;

  opportunity_status := CASE
    WHEN conn.id IS NOT NULL AND connection_status = 'COMPLETED' THEN 'CLOSED'::public.opportunity_status
    ELSE 'PASSED'::public.opportunity_status
  END;

  UPDATE public.opportunities
  SET status = opportunity_status, responded_at = coalesce(responded_at, now())
  WHERE id = opp.id;

  -- Free offer/participate capacity goes to the next ranked unused eligible contractor.
  backfilled := public.fill_project_opportunity_offers(opp.project_id);

  PERFORM public.write_audit_log(
    auth.uid(),
    'opportunity.ended',
    'opportunities',
    opp.id,
    jsonb_build_object(
      'project_id', opp.project_id,
      'opportunity_status', opportunity_status,
      'connection_status', connection_status,
      'released_connection_slot', released_connection_slot,
      'released_opportunity_slot', released_opportunity_slot,
      'backfilled', backfilled,
      'contact_unlocked', false
    )
  );

  RETURN jsonb_build_object(
    'opportunity_id', opp.id,
    'opportunity_status', opportunity_status,
    'connection_id', conn.id,
    'connection_status', connection_status,
    'released_connection_slot', released_connection_slot,
    'released_opportunity_slot', released_opportunity_slot,
    'withdrew_estimates', withdrew_estimates,
    'contact_unlocked', false,
    'paid', connection_status = 'COMPLETED',
    'already_ended', false,
    'payments_live', false,
    'charges_live', false,
    'backfilled', backfilled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_eligible_for_project(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_contractor_fit_score(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contractor_offer_fairness_penalty(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rank_project_matches(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fill_project_opportunity_offers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_project(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.pass_opportunity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pass_opportunity(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.contractor_end_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_end_job(uuid) TO authenticated;

COMMENT ON FUNCTION public.contractor_eligible_for_project(uuid, uuid) IS
  'Internal. Hard filters: ACTIVE+APPROVED contractor, accepting_work, category via contractor_services, service area via contractor_service_areas+location_matches, job size, verified credential when required. No public grant.';
COMMENT ON FUNCTION public.project_contractor_fit_score(uuid, uuid) IS
  'Internal fit score (ZIP tighter than radius, verified credential bonus, years). Used with a capped fairness penalty so offers rotate among similar-quality pros.';
COMMENT ON FUNCTION public.contractor_offer_fairness_penalty(uuid, uuid) IS
  'Internal. Caps at 24 so fairness rotates among similar fits without sending jobs to poor matches. Same-category recent offers weigh more than overall.';
COMMENT ON FUNCTION public.rank_project_matches(uuid) IS
  'Internal. Writes matches.rank_order. Effective score DESC, never/oldest last offered first, contractor id ASC.';
COMMENT ON FUNCTION public.fill_project_opportunity_offers(uuid) IS
  'Internal. Creates at most (3 - participating - live AVAILABLE) new AVAILABLE opportunities from the ranked unused queue. Reopens capacity-CLOSED first. Exhausted queue leaves the slot empty until match_project is re-run.';
COMMENT ON FUNCTION public.match_project(uuid) IS
  'Internal. Refreshes the full eligible match queue (scores + rank_order) and offers only up to 3 live AVAILABLE opportunities. ON CONFLICT updates unused match scores; never duplicates opportunities. Historical estimates/jobs are kept.';
COMMENT ON FUNCTION public.pass_opportunity(uuid) IS
  'Contractor skip: AVAILABLE → PASSED (cannot reclaim). Immediately backfills one AVAILABLE offer for the next ranked unused eligible contractor when capacity remains. Does not grant #14 contact.';
COMMENT ON FUNCTION public.contractor_end_job(uuid) IS
  'Contractor soft-end: AVAILABLE/ACCEPTED → PASSED (or CLOSED after paid complete). Unpaid INITIATED/RESERVED/PAYMENT_DISABLED → CANCELLED and connection_slots deleted. PAID → COMPLETED (slot stays occupied). Backfills the open offer position from the ranked queue. Never grants #14. Never flips payment flags.';
