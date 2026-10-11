-- Rewrite other people's notifications that name a deleted account.
-- Applies after 20261017000001_account_deletion_anonymize.sql and
-- 20261017100001_account_deletion_clear_contractor_details.sql.
-- Version 20261017100002 is unused on main and on every open pull request
-- (checked 2026-10-11).
--
-- Replaces existing function purge_account_owned_rows; must be diffed against prod before apply.
-- Creates functions scrub_deleted_identity_text and scrub_deleted_identity_jsonb.
--
-- Where notification text is written (prod and repo, 2026-10-11):
--   notify_project_message: body 'New message from ' || first_name (customer
--     sender), business_name (pro sender with a paid connection), or the public
--     pro label (trade, services, city). Payload holds thread, project, and pro
--     card ids only.
--   Every other writer (estimate, booking, change order, review, connection,
--   question, contact-share, opportunity notifications) uses fixed text and id
--   payloads. enqueue_notification refuses contact info in title and body and
--   strips phone, email, and street keys from payloads. No edge function writes
--   notifications; send-notification only reads them. notification_email_log
--   holds ids, category, and time only.
--
-- The purge now, in the same transaction as the delete:
--   1. Sets the body of every message notification in this account's threads
--      to 'New message from a deleted user.' (customer or admin) or
--      'New message from a former PPP pro.' (contractor).
--   2. In other notifications tied to this account's projects, jobs, estimates,
--      connections, opportunities, change orders, reviews, and threads,
--      replaces first name, last name, full name, email, phone, business name,
--      and public pro label, and drops name, email, and phone payload keys.
--   3. Anywhere else, replaces only the exact full name, email, and phone.
-- Unrelated notifications are not changed. Notifications are never deleted
-- here except the account's own, which the profile cascade removes. Updates
-- do not send email or push: notifications_dispatch_channels is AFTER INSERT.
-- Email or push already delivered cannot be recalled.
-- Does not call Stripe. Does not change payments, refunds, ledger rows,
-- disputes, signup charges, fees, or refusals.

