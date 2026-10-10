-- Unpaid contractors (signup_fee_status UNPAID while signup_fee_enabled) do not
-- receive public directory listing, new match offers, or Connection Fee reservations.
-- Does not change the $9.99 or $4.99 amounts, Stripe Price IDs, webhooks, payment
-- rows, contractor_fee_bps, matching caps, hiring rules, or contact-unlock rules
-- beyond the activation check below.
-- Does not flip payments_live, charges_live, signup_fee_enabled, or
-- connection_fee_checkout_enabled. Does not delete ACCEPTED opportunities or
-- opportunity_slots / connection_slots.
--
-- Filename sorts after 20261012000002_radius_service_matching.sql. A clock
-- timestamp of 20261010 would be overwritten by that later directory definition.


CREATE OR REPLACE FUNCTION public.contractor_is_directory_listed(p_contractor_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_profiles cp
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE cp.id = p_contractor_profile_id
      AND cp.approval_status = 'APPROVED'
      AND p.account_status = 'ACTIVE'
      AND public.signup_fee_is_satisfied(cp.profile_id)
  );
$$;

CREATE OR REPLACE VIEW public.contractor_public_profiles
WITH (security_invoker = false)
AS
SELECT
  cp.id,
  public.anonymized_pro_label(cp.primary_trade, NULL) AS display_label,
  cp.primary_trade,
  cp.years_experience,
  public.public_safe_blurb(cp.headline, cp.bio) AS short_description,
  public.public_safe_about(cp.bio, cp.headline) AS about,
  cp.accepting_work,
  cp.created_at,
  coalesce(
    public.contractor_public_service_label(cp.id),
    public.general_service_area(cp.service_area)
  ) AS service_area
FROM public.contractor_profiles cp
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND public.signup_fee_is_satisfied(cp.profile_id);
CREATE OR REPLACE VIEW public.contractor_public_areas
WITH (security_invoker = false)
AS
SELECT
  a.id,
  a.contractor_profile_id,
  coalesce(
    public.contractor_public_service_label(a.contractor_profile_id),
    public.general_service_area(cp.service_area)
  ) AS label
FROM public.contractor_service_areas a
JOIN public.contractor_profiles cp ON cp.id = a.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND public.signup_fee_is_satisfied(cp.profile_id);
CREATE OR REPLACE VIEW public.contractor_public_services
WITH (security_invoker = false)
AS
SELECT
  cs.id,
  cs.contractor_profile_id,
  cs.category_id,
  sc.slug AS category_slug,
  sc.name AS category_name
FROM public.contractor_services cs
JOIN public.contractor_profiles cp ON cp.id = cs.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
JOIN public.service_categories sc ON sc.id = cs.category_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND public.signup_fee_is_satisfied(cp.profile_id);
CREATE OR REPLACE VIEW public.contractor_public_portfolio
WITH (security_invoker = false)
AS
SELECT
  pf.id,
  pf.contractor_profile_id,
  pf.sort_order,
  public.public_safe_portfolio_caption(pf.title, pf.description) AS caption
FROM public.contractor_portfolio pf
JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE pf.privacy_state = 'PUBLIC_SAFE'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND public.signup_fee_is_satisfied(cp.profile_id)
  AND NOT public.text_contains_pre_hire_contact(pf.title)
  AND NOT public.text_contains_pre_hire_contact(coalesce(pf.description, ''));
