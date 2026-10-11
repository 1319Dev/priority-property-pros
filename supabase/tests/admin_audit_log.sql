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

SET ROLE authenticated;
SELECT public._audit_raises(
  $$INSERT INTO public.audit_logs (action, entity_type) VALUES ('client.wrote', 'project')$$,
  'permission denied'
);
RESET ROLE;
