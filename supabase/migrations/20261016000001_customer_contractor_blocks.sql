-- A customer can keep a pro off future projects.
-- One row per customer/contractor pair. Reason is LOW_RATING (a customer
-- booking review of 3 stars or less) or CUSTOMER_REQUEST (the customer asked
-- not to be matched again).
--
-- Once a row exists it stays until that customer unblocks it or an admin
-- deletes it. Editing a review up to 4 or 5 stars does not delete a
-- LOW_RATING row. A later low rating does not replace a CUSTOMER_REQUEST row.
-- Unblocking sticks until the next customer review insert or edit at 3 stars
-- or less, which inserts LOW_RATING again.
--
-- This file does not read or copy existing booking_reviews. There is no
-- backfill. The low-rating trigger runs only for reviews created or edited
-- after this migration.
--
-- Open AVAILABLE offers on the customer's other open projects are set to
-- CLOSED. The project the review, booking, or estimate came from is left
-- alone. ACCEPTED, PASSED, and EXPIRED offers stay as they are. Bookings,
-- estimates, project_connections, payments, fee amounts, and contact-unlock
-- rows are not updated. No notification is enqueued.
--
-- contractor_eligible_for_project keeps every previous rule, including
-- signup_fee_is_satisfied, and adds the block check last.
-- match_project, fill_project_opportunity_offers, and the signup_fee_status
-- rematch trigger already call that function, so they pick up the check
-- without a second matcher.
--
-- Not applied to production by this change.
--
-- hire_again_contractors is replaced from 20261013000004_public_pro_labels.sql.
-- Its label CASE stays exactly as that migration left it. The only added
-- predicate is NOT EXISTS on customer_contractor_blocks.

CREATE TYPE public.customer_contractor_block_reason AS ENUM (
  'LOW_RATING',
  'CUSTOMER_REQUEST'
);

CREATE TABLE public.customer_contractor_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  reason public.customer_contractor_block_reason NOT NULL,
  source_review_id uuid REFERENCES public.booking_reviews (id) ON DELETE SET NULL,
  source_booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_contractor_blocks_pair UNIQUE (customer_profile_id, contractor_profile_id)
);

COMMENT ON TABLE public.customer_contractor_blocks IS
  'One block per customer and contractor. Customers can read their own rows. Contractors cannot see that they were blocked or by whom. Admins can read and delete. Inserts and customer deletes go through SECURITY DEFINER functions and the review trigger.';

CREATE INDEX customer_contractor_blocks_contractor_idx
  ON public.customer_contractor_blocks (contractor_profile_id);

