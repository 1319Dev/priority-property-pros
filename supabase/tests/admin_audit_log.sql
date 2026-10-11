-- Admin-only audit feed, and no client writes to audit_logs.
-- Does not call Stripe and does not update a production database.
--
--   psql -d admin_audit -v ON_ERROR_STOP=1 -f supabase/tests/admin_audit_log.sql

\set ON_ERROR_STOP on
SET client_min_messages = warning;
SET TIME ZONE 'UTC';

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(current_setting('request.jwt.claims', true), '') = '' THEN NULL::jsonb
    ELSE current_setting('request.jwt.claims', true)::jsonb
  END;
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE public.account_type AS ENUM ('CUSTOMER', 'CONTRACTOR', 'VERIFIER', 'ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
    CREATE TYPE public.account_status AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value_int integer,
  value_text text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  first_name text,
  last_name text,
  account_type public.account_type NOT NULL,
  account_status public.account_status NOT NULL DEFAULT 'ACTIVE'
);

INSERT INTO public.profiles (id, email, first_name, last_name, account_type, account_status)
VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'admin@example.test', 'Cam', 'Admin', 'ADMIN', 'ACTIVE'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'home@example.test', 'Ada', 'Home', 'CUSTOMER', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

\ir ../migrations/20261013000001_admin_mfa_required.sql

CREATE OR REPLACE FUNCTION public.admin_require()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY,
  reference_number bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.estimates (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.change_orders (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.connection_checkout_sessions (
  id uuid PRIMARY KEY,
  project_id uuid
);

CREATE TABLE IF NOT EXISTS public.connection_checkout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_event_id text NOT NULL UNIQUE,
  checkout_session_id uuid,
  stripe_checkout_session_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

GRANT INSERT, UPDATE, DELETE ON TABLE public.audit_logs TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb) TO anon, authenticated;

-- Columns the loaded event functions read. Nullable so the viewer fixtures still insert.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS contractor_profile_id uuid;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS billable_amount_cents integer;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS amount_cents integer;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_hired_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS contractor_hired_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'change_order_status') THEN
    CREATE TYPE public.change_order_status AS ENUM (
      'PROPOSED', 'CUSTOMER_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED'
    );
  END IF;
END $$;

ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS created_by_role text;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS amount_delta_cents integer;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS status public.change_order_status;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS customer_approved_at timestamptz;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS customer_approved_by uuid;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS contractor_acked_at timestamptz;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS contractor_acked_by uuid;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE public.change_orders ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS public.booking_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid,
  customer_id uuid,
  contractor_profile_id uuid,
  rating integer,
  body text,
  is_verified boolean,
  reviewer_role text
);

CREATE TABLE IF NOT EXISTS public.customer_contractor_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_profile_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  reason text,
  source_booking_id uuid,
  source_review_id uuid,
  UNIQUE (customer_profile_id, contractor_profile_id)
);

CREATE TABLE IF NOT EXISTS public.customer_contractor_relationships (
  customer_id uuid,
  contractor_profile_id uuid,
  status text,
  last_completed_booking_id uuid,
  last_completed_at timestamptz,
  protected_until timestamptz
);

