-- Account deletion was failing for real users and, where it ran, deleted payment rows.
-- A Connect row cannot be deleted or rewritten from the client
-- ('project connections cannot be written from the client').
-- Nulling projects.selected_booking_id / selected_contractor_profile_id while
-- status stays CONTRACTOR_SELECTED violates projects_selection_consistency.
--
-- This keeps payment rows, audit logs, bookings, connections, and the other
-- party's project. It anonymizes the closing account instead of cascading.
-- Active PENDING, AWAITING_PAYMENT, CONFIRMED, and IN_PROGRESS bookings block
-- deletion. DISPUTED bookings and open Stripe disputes block with their own reason.
--
-- Guards below are the combined #88 + purge bodies. Apply #88 first, then this
-- PR. These two functions keep contractor_end_job and add the purge UPDATE.
-- Do not drop prod-only RPC names when diffing.
--
-- Prod dry run: rewriting email is rejected by protect_profile_columns, and
-- session_replication_role is permission denied. This function deletes the
-- auth user itself, and the profile row goes with that cascade, so email is
-- not rewritten first. Owner-clearing project
-- updates skip enforce_signup_fee_on_projects. Signup-charge profile_id can
-- be cleared only by this purge. audit_logs.actor_id, estimate_events.actor_id,
-- and signup_fee_events.profile_id lose their foreign keys so the immutable
-- history triggers do not block the auth.users delete. The ids stay as opaque
-- uuids. protect_platform_review lets a server-side delete (no signed-in user)
-- remove a deleted account's site review. Signed-in non-admins stay blocked.
--
-- One transaction: every detach, the audit row, and the auth-user delete.
-- A failure rolls the whole close back. There is no second step that can
-- leave an anonymized profile behind.
--
-- Pending projects: an empty DRAFT (no booking, connection, estimate,
-- opportunity, or thread) is deleted. Every other project stays, with the
-- owner and street address cleared. That is not a block.
-- Active bookings (PENDING, AWAITING_PAYMENT, CONFIRMED, IN_PROGRESS) block.
-- A DISPUTED booking or an open stripe_disputes row blocks with its own reason.
-- needs_refund, or a refund still pending, blocks with its own reason.
-- Payment, refund, ledger, dispute, checkout, and agreement rows are kept.
-- Ledger and agreement links stay as opaque uuids because those rows cannot
-- be updated. Other people's reviews, messages, and projects are not deleted.
--
-- What stays on those money rows, and why:
--   payments: amount_cents, currency, status, processing_cost_cents, stripe_mode,
--     every Stripe id, created_at, updated_at. No name, email, phone, or address
--     column exists. customer_id is set null.
--   refunds: the row, amount_cents, status, stripe_refund_id, booking_id,
--     payment_id, created_at. reason is free text and is set null. created_by
--     is set null only when it is this account.
--   payment_schedule_items: amount_cents, kind, sequence, status, due_now,
--     due_condition, due_at, paid_at, failed_at, Stripe ids, created_at,
--     updated_at. due_condition stays because it is a schedule code
--     (due_now_to_confirm), not an essay. description is replaced with the
--     kind name so a typed note cannot remain. *_by is set null.
--   booking_cancellations: category, initiator, refund_decision, payment_state,
--     created_at. reason is free text and is set null. created_by is set null
--     only when it is this account.
--   stripe_disputes: kind, status, stripe_dispute_id, amount_cents, reason,
--     evidence_due_by, dates. reason stays. It is Stripe's dispute
--     classification and is the legal record of the dispute.
--   signup_fee_charges, project_connections, connection_checkout_sessions:
--     amounts, statuses, Stripe ids, dates, needs_refund, and refund_reason.
--     refund_reason stays. It is a server code (paid_but_reservation_not_active,
--     activation_unpaid, paid_but_entitlement_failed), not a person's note.
--     fee_cents, paid_at, and the live flags are not changed.
--   ledger_entries: entry_type, amount_cents, currency, Stripe ids, dates, and
--     note. note stays because protect_ledger_row rejects every update
--     (ledger entries are immutable; corrections are new rows). This migration
--     does not replace that function. A note is the accounting narrative.
--   audit_logs: action, target, timestamp, actor uuid, metadata. Rows stay
--     because forbid_audit_mutation rejects every update. The account.deleted
--     row written here stores only self_service and anonymized. Older metadata
--     can hold an email or a short admin note under the keys email, from, to,
--     message, note, or reason. Those rows are the legal audit trail.
--   agreement_acceptances: document, version, accepted_at, user_agent, and the
--     profile id as an opaque uuid. That is the record that terms were accepted.
--   estimate_events and signup_fee_events: event type, timestamp, and payload.
--     Payloads on file are statuses, amounts, and ids. The rows are immutable.
-- Removed with the profile: name, email, phone, avatar. Project street, lat,
-- and lng are cleared. The pro card becomes Deleted Pro, with bio, headline,
-- website, license, and insurance cleared. change_orders.description stays
-- because it is the other party's job history. Messages and booking reviews stay.
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
-- Replaces existing function enforce_signup_fee_on_projects; must be diffed against prod before apply.
-- Replaces existing function protect_signup_fee_charge_row; must be diffed against prod before apply.
-- Replaces existing function protect_platform_review; must be diffed against prod before apply.

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

