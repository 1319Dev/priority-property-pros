-- Restores contractor_eligible_for_project from 20261012000003_unpaid_contractor_gates.sql
-- and hire_again_contractors from 20261013000004_public_pro_labels.sql.
-- Drops the block table. Does not change booking_reviews rows, offers, connections, or payments.

DROP TRIGGER IF EXISTS booking_reviews_low_rating_block ON public.booking_reviews;

DROP FUNCTION IF EXISTS public.apply_customer_low_rating_block();
DROP FUNCTION IF EXISTS public.close_blocked_contractor_open_offers(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.block_contractor_for_customer(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.unblock_contractor_for_customer(uuid);
DROP FUNCTION IF EXISTS public.customer_has_blocked_contractor(uuid);
DROP FUNCTION IF EXISTS public.list_my_contractor_blocks();

DROP TABLE IF EXISTS public.customer_contractor_blocks;
DROP TYPE IF EXISTS public.customer_contractor_block_reason;

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

COMMENT ON FUNCTION public.contractor_eligible_for_project(uuid, uuid) IS
  'Internal. Hard filters: ACTIVE+APPROVED contractor, accepting_work, category via contractor_services, service area via contractor_service_areas+location_matches, job size, verified credential when required. No public grant.';

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
    ORDER BY r.last_completed_at DESC NULLS LAST
  ) x;
  RETURN result;
END;
$$;
COMMENT ON FUNCTION public.hire_again_contractors() IS
  'Caller''s completed relationships. business_name is the real name only when message_pair_has_connection_entitlement is true for the completed booking''s project. Otherwise the neutral public label. Does not change protection months or payment flags.';


REVOKE ALL ON FUNCTION public.contractor_eligible_for_project(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.hire_again_contractors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hire_again_contractors() TO authenticated;

