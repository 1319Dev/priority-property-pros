-- Rollback for 20261020100001_admin_alerts_disputes_refunds.sql
-- Removes the admin alert triggers and helpers, the admin notification categories, and restores
-- ensure_notification_preferences to its live body captured 2026-10-11 before deploy.
-- Audit rows and notifications already written are kept (they are history, not configuration).
-- Payment rows, refund flags, and booking statuses are not touched.

DROP TRIGGER IF EXISTS bookings_admin_alert_disputed ON public.bookings;
DROP TRIGGER IF EXISTS project_connections_admin_alert_refund ON public.project_connections;
DROP TRIGGER IF EXISTS signup_fee_charges_admin_alert_refund ON public.signup_fee_charges;
DROP TRIGGER IF EXISTS contractor_profiles_admin_alert_submitted ON public.contractor_profiles;
DROP TRIGGER IF EXISTS content_reports_admin_alert ON public.content_reports;

DROP FUNCTION IF EXISTS public.admin_alert_booking_disputed();
DROP FUNCTION IF EXISTS public.admin_alert_refund_flagged();
DROP FUNCTION IF EXISTS public.admin_alert_application_submitted();
DROP FUNCTION IF EXISTS public.admin_alert_content_report();
DROP FUNCTION IF EXISTS public.notify_admins(text, text, text, text, uuid, jsonb, uuid);
DROP FUNCTION IF EXISTS public.admin_path_for_reference(integer);

-- LIVE definition captured 2026-10-11 before deploy.
CREATE OR REPLACE FUNCTION public.ensure_notification_preferences(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted integer := 0;
  v_type text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT account_type::text INTO v_type
  FROM public.profiles
  WHERE id = p_user_id;

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
  WHERE v.category <> 'new_job' OR v_type = 'CONTRACTOR'
  ON CONFLICT (user_id, category) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$function$;

DELETE FROM public.notification_preferences
WHERE category IN ('admin_applications', 'admin_reports', 'admin_disputes', 'admin_refunds');

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_category_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_category_check CHECK (
    category = ANY (ARRAY['new_job', 'messages', 'connect', 'estimates', 'booking', 'change_orders', 'reviews', 'account']::text[])
  );