CREATE OR REPLACE VIEW public.contractor_public_ratings
WITH (security_invoker = false)
AS
SELECT
  r.contractor_profile_id,
  round(avg(r.rating)::numeric, 1) AS rating_average,
  count(*)::integer AS rating_count
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND public.signup_fee_is_satisfied(cp.profile_id)
GROUP BY r.contractor_profile_id;
CREATE OR REPLACE VIEW public.contractor_public_reviews
WITH (security_invoker = false)
AS
SELECT
  r.id,
  r.contractor_profile_id,
  r.rating,
  CASE
    WHEN r.body IS NULL OR btrim(r.body) = '' OR public.text_contains_pre_hire_contact(r.body)
      THEN 'Verified PPP review.'
    WHEN char_length(regexp_replace(btrim(r.body), '\s+', ' ', 'g')) > 280
      THEN left(regexp_replace(btrim(r.body), '\s+', ' ', 'g'), 277) || '…'
    ELSE regexp_replace(btrim(r.body), '\s+', ' ', 'g')
  END AS body
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND public.signup_fee_is_satisfied(cp.profile_id);
CREATE OR REPLACE VIEW public.contractor_verified_credential_badges
WITH (security_invoker = false)
AS
SELECT
  cr.id,
  cr.contractor_profile_id,
  cr.kind,
  public.generic_credential_badge_label(cr.kind) AS label,
  cr.status,
  cr.expires_at
FROM public.contractor_credentials cr
JOIN public.contractor_profiles cp ON cp.id = cr.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cr.status = 'VERIFIED'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND public.signup_fee_is_satisfied(cp.profile_id);

CREATE OR REPLACE FUNCTION public.list_public_directory_contractors()
RETURNS TABLE (
  id uuid,
  display_label text,
  primary_trade text,
  categories text[],
  service_area text,
  years_experience integer,
  rating_average numeric,
  rating_count integer,
  badges jsonb,
  short_description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.id,
    public.anonymized_pro_label(
      cp.primary_trade,
      coalesce((
        SELECT array_agg(sc.name ORDER BY sc.name)
        FROM public.contractor_services cs
        JOIN public.service_categories sc ON sc.id = cs.category_id
        WHERE cs.contractor_profile_id = cp.id
      ), '{}'::text[])
    ),
    cp.primary_trade,
    coalesce((
      SELECT array_agg(sc.name ORDER BY sc.name)
      FROM public.contractor_services cs
      JOIN public.service_categories sc ON sc.id = cs.category_id
      WHERE cs.contractor_profile_id = cp.id
    ), '{}'::text[]),
    coalesce(
      public.contractor_public_service_label(cp.id),
      public.general_service_area(cp.service_area)
    ),
    cp.years_experience,
    r.rating_average,
    coalesce(r.rating_count, 0),
    (
      jsonb_build_array(jsonb_build_object('kind', 'APPROVED', 'label', 'Approved Pro'))
      || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'kind', cr.kind,
          'label', public.generic_credential_badge_label(cr.kind)
        ) ORDER BY cr.kind)
        FROM public.contractor_credentials cr
        WHERE cr.contractor_profile_id = cp.id
          AND cr.status = 'VERIFIED'
      ), '[]'::jsonb)
    ),
    public.public_safe_blurb(cp.headline, cp.bio)
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  LEFT JOIN public.contractor_public_ratings r ON r.contractor_profile_id = cp.id
  WHERE cp.approval_status = 'APPROVED'
    AND p.account_status = 'ACTIVE'
    AND public.signup_fee_is_satisfied(cp.profile_id)
  ORDER BY 2, cp.id;
$$;

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
  IF NOT public.signup_fee_is_satisfied(acct.id) THEN RETURN false; END IF;
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

  -- Live AVAILABLE offers whose contractor is no longer eligible (including an
  -- unpaid activation fee) must not hold one of the offer positions until TTL.
  -- CLOSED can be reopened by the query below once they are eligible again, so
  -- a later payment is not stuck behind the unique (project, contractor) row.
  -- EXPIRED and PASSED stay unrestorable. ACCEPTED rows and opportunity_slots
  -- are not updated here.
  UPDATE public.opportunities o
  SET status = 'CLOSED'
  WHERE o.project_id = p_project_id
    AND o.status = 'AVAILABLE'
    AND NOT public.contractor_eligible_for_project(p_project_id, o.contractor_profile_id);

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


