-- Exact rollback for 20261015000004_account_deletion_anonymize.sql.
-- Restores purge_account_owned_rows to the 20261008023600 body (it deletes
-- bookings, connections, and change orders, and nulls selection columns).
-- Restores the two connection guards to the 20260930000001 bodies, which allow
-- contractor_end_job and do not allow purge_account_owned_rows.
-- FK rollback fails if any anonymized row already has a null owner. That is
-- intentional: do not drop the kept payment history to make SET NOT NULL pass.
-- Restores enforce_signup_fee_on_projects and protect_signup_fee_charge_row
-- to the live bodies (no owner-clear skip, no purge allowance).
-- Re-adds audit_logs_actor_id_fkey ON DELETE SET NULL. That ADD fails if an
-- actor uuid no longer matches a profile. That is intentional.
-- Re-adds estimate_events_actor_id_fkey and signup_fee_events_profile_id_fkey
-- ON DELETE SET NULL NOT VALID, because deleted accounts leave dangling ids.
-- Restores protect_platform_review to the live body: DELETE requires an admin
-- even when auth.uid() is null.
-- Does not replace match_project, respond_change_order, or recompute_booking_money.

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles (id) ON DELETE SET NULL;


ALTER TABLE public.signup_fee_charges DROP CONSTRAINT IF EXISTS signup_fee_charges_profile_id_fkey;
ALTER TABLE public.signup_fee_charges ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE public.signup_fee_charges
  ADD CONSTRAINT signup_fee_charges_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_customer_id_fkey;
ALTER TABLE public.projects ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_customer_id_fkey;
ALTER TABLE public.bookings ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles (id) ON DELETE RESTRICT;

ALTER TABLE public.project_connections DROP CONSTRAINT IF EXISTS project_connections_customer_id_fkey;
ALTER TABLE public.project_connections ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE public.project_connections
  ADD CONSTRAINT project_connections_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles (id);

ALTER TABLE public.contractor_profiles DROP CONSTRAINT IF EXISTS contractor_profiles_profile_id_fkey;
ALTER TABLE public.contractor_profiles ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE public.contractor_profiles
  ADD CONSTRAINT contractor_profiles_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.project_messages DROP CONSTRAINT IF EXISTS project_messages_sender_profile_id_fkey;
ALTER TABLE public.project_messages ALTER COLUMN sender_profile_id SET NOT NULL;
ALTER TABLE public.project_messages
  ADD CONSTRAINT project_messages_sender_profile_id_fkey
  FOREIGN KEY (sender_profile_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.booking_reviews DROP CONSTRAINT IF EXISTS booking_reviews_customer_id_fkey;
ALTER TABLE public.booking_reviews ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles (id);

ALTER TABLE public.change_orders DROP CONSTRAINT IF EXISTS change_orders_created_by_fkey;
ALTER TABLE public.change_orders ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE public.change_orders
  ADD CONSTRAINT change_orders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles (id);


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


REVOKE ALL ON FUNCTION public.purge_account_owned_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_account_owned_rows(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.protect_project_connection_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('request_project_connection')
     OR public.ppp_rpc_is('stop_new_project_connections')
     OR public.ppp_rpc_is('admin_grant_connection_contact_access')
     OR public.ppp_rpc_is('admin_revoke_connection_contact_access')
     OR public.ppp_rpc_is('finalize_project_connection_payment')
     OR public.ppp_rpc_is('grant_booking_contact_access_from_connection_fee')
     OR public.ppp_rpc_is('grant_connection_contact_access_from_fee')
     OR public.ppp_rpc_is('reserve_connection_checkout')
     OR public.ppp_rpc_is('attach_connection_checkout_session')
     OR public.ppp_rpc_is('fulfill_connection_fee_checkout')
     OR public.ppp_rpc_is('expire_stale_connection_reservations')
     OR public.ppp_rpc_is('expire_connection_checkout_session')
     OR public.ppp_rpc_is('flag_connection_checkout_needs_refund')
     OR public.ppp_rpc_is('contractor_end_job') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'project connections cannot be written from the client';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_project_connection_money()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fee_cents IS DISTINCT FROM 499 THEN
    RAISE EXCEPTION 'connection fee is server-authoritative and must be 499 cents';
  END IF;
  IF NEW.status IN ('PAID', 'COMPLETED')
     AND NOT (
       public.ppp_rpc_is('finalize_project_connection_payment')
       OR public.ppp_rpc_is('grant_connection_contact_access_from_fee')
       OR public.ppp_rpc_is('fulfill_connection_fee_checkout')
       OR (
         public.ppp_rpc_is('contractor_end_job')
         AND TG_OP = 'UPDATE'
         AND OLD.status = 'PAID'
         AND NEW.status = 'COMPLETED'
       )
     ) THEN
    RAISE EXCEPTION 'connection cannot be marked paid from the client';
  END IF;
  IF NEW.payments_live IS DISTINCT FROM false OR NEW.charges_live IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'connection payments_live and charges_live must stay false';
  END IF;
  RETURN NEW;
END;
$$;

-- Soft-end a contractor's opportunity / unpaid reservation, or complete a paid connection.
-- Never grants #14. Never flips payment flags. Never hard-deletes purchase history.

-- Live enforce_signup_fee_on_projects (prod dry-run body, without the owner-clear skip).
CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_projects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_signup_fee_paid(NEW.customer_id);
  RETURN NEW;
END;
$function$;

-- Live protect_signup_fee_charge_row (prod dry-run body, without the purge branch).
CREATE OR REPLACE FUNCTION public.protect_signup_fee_charge_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.ppp_rpc_is('register_signup_fee_checkout')
     OR public.ppp_rpc_is('fulfill_signup_fee_checkout')
     OR public.ppp_rpc_is('record_signup_fee_event')
     OR public.ppp_rpc_is('flag_signup_checkout_needs_refund') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'signup fee charges cannot be written from the client';
END;
$function$;

-- F5 rollback. NOT VALID because deleted accounts leave dangling actor/profile ids.
ALTER TABLE public.estimate_events
  ADD CONSTRAINT estimate_events_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.signup_fee_events
  ADD CONSTRAINT signup_fee_events_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;

-- Live protect_platform_review. DELETE blocks every non-admin, including
-- unsigned server-side callers.
CREATE OR REPLACE FUNCTION public.protect_platform_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'sign in to leave a review';
    END IF;

    NEW.user_id := auth.uid();
    NEW.display_name := btrim(NEW.display_name);
    NEW.body := btrim(NEW.body);
    NEW.city := NULLIF(btrim(COALESCE(NEW.city, '')), '');

    IF public.text_contains_contact_info(NEW.display_name)
       OR public.text_contains_contact_info(NEW.body)
       OR public.text_contains_contact_info(COALESCE(NEW.city, '')) THEN
      RAISE EXCEPTION '%', public.contact_info_blocked_message();
    END IF;

    -- Auto-approve valid signed-in reviews. Admins can still reject later.
    IF NOT public.is_admin() OR NEW.status IS DISTINCT FROM 'PENDING' THEN
      NEW.status := 'APPROVED';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can change a platform review';
    END IF;
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can delete a platform review';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;
