-- Account deletion was failing for real users and, where it ran, deleted payment rows.
-- A Connect row cannot be deleted or rewritten from the client
-- ('project connections cannot be written from the client').
-- Nulling projects.selected_booking_id / selected_contractor_profile_id while
-- status stays CONTRACTOR_SELECTED violates projects_selection_consistency.
--
-- This keeps payment rows, audit logs, bookings, connections, and the other
-- party's project. It anonymizes the closing account instead of cascading.
-- Active CONFIRMED, IN_PROGRESS, and DISPUTED bookings block deletion.
--
-- Guards below start from 20260930000001 (which already allows contractor_end_job)
-- and add one purge UPDATE branch. The end-job PR also replaces these two
-- functions. Whichever migration is applied last must keep BOTH allow-lists.
-- Do not drop prod-only RPC names when diffing.
--
-- Matching: setting account_status DELETED, approval_status SUSPENDED, and
-- accepting_work false fires the existing rematch triggers. This migration
-- does not change match_project or contractor_eligible_for_project.
-- call_match_project_for_contractor overwrites ppp.rpc, so the purge name is
-- set again before any connection write.
--
-- Replaces existing function purge_account_owned_rows; must be diffed against prod before apply.
-- Replaces existing function protect_project_connection_row; must be diffed against prod before apply.
-- Replaces existing function guard_project_connection_money; must be diffed against prod before apply.

ALTER TABLE public.signup_fee_charges DROP CONSTRAINT IF EXISTS signup_fee_charges_profile_id_fkey;
ALTER TABLE public.signup_fee_charges ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE public.signup_fee_charges
  ADD CONSTRAINT signup_fee_charges_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_customer_id_fkey;
ALTER TABLE public.projects ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_customer_id_fkey;
ALTER TABLE public.bookings ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.project_connections DROP CONSTRAINT IF EXISTS project_connections_customer_id_fkey;
ALTER TABLE public.project_connections ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.project_connections
  ADD CONSTRAINT project_connections_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.contractor_profiles DROP CONSTRAINT IF EXISTS contractor_profiles_profile_id_fkey;
ALTER TABLE public.contractor_profiles ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE public.contractor_profiles
  ADD CONSTRAINT contractor_profiles_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.project_messages DROP CONSTRAINT IF EXISTS project_messages_sender_profile_id_fkey;
