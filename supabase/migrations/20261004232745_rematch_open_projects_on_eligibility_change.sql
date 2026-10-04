-- A successful post already calls public.match_project from public.post_project.
-- That call is internal (no authenticated grant) and keeps the 3-offer cap.
--
-- Production 2026-10-04: post_project for the Conroe fence job committed
-- status MATCHING with matched = 0. The approved handyman's service area was
-- saved afterward; contractor_eligible_for_project was then true, and nothing
-- called match_project again, so no opportunities row existed.
--
-- This does not add a second matcher, and it does not change payments, prices,
-- webhooks, or fee flags. Eligibility changes call the existing match_project
-- for open projects that contractor now qualifies for.

CREATE OR REPLACE FUNCTION public.protect_posted_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('post_project')
     OR public.ppp_rpc_is('match_project')
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

CREATE OR REPLACE FUNCTION public.call_match_project_for_contractor(p_contractor_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj_id uuid;
BEGIN
  IF p_contractor_profile_id IS NULL THEN
    RETURN;
  END IF;

  -- Lets fill_project_opportunity_offers move MATCHING -> CONTRACTORS_RESPONDING
  -- while a contractor (not the project owner) is saving eligibility inputs.
  PERFORM set_config('ppp.rpc', 'match_project', true);

  FOR proj_id IN
    SELECT p.id
    FROM public.projects p
    WHERE p.status IN ('POSTED', 'MATCHING', 'CONTRACTORS_RESPONDING', 'ESTIMATES_AVAILABLE')
      AND public.signup_fee_is_satisfied(p.customer_id)
      AND public.contractor_eligible_for_project(p.id, p_contractor_profile_id)
    ORDER BY p.id
  LOOP
    PERFORM public.match_project(proj_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.call_match_project_after_eligibility_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contractor_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    SELECT cp.id INTO contractor_id
    FROM public.contractor_profiles cp
    WHERE cp.profile_id = COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'contractor_profiles' THEN
    contractor_id := COALESCE(NEW.id, OLD.id);
  ELSE
    contractor_id := COALESCE(NEW.contractor_profile_id, OLD.contractor_profile_id);
  END IF;

  PERFORM public.call_match_project_for_contractor(contractor_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contractor_service_areas_match_projects ON public.contractor_service_areas;
CREATE TRIGGER contractor_service_areas_match_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.contractor_service_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.call_match_project_after_eligibility_change();

DROP TRIGGER IF EXISTS contractor_services_match_projects ON public.contractor_services;
CREATE TRIGGER contractor_services_match_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.contractor_services
  FOR EACH ROW
  EXECUTE FUNCTION public.call_match_project_after_eligibility_change();

DROP TRIGGER IF EXISTS contractor_profiles_match_projects ON public.contractor_profiles;
CREATE TRIGGER contractor_profiles_match_projects
  AFTER UPDATE OF approval_status, accepting_work, min_job_cents, max_job_cents
  ON public.contractor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.call_match_project_after_eligibility_change();

DROP TRIGGER IF EXISTS profiles_match_projects_on_account_status ON public.profiles;
CREATE TRIGGER profiles_match_projects_on_account_status
  AFTER UPDATE OF account_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.call_match_project_after_eligibility_change();

DROP TRIGGER IF EXISTS contractor_credentials_match_projects ON public.contractor_credentials;
CREATE TRIGGER contractor_credentials_match_projects
  AFTER INSERT OR DELETE OR UPDATE OF status, expires_at ON public.contractor_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.call_match_project_after_eligibility_change();

REVOKE ALL ON FUNCTION public.call_match_project_for_contractor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.call_match_project_after_eligibility_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_project(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.call_match_project_for_contractor(uuid) IS
  'Internal. Calls existing match_project for open projects this contractor is eligible for. Does not score, cap, or insert opportunities itself.';
COMMENT ON FUNCTION public.call_match_project_after_eligibility_change() IS
  'Internal trigger. After eligibility inputs change, calls call_match_project_for_contractor. post_project still calls match_project directly.';
