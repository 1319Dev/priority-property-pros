-- Rollback for 20261017100002_account_deletion_scrub_notifications.sql.
-- Restores the purge body from 20261017100001 exactly, then drops the two
-- scrub helpers. Notifications already rewritten are not restored; the names
-- they held belonged to deleted accounts.
-- Does not call Stripe. Does not delete payment rows.

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
    WHERE b.status = 'DISPUTED'
      AND (
        b.customer_id = p_user_id
        OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.stripe_disputes d
    JOIN public.bookings b ON b.id = d.booking_id
    WHERE d.status IN ('NEEDS_RESPONSE', 'UNDER_REVIEW', 'HELD')
      AND (
        b.customer_id = p_user_id
        OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
      )
  ) THEN
    RAISE EXCEPTION 'Resolve the open dispute before deleting this account.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.signup_fee_charges s
    WHERE s.profile_id = p_user_id
      AND s.needs_refund
  ) OR EXISTS (
    SELECT 1
    FROM public.project_connections c
    WHERE c.needs_refund
      AND (
        c.customer_id = p_user_id
        OR (v_contractor_id IS NOT NULL AND c.contractor_profile_id = v_contractor_id)
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.connection_checkout_sessions s
    WHERE s.needs_refund
      AND (
        (v_contractor_id IS NOT NULL AND s.contractor_profile_id = v_contractor_id)
        OR EXISTS (
          SELECT 1
          FROM public.project_connections c
          WHERE c.id = s.connection_id
            AND c.customer_id = p_user_id
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.refunds r
    JOIN public.payments pay ON pay.id = r.payment_id
    WHERE pay.customer_id = p_user_id
      AND lower(r.status) IN ('pending', 'requires_action', 'processing')
  ) OR EXISTS (
    SELECT 1
    FROM public.refunds r
    JOIN public.bookings b ON b.id = r.booking_id
    WHERE lower(r.status) IN ('pending', 'requires_action', 'processing')
      AND (
        b.customer_id = p_user_id
        OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
      )
  ) THEN
    RAISE EXCEPTION 'Wait until the outstanding refund is finished before deleting this account.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status IN ('PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS')
      AND (
        b.customer_id = p_user_id
        OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
      )
  ) THEN
    RAISE EXCEPTION 'Finish or cancel your active jobs before deleting this account.';
  END IF;

  UPDATE public.profiles
  SET
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

  -- Owner-only updates. enforce_signup_fee_on_projects skips a customer_id clear.
  PERFORM public.ppp_set_rpc('purge_account_owned_rows');
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

  -- Gap fix: project-photo rows on kept projects point at files the storage
  -- cleanup removes. Delete them while the owner is still set, so the
  -- completeness trigger's project update still passes the signup-fee check.
  DELETE FROM public.project_photos
  WHERE project_id = ANY (v_project_ids);
  PERFORM public.ppp_set_rpc('purge_account_owned_rows');

  UPDATE public.projects
  SET customer_id = NULL,
      updated_at = now()
  WHERE id = ANY (v_project_ids);
  PERFORM public.ppp_set_rpc('purge_account_owned_rows');

  DELETE FROM public.projects p
  WHERE p.id = ANY (v_project_ids)
    AND p.status = 'DRAFT'
    AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.project_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.project_connections c WHERE c.project_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.estimates e WHERE e.project_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.opportunities o WHERE o.project_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.project_message_threads t WHERE t.project_id = p.id);

  -- Free text on money rows can hold a name or a note. Clear it while the
  -- booking owner is still set. Amounts, Stripe ids, dates, and statuses stay.
  -- protect_financial_row allows the write while this RPC name is set.
  PERFORM public.ppp_set_rpc('purge_account_owned_rows');

  UPDATE public.payment_schedule_items AS item
  SET description = item.kind::text
  WHERE item.booking_id IN (
    SELECT b.id
    FROM public.bookings b
    WHERE b.customer_id = p_user_id
       OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
  )
    AND item.description IS DISTINCT FROM item.kind::text;

  UPDATE public.booking_cancellations AS cancel
  SET reason = NULL
  WHERE cancel.reason IS NOT NULL
    AND (
      cancel.created_by = p_user_id
      OR cancel.booking_id IN (
        SELECT b.id
        FROM public.bookings b
        WHERE b.customer_id = p_user_id
           OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
      )
    );

  UPDATE public.refunds AS refund
  SET reason = NULL
  WHERE refund.reason IS NOT NULL
    AND (
      refund.created_by = p_user_id
      OR refund.booking_id IN (
        SELECT b.id
        FROM public.bookings b
        WHERE b.customer_id = p_user_id
           OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
      )
      OR refund.payment_id IN (
        SELECT pay.id
        FROM public.payments pay
        WHERE pay.customer_id = p_user_id
      )
    );

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

  UPDATE public.payments
  SET customer_id = NULL
  WHERE customer_id = p_user_id;

  UPDATE public.refunds
  SET created_by = NULL
  WHERE created_by = p_user_id;

  UPDATE public.booking_cancellations
  SET created_by = NULL
  WHERE created_by = p_user_id;

  UPDATE public.payment_schedule_items
  SET contractor_completed_by = NULL
  WHERE contractor_completed_by = p_user_id;

  UPDATE public.payment_schedule_items
  SET customer_approved_by = NULL
  WHERE customer_approved_by = p_user_id;

  UPDATE public.admin_account_flags
  SET set_by = NULL
  WHERE set_by = p_user_id;

  -- Gap fix: the Deleted Pro card stays for the other party's history, but the
  -- contractor's own detail rows go: portfolio rows (titles, captions, storage
  -- paths), credential rows (labels, document paths, reviewer notes), services,
  -- service areas, and the Stripe Connect account row. Admin free text on the
  -- card is cleared. Matching triggers overwrite ppp.rpc, so it is set again.
  IF v_contractor_id IS NOT NULL THEN
    DELETE FROM public.contractor_portfolio WHERE contractor_profile_id = v_contractor_id;
    DELETE FROM public.contractor_credentials WHERE contractor_profile_id = v_contractor_id;
    DELETE FROM public.contractor_services WHERE contractor_profile_id = v_contractor_id;
    DELETE FROM public.contractor_service_areas WHERE contractor_profile_id = v_contractor_id;
    PERFORM public.ppp_set_rpc('purge_account_owned_rows');
    DELETE FROM public.contractor_stripe_accounts WHERE contractor_profile_id = v_contractor_id;
    UPDATE public.contractor_profiles
    SET rejection_reason = NULL,
        info_request_message = NULL,
        years_experience = NULL,
        min_job_cents = NULL,
        max_job_cents = NULL,
        identity_review_fields = '{}'::text[]
    WHERE id = v_contractor_id;
    PERFORM public.ppp_set_rpc('purge_account_owned_rows');
  END IF;

  DELETE FROM public.content_reports
  WHERE reporter_id = p_user_id;

  PERFORM public.write_audit_log(
    p_user_id,
    'account.deleted',
    'profile',
    p_user_id,
    jsonb_build_object('self_service', true, 'anonymized', true)
  );

  -- Same transaction as the detaches above. Profile cascade runs here.
  DELETE FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'could not close the auth user';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'deleted',
    'contractor_profile_id', v_contractor_id,
    'anonymized', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_account_owned_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_account_owned_rows(uuid) TO service_role;
COMMENT ON FUNCTION public.purge_account_owned_rows(uuid) IS
  'Service-role account close in one transaction, including the auth user delete. Blocks active bookings, open disputes, and unfinished refunds. Anonymizes the pro card and clears its rejection reason, info-request message, years of experience, job-size range, and identity-review fields. Deletes that card''s portfolio, credentials, services, service areas, and Stripe Connect database row without calling Stripe. Deletes project photo rows on the customer''s projects. Keeps projects except an empty draft. Keeps payment amounts, Stripe ids, dates, statuses, refund rows, and audit rows. Never deletes payments, refunds, ledger rows, disputes, bookings, connections, checkout sessions, messages, booking reviews, agreement acceptances, or audit logs.';

DROP FUNCTION IF EXISTS public.scrub_deleted_identity_jsonb(jsonb, text[], text, boolean);
DROP FUNCTION IF EXISTS public.scrub_deleted_identity_text(text, text[], text);
