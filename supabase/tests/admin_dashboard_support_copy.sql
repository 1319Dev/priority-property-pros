-- Local proof that the support sentence changed and non-admins are still rejected.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN coalesce(current_setting('request.jwt.claims', true), '') = '' THEN NULL::jsonb ELSE current_setting('request.jwt.claims', true)::jsonb END;
$$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;
CREATE TABLE public.platform_settings (key text PRIMARY KEY, value_int integer);
INSERT INTO public.platform_settings VALUES ('admin_mfa_required', 0);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, email text NOT NULL, first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
  account_type text NOT NULL, account_status text NOT NULL DEFAULT 'ACTIVE'
);
CREATE TABLE public.contractor_profiles (
  id uuid PRIMARY KEY, profile_id uuid NOT NULL, approval_status text NOT NULL DEFAULT 'PENDING',
  identity_review_required boolean NOT NULL DEFAULT false
);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY, customer_id uuid NOT NULL, status text NOT NULL DEFAULT 'DRAFT', posted_at timestamptz
);
CREATE TABLE public.estimates (id uuid PRIMARY KEY, project_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY, customer_id uuid NOT NULL, contractor_profile_id uuid NOT NULL, status text NOT NULL,
  customer_hired_at timestamptz, contractor_hired_at timestamptz
);
CREATE TABLE public.contractor_portfolio (
  id uuid PRIMARY KEY, contractor_profile_id uuid NOT NULL, privacy_state text NOT NULL
);
CREATE TABLE public.platform_reviews (id uuid PRIMARY KEY, user_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE public.content_reports (id uuid PRIMARY KEY, reporter_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.signup_fee_charges (
  id uuid PRIMARY KEY, profile_id uuid NOT NULL, amount_cents integer NOT NULL, livemode boolean NOT NULL,
  status text NOT NULL, fulfilled_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.connection_checkout_sessions (
  id uuid PRIMARY KEY, contractor_profile_id uuid NOT NULL, amount_cents integer NOT NULL, livemode boolean NOT NULL,
  status text NOT NULL, fulfilled_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.admin_account_flags (profile_id uuid PRIMARY KEY, flag text NOT NULL);
CREATE OR REPLACE FUNCTION public.admin_mfa_required() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'admin_mfa_required'), 0) <> 0; $$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type = 'ADMIN' AND account_status = 'ACTIVE')
    AND (NOT public.admin_mfa_required() OR coalesce(auth.jwt() ->> 'aal', '') = 'aal2'); $$;
CREATE OR REPLACE FUNCTION public.admin_require() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF; END; $$;
CREATE OR REPLACE FUNCTION public.admin_account_is_excluded(p_profile_id uuid, p_include_test boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT coalesce(p_include_test, false) AND EXISTS (
    SELECT 1 FROM public.admin_account_flags f WHERE f.profile_id = p_profile_id AND f.flag = 'TEST'); $$;

\ir ../migrations/20261019300005_admin_dashboard_support_copy.sql

INSERT INTO public.profiles (id, email, first_name, last_name, account_type) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com', 'Ada', 'Admin', 'ADMIN'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owen@example.com', 'Owen', 'Home', 'CUSTOMER'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pat@example.com', 'Pat', 'Pro', 'CONTRACTOR');
INSERT INTO public.contractor_profiles (id, profile_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
INSERT INTO public.signup_fee_charges (id, profile_id, amount_cents, livemode, status) VALUES
  ('10101010-1010-4010-8010-101010101010', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 999, true, 'PAID');
INSERT INTO public.connection_checkout_sessions (id, contractor_profile_id, amount_cents, livemode, status) VALUES
  ('70707070-7070-4070-8070-707070707070', '11111111-1111-4111-8111-111111111111', 499, true, 'CONSUMED');

SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","aal":"aal2"}', false);
DO $$ BEGIN
  PERFORM public.admin_dashboard_summary(false);
  RAISE EXCEPTION 'customer was allowed to read the overview';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

DO $$
DECLARE
  summary jsonb;
  src text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal1"}', true);
  summary := public.admin_dashboard_summary(false);
  IF (summary #>> '{metrics,revenue_lifetime_cents,value}')::int <> 1498 THEN
    RAISE EXCEPTION 'gross revenue changed %', summary #>> '{metrics,revenue_lifetime_cents,value}';
  END IF;
  IF summary #>> '{metrics,revenue_net_cents,status}' IS DISTINCT FROM 'unavailable' THEN
    RAISE EXCEPTION 'net card changed';
  END IF;
  IF summary #>> '{metrics,support_tickets,definition}' !~ 'support@prioritypropertypros.com' THEN
    RAISE EXCEPTION 'support sentence %', summary #>> '{metrics,support_tickets,definition}';
  END IF;
  IF summary::text ~* 'gmail' THEN RAISE EXCEPTION 'old mailbox remains'; END IF;
  SELECT pg_get_functiondef('public.admin_dashboard_summary(boolean)'::regprocedure) INTO src;
  IF src ~ 'gmail' OR src !~ 'support@prioritypropertypros.com' THEN RAISE EXCEPTION 'function text'; END IF;
  IF src !~ 'PAID'', ''CONSUMED' THEN RAISE EXCEPTION 'succeeded statuses changed'; END IF;
  IF has_function_privilege('anon', 'public.admin_dashboard_summary(boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute';
  END IF;
  UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';
  BEGIN
    PERFORM public.admin_dashboard_summary(false);
    RAISE EXCEPTION 'aal1 admin was allowed while MFA is required';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
