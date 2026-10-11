-- Admin alerts and audit rows for disputes and refund flags, plus admin alerts for new
-- contractor applications and new content reports.
--
-- * A booking moving to DISPUTED writes an audit row (booking.disputed) and alerts admins.
-- * A Connect or activation payment newly flagged needs_refund writes an audit row
--   (payment.flagged_for_refund) and alerts admins. Refund behavior is unchanged: these are
--   AFTER triggers that only read NEW/OLD. Nothing is refunded and no status is changed.
-- * A contractor application moving to SUBMITTED (approval PENDING) alerts admins.
-- * A new content report alerts admins. The reason and notes text are not copied.
-- * Four admin-only notification categories so admins can turn each alert on or off.
--
-- Alert titles and bodies carry no names, contact, amounts, or report text. The payload holds
-- ids, the PPP number, and an admin path only. Delivery uses notify_safely, which never raises,
-- and the refund trigger also swallows audit errors so the Stripe webhook path cannot fail here.

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_category_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_category_check CHECK (
    category = ANY (ARRAY[
      'new_job', 'messages', 'connect', 'estimates', 'booking', 'change_orders', 'reviews', 'account',
      'admin_applications', 'admin_reports', 'admin_disputes', 'admin_refunds'
    ]::text[])
  );

CREATE OR REPLACE FUNCTION public.ensure_notification_preferences(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted integer := 0;
  extra integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notification_preferences (user_id, category, in_app, push, email)
  SELECT p_user_id, v.category, true, false, v.email_on
  FROM (
    VALUES
      ('new_job'::text, true),
      ('messages', true),
      ('connect', true),
      ('estimates', true),
      ('booking', true),
      ('change_orders', true),
      ('reviews', false),
      ('account', false)
  ) AS v(category, email_on)
  ON CONFLICT (user_id, category) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.account_type = 'ADMIN') THEN
    INSERT INTO public.notification_preferences (user_id, category, in_app, push, email)
    SELECT p_user_id, v.category, true, false, true
    FROM (
      VALUES ('admin_applications'::text), ('admin_reports'), ('admin_disputes'), ('admin_refunds')
    ) AS v(category)
    ON CONFLICT (user_id, category) DO NOTHING;
    GET DIAGNOSTICS extra = ROW_COUNT;
  END IF;

  RETURN inserted + extra;
END;
$function$;