DROP TRIGGER IF EXISTS profiles_match_projects_on_account_status ON public.profiles;
CREATE TRIGGER profiles_match_projects_on_account_status
  AFTER UPDATE OF account_status, signup_fee_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.call_match_project_after_eligibility_change();


CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_project_connections()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Webhook fulfillment updates an already-RESERVED row, including RESERVED → PAID.
    -- Raising here rolls back the paid event and Stripe retries the webhook forever.
    -- Entry into RESERVED is checked below and in reserve_connection_checkout.
    IF OLD.status = 'RESERVED' THEN
      RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM 'RESERVED' AND NEW.status IS DISTINCT FROM 'PAID' THEN
      RETURN NEW;
    END IF;
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT profile_id INTO v_profile_id
  FROM public.contractor_profiles
  WHERE id = NEW.contractor_profile_id;
  PERFORM public.assert_signup_fee_paid(v_profile_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_connections_require_signup_fee ON public.project_connections;
CREATE TRIGGER project_connections_require_signup_fee
  BEFORE INSERT OR UPDATE ON public.project_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_fee_on_project_connections();

CREATE OR REPLACE FUNCTION public.reserve_connection_checkout(
  p_project_id uuid,
  p_auth_user_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  contractor_id uuid;
  existing public.project_connections;
  occupied integer;
  slot integer;
  conn public.project_connections;
  ttl interval;
  account public.account_status;
  approval public.approval_status;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('reserve_connection_checkout');
  PERFORM public.expire_stale_connection_reservations();

  IF NOT public.connection_fee_checkout_enabled() THEN
    RAISE EXCEPTION 'connection fee checkout is disabled';
  END IF;
  -- Both TEST (stripe_test_mode=1) and LIVE (0) may reserve. Kill switch is connection_fee_checkout_enabled.
  -- Stripe key/Price/livemode matching is enforced at checkout attach, webhook, reconcile, and fulfill.
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT p.account_status INTO account FROM public.profiles p WHERE p.id = p_auth_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;
  IF account IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;

  SELECT cp.id, cp.approval_status
    INTO contractor_id, approval
  FROM public.contractor_profiles cp
  WHERE cp.profile_id = p_auth_user_id
  LIMIT 1;
  IF contractor_id IS NULL THEN
    RAISE EXCEPTION 'only a contractor can request a connection';
  END IF;
  IF approval IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;

  PERFORM public.assert_signup_fee_paid(p_auth_user_id);

  ttl := make_interval(secs => public.connection_reservation_ttl_seconds());

  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id = p_auth_user_id THEN
    RAISE EXCEPTION 'customers do not pay a Connection Fee';
  END IF;
  IF proj.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'project is cancelled';
  END IF;
  IF proj.accepting_connections IS NOT TRUE THEN
    RAISE EXCEPTION 'customer stopped new connections';
  END IF;

  -- FLAT-499: matched opportunity may be AVAILABLE or ACCEPTED (Participate is optional).
  -- Unmatched contractors and PASSED / EXPIRED / CLOSED opportunities cannot reserve.
  IF NOT EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.project_id = p_project_id
      AND o.contractor_profile_id = contractor_id
      AND o.status IN ('AVAILABLE', 'ACCEPTED')
  ) THEN
    RAISE EXCEPTION 'ineligible contractor';
  END IF;

  SELECT * INTO existing
  FROM public.project_connections
  WHERE project_id = p_project_id
    AND contractor_profile_id = contractor_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF existing.status IN ('PAID', 'COMPLETED') THEN
      RAISE EXCEPTION 'duplicate connection';
    END IF;
    -- Unpaid payments-off request. Checkout is on, so resume this same slot.
    -- Do not grant contact. Fee stays 499. payments_live and charges_live stay false.
    IF existing.status = 'PAYMENT_DISABLED' THEN
      UPDATE public.project_connections
      SET
        status = 'RESERVED',
        fee_cents = 499,
        reserved_at = now(),
        reserved_until = now() + ttl,
        needs_refund = false,
        refund_reason = NULL,
        stripe_checkout_session_id = NULL,
        payments_live = false,
        charges_live = false,
        updated_at = now()
      WHERE id = existing.id
      RETURNING * INTO conn;

      IF NOT EXISTS (
        SELECT 1 FROM public.connection_slots WHERE connection_id = conn.id
      ) THEN
        RAISE EXCEPTION 'connections full';
      END IF;

      PERFORM public.write_connection_event(
        conn.id,
        'connection.reserved',
        jsonb_build_object(
          'project_id', p_project_id,
          'slot', conn.reservation_slot,
          'fee_cents', 499,
          'status', 'RESERVED',
          'resumed_from', 'PAYMENT_DISABLED',
          'contact_unlocked', false
        )
      );

      RETURN jsonb_build_object(
        'connection_id', conn.id,
        'status', conn.status,
        'fee_cents', 499,
        'reservation_slot', conn.reservation_slot,
        'reserved_until', conn.reserved_until,
        'contact_unlocked', false,
        'paid', false,
        'idempotent', false,
        'payments_live', false,
        'charges_live', false
      );
    END IF;
    IF existing.status = 'RESERVED'
       AND (existing.reserved_until IS NULL OR existing.reserved_until > now()) THEN
      RETURN jsonb_build_object(
        'connection_id', existing.id,
        'status', existing.status,
        'fee_cents', 499,
        'reservation_slot', existing.reservation_slot,
        'reserved_until', existing.reserved_until,
        'contact_unlocked', false,
        'paid', false,
        'idempotent', true,
        'payments_live', false,
        'charges_live', false
      );
    END IF;
  END IF;

  occupied := public.project_connection_occupancy(p_project_id);
  IF occupied >= 3 THEN
    RAISE EXCEPTION 'connections full';
  END IF;

  SELECT s INTO slot
  FROM generate_series(1, 3) AS s
  WHERE s NOT IN (
    SELECT slot_number FROM public.connection_slots WHERE project_id = p_project_id
  )
  ORDER BY s
  LIMIT 1;
  IF slot IS NULL THEN
    RAISE EXCEPTION 'connections full';
  END IF;

  IF existing.id IS NOT NULL AND existing.status IN ('EXPIRED', 'FAILED', 'CANCELLED') THEN
    UPDATE public.project_connections
    SET
      status = 'RESERVED',
      fee_cents = 499,
      reservation_slot = slot,
      reserved_at = now(),
      reserved_until = now() + ttl,
      needs_refund = false,
      refund_reason = NULL,
      stripe_checkout_session_id = NULL,
      updated_at = now()
    WHERE id = existing.id
    RETURNING * INTO conn;
  ELSE
    BEGIN
      INSERT INTO public.project_connections (
        project_id,
        contractor_profile_id,
        customer_id,
        status,
        fee_cents,
        idempotency_key,
        reservation_slot,
        payments_live,
        charges_live,
        reserved_at,
        reserved_until
      ) VALUES (
        p_project_id,
        contractor_id,
        proj.customer_id,
        'RESERVED',
        499,
        nullif(btrim(coalesce(p_idempotency_key, '')), ''),
        slot,
        false,
        false,
        now(),
        now() + ttl
      )
      RETURNING * INTO conn;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'duplicate connection';
    END;
  END IF;

  BEGIN
    INSERT INTO public.connection_slots (
      project_id, slot_number, connection_id, contractor_profile_id
    ) VALUES (
      p_project_id, slot, conn.id, contractor_id
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'connections full';
  END;

  -- AVAILABLE → RESERVED only. No #14 row until trusted fulfill. Missing = no access.
  PERFORM public.write_connection_event(
    conn.id,
    'connection.reserved',
    jsonb_build_object(
      'project_id', p_project_id,
      'slot', slot,
      'fee_cents', 499,
      'status', 'RESERVED',
      'contact_unlocked', false
    )
  );

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'status', conn.status,
    'fee_cents', 499,
    'reservation_slot', slot,
    'reserved_until', conn.reserved_until,
    'contact_unlocked', false,
    'paid', false,
    'idempotent', false,
    'payments_live', false,
    'charges_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_connection_fee_checkout(
  p_stripe_checkout_session_id text,
  p_processor_event_id text,
  p_amount_cents integer,
  p_currency text,
  p_price_id text,
  p_payment_status text,
  p_livemode boolean,
  p_connection_id uuid,
  p_project_id uuid,
  p_contractor_profile_id uuid,
  p_stripe_payment_intent_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn public.project_connections;
  access public.booking_contact_access;
  sess public.connection_checkout_sessions;
  event_row jsonb;
  grant_row jsonb;
  unlocked boolean;
  intent_id text;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('fulfill_connection_fee_checkout');

  IF NOT public.connection_fee_checkout_enabled() THEN
    RAISE EXCEPTION 'connection fee checkout is disabled';
  END IF;
  PERFORM public.assert_connection_stripe_environment(p_livemode, p_stripe_checkout_session_id);
  IF p_amount_cents IS DISTINCT FROM 499 THEN
    RAISE EXCEPTION 'connection fee is server-authoritative and must be 499 cents';
  END IF;
  IF lower(coalesce(p_currency, '')) IS DISTINCT FROM 'usd' THEN
    RAISE EXCEPTION 'connection fee currency must be usd';
  END IF;
  IF p_price_id IS NULL OR left(btrim(p_price_id), 6) IS DISTINCT FROM 'price_' THEN
    RAISE EXCEPTION 'wrong connection Price ID';
  END IF;
  IF btrim(p_price_id) IS NOT DISTINCT FROM public.stripe_activation_price_id() THEN
    RAISE EXCEPTION 'wrong connection Price ID';
  END IF;
  IF p_payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'unpaid';
  END IF;

  intent_id := public.normalized_stripe_payment_intent_id(p_stripe_payment_intent_id);

  -- Fulfillment source stays on processor_event_id / fulfillment_reference, never in the PI column.
  event_row := public.record_connection_checkout_event(
    p_processor_event_id,
    'fulfill',
    p_stripe_checkout_session_id,
    jsonb_build_object('connection_id', p_connection_id, 'amount_cents', 499)
  );

  SELECT * INTO conn FROM public.project_connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection not found';
  END IF;
  IF conn.project_id IS DISTINCT FROM p_project_id
     OR conn.contractor_profile_id IS DISTINCT FROM p_contractor_profile_id THEN
    RAISE EXCEPTION 'mismatched metadata';
  END IF;

  SELECT * INTO access
  FROM public.booking_contact_access
  WHERE connection_id = conn.id
  FOR UPDATE;

  SELECT * INTO sess
  FROM public.connection_checkout_sessions
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
  FOR UPDATE;

  IF sess.id IS NOT NULL THEN
    IF sess.price_id IS DISTINCT FROM btrim(p_price_id) THEN
      RAISE EXCEPTION 'wrong connection Price ID';
    END IF;
    IF sess.livemode IS DISTINCT FROM p_livemode THEN
      RAISE EXCEPTION 'checkout session livemode does not match stripe_test_mode';
    END IF;
  END IF;

  IF conn.status IN ('PAID', 'COMPLETED') THEN
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET
        status = 'CONSUMED',
        payment_status = 'paid',
        consumed_at = coalesce(consumed_at, now()),
        fulfilled_at = coalesce(fulfilled_at, now()),
        stripe_payment_intent_id = coalesce(
          public.normalized_stripe_payment_intent_id(stripe_payment_intent_id),
          intent_id
        ),
        fulfillment_reference = coalesce(
          nullif(btrim(fulfillment_reference), ''),
          nullif(btrim(p_processor_event_id), '')
        )
      WHERE id = sess.id;
    END IF;
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', coalesce(access.status IN ('UNLOCKED', 'ADMIN_OVERRIDE') AND access.revoked_at IS NULL, false),
      'paid', true,
      'idempotent', true,
      'duplicate_event', (event_row->>'duplicate')::boolean,
      'payments_live', false,
      'charges_live', false
    );
  END IF;

  IF conn.status IS DISTINCT FROM 'RESERVED'
     OR (conn.reserved_until IS NOT NULL AND conn.reserved_until < now())
     OR NOT EXISTS (SELECT 1 FROM public.connection_slots WHERE connection_id = conn.id) THEN
    UPDATE public.project_connections
    SET needs_refund = true, refund_reason = 'paid_but_reservation_not_active', updated_at = now()
    WHERE id = conn.id;
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET status = 'NEEDS_REFUND', needs_refund = true, refund_reason = 'paid_but_reservation_not_active', payment_status = 'paid'
      WHERE id = sess.id;
    END IF;
    PERFORM public.write_connection_event(
      conn.id,
      'connection.needs_refund',
      jsonb_build_object('reason', 'paid_but_reservation_not_active', 'checkout_session_id', p_stripe_checkout_session_id)
    );
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', false,
      'paid', false,
      'needs_refund', true,
      'reason', 'paid_but_reservation_not_active',
      'payments_live', false,
      'charges_live', false
    );
  END IF;

  -- $4.99 was collected while activation is still unpaid. Do not grant contact.
  -- Return normally (same shape as paid_but_reservation_not_active) so the webhook
  -- answers 200 and Stripe does not retry. The checkout event row already recorded
  -- above stays committed. Status stays RESERVED; needs_refund carries the reason.
  IF NOT public.signup_fee_is_satisfied((
    SELECT cp.profile_id
    FROM public.contractor_profiles cp
    WHERE cp.id = conn.contractor_profile_id
  )) THEN
    UPDATE public.project_connections
    SET needs_refund = true, refund_reason = 'activation_unpaid', updated_at = now()
    WHERE id = conn.id;
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET status = 'NEEDS_REFUND', needs_refund = true, refund_reason = 'activation_unpaid', payment_status = 'paid'
      WHERE id = sess.id;
    END IF;
    PERFORM public.write_connection_event(
      conn.id,
      'connection.needs_refund',
      jsonb_build_object('reason', 'activation_unpaid', 'checkout_session_id', p_stripe_checkout_session_id)
    );
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', false,
      'paid', false,
      'needs_refund', true,
      'reason', 'activation_unpaid',
      'payments_live', false,
      'charges_live', false
    );
  END IF;

  -- Grant the #14 entitlement FIRST, then mark the purchase PAID.
  grant_row := public.grant_booking_contact_access_from_connection_fee(conn.id, 'connection_fee_payment');
  IF coalesce((grant_row->>'contact_unlocked')::boolean, false) IS NOT TRUE THEN
    UPDATE public.project_connections
    SET needs_refund = true, refund_reason = 'paid_but_entitlement_failed', updated_at = now()
    WHERE id = conn.id;
    IF sess.id IS NOT NULL THEN
      UPDATE public.connection_checkout_sessions
      SET status = 'NEEDS_REFUND', needs_refund = true, refund_reason = 'paid_but_entitlement_failed', payment_status = 'paid'
      WHERE id = sess.id;
    END IF;
    RETURN jsonb_build_object(
      'connection_id', conn.id,
      'status', conn.status,
      'contact_unlocked', false,
      'paid', false,
      'needs_refund', true,
      'reason', 'paid_but_entitlement_failed',
      'payments_live', false,
      'charges_live', false
    );
  END IF;

  UPDATE public.project_connections
  SET
    status = 'PAID',
    paid_at = now(),
    completed_at = now(),
    needs_refund = false,
    stripe_checkout_session_id = p_stripe_checkout_session_id,
    updated_at = now()
  WHERE id = conn.id
  RETURNING * INTO conn;

  IF sess.id IS NOT NULL THEN
    UPDATE public.connection_checkout_sessions
    SET
      status = 'CONSUMED',
      payment_status = 'paid',
      stripe_payment_intent_id = coalesce(
        public.normalized_stripe_payment_intent_id(stripe_payment_intent_id),
        intent_id
      ),
      fulfillment_reference = coalesce(
        nullif(btrim(fulfillment_reference), ''),
        nullif(btrim(p_processor_event_id), '')
      ),
      consumed_at = now(),
      fulfilled_at = now()
    WHERE id = sess.id;
  END IF;

  PERFORM public.write_connection_event(
    conn.id,
    'connection.paid',
    jsonb_build_object('fee_cents', 499, 'contact_unlocked', true, 'checkout_session_id', p_stripe_checkout_session_id)
  );

  SELECT status IN ('UNLOCKED', 'ADMIN_OVERRIDE') AND revoked_at IS NULL INTO unlocked
  FROM public.booking_contact_access
  WHERE connection_id = conn.id;

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'status', conn.status,
    'contact_unlocked', coalesce(unlocked, false),
    'paid', true,
    'idempotent', false,
    'duplicate_event', (event_row->>'duplicate')::boolean,
    'payments_live', false,
    'charges_live', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_is_directory_listed(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.list_public_directory_contractors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_directory_contractors() TO anon, authenticated;

GRANT SELECT ON public.contractor_public_profiles TO anon, authenticated;
GRANT SELECT ON public.contractor_public_services TO anon, authenticated;
GRANT SELECT ON public.contractor_public_areas TO anon, authenticated;
GRANT SELECT ON public.contractor_public_portfolio TO anon, authenticated;
GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;
GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;
GRANT SELECT ON public.contractor_verified_credential_badges TO anon, authenticated;

REVOKE ALL ON FUNCTION public.contractor_eligible_for_project(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fill_project_opportunity_offers(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.contractor_is_directory_listed(uuid) IS
  'True only for APPROVED contractors whose account_status is ACTIVE and whose signup fee is satisfied. Used by public directory views.';

COMMENT ON FUNCTION public.reserve_connection_checkout(uuid, uuid, text) IS
  'Service-role only. Matched contractor with AVAILABLE or ACCEPTED opportunity may reserve after assert_signup_fee_paid. Connection status AVAILABLE → RESERVED (pending payment) with TTL. Resume from PAYMENT_DISABLED, EXPIRED, FAILED, or CANCELLED also requires the activation fee. Max 3 race-safe slots. Client cannot set price. Does not grant #14 contact. Allowed in TEST or LIVE when connection_fee_checkout_enabled=1.';

COMMENT ON FUNCTION public.fulfill_connection_fee_checkout(text, text, integer, text, text, text, boolean, uuid, uuid, uuid, text) IS
  'Service-role only. Unlocks #14 booking_contact_access after Stripe verification of Price ID + 499 USD whose livemode matches stripe_test_mode. If the contractor signup fee is not satisfied, sets needs_refund reason activation_unpaid and does not grant contact or raise. stripe_payment_intent_id stores pi_... only. Never trust success URLs. TEST events cannot fulfill LIVE transactions and vice versa.';

COMMENT ON FUNCTION public.fill_project_opportunity_offers(uuid) IS
  'Internal. Creates at most (3 - participating - live AVAILABLE) new AVAILABLE opportunities from the ranked unused queue. Closes AVAILABLE offers whose contractor is no longer eligible so an unpaid activation does not hold a slot until TTL; those CLOSED rows can be reopened. Reopens capacity-CLOSED first. Does not delete ACCEPTED opportunities or opportunity_slots. Exhausted queue leaves the slot empty until match_project is re-run.';
