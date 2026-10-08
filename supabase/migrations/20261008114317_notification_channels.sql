-- Notification channels: in-site, web push, and email.
--
-- Does not change checkout, webhooks, fee functions, prices, or connection/booking
-- payment columns. The connection alert only READS project_connections.status.
-- Notification failures are swallowed so a customer's or contractor's action still commits.
--
-- PROVISIONING (one SQL statement, after this migration and the Edge Functions
-- are deployed). Placeholders only. Do not commit real values. This migration
-- does not call vault.create_secret.
--
-- Generate two random strings with: openssl rand -base64 32
-- <NOTIFY_WEBHOOK_SECRET>       first random string
-- <UNSUBSCRIBE_TOKEN_SECRET>    second random string
-- <VAPID_PUBLIC_KEY>            COMMITTED_VAPID_PUBLIC_KEY in src/lib/notifications/vapid.ts
-- <VAPID_PRIVATE_KEY>           owner's private key file, never git
-- <VAPID_SUBJECT>               mailto:prioritypropertypros@gmail.com
-- <NOTIFICATION_FROM>           Priority Property Pros <notifications@prioritypropertypros.com>
-- <NOTIFICATION_SITE_URL>       https://prioritypropertypros.com
-- <NOTIFICATION_FUNCTION_URL>   https://<project-ref>.supabase.co/functions/v1/send-notification
--
-- DO $vault$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notify_webhook_secret') THEN
--     PERFORM vault.create_secret('<NOTIFY_WEBHOOK_SECRET>', 'notify_webhook_secret', 'Header secret for send-notification');
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'unsubscribe_token_secret') THEN
--     PERFORM vault.create_secret('<UNSUBSCRIBE_TOKEN_SECRET>', 'unsubscribe_token_secret', 'Signs one-click unsubscribe links');
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'vapid_public_key') THEN
--     PERFORM vault.create_secret('<VAPID_PUBLIC_KEY>', 'vapid_public_key', 'Web Push public key');
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'vapid_private_key') THEN
--     PERFORM vault.create_secret('<VAPID_PRIVATE_KEY>', 'vapid_private_key', 'Web Push private key');
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'vapid_subject') THEN
--     PERFORM vault.create_secret('<VAPID_SUBJECT>', 'vapid_subject', 'Web Push subject');
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notification_from') THEN
--     PERFORM vault.create_secret('<NOTIFICATION_FROM>', 'notification_from', 'From address for alert email');
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notification_site_url') THEN
--     PERFORM vault.create_secret('<NOTIFICATION_SITE_URL>', 'notification_site_url', 'Public site origin for alert links');
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notification_function_url') THEN
--     PERFORM vault.create_secret('<NOTIFICATION_FUNCTION_URL>', 'notification_function_url', 'send-notification URL for pg_net');
--   END IF;
-- END
-- $vault$;
--
-- The owner pastes only RESEND_API_KEY in Dashboard → Edge Functions → Secrets.
-- Optional fallback, not required: vault.create_secret('<RESEND_API_KEY>', 'resend_api_key', 'Resend').
-- Functions read Vault first and fall back to the matching Deno env var.
-- RESEND_API_KEY is read from the environment first, then Vault name resend_api_key.
-- Until the function URL and webhook secret exist, in-site alerts still save.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.notification_delivery_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  function_url text,
  webhook_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.notification_delivery_config FROM PUBLIC;
REVOKE ALL ON TABLE private.notification_delivery_config FROM anon, authenticated;

INSERT INTO private.notification_delivery_config (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

COMMENT ON TABLE private.notification_delivery_config IS
  'Optional fallback for the send-notification URL and shared secret when Vault names notification_function_url and notify_webhook_secret are empty. Not granted to anon or authenticated. This migration stores no secret.';

-- ---------------------------------------------------------------------------
-- Preferences. One row per user and category. Users only see and edit their own.
-- Defaults: in-app on, push off until the person enables push, email on for
-- new_job, messages, connect, estimates, booking, and change_orders.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  category text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  push boolean NOT NULL DEFAULT false,
  email boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category),
  CONSTRAINT notification_preferences_category_check CHECK (
    category IN (
      'new_job',
      'messages',
      'connect',
      'estimates',
      'booking',
      'change_orders',
      'reviews',
      'account'
    )
  )
);