CREATE OR REPLACE FUNCTION public.ppp_set_rpc(p_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('ppp.rpc', p_name, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.current_contractor_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('test.contractor_profile_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.write_booking_event(uuid, text, jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_booking_money(uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
END;
$$;

CREATE OR REPLACE FUNCTION public.add_change_order_schedule_item(uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_relationship_on_confirm(uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_protection_months()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT 12;
$$;

CREATE OR REPLACE FUNCTION public.payments_live()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.close_blocked_contractor_open_offers(uuid, uuid, uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 0;
END;
$$;

-- This is the migration that previously never loaded. A syntax error stops the file.
\ir ../migrations/20261019000003_admin_audit_events.sql

DROP TRIGGER IF EXISTS booking_reviews_low_rating ON public.booking_reviews;
CREATE TRIGGER booking_reviews_low_rating
  BEFORE INSERT ON public.booking_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_customer_low_rating_block();

\ir ../migrations/20261019000004_admin_audit_log_rpc.sql

CREATE OR REPLACE FUNCTION public._audit_ok(p_cond boolean, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_cond, false) THEN
    RAISE EXCEPTION 'admin audit test failed: %', p_msg;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._audit_raises(p_sql text, p_expected text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'expected failure containing: %', p_expected;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM ILIKE 'expected failure containing:%' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT ILIKE '%' || p_expected || '%' THEN
      RAISE EXCEPTION 'expected "%" in error, got "%"', p_expected, SQLERRM;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._audit_jwt(p_sub uuid, p_aal text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_sub, 'aal', p_aal, 'role', 'authenticated')::text,
    false
  );
END;
$$;

SELECT public._audit_ok(
  NOT has_table_privilege('anon', 'public.audit_logs', 'INSERT'),
  'anon cannot insert audit rows'
);
SELECT public._audit_ok(
  NOT has_table_privilege('authenticated', 'public.audit_logs', 'INSERT'),
  'authenticated cannot insert audit rows'
);
SELECT public._audit_ok(
  NOT has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE'),
  'authenticated cannot update audit rows'
);
SELECT public._audit_ok(
  NOT has_table_privilege('authenticated', 'public.audit_logs', 'DELETE'),
  'authenticated cannot delete audit rows'
);
SELECT public._audit_ok(
  has_table_privilege('authenticated', 'public.audit_logs', 'SELECT'),
  'authenticated can select and RLS still requires is_admin'
);
SELECT public._audit_ok(
  NOT has_function_privilege('anon', 'public.write_audit_log(uuid, text, text, uuid, jsonb)', 'EXECUTE'),
  'anon cannot execute write_audit_log'
);
SELECT public._audit_ok(
  NOT has_function_privilege('authenticated', 'public.write_audit_log(uuid, text, text, uuid, jsonb)', 'EXECUTE'),
  'authenticated cannot execute write_audit_log'
);
SELECT public._audit_ok(
  NOT has_function_privilege('anon', 'public.admin_list_audit_log(text, text, date, date, text, integer)', 'EXECUTE'),
  'anon cannot execute the viewer'
);
SELECT public._audit_ok(
  has_function_privilege('authenticated', 'public.admin_list_audit_log(text, text, date, date, text, integer)', 'EXECUTE'),
  'authenticated can execute the viewer, which still checks is_admin'
);

INSERT INTO public.projects (id, reference_number)
VALUES ('11111111-1111-4111-8111-111111111111', 1042);

INSERT INTO public.bookings (id, project_id)
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');

INSERT INTO public.connection_checkout_sessions (id, project_id)
VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');

INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'booking.review_submitted',
  'booking',
  '22222222-2222-4222-8222-222222222222',
  jsonb_build_object(
    'reviewer_role', 'CUSTOMER',
    'rating', '5',
    'email', 'secret@example.com',
    'phone', '555-0100',
    'business_name', 'Hidden Pros LLC',
    'storage_path', 'private/photo.jpg',
    'body', 'Call me at 555-0199 about 12 Oak Street',
    'address', '12 Oak Street'
  ),
  '2026-10-11 15:04:00+00'
);

INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'portfolio.privacy_set',
  'project',
  '11111111-1111-4111-8111-111111111111',
  jsonb_build_object(
    'privacy_state', 'PRIVATE',
    'storage_path', 'private/photo.jpg',
    'business_name', 'Hidden Pros LLC'
  ),
  '2026-10-11 16:00:00+00'
);

INSERT INTO public.connection_checkout_events (
  processor_event_id, checkout_session_id, stripe_checkout_session_id, event_type, payload, created_at
) VALUES (
  'evt_test',
  '33333333-3333-4333-8333-333333333333',
  'cs_test_secret',
  'checkout.session.completed',
  jsonb_build_object('customer_email', 'secret@example.com', 'stripe_customer', 'cus_secret'),
  '2026-10-11 17:00:00+00'
);

SELECT public._audit_raises(
  'UPDATE public.audit_logs SET action = ''tampered''',
  'audit_logs are immutable'
);
SELECT public._audit_raises(
  'DELETE FROM public.audit_logs',
  'audit_logs are immutable'
);

SELECT public._audit_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal1');
SELECT public._audit_raises(
  'SELECT * FROM public.admin_list_audit_log()',
  'not authorized'
);

SELECT public._audit_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');

SELECT public._audit_ok(
  (SELECT count(*) FROM public.admin_list_audit_log()) = 3,
  'admin sees the audit rows and the checkout event'
);

SELECT public._audit_ok(
  (SELECT count(*) FROM public.admin_list_audit_log(NULL, NULL, NULL, NULL, 'PPP-1042')) = 3,
  'PPP-1042 matches the booking, the project, and the checkout'
);

SELECT public._audit_ok(
  (SELECT count(*) FROM public.admin_list_audit_log('CUSTOMER', 'booking.review', '2026-10-11', '2026-10-11', '1042')) = 1,
  'role, action, date, and bare PPP number narrow to one row'
);

SELECT public._audit_ok(
  (
    SELECT summary = 'CUSTOMER · rating 5'
    FROM public.admin_list_audit_log('CUSTOMER', NULL, NULL, NULL, 'PPP-1042')
  ),
  'summary keeps the role and rating only'
);

SELECT public._audit_ok(
  (
    SELECT action = 'connection.checkout.checkout.session.completed'
      AND actor_role = 'SYSTEM'
      AND summary IS NULL
      AND job_reference = 'PPP-1042'
    FROM public.admin_list_audit_log('SYSTEM', 'connection.checkout', NULL, NULL, 'PPP-1042')
  ),
  'checkout feed shows type, time, and PPP number'
);

SELECT public._audit_ok(
  position('secret@example.com' IN coalesce((
    SELECT string_agg(coalesce(actor_role, '') || ' ' || coalesce(action, '') || ' ' || coalesce(job_reference, '') || ' ' || coalesce(summary, ''), ' | ')
    FROM public.admin_list_audit_log()
  ), '')) = 0,
  'feed hides the email'
);
SELECT public._audit_ok(
  position('Hidden Pros' IN coalesce((
    SELECT string_agg(coalesce(summary, '') || ' ' || coalesce(action, ''), ' | ')
    FROM public.admin_list_audit_log()
  ), '')) = 0,
  'feed hides the business name'
);
SELECT public._audit_ok(
  position('photo.jpg' IN coalesce((
    SELECT string_agg(coalesce(summary, '') || ' ' || coalesce(action, ''), ' | ')
    FROM public.admin_list_audit_log()
  ), '')) = 0,
  'feed hides the photo path'
);
SELECT public._audit_ok(
  position('Oak Street' IN coalesce((
    SELECT string_agg(coalesce(summary, '') || ' ' || coalesce(action, ''), ' | ')
    FROM public.admin_list_audit_log()
  ), '')) = 0,
  'feed hides the address'
);
SELECT public._audit_ok(
  position('cus_secret' IN coalesce((
    SELECT string_agg(coalesce(summary, '') || ' ' || coalesce(action, ''), ' | ')
    FROM public.admin_list_audit_log()
  ), '')) = 0,
  'feed hides the checkout payload'
);
SELECT public._audit_ok(
  position('cs_test_secret' IN coalesce((
    SELECT string_agg(coalesce(summary, '') || ' ' || coalesce(action, ''), ' | ')
    FROM public.admin_list_audit_log()
  ), '')) = 0,
  'feed hides the stripe session id'
);

CREATE OR REPLACE FUNCTION public._audit_n(p_action text)
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT count(*) FROM public.audit_logs WHERE action = p_action;
$$;

SELECT public._audit_ok(
  position('write_audit_log' IN pg_get_functiondef('public.propose_change_order(uuid,text,integer)'::regprocedure)) > 0
  AND position('write_audit_log' IN pg_get_functiondef('public.respond_change_order(uuid,boolean)'::regprocedure)) > 0
  AND position('write_audit_log' IN pg_get_functiondef('public.start_booking(uuid)'::regprocedure)) > 0
  AND position('write_audit_log' IN pg_get_functiondef('public.complete_booking(uuid)'::regprocedure)) > 0
  AND position('write_audit_log' IN pg_get_functiondef('public.submit_booking_review(uuid,integer,text)'::regprocedure)) > 0
  AND position('write_audit_log' IN pg_get_functiondef('public.block_contractor_for_customer(uuid,uuid,uuid)'::regprocedure)) > 0
  AND position('write_audit_log' IN pg_get_functiondef('public.unblock_contractor_for_customer(uuid)'::regprocedure)) > 0
  AND position('write_audit_log' IN pg_get_functiondef('public.apply_customer_low_rating_block()'::regprocedure)) > 0,
  '000003 loaded and each wrapped function writes an audit row'
);

INSERT INTO public.bookings (
  id, project_id, status, customer_id, contractor_profile_id, amount_cents, customer_hired_at, contractor_hired_at
) VALUES
  (
    '44444444-4444-4444-8444-444444444441',
    '11111111-1111-4111-8111-111111111111',
    'CONFIRMED',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    50000,
    NULL,
    NULL
  ),
  (
    '44444444-4444-4444-8444-444444444442',
    '11111111-1111-4111-8111-111111111111',
    'CONFIRMED',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    50000,
    NULL,
    NULL
  ),
  (
    '44444444-4444-4444-8444-444444444443',
    '11111111-1111-4111-8111-111111111111',
    'COMPLETED',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    50000,
    now(),
    now()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'CONFIRMED',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    50000,
    NULL,
    NULL
  );

SELECT set_config('test.contractor_profile_id', '', false);
SELECT public._audit_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal1');

CREATE TEMP TABLE _event_ids (label text PRIMARY KEY, id uuid);

INSERT INTO _event_ids (label, id)
SELECT 'customer_proposed', (public.propose_change_order(
  '44444444-4444-4444-8444-444444444441',
  'Add a vent hood',
  1500
) ->> 'change_order_id')::uuid;

SELECT public._audit_ok(
  public._audit_n('change_order.proposed') = 1,
  'propose writes exactly one change_order.proposed row'
);

SELECT public.respond_change_order((SELECT id FROM _event_ids WHERE label = 'customer_proposed'), false);
SELECT public._audit_ok(
  public._audit_n('change_order.rejected') = 1,
  'reject writes exactly one change_order.rejected row'
);

SELECT public._audit_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');
INSERT INTO _event_ids (label, id)
SELECT 'admin_partial', (public.propose_change_order(
  '44444444-4444-4444-8444-444444444441',
  'Move the outlet',
  800
) ->> 'change_order_id')::uuid;
SELECT public._audit_ok(
  public._audit_n('change_order.proposed') = 2,
  'second propose writes one more change_order.proposed row'
);

SELECT public._audit_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal1');
SELECT public.respond_change_order((SELECT id FROM _event_ids WHERE label = 'admin_partial'), true);
SELECT public._audit_ok(
  public._audit_n('change_order.responded') = 1,
  'one-sided approval writes exactly one change_order.responded row'
);

SELECT public._audit_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');
INSERT INTO _event_ids (label, id)
SELECT 'admin_full', (public.propose_change_order(
  '44444444-4444-4444-8444-444444444441',
  'Paint the trim',
  600
) ->> 'change_order_id')::uuid;
SELECT public.respond_change_order((SELECT id FROM _event_ids WHERE label = 'admin_full'), true);
SELECT public._audit_ok(
  public._audit_n('change_order.approved') = 1,
  'admin approval writes exactly one change_order.approved row'
);
SELECT public._audit_ok(
  public._audit_n('change_order.proposed') = 3,
  'third propose writes one more change_order.proposed row'
);

SELECT public._audit_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal1');
SELECT public.start_booking('44444444-4444-4444-8444-444444444442');
SELECT public._audit_ok(
  public._audit_n('booking.started') = 1,
  'start writes exactly one booking.started row'
);
SELECT public.complete_booking('44444444-4444-4444-8444-444444444442');
SELECT public._audit_ok(
  public._audit_n('booking.completed') = 1,
  'complete writes exactly one booking.completed row'
);

SELECT public.submit_booking_review(
  '44444444-4444-4444-8444-444444444443',
  2,
  NULL
);
SELECT public._audit_ok(
  public._audit_n('booking.review_submitted') = 2,
  'a 2 star review writes exactly one new booking.review_submitted row'
);
SELECT public._audit_ok(
  public._audit_n('contractor.blocked_low_rating') = 1,
  'a 2 star review writes exactly one low-rating block row'
);

SELECT public.block_contractor_for_customer(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '44444444-4444-4444-8444-444444444444',
  NULL
);
SELECT public._audit_ok(
  public._audit_n('contractor.blocked') = 1,
  'block writes exactly one contractor.blocked row'
);
SELECT public.unblock_contractor_for_customer('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
SELECT public._audit_ok(
  public._audit_n('contractor.unblocked') = 1,
  'unblock writes exactly one contractor.unblocked row'
);

INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'admin.account_flag_set',
  'project',
  '11111111-1111-4111-8111-111111111111',
  '{}'::jsonb,
  '2026-10-11 18:00:00+00'
);

SELECT public._audit_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');
SELECT public._audit_ok(
  (SELECT count(*) FROM public.admin_list_audit_log(NULL, 'admin.account_flag_set', NULL, NULL, NULL)) = 1,
  'action filter keeps underscores in admin.account_flag_set'
);
SELECT public._audit_ok(
  (SELECT count(*) FROM public.admin_list_audit_log(NULL, 'change_order', NULL, NULL, 'PPP-1042')) = 6,
  'action filter keeps underscores in change_order'
);
SELECT public._audit_ok(
  (SELECT count(*) FROM public.admin_list_audit_log(NULL, 'changeorder', NULL, NULL, NULL)) = 0,
  'a filter without the underscore does not match change_order'
);
SELECT public._audit_ok(
  (SELECT count(*) FROM public.admin_list_audit_log(NULL, '%', NULL, NULL, NULL)) = 0,
  'a percent sign in the filter is not a wildcard'
);

SELECT 'loaded 20261019000003 and each new event wrote one row' AS admin_audit_events;

SET ROLE authenticated;
SELECT public._audit_raises(
  $$INSERT INTO public.audit_logs (action, entity_type) VALUES ('client.wrote', 'project')$$,
  'permission denied'
);
RESET ROLE;