ALTER TABLE public.project_messages ALTER COLUMN sender_profile_id DROP NOT NULL;
ALTER TABLE public.project_messages
  ADD CONSTRAINT project_messages_sender_profile_id_fkey
  FOREIGN KEY (sender_profile_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.booking_reviews DROP CONSTRAINT IF EXISTS booking_reviews_customer_id_fkey;
ALTER TABLE public.booking_reviews ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

ALTER TABLE public.change_orders DROP CONSTRAINT IF EXISTS change_orders_created_by_fkey;
ALTER TABLE public.change_orders ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.change_orders
  ADD CONSTRAINT change_orders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.purge_account_owned_rows(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contractor_id uuid;
  v_is_last_admin boolean := false;
  v_project_ids uuid[];
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('purge_account_owned_rows');

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

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status IN ('CONFIRMED', 'IN_PROGRESS', 'DISPUTED')
      AND (
        b.customer_id = p_user_id
        OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
      )
  ) THEN
    RAISE EXCEPTION 'Finish or cancel your active jobs before deleting this account.';
  END IF;

  UPDATE public.profiles
  SET
    email = 'deleted+' || p_user_id::text || '@users.invalid',
    first_name = '',
    last_name = '',
    phone = NULL,
    avatar_url = NULL,
    account_status = 'DELETED'
  WHERE id = p_user_id;

  IF v_contractor_id IS NOT NULL THEN
    UPDATE public.contractor_profiles
    SET
      business_name = 'Deleted Pro',
      headline = NULL,
      bio = NULL,
      website_url = NULL,
      license_number = NULL,
      insurance_carrier = NULL,
      primary_trade = NULL,
      service_area = NULL,
      accepting_work = false,
      approval_status = 'SUSPENDED'
    WHERE id = v_contractor_id;
  END IF;

  -- Rematch triggers overwrite ppp.rpc. Restore it before guarded writes.
  PERFORM public.ppp_set_rpc('purge_account_owned_rows');

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

  SELECT coalesce(array_agg(p.id), '{}'::uuid[])
  INTO v_project_ids
  FROM public.projects p
  WHERE p.customer_id = p_user_id;

  -- Skip contact-text and message-body triggers for these non-payment updates.
  -- session_replication_role requires the function owner to be a superuser.
  -- Payment tables are updated below, after triggers are turned back on.
  PERFORM set_config('session_replication_role', 'replica', true);
  BEGIN
    UPDATE public.project_private_locations loc
    SET street_line1 = NULL,
        street_line2 = NULL,
        lat = NULL,
        lng = NULL,
        updated_at = now()
    WHERE loc.project_id = ANY (v_project_ids);

    UPDATE public.project_messages
    SET sender_profile_id = NULL
    WHERE sender_profile_id = p_user_id;

    UPDATE public.projects
    SET customer_id = NULL,
        updated_at = now()
    WHERE id = ANY (v_project_ids);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('session_replication_role', 'origin', true);
      RAISE;
  END;
  PERFORM set_config('session_replication_role', 'origin', true);
  PERFORM public.ppp_set_rpc('purge_account_owned_rows');

  DELETE FROM public.projects p
  WHERE p.id = ANY (v_project_ids)
    AND p.status = 'DRAFT'
    AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.project_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.project_connections c WHERE c.project_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.estimates e WHERE e.project_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.opportunities o WHERE o.project_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.project_message_threads t WHERE t.project_id = p.id);

  UPDATE public.project_connections
  SET customer_id = NULL,
      updated_at = now()
  WHERE customer_id = p_user_id;

  UPDATE public.bookings
  SET customer_id = NULL
  WHERE customer_id = p_user_id;

  UPDATE public.signup_fee_charges
  SET profile_id = NULL
  WHERE profile_id = p_user_id;

  UPDATE public.booking_reviews
  SET customer_id = NULL
  WHERE customer_id = p_user_id;

  UPDATE public.change_orders
  SET created_by = NULL
  WHERE created_by = p_user_id;

  DELETE FROM public.content_reports
  WHERE reporter_id = p_user_id;

  PERFORM public.write_audit_log(
    p_user_id,
    'account.deleted',
    'profile',
    p_user_id,
    jsonb_build_object('self_service', true, 'anonymized', true)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'contractor_profile_id', v_contractor_id,
    'anonymized', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_account_owned_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_account_owned_rows(uuid) TO service_role;

COMMENT ON FUNCTION public.purge_account_owned_rows(uuid) IS
  'Service-role account close. Blocks CONFIRMED, IN_PROGRESS, and DISPUTED bookings. Anonymizes the profile and pro card. Detaches customer_id on projects, bookings, and connections without changing connection status, fee_cents, paid_at, or payment flags. Never deletes payment rows, bookings, connections, checkout sessions, or audit logs.';

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
     OR public.ppp_rpc_is('contractor_end_job')
     OR (
       public.ppp_rpc_is('purge_account_owned_rows')
       AND TG_OP = 'UPDATE'
       AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
       AND NEW.contractor_profile_id IS NOT DISTINCT FROM OLD.contractor_profile_id
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.fee_cents IS NOT DISTINCT FROM OLD.fee_cents
       AND NEW.payments_live IS NOT DISTINCT FROM OLD.payments_live
       AND NEW.charges_live IS NOT DISTINCT FROM OLD.charges_live
       AND NEW.paid_at IS NOT DISTINCT FROM OLD.paid_at
       AND NEW.stripe_checkout_session_id IS NOT DISTINCT FROM OLD.stripe_checkout_session_id
       AND NEW.needs_refund IS NOT DISTINCT FROM OLD.needs_refund
     ) THEN
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
       OR (
         public.ppp_rpc_is('purge_account_owned_rows')
         AND TG_OP = 'UPDATE'
         AND NEW.status IS NOT DISTINCT FROM OLD.status
         AND NEW.fee_cents IS NOT DISTINCT FROM OLD.fee_cents
         AND NEW.payments_live IS NOT DISTINCT FROM OLD.payments_live
         AND NEW.charges_live IS NOT DISTINCT FROM OLD.charges_live
         AND NEW.paid_at IS NOT DISTINCT FROM OLD.paid_at
         AND NEW.stripe_checkout_session_id IS NOT DISTINCT FROM OLD.stripe_checkout_session_id
         AND NEW.needs_refund IS NOT DISTINCT FROM OLD.needs_refund
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