DROP TRIGGER IF EXISTS notification_preferences_set_updated_at ON public.notification_preferences;
CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notification_preferences TO authenticated;
GRANT UPDATE (in_app, push, email, updated_at) ON TABLE public.notification_preferences TO authenticated;

DROP POLICY IF EXISTS notification_preferences_select_own ON public.notification_preferences;
CREATE POLICY notification_preferences_select_own
  ON public.notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_preferences_update_own ON public.notification_preferences;
CREATE POLICY notification_preferences_update_own
  ON public.notification_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.ensure_notification_preferences(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer := 0;
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
  RETURN inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_notification_preferences_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_notification_preferences(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_seed_notification_preferences ON public.profiles;
CREATE TRIGGER profiles_seed_notification_preferences
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_notification_preferences_row();

INSERT INTO public.notification_preferences (user_id, category, in_app, push, email)
SELECT p.id, v.category, true, false, v.email_on
FROM public.profiles p
CROSS JOIN (
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

CREATE OR REPLACE FUNCTION public.ensure_my_notification_preferences()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  RETURN public.ensure_notification_preferences(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_notification_preferences(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_notification_preferences_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_my_notification_preferences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_notification_preferences() TO authenticated;

-- ---------------------------------------------------------------------------
-- Web Push subscriptions. Endpoint is unique so a browser can move between accounts.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint),
  CONSTRAINT push_subscriptions_endpoint_https CHECK (endpoint LIKE 'https://%')
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.push_subscriptions TO authenticated;

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.save_my_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nid uuid;
  clean_endpoint text := btrim(coalesce(p_endpoint, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF clean_endpoint !~ '^https://' OR length(clean_endpoint) < 12 OR length(clean_endpoint) > 2000 THEN
    RAISE EXCEPTION 'invalid push endpoint';
  END IF;
  IF p_p256dh IS NULL OR p_auth IS NULL OR length(btrim(p_p256dh)) < 8 OR length(btrim(p_auth)) < 8 THEN
    RAISE EXCEPTION 'invalid push keys';
  END IF;

  DELETE FROM public.push_subscriptions WHERE endpoint = clean_endpoint;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
  VALUES (
    auth.uid(),
    clean_endpoint,
    btrim(p_p256dh),
    btrim(p_auth),
    left(coalesce(p_user_agent, ''), 400),
    now()
  )
  RETURNING id INTO nid;

  RETURN nid;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  DELETE FROM public.push_subscriptions
  WHERE user_id = auth.uid()
    AND endpoint = btrim(coalesce(p_endpoint, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_push_subscription(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_push_subscription(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_push_subscription(text) TO authenticated;

-- Successful email sends. Service role only. Used for the 15-minute message cap.
CREATE TABLE IF NOT EXISTS public.notification_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications (id) ON DELETE CASCADE,
  recipient_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  category text NOT NULL,
  conversation_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_email_log_conversation_sent_idx
  ON public.notification_email_log (recipient_profile_id, conversation_id, sent_at DESC)
  WHERE category = 'messages' AND conversation_id IS NOT NULL;

ALTER TABLE public.notification_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_email_log FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Allow server-side enqueue from notification triggers without changing ppp.rpc,
-- which later statements in the same transaction still depend on.
-- Clients have no INSERT grant on notifications.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_notification_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL
       AND coalesce(current_setting('ppp.rpc', true), '') = ''
       AND coalesce(current_setting('ppp.notify', true), '') IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'notifications cannot be inserted from the client';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'notifications cannot be deleted from the client';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.recipient_profile_id IS DISTINCT FROM OLD.recipient_profile_id
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.channel IS DISTINCT FROM OLD.channel
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'notifications are immutable except read_at';
    END IF;
    IF NEW.recipient_profile_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'not your notification';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_notification_row() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_safely(
  p_recipient uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_recipient IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    PERFORM set_config('ppp.notify', '1', true);
    PERFORM public.enqueue_notification(
      p_recipient,
      p_kind,
      p_title,
      p_body,
      p_entity_type,
      p_entity_id,
      coalesce(p_payload, '{}'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notification skipped for %', p_kind;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_safely(uuid, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- New job offered. Inserts and reopened AVAILABLE offers. No address or contact.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_opportunity_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'AVAILABLE' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'AVAILABLE' THEN
      RETURN NEW;
    END IF;
  END IF;

  v_user := public.contractor_owner_profile_id(NEW.contractor_profile_id);
  PERFORM public.notify_safely(
    v_user,
    'opportunity.offered',
    'New job offered',
    'A new job in your service area is ready to view.',
    'opportunities',
    NEW.id,
    jsonb_build_object(
      'project_id', NEW.project_id,
      'path', '/app/pro/opportunities/' || NEW.id::text
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_notify_offer ON public.opportunities;
CREATE TRIGGER opportunities_notify_offer
  AFTER INSERT OR UPDATE OF status ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_opportunity_offer();

REVOKE ALL ON FUNCTION public.notify_opportunity_offer() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- $4.99 Connect becomes active. Reads status only. Does not write the row.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_connection_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'PAID' AND NEW.status IS DISTINCT FROM 'COMPLETED' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('PAID', 'COMPLETED') THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_safely(
    NEW.customer_id,
    'connect.paid',
    'A pro connected',
    'A pro connected on your project.',
    'project_connections',
    NEW.id,
    jsonb_build_object(
      'project_id', NEW.project_id,
      'path', '/app/customer/projects/' || NEW.project_id::text
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_connections_notify_active ON public.project_connections;
CREATE TRIGGER project_connections_notify_active
  AFTER UPDATE OF status ON public.project_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_connection_active();

REVOKE ALL ON FUNCTION public.notify_connection_active() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notify_connection_active() IS
  'Customer alert when a connection status becomes PAID or COMPLETED. Reads status, customer, and project id only. Does not write the connection row.';

-- ---------------------------------------------------------------------------
-- Questions. Bodies stay generic so prompts and answers are not copied out.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_estimate_question()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_contractor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.customer_id INTO v_customer
    FROM public.projects p
    WHERE p.id = NEW.project_id;
    PERFORM public.notify_safely(
      v_customer,
      'question.asked',
      'New question',
      'A pro asked a question about your project.',
      'estimate_questions',
      NEW.id,
      jsonb_build_object(
        'project_id', NEW.project_id,
        'opportunity_id', NEW.opportunity_id,
        'path', '/app/customer/projects/' || NEW.project_id::text
      )
    );
    RETURN NEW;
  END IF;

  IF coalesce(btrim(OLD.answer_text), '') = '' AND coalesce(btrim(NEW.answer_text), '') <> '' THEN
    v_contractor := public.contractor_owner_profile_id(NEW.asked_by_contractor_profile_id);
    PERFORM public.notify_safely(
      v_contractor,
      'question.answered',
      'Question answered',
      'A homeowner answered your question.',
      'estimate_questions',
      NEW.id,
      jsonb_build_object(
        'project_id', NEW.project_id,
        'opportunity_id', NEW.opportunity_id,
        'path', '/app/pro/opportunities/' || NEW.opportunity_id::text
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimate_questions_notify ON public.estimate_questions;
CREATE TRIGGER estimate_questions_notify
  AFTER INSERT OR UPDATE OF answer_text ON public.estimate_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_estimate_question();

REVOKE ALL ON FUNCTION public.notify_estimate_question() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hired and booking status. Does not write fee or charge columns.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_booking_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contractor uuid;
  v_customer_path text := '/app/customer/bookings/' || NEW.id::text;
  v_pro_path text := '/app/pro/bookings/' || NEW.id::text;
  v_kind text;
  v_title text;
  v_body text;
BEGIN
  v_contractor := public.contractor_owner_profile_id(NEW.contractor_profile_id);

  IF NEW.customer_hired_at IS NOT NULL
     AND NEW.contractor_hired_at IS NOT NULL
     AND (OLD.customer_hired_at IS NULL OR OLD.contractor_hired_at IS NULL) THEN
    PERFORM public.notify_safely(
      NEW.customer_id,
      'booking.hired',
      'Hired',
      'Both sides confirmed Hired.',
      'bookings',
      NEW.id,
      jsonb_build_object('project_id', NEW.project_id, 'booking_id', NEW.id, 'path', v_customer_path)
    );
    PERFORM public.notify_safely(
      v_contractor,
      'booking.hired',
      'Hired',
      'Both sides confirmed Hired.',
      'bookings',
      NEW.id,
      jsonb_build_object('project_id', NEW.project_id, 'booking_id', NEW.id, 'path', v_pro_path)
    );
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'CONFIRMED' THEN
    v_kind := 'booking.confirmed';
    v_title := 'Booking confirmed';
    v_body := 'Your booking is confirmed.';
  ELSIF NEW.status = 'IN_PROGRESS' THEN
    v_kind := 'booking.in_progress';
    v_title := 'Job in progress';
    v_body := 'Your booking is in progress.';
  ELSIF NEW.status = 'COMPLETED' THEN
    v_kind := 'booking.completed';
    v_title := 'Job completed';
    v_body := 'Your booking was marked completed.';
  ELSIF NEW.status = 'CANCELLED' THEN
    v_kind := 'booking.cancelled';
    v_title := 'Booking cancelled';
    v_body := 'Your booking was cancelled.';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.notify_safely(
    NEW.customer_id,
    v_kind,
    v_title,
    v_body,
    'bookings',
    NEW.id,
    jsonb_build_object('project_id', NEW.project_id, 'booking_id', NEW.id, 'path', v_customer_path)
  );
  PERFORM public.notify_safely(
    v_contractor,
    v_kind,
    v_title,
    v_body,
    'bookings',
    NEW.id,
    jsonb_build_object('project_id', NEW.project_id, 'booking_id', NEW.id, 'path', v_pro_path)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_notify_status ON public.bookings;
CREATE TRIGGER bookings_notify_status
  AFTER UPDATE OF status, customer_hired_at, contractor_hired_at ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_booking_status();

REVOKE ALL ON FUNCTION public.notify_booking_status() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Change orders: proposed, approved, declined. Description is not copied.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_change_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_contractor uuid;
  v_customer_path text;
  v_pro_path text;
  v_kind text;
  v_title text;
  v_body text;
BEGIN
  SELECT b.customer_id, public.contractor_owner_profile_id(b.contractor_profile_id)
    INTO v_customer, v_contractor
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;

  v_customer_path := '/app/customer/bookings/' || NEW.booking_id::text;
  v_pro_path := '/app/pro/bookings/' || NEW.booking_id::text;

  IF TG_OP = 'INSERT' THEN
    v_kind := 'change_order.proposed';
    v_title := 'Change order proposed';
    v_body := 'A change order was proposed on a booking.';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'APPROVED' THEN
    v_kind := 'change_order.approved';
    v_title := 'Change order approved';
    v_body := 'A change order was approved.';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'REJECTED' THEN
    v_kind := 'change_order.declined';
    v_title := 'Change order declined';
    v_body := 'A change order was declined.';
  ELSE
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.created_by_role = 'CUSTOMER' THEN
    PERFORM public.notify_safely(
      v_contractor, v_kind, v_title, v_body, 'change_orders', NEW.id,
      jsonb_build_object('booking_id', NEW.booking_id, 'path', v_pro_path)
    );
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.notify_safely(
      v_customer, v_kind, v_title, v_body, 'change_orders', NEW.id,
      jsonb_build_object('booking_id', NEW.booking_id, 'path', v_customer_path)
    );
  ELSE
    IF v_customer IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify_safely(
        v_customer, v_kind, v_title, v_body, 'change_orders', NEW.id,
        jsonb_build_object('booking_id', NEW.booking_id, 'path', v_customer_path)
      );
    END IF;
    IF v_contractor IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify_safely(
        v_contractor, v_kind, v_title, v_body, 'change_orders', NEW.id,
        jsonb_build_object('booking_id', NEW.booking_id, 'path', v_pro_path)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS change_orders_notify ON public.change_orders;
CREATE TRIGGER change_orders_notify
  AFTER INSERT OR UPDATE OF status ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_change_order();

REVOKE ALL ON FUNCTION public.notify_change_order() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reviews received. Review text is not copied into the alert.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_booking_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contractor uuid;
BEGIN
  IF NEW.reviewer_role = 'CUSTOMER' THEN
    v_contractor := public.contractor_owner_profile_id(NEW.contractor_profile_id);
    PERFORM public.notify_safely(
      v_contractor,
      'review.received',
      'New review',
      'You received a review.',
      'booking_reviews',
      NEW.id,
      jsonb_build_object(
        'booking_id', NEW.booking_id,
        'path', '/app/pro/bookings/' || NEW.booking_id::text
      )
    );
  ELSE
    PERFORM public.notify_safely(
      NEW.customer_id,
      'review.received',
      'New review',
      'You received a review.',
      'booking_reviews',
      NEW.id,
      jsonb_build_object(
        'booking_id', NEW.booking_id,
        'path', '/app/customer/bookings/' || NEW.booking_id::text
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_reviews_notify ON public.booking_reviews;
CREATE TRIGGER booking_reviews_notify
  AFTER INSERT ON public.booking_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_booking_review();

REVOKE ALL ON FUNCTION public.notify_booking_review() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vault reads for Edge Functions. Whitelisted names only. service_role only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.get_notification_channel_secrets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_object_agg(s.name, s.decrypted_secret)
      FILTER (WHERE s.decrypted_secret IS NOT NULL AND btrim(s.decrypted_secret) <> ''),
    '{}'::jsonb
  )
  FROM vault.decrypted_secrets s
  WHERE s.name IN (
    'notify_webhook_secret',
    'vapid_public_key',
    'vapid_private_key',
    'vapid_subject',
    'notification_from',
    'notification_site_url',
    'unsubscribe_token_secret',
    'notification_function_url',
    'resend_api_key'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_notification_channel_secrets()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_service_role();
  RETURN private.get_notification_channel_secrets();
END;
$$;

REVOKE ALL ON FUNCTION private.get_notification_channel_secrets() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_notification_channel_secrets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_notification_channel_secrets() TO service_role;

COMMENT ON FUNCTION public.get_notification_channel_secrets() IS
  'Returns whitelisted notification Vault secrets for the service role. Edge Functions fall back to Deno env when a name is missing.';

-- ---------------------------------------------------------------------------
-- After a notification row is saved, ask send-notification to deliver push/email.
-- Vault names win. private.notification_delivery_config fills any blank.
-- Missing config or a network error must not roll back the user's action.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dispatch_notification_channels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_cfg_url text;
  v_cfg_secret text;
BEGIN
  BEGIN
    BEGIN
      SELECT s.decrypted_secret INTO v_url
      FROM vault.decrypted_secrets s
      WHERE s.name = 'notification_function_url'
      LIMIT 1;
      SELECT s.decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets s
      WHERE s.name = 'notify_webhook_secret'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_url := NULL;
      v_secret := NULL;
    END;

    BEGIN
      SELECT c.function_url, c.webhook_secret
        INTO v_cfg_url, v_cfg_secret
      FROM private.notification_delivery_config c
      WHERE c.singleton
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_cfg_url := NULL;
      v_cfg_secret := NULL;
    END;

    IF v_url IS NULL OR btrim(v_url) = '' THEN
      v_url := v_cfg_url;
    END IF;
    IF v_secret IS NULL OR btrim(v_secret) = '' THEN
      v_secret := v_cfg_secret;
    END IF;

    IF v_url IS NULL OR btrim(v_url) = '' OR v_secret IS NULL OR btrim(v_secret) = '' THEN
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url := btrim(v_url),
      body := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notify-secret', v_secret
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notification delivery skipped for %', NEW.id;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_dispatch_channels ON public.notifications;
CREATE TRIGGER notifications_dispatch_channels
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_notification_channels();

REVOKE ALL ON FUNCTION public.dispatch_notification_channels() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.dispatch_notification_channels() IS
  'Queues send-notification via pg_net. Reads notification_function_url and notify_webhook_secret from Vault, then private.notification_delivery_config. Skips when either value is blank. Never raises to the caller.';

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime'
        AND n.nspname = 'public'
        AND c.relname = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;