-- Payments stay. Only the profile link is cleared. Stripe ids are not touched.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_customer_id_fkey;
ALTER TABLE public.payments ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

-- Ledger rows are immutable, so the actor id stays and the foreign key goes.
ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_actor_id_fkey;

-- Terms and privacy acceptances stay, with the profile id kept as an opaque uuid.
ALTER TABLE public.agreement_acceptances DROP CONSTRAINT IF EXISTS agreement_acceptances_profile_id_fkey;

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
  'Service-role account close in one transaction, including the auth user delete. Blocks active bookings, open disputes, and unfinished refunds. Anonymizes the pro card. Keeps projects except an empty draft. Keeps payment amounts, Stripe ids, dates, statuses, refund rows, and audit rows. Clears refund and cancellation free text and replaces schedule descriptions with the item kind. Does not rewrite immutable ledger notes, dispute classifications, or refund_reason codes. Never deletes payments, refunds, ledger rows, disputes, bookings, connections, checkout sessions, messages, booking reviews, agreement acceptances, or audit logs.';

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

-- F2: live enforce_signup_fee_on_projects, plus an early return when an update
-- only clears the project owner. Based on the live body from the prod dry run.
CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_projects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.customer_id IS NULL AND OLD.customer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM public.assert_signup_fee_paid(NEW.customer_id);
  RETURN NEW;
END;
$function$;

-- F3: live protect_signup_fee_charge_row, plus a purge UPDATE that may set
-- profile_id null and nothing else. Based on the live body from the prod dry run.
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
  IF public.ppp_rpc_is('purge_account_owned_rows')
     AND TG_OP = 'UPDATE'
     AND NEW.profile_id IS NULL
     AND (to_jsonb(NEW) - 'profile_id' - 'updated_at') = (to_jsonb(OLD) - 'profile_id' - 'updated_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'signup fee charges cannot be written from the client';
END;
$function$;

-- F4: audit_logs is immutable, so ON DELETE SET NULL on actor_id makes every
-- auth.users delete fail once this purge writes an audit row. Keep the actor
-- uuid. Drop only the foreign key.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;

-- F5: estimate_events and signup_fee_events keep the actor/profile id as an
-- opaque uuid (same approach as F4). Do not replace forbid_estimate_event_mutation
-- or protect_signup_fee_event_row; dropping the keys avoids those triggers on
-- the auth.users delete.
ALTER TABLE public.estimate_events DROP CONSTRAINT IF EXISTS estimate_events_actor_id_fkey;
ALTER TABLE public.signup_fee_events DROP CONSTRAINT IF EXISTS signup_fee_events_profile_id_fkey;

-- F6: server-side / cascade delete of a deleted account's platform reviews.
-- Live body, with the DELETE branch allowing auth.uid() IS NULL.
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
    -- Server-side deletes (service role, auth user deletion cascading through
    -- profiles) have no signed-in user. Signed-in non-admins stay blocked.
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can delete a platform review';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;
