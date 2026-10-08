-- SEPARATE, OPTIONAL fix (not part of the change-order fix). Delete-account is broken in prod:
--   42P01 relation "public.connection_contact_access" does not exist (purge_account_owned_rows line 74)
-- The table was created 2026-09-18 (connection_marketplace) but no longer exists; no recorded migration drops it.
-- Fix: run that one UPDATE only if the table exists. Everything else identical.
CREATE OR REPLACE FUNCTION public.purge_account_owned_rows(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contractor_id uuid;
  v_is_last_admin boolean := false;
BEGIN
  PERFORM public.require_service_role();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  SELECT
    p.account_type = 'ADMIN'
    AND p.account_status = 'ACTIVE'
    AND (
      SELECT count(*)
      FROM public.profiles admins
      WHERE admins.account_type = 'ADMIN'
        AND admins.account_status = 'ACTIVE'
    ) <= 1
  INTO v_is_last_admin
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF coalesce(v_is_last_admin, false) THEN
    RAISE EXCEPTION 'cannot delete the last active admin';
  END IF;

  SELECT cp.id
  INTO v_contractor_id
  FROM public.contractor_profiles cp
  WHERE cp.profile_id = p_user_id;

  UPDATE public.contractor_profiles
  SET approved_by = NULL
  WHERE approved_by = p_user_id;

  UPDATE public.contractor_profiles
  SET rejected_by = NULL
  WHERE rejected_by = p_user_id;

  UPDATE public.contractor_profiles
  SET info_requested_by = NULL
  WHERE info_requested_by = p_user_id;

  UPDATE public.verifier_profiles
  SET approved_by = NULL
  WHERE approved_by = p_user_id;

  UPDATE public.contractor_credentials
  SET reviewer_id = NULL
  WHERE reviewer_id = p_user_id;

  UPDATE public.projects
  SET connections_closed_by = NULL
  WHERE connections_closed_by = p_user_id;

  UPDATE public.project_status_history
  SET changed_by = NULL
  WHERE changed_by = p_user_id;

  UPDATE public.project_notices
  SET created_by = NULL
  WHERE created_by = p_user_id;

  UPDATE public.booking_events
  SET actor_id = NULL
  WHERE actor_id = p_user_id;

  UPDATE public.connection_events
  SET actor_id = NULL
  WHERE actor_id = p_user_id;

  IF to_regclass('public.connection_contact_access') IS NOT NULL THEN
    EXECUTE 'UPDATE public.connection_contact_access SET granted_by = NULL WHERE granted_by = $1'
    USING p_user_id;
  END IF;

  UPDATE public.booking_contact_access
  SET granted_by = NULL
  WHERE granted_by = p_user_id;

  UPDATE public.change_orders
  SET customer_approved_by = NULL
  WHERE customer_approved_by = p_user_id;

  UPDATE public.change_orders
  SET contractor_acked_by = NULL
  WHERE contractor_acked_by = p_user_id;

  UPDATE public.projects
  SET selected_booking_id = NULL
  WHERE selected_booking_id IN (
    SELECT b.id
    FROM public.bookings b
    WHERE b.customer_id = p_user_id
       OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
  );

  IF v_contractor_id IS NOT NULL THEN
    UPDATE public.projects
    SET selected_contractor_profile_id = NULL
    WHERE selected_contractor_profile_id = v_contractor_id;
  END IF;

  DELETE FROM public.project_contact_shares
  WHERE customer_id = p_user_id
     OR project_id IN (SELECT id FROM public.projects WHERE customer_id = p_user_id)
     OR (v_contractor_id IS NOT NULL AND contractor_profile_id = v_contractor_id);

  DELETE FROM public.project_message_threads
  WHERE project_id IN (SELECT id FROM public.projects WHERE customer_id = p_user_id)
     OR (v_contractor_id IS NOT NULL AND contractor_profile_id = v_contractor_id);

  DELETE FROM public.change_orders
  WHERE created_by = p_user_id;

  DELETE FROM public.bookings
  WHERE customer_id = p_user_id
     OR (v_contractor_id IS NOT NULL AND contractor_profile_id = v_contractor_id);

  DELETE FROM public.project_connections
  WHERE customer_id = p_user_id
     OR (v_contractor_id IS NOT NULL AND contractor_profile_id = v_contractor_id);

  IF v_contractor_id IS NOT NULL THEN
    DELETE FROM public.estimate_questions
    WHERE asked_by_contractor_profile_id = v_contractor_id;

    DELETE FROM public.estimates
    WHERE contractor_profile_id = v_contractor_id;
  END IF;

  DELETE FROM public.content_reports
  WHERE reporter_id = p_user_id;

  PERFORM public.write_audit_log(
    p_user_id,
    'account.deleted',
    'profile',
    p_user_id,
    jsonb_build_object('self_service', true)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'contractor_profile_id', v_contractor_id
  );
END;
$function$;