ALTER TABLE public.customer_contractor_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_contractor_blocks_select_customer_or_admin ON public.customer_contractor_blocks;
CREATE POLICY customer_contractor_blocks_select_customer_or_admin
  ON public.customer_contractor_blocks
  FOR SELECT
  TO authenticated
  USING (customer_profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS customer_contractor_blocks_delete_admin ON public.customer_contractor_blocks;
CREATE POLICY customer_contractor_blocks_delete_admin
  ON public.customer_contractor_blocks
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.customer_contractor_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.customer_contractor_blocks TO authenticated;

CREATE OR REPLACE FUNCTION public.close_blocked_contractor_open_offers(
  p_customer_profile_id uuid,
  p_contractor_profile_id uuid,
  p_except_project_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer := 0;
BEGIN
  -- AVAILABLE only. The source project is skipped so the job the customer
  -- is looking at stays put. Paid connections and bookings are not in this update.
  UPDATE public.opportunities o
  SET status = 'CLOSED'
  FROM public.projects p
  WHERE o.project_id = p.id
    AND p.customer_id = p_customer_profile_id
    AND o.contractor_profile_id = p_contractor_profile_id
    AND o.status = 'AVAILABLE'
    AND p.status IN ('POSTED', 'MATCHING', 'CONTRACTORS_RESPONDING', 'ESTIMATES_AVAILABLE')
    AND (p_except_project_id IS NULL OR p.id IS DISTINCT FROM p_except_project_id);

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.close_blocked_contractor_open_offers(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_customer_low_rating_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  IF NEW.reviewer_role IS DISTINCT FROM 'CUSTOMER' OR NEW.rating IS NULL OR NEW.rating > 3 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customer_contractor_blocks (
    customer_profile_id,
    contractor_profile_id,
    reason,
    source_review_id,
    source_booking_id
  ) VALUES (
    NEW.customer_id,
    NEW.contractor_profile_id,
    'LOW_RATING',
    NEW.id,
    NEW.booking_id
  )
  ON CONFLICT (customer_profile_id, contractor_profile_id) DO NOTHING;

  SELECT b.project_id INTO v_project_id
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;

  PERFORM public.close_blocked_contractor_open_offers(
    NEW.customer_id,
    NEW.contractor_profile_id,
    v_project_id
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_customer_low_rating_block() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS booking_reviews_low_rating_block ON public.booking_reviews;
CREATE TRIGGER booking_reviews_low_rating_block
  AFTER INSERT OR UPDATE OF rating, reviewer_role ON public.booking_reviews
  FOR EACH ROW
  WHEN (NEW.reviewer_role = 'CUSTOMER' AND NEW.rating <= 3)
  EXECUTE FUNCTION public.apply_customer_low_rating_block();

CREATE OR REPLACE FUNCTION public.block_contractor_for_customer(
  p_contractor_profile_id uuid,
  p_booking_id uuid DEFAULT NULL,
  p_estimate_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_except uuid;
  v_estimate_project uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  IF p_contractor_profile_id IS NULL THEN
    RAISE EXCEPTION 'contractor is required';
  END IF;
  IF p_booking_id IS NULL AND p_estimate_id IS NULL THEN
    RAISE EXCEPTION 'a booking or estimate is required';
  END IF;

  IF p_booking_id IS NOT NULL THEN
    SELECT b.project_id INTO v_except
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.customer_id = auth.uid()
      AND b.contractor_profile_id = p_contractor_profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'booking not found';
    END IF;
  END IF;

  IF p_estimate_id IS NOT NULL THEN
    SELECT e.project_id INTO v_estimate_project
    FROM public.estimates e
    JOIN public.projects p ON p.id = e.project_id
    WHERE e.id = p_estimate_id
      AND e.contractor_profile_id = p_contractor_profile_id
      AND p.customer_id = auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'estimate not found';
    END IF;
    IF v_except IS NULL THEN
      v_except := v_estimate_project;
    END IF;
  END IF;

  INSERT INTO public.customer_contractor_blocks (
    customer_profile_id,
    contractor_profile_id,
    reason,
    source_booking_id
  ) VALUES (
    auth.uid(),
    p_contractor_profile_id,
    'CUSTOMER_REQUEST',
    p_booking_id
  )
  ON CONFLICT (customer_profile_id, contractor_profile_id) DO NOTHING;

  PERFORM public.close_blocked_contractor_open_offers(
    auth.uid(),
    p_contractor_profile_id,
    v_except
  );

  RETURN jsonb_build_object(
    'blocked', true,
    'contractor_profile_id', p_contractor_profile_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.block_contractor_for_customer(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_contractor_for_customer(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_contractor_for_customer(p_contractor_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;

  DELETE FROM public.customer_contractor_blocks b
  WHERE b.customer_profile_id = auth.uid()
    AND b.contractor_profile_id = p_contractor_profile_id;

  GET DIAGNOSTICS removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'blocked', false,
    'removed', removed > 0,
    'contractor_profile_id', p_contractor_profile_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unblock_contractor_for_customer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unblock_contractor_for_customer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_has_blocked_contractor(p_contractor_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.customer_contractor_blocks b
      WHERE b.customer_profile_id = auth.uid()
        AND b.contractor_profile_id = p_contractor_profile_id
    );
$$;

REVOKE ALL ON FUNCTION public.customer_has_blocked_contractor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_has_blocked_contractor(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_contractor_blocks()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'contractor_profile_id', b.contractor_profile_id,
        'display_label', CASE
          WHEN paid.connected AND nullif(btrim(cp.business_name), '') IS NOT NULL THEN btrim(cp.business_name)
          ELSE public.anonymized_pro_label(cp.primary_trade, NULL)
        END,
        'uses_business_name', paid.connected AND nullif(btrim(cp.business_name), '') IS NOT NULL,
        'reason', b.reason,
        'created_at', b.created_at
      )
      ORDER BY b.created_at DESC, b.id
    ),
    '[]'::jsonb
  )
  FROM public.customer_contractor_blocks b
  JOIN public.contractor_profiles cp ON cp.id = b.contractor_profile_id
  CROSS JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1
      FROM public.project_connections pc
      WHERE pc.customer_id = auth.uid()
        AND pc.contractor_profile_id = b.contractor_profile_id
        AND pc.status IN ('PAID', 'COMPLETED')
    ) AS connected
  ) paid
  WHERE b.customer_profile_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.list_my_contractor_blocks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_contractor_blocks() TO authenticated;

COMMENT ON FUNCTION public.list_my_contractor_blocks() IS
  'The signed-in customer''s blocks. display_label is the business name only when that pair has a PAID or COMPLETED project connection. Otherwise it is the anonymized trade label. The business name is not returned as its own field.';

COMMENT ON FUNCTION public.block_contractor_for_customer(uuid, uuid, uuid) IS
  'Customer-only. Inserts CUSTOMER_REQUEST for the caller. Does not replace an existing LOW_RATING or CUSTOMER_REQUEST row. Closes AVAILABLE offers on the customer''s other open projects. Does not update bookings, connections, or payments.';

COMMENT ON FUNCTION public.unblock_contractor_for_customer(uuid) IS
  'Customer-only delete of the caller''s block. Restores future eligibility. Does not reopen offers and does not update bookings, connections, or payments.';

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

  IF EXISTS (
    SELECT 1
    FROM public.customer_contractor_blocks b
    WHERE b.customer_profile_id = proj.customer_id
      AND b.contractor_profile_id = cp.id
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_eligible_for_project(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.contractor_eligible_for_project(uuid, uuid) IS
  'Internal. Hard filters: ACTIVE+APPROVED contractor, signup_fee_is_satisfied, accepting_work, category via contractor_services, service area via contractor_service_areas+location_matches, job size, verified credential when required, and no customer_contractor_blocks row for the project customer. No public grant.';

-- hire_again_contractors is the body from 20261013000004_public_pro_labels.sql.
-- The business-name CASE and primary_trade expression are unchanged.
-- The only addition is NOT EXISTS on customer_contractor_blocks.

CREATE OR REPLACE FUNCTION public.hire_again_contractors()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  months integer;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  months := public.relationship_protection_months();
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      r.id AS relationship_id,
      r.contractor_profile_id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.bookings b
          WHERE b.id = r.last_completed_booking_id
            AND public.message_pair_has_connection_entitlement(b.project_id, r.contractor_profile_id)
        )
        AND nullif(btrim(cp.business_name), '') IS NOT NULL
        AND NOT public.text_contains_contact_info(cp.business_name)
        AND NOT public.text_contains_pre_hire_contact(cp.business_name)
          THEN btrim(cp.business_name)
        ELSE coalesce(public.public_directory_label(cp.id), 'Local pro')
      END AS business_name,
      coalesce(
        public.public_directory_primary_trade(cp.id),
        public.public_primary_trade(
          CASE
            WHEN lower(btrim(coalesce(cp.primary_trade, ''))) = lower(btrim(coalesce(cp.business_name, '')))
              THEN NULL
            ELSE cp.primary_trade
          END,
          NULL
        )
      ) AS primary_trade,
      r.introduced_at,
      r.last_completed_at,
      r.last_completed_booking_id,
      r.protected_until,
      r.protected_until > now() AS currently_protected,
      months AS protection_months,
      false AS charges_live,
      false AS payments_live
    FROM public.customer_contractor_relationships r
    JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
    WHERE r.customer_id = auth.uid()
      AND r.status = 'ACTIVE'
      AND r.last_completed_booking_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.customer_contractor_blocks b
        WHERE b.customer_profile_id = r.customer_id
          AND b.contractor_profile_id = r.contractor_profile_id
      )
    ORDER BY r.last_completed_at DESC NULLS LAST
  ) x;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.hire_again_contractors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hire_again_contractors() TO authenticated;