-- Internal fan-out. Not callable by clients.
CREATE OR REPLACE FUNCTION public.notify_admins(
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_skip_profile_id uuid DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  sent integer := 0;
BEGIN
  FOR r IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.account_type = 'ADMIN'
      AND p.account_status::text NOT IN ('DELETED', 'DISABLED')
      AND p.id IS DISTINCT FROM p_skip_profile_id
  LOOP
    PERFORM public.notify_safely(r.id, p_kind, p_title, p_body, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb));
    sent := sent + 1;
  END LOOP;
  RETURN sent;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_admins(text, text, text, text, uuid, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_admins(text, text, text, text, uuid, jsonb, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, uuid, jsonb, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_path_for_reference(p_reference integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN p_reference IS NULL THEN '/app/admin/bookings'
              ELSE '/app/admin/bookings?ref=PPP-' || p_reference::text END;
$function$;

REVOKE ALL ON FUNCTION public.admin_path_for_reference(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_path_for_reference(integer) FROM anon, authenticated;

-- Disputes ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_alert_booking_disputed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref integer;
  v_role text;
  v_actor uuid := auth.uid();
BEGIN
  SELECT pr.reference_number INTO v_ref FROM public.projects pr WHERE pr.id = NEW.project_id;
  v_role := CASE
    WHEN v_actor IS NULL THEN 'SYSTEM'
    WHEN v_actor = NEW.customer_id THEN 'CUSTOMER'
    WHEN NEW.contractor_profile_id IS NOT DISTINCT FROM public.current_contractor_profile_id() THEN 'CONTRACTOR'
    WHEN public.is_admin() THEN 'ADMIN'
    ELSE 'OTHER'
  END;

  -- The audit row is part of the dispute. If it cannot be written, the dispute does not happen.
  PERFORM public.write_audit_log(
    v_actor,
    'booking.disputed',
    'booking',
    NEW.id,
    jsonb_build_object(
      'project_id', NEW.project_id,
      'reference_number', v_ref,
      'previous_status', OLD.status,
      'opened_by_role', v_role
    )
  );

  PERFORM public.notify_admins(
    'admin.dispute_opened',
    'Dispute opened',
    'A job was disputed. Open Booking tools to review it.',
    'bookings',
    NEW.id,
    jsonb_build_object(
      'booking_id', NEW.id,
      'project_id', NEW.project_id,
      'reference_number', v_ref,
      'opened_by_role', v_role,
      'path', public.admin_path_for_reference(v_ref)
    ),
    CASE WHEN v_role = 'ADMIN' THEN v_actor ELSE NULL END
  );
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_alert_booking_disputed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_alert_booking_disputed() FROM anon, authenticated;

DROP TRIGGER IF EXISTS bookings_admin_alert_disputed ON public.bookings;
CREATE TRIGGER bookings_admin_alert_disputed
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (NEW.status = 'DISPUTED' AND OLD.status IS DISTINCT FROM 'DISPUTED')
  EXECUTE FUNCTION public.admin_alert_booking_disputed();

-- Refund flags (observe only) -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_alert_refund_flagged()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kind text;
  v_entity_type text;
  v_project uuid;
  v_ref integer;
  v_path text;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'project_connections' THEN
      v_kind := 'connect';
      v_entity_type := 'project_connection';
      v_project := NEW.project_id;
      SELECT pr.reference_number INTO v_ref FROM public.projects pr WHERE pr.id = v_project;
      v_path := public.admin_path_for_reference(v_ref);
    ELSE
      v_kind := 'activation';
      v_entity_type := 'signup_fee_charge';
      v_project := NULL;
      v_ref := NULL;
      v_path := '/app/admin';
    END IF;

    PERFORM public.write_audit_log(
      auth.uid(),
      'payment.flagged_for_refund',
      v_entity_type,
      NEW.id,
      jsonb_build_object(
        'payment_kind', v_kind,
        'reason', NEW.refund_reason,
        'project_id', v_project,
        'reference_number', v_ref
      )
    );

    PERFORM public.notify_admins(
      'admin.refund_flagged',
      'Payment flagged for refund',
      CASE WHEN v_kind = 'connect'
        THEN 'A paid Connect was flagged for a refund. Nothing was refunded automatically.'
        ELSE 'A paid activation was flagged for a refund. Nothing was refunded automatically.'
      END,
      v_entity_type,
      NEW.id,
      jsonb_build_object(
        'payment_kind', v_kind,
        'reason', NEW.refund_reason,
        'project_id', v_project,
        'reference_number', v_ref,
        'path', v_path
      ),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never break the payment path that set the flag.
    RAISE WARNING 'admin refund alert skipped for %', NEW.id;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_alert_refund_flagged() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_alert_refund_flagged() FROM anon, authenticated;

DROP TRIGGER IF EXISTS project_connections_admin_alert_refund ON public.project_connections;
CREATE TRIGGER project_connections_admin_alert_refund
  AFTER UPDATE OF needs_refund ON public.project_connections
  FOR EACH ROW
  WHEN (NEW.needs_refund IS TRUE AND OLD.needs_refund IS NOT TRUE)
  EXECUTE FUNCTION public.admin_alert_refund_flagged();

DROP TRIGGER IF EXISTS signup_fee_charges_admin_alert_refund ON public.signup_fee_charges;
CREATE TRIGGER signup_fee_charges_admin_alert_refund
  AFTER UPDATE OF needs_refund ON public.signup_fee_charges
  FOR EACH ROW
  WHEN (NEW.needs_refund IS TRUE AND OLD.needs_refund IS NOT TRUE)
  EXECUTE FUNCTION public.admin_alert_refund_flagged();

-- New contractor applications -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_alert_application_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_admins(
    'admin.application_submitted',
    'New contractor application',
    'A contractor submitted an application. Review it in Approvals.',
    'contractor_profiles',
    NEW.id,
    jsonb_build_object(
      'contractor_profile_id', NEW.id,
      'path', '/app/admin/approvals/' || NEW.id::text
    ),
    NULL
  );
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_alert_application_submitted() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_alert_application_submitted() FROM anon, authenticated;

DROP TRIGGER IF EXISTS contractor_profiles_admin_alert_submitted ON public.contractor_profiles;
CREATE TRIGGER contractor_profiles_admin_alert_submitted
  AFTER UPDATE OF onboarding_status ON public.contractor_profiles
  FOR EACH ROW
  WHEN (
    NEW.onboarding_status = 'SUBMITTED'
    AND OLD.onboarding_status IS DISTINCT FROM 'SUBMITTED'
    AND NEW.approval_status = 'PENDING'
  )
  EXECUTE FUNCTION public.admin_alert_application_submitted();

-- New content reports -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_alert_content_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_admins(
    'admin.report_received',
    'New report',
    'Someone reported content on the site. It is listed under Needs your attention.',
    'content_reports',
    NEW.id,
    jsonb_build_object('report_id', NEW.id, 'target_type', NEW.target_type, 'path', '/app/admin'),
    NULL
  );
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_alert_content_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_alert_content_report() FROM anon, authenticated;

DROP TRIGGER IF EXISTS content_reports_admin_alert ON public.content_reports;
CREATE TRIGGER content_reports_admin_alert
  AFTER INSERT ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_alert_content_report();

-- Seed the admin categories for existing admins.
SELECT public.ensure_notification_preferences(p.id)
FROM public.profiles p
WHERE p.account_type = 'ADMIN';