CREATE OR REPLACE FUNCTION public.scrub_deleted_identity_text(p_text text, p_terms text[], p_replacement text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out text := p_text;
  v_term text;
  v_repl text := replace(replace(coalesce(p_replacement, ''), '\', '\\'), '&', '\&');
BEGIN
  IF p_text IS NULL OR p_terms IS NULL THEN
    RETURN p_text;
  END IF;
  -- Longest first, so a full name is replaced before its first name. Every
  -- character that is not a letter, digit, or space is escaped, so a term is
  -- matched literally.
  FOR v_term IN
    SELECT t FROM (SELECT DISTINCT btrim(t) AS t FROM unnest(p_terms) AS t WHERE t IS NOT NULL AND length(btrim(t)) >= 2) s
    ORDER BY length(t) DESC, t
  LOOP
    v_out := regexp_replace(
      v_out,
      '(^|[^[:alnum:]_])' || regexp_replace(v_term, '([^[:alnum:][:space:]])', '\\\1', 'g') || '(?=$|[^[:alnum:]_])',
      '\1' || v_repl,
      'gi'
    );
  END LOOP;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.scrub_deleted_identity_jsonb(p_payload jsonb, p_terms text[], p_replacement text, p_drop_identity_keys boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_keys text[] := ARRAY[
    'name', 'first_name', 'last_name', 'full_name', 'display_name',
    'customer_name', 'customer_first_name', 'sender_name', 'from_name',
    'business_name', 'contractor_name', 'contractor_business_name', 'pro_name',
    'email', 'customer_email', 'contractor_email', 'phone', 'customer_phone', 'contractor_phone'
  ];
BEGIN
  IF p_payload IS NULL THEN
    RETURN NULL;
  END IF;
  CASE jsonb_typeof(p_payload)
    WHEN 'object' THEN
      RETURN coalesce((
        SELECT jsonb_object_agg(e.key, public.scrub_deleted_identity_jsonb(e.value, p_terms, p_replacement, p_drop_identity_keys))
        FROM jsonb_each(p_payload) e
        WHERE NOT (p_drop_identity_keys AND lower(e.key) = ANY (v_keys))
      ), '{}'::jsonb);
    WHEN 'array' THEN
      RETURN coalesce((
        SELECT jsonb_agg(public.scrub_deleted_identity_jsonb(e.value, p_terms, p_replacement, p_drop_identity_keys) ORDER BY e.ord)
        FROM jsonb_array_elements(p_payload) WITH ORDINALITY AS e(value, ord)
      ), '[]'::jsonb);
    WHEN 'string' THEN
      RETURN to_jsonb(public.scrub_deleted_identity_text(p_payload #>> '{}', p_terms, p_replacement));
    ELSE
      RETURN p_payload;
  END CASE;
END;
$function$;

REVOKE ALL ON FUNCTION public.scrub_deleted_identity_text(text, text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scrub_deleted_identity_jsonb(jsonb, text[], text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scrub_deleted_identity_text(text, text[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.scrub_deleted_identity_jsonb(jsonb, text[], text, boolean) TO service_role;

COMMENT ON FUNCTION public.scrub_deleted_identity_text(text, text[], text) IS
  'Account deletion helper. Replaces each whole-word term (case-insensitive, longest first) with the neutral text. Not granted to clients.';
COMMENT ON FUNCTION public.scrub_deleted_identity_jsonb(jsonb, text[], text, boolean) IS
  'Account deletion helper. Scrubs every string in a notification payload and optionally drops name, email, and phone keys. Not granted to clients.';

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
  -- Notification scrub (20261017100002).
  v_neutral text;
  v_scoped_terms text[];
  v_global_terms text[];
  v_related_ids text[];
  v_threads uuid[];
  v_notifications_scrubbed integer := 0;
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

  -- Notification scrub. Other people's notifications can name this account:
  -- notify_project_message writes 'New message from <first name>' for a
  -- customer and 'New message from <business name>' (or the public pro label)
  -- for a pro. Rewrite them to neutral text here, before the names are cleared
  -- below, so the scrub and the delete commit or roll back together.
  -- Notifications this account received are removed by the profile cascade.
  -- notifications_dispatch_channels fires only AFTER INSERT, so these updates
  -- send no email or push.
  v_neutral := CASE WHEN v_contractor_id IS NOT NULL THEN 'a former PPP pro' ELSE 'a deleted user' END;

  SELECT
    array_remove(ARRAY[
      nullif(btrim(p.first_name), ''),
      nullif(btrim(p.last_name), ''),
      nullif(btrim(concat_ws(' ', nullif(btrim(p.first_name), ''), nullif(btrim(p.last_name), ''))), ''),
      nullif(btrim(p.email), ''),
      nullif(btrim(u.email), ''),
      nullif(btrim(p.phone), ''),
      nullif(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), ''),
      nullif(right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10), ''),
      (SELECT nullif(btrim(cp.business_name), '') FROM public.contractor_profiles cp WHERE cp.id = v_contractor_id),
      public.public_directory_label(v_contractor_id)
    ], NULL),
    array_remove(ARRAY[
      CASE WHEN nullif(btrim(p.first_name), '') IS NOT NULL AND nullif(btrim(p.last_name), '') IS NOT NULL
        THEN btrim(p.first_name) || ' ' || btrim(p.last_name) END,
      nullif(btrim(p.email), ''),
      nullif(btrim(u.email), ''),
      CASE WHEN length(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')) >= 7 THEN btrim(p.phone) END,
      CASE WHEN length(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')) >= 7
        THEN regexp_replace(p.phone, '[^0-9]', '', 'g') END
    ], NULL)
  INTO v_scoped_terms, v_global_terms
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;

  SELECT coalesce(array_agg(t.id), '{}'::uuid[])
  INTO v_threads
  FROM public.project_message_threads t
  WHERE t.contractor_profile_id = v_contractor_id
     OR t.project_id IN (SELECT pr.id FROM public.projects pr WHERE pr.customer_id = p_user_id);

  -- Rows that belong to this account's projects, jobs, estimates, connections,
  -- opportunities, and threads. Names are scrubbed only inside this scope, so
  -- another person with the same first name is never touched.
  SELECT coalesce(array_agg(DISTINCT x.id::text), '{}'::text[])
  INTO v_related_ids
  FROM (
    SELECT unnest(v_threads) AS id
    UNION ALL SELECT pr.id FROM public.projects pr WHERE pr.customer_id = p_user_id
    UNION ALL SELECT b.id FROM public.bookings b
      WHERE b.customer_id = p_user_id OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
    UNION ALL SELECT e.id FROM public.estimates e
      WHERE (v_contractor_id IS NOT NULL AND e.contractor_profile_id = v_contractor_id)
         OR e.project_id IN (SELECT pr.id FROM public.projects pr WHERE pr.customer_id = p_user_id)
    UNION ALL SELECT c.id FROM public.project_connections c
      WHERE c.customer_id = p_user_id OR (v_contractor_id IS NOT NULL AND c.contractor_profile_id = v_contractor_id)
    UNION ALL SELECT o.id FROM public.opportunities o
      WHERE (v_contractor_id IS NOT NULL AND o.contractor_profile_id = v_contractor_id)
         OR o.project_id IN (SELECT pr.id FROM public.projects pr WHERE pr.customer_id = p_user_id)
    UNION ALL SELECT co.id FROM public.change_orders co
      JOIN public.bookings b ON b.id = co.booking_id
      WHERE b.customer_id = p_user_id OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
    UNION ALL SELECT r.id FROM public.booking_reviews r
      JOIN public.bookings b ON b.id = r.booking_id
      WHERE b.customer_id = p_user_id OR (v_contractor_id IS NOT NULL AND b.contractor_profile_id = v_contractor_id)
  ) x
  WHERE x.id IS NOT NULL;

  -- Message notifications in this account's threads were all sent by this
  -- account (its own copies go with the profile). Rewrite the body exactly,
  -- so a name changed after sending is also covered.
  UPDATE public.notifications n
  SET body = 'New message from ' || v_neutral || '.',
      title = public.scrub_deleted_identity_text(n.title, v_scoped_terms, v_neutral),
      payload = public.scrub_deleted_identity_jsonb(n.payload, v_scoped_terms, v_neutral, true)
  WHERE n.recipient_profile_id IS DISTINCT FROM p_user_id
    AND n.kind = 'message.received'
    AND n.entity_type = 'project_message_threads'
    AND n.entity_id = ANY (v_threads)
    AND (
      n.body IS DISTINCT FROM 'New message from ' || v_neutral || '.'
      OR n.title IS DISTINCT FROM public.scrub_deleted_identity_text(n.title, v_scoped_terms, v_neutral)
      OR n.payload IS DISTINCT FROM public.scrub_deleted_identity_jsonb(n.payload, v_scoped_terms, v_neutral, true)
    );
  GET DIAGNOSTICS v_notifications_scrubbed = ROW_COUNT;

  -- Any other notification tied to this account: replace its names, emails,
  -- phones, and business name, and drop name, email, and phone payload keys.
  WITH changed AS (
    UPDATE public.notifications n
    SET title = public.scrub_deleted_identity_text(n.title, v_scoped_terms, v_neutral),
        body = public.scrub_deleted_identity_text(n.body, v_scoped_terms, v_neutral),
        payload = public.scrub_deleted_identity_jsonb(n.payload, v_scoped_terms, v_neutral, true)
    WHERE n.recipient_profile_id IS DISTINCT FROM p_user_id
      AND (
        n.entity_id::text = ANY (v_related_ids)
        OR n.payload ->> 'project_id' = ANY (v_related_ids)
        OR n.payload ->> 'booking_id' = ANY (v_related_ids)
        OR n.payload ->> 'thread_id' = ANY (v_related_ids)
        OR n.payload ->> 'opportunity_id' = ANY (v_related_ids)
        OR n.payload ->> 'estimate_id' = ANY (v_related_ids)
        OR n.payload ->> 'connection_id' = ANY (v_related_ids)
        OR (v_contractor_id IS NOT NULL AND n.payload ->> 'contractor_profile_id' = v_contractor_id::text)
      )
      AND (
        n.title IS DISTINCT FROM public.scrub_deleted_identity_text(n.title, v_scoped_terms, v_neutral)
        OR n.body IS DISTINCT FROM public.scrub_deleted_identity_text(n.body, v_scoped_terms, v_neutral)
        OR n.payload IS DISTINCT FROM public.scrub_deleted_identity_jsonb(n.payload, v_scoped_terms, v_neutral, true)
      )
    RETURNING 1
  )
  SELECT v_notifications_scrubbed + count(*) INTO v_notifications_scrubbed FROM changed;

  -- Anywhere else, only exact full name, email, and phone are replaced.
  -- First names and business names alone are not, since they can be someone else's.
  WITH changed AS (
    UPDATE public.notifications n
    SET title = public.scrub_deleted_identity_text(n.title, v_global_terms, v_neutral),
        body = public.scrub_deleted_identity_text(n.body, v_global_terms, v_neutral),
        payload = public.scrub_deleted_identity_jsonb(n.payload, v_global_terms, v_neutral, false)
    WHERE n.recipient_profile_id IS DISTINCT FROM p_user_id
      AND coalesce(array_length(v_global_terms, 1), 0) > 0
      AND (
        n.title IS DISTINCT FROM public.scrub_deleted_identity_text(n.title, v_global_terms, v_neutral)
        OR n.body IS DISTINCT FROM public.scrub_deleted_identity_text(n.body, v_global_terms, v_neutral)
        OR n.payload IS DISTINCT FROM public.scrub_deleted_identity_jsonb(n.payload, v_global_terms, v_neutral, false)
      )
    RETURNING 1
  )
  SELECT v_notifications_scrubbed + count(*) INTO v_notifications_scrubbed FROM changed;

  PERFORM public.ppp_set_rpc('purge_account_owned_rows');

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
    'anonymized', true,
    'notifications_scrubbed', v_notifications_scrubbed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_account_owned_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_account_owned_rows(uuid) TO service_role;

COMMENT ON FUNCTION public.purge_account_owned_rows(uuid) IS
  'Service-role account close in one transaction, including the auth user delete. Blocks active bookings, open disputes, and unfinished refunds. Rewrites other people''s notifications that name the account to ''a deleted user'' or ''a former PPP pro''. Anonymizes the pro card and clears its rejection reason, info-request message, years of experience, job-size range, and identity-review fields. Deletes that card''s portfolio, credentials, services, service areas, and Stripe Connect database row without calling Stripe. Deletes project photo rows on the customer''s projects. Keeps projects except an empty draft. Keeps payment amounts, Stripe ids, dates, statuses, refund rows, and audit rows. Never deletes payments, refunds, ledger rows, disputes, bookings, connections, checkout sessions, messages, booking reviews, agreement acceptances, or audit logs.';
