-- Local proof for the read-only payments dashboard.
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
  account_type text NOT NULL, account_status text NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contractor_profiles (
  id uuid PRIMARY KEY, profile_id uuid NOT NULL, business_name text NOT NULL DEFAULT ''
);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY, customer_id uuid NOT NULL, title text NOT NULL DEFAULT '', reference_number bigint
);
CREATE TABLE public.signup_fee_charges (
  id uuid PRIMARY KEY, profile_id uuid NOT NULL, amount_cents integer NOT NULL, livemode boolean NOT NULL DEFAULT false,
  status text NOT NULL, needs_refund boolean NOT NULL DEFAULT false, refund_reason text,
  fulfilled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.connection_checkout_sessions (
  id uuid PRIMARY KEY, project_id uuid NOT NULL, contractor_profile_id uuid NOT NULL, amount_cents integer NOT NULL,
  livemode boolean NOT NULL DEFAULT false, status text NOT NULL, needs_refund boolean NOT NULL DEFAULT false,
  refund_reason text, fulfilled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.admin_account_flags (profile_id uuid PRIMARY KEY, flag text NOT NULL, note text);
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

\ir ../migrations/20261019300004_admin_payments_dashboard.sql

INSERT INTO public.profiles (id, email, first_name, last_name, account_type) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com', 'Ada', 'Admin', 'ADMIN'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owen@example.com', 'Owen', 'Home', 'CUSTOMER'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'tina@example.com', 'Tina', 'Test', 'CUSTOMER'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pat@example.com', 'Pat', 'Pro', 'CONTRACTOR');
INSERT INTO public.contractor_profiles (id, profile_id, business_name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Plymate Example');
INSERT INTO public.admin_account_flags (profile_id, flag) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'TEST');
INSERT INTO public.projects (id, customer_id, title, reference_number) VALUES
  ('66666666-6666-4666-8666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Fence stain', 1004);
INSERT INTO public.signup_fee_charges (id, profile_id, amount_cents, livemode, status, needs_refund, created_at) VALUES
  ('10101010-1010-4010-8010-101010101010', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, true, 'PAID', false, '2026-10-01 15:00:00+00'),
  ('20202020-2020-4020-8020-202020202020', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, true, 'FAILED', false, '2026-10-02 15:00:00+00'),
  ('30303030-3030-4030-8030-303030303030', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, true, 'NEEDS_REFUND', true, '2026-10-03 15:00:00+00'),
  ('50505050-5050-4050-8050-505050505050', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, false, 'PAID', false, '2026-10-05 15:00:00+00'),
  ('60606060-6060-4060-8060-606060606060', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 999, true, 'PAID', false, '2026-10-06 15:00:00+00');
INSERT INTO public.signup_fee_charges (id, profile_id, amount_cents, livemode, status, needs_refund, refund_reason, created_at) VALUES
  ('40404040-4040-4040-8040-404040404040', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, true, 'PAID', true, 'duplicate', '2026-10-04 15:00:00+00');
INSERT INTO public.connection_checkout_sessions (id, project_id, contractor_profile_id, amount_cents, livemode, status, created_at) VALUES
  ('70707070-7070-4070-8070-707070707070', '66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 499, true, 'CONSUMED', '2026-10-07 15:00:00+00');

SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","aal":"aal2"}', false);
DO $$ BEGIN
  PERFORM public.admin_list_payments(NULL,NULL,NULL,NULL,false,50,0);
  RAISE EXCEPTION 'customer was allowed to list payments';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

DO $$
DECLARE
  listed jsonb;
  summary jsonb;
  keys text[];
  src text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal1"}', true);
  listed := public.admin_list_payments(NULL,NULL,NULL,NULL,false,50,0);
  IF (listed ->> 'total')::int <> 6 THEN RAISE EXCEPTION 'test account was not hidden, got %', listed ->> 'total'; END IF;
  listed := public.admin_list_payments(NULL,NULL,NULL,true,false,50,0);
  IF (listed ->> 'total')::int <> 1 OR listed #>> '{rows,0,status}' IS DISTINCT FROM 'FAILED' THEN
    RAISE EXCEPTION 'failed filter %', listed;
  END IF;
  listed := public.admin_list_payments('PPP-1004',NULL,NULL,NULL,false,50,0);
  IF (listed ->> 'total')::int <> 1 OR listed #>> '{rows,0,kind}' IS DISTINCT FROM 'connect' OR (listed #>> '{rows,0,amount_cents}')::int <> 499 THEN
    RAISE EXCEPTION 'connect row %', listed;
  END IF;
  IF listed #>> '{rows,0,business_name}' IS DISTINCT FROM 'Plymate Example' THEN RAISE EXCEPTION 'business name %', listed; END IF;
  listed := public.admin_list_payments('40404040-4040-4040-8040-404040404040',NULL,NULL,NULL,false,50,0);
  IF (listed #>> '{rows,0,refunded_cents}')::int <> 0 OR (listed #>> '{rows,0,needs_refund}')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'refund column %', listed -> 'rows' -> 0;
  END IF;
  IF listed #>> '{rows,0,refund_reason}' IS DISTINCT FROM 'duplicate' THEN RAISE EXCEPTION 'refund reason'; END IF;
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO keys
  FROM jsonb_object_keys(public.admin_list_payments('owen@example.com',NULL,NULL,NULL,false,50,0) -> 'rows' -> 0) key;
  IF keys <> ARRAY['amount_cents','business_name','created_at','email','fulfilled_at','kind','livemode','needs_refund','party_name','payment_id','profile_id','reference_number','refunded_cents','refund_reason','status'] THEN
    RAISE EXCEPTION 'list allowlist mismatch %', keys;
  END IF;

  summary := public.admin_payments_summary(false);
  IF (summary ->> 'gross_cents')::int <> 2497 OR (summary ->> 'refunded_cents')::int <> 0 OR (summary ->> 'net_cents')::int <> 2497 THEN
    RAISE EXCEPTION 'net revenue %', summary;
  END IF;
  IF (summary ->> 'failed_count')::int <> 1 OR (summary ->> 'needs_refund_count')::int <> 2 THEN
    RAISE EXCEPTION 'counts %', summary;
  END IF;
  IF summary ->> 'definition' !~ 'needs_refund flag is not a completed refund' THEN RAISE EXCEPTION 'definition'; END IF;

  SELECT pg_get_functiondef('public.admin_list_payments(text,text,text,boolean,boolean,integer,integer)'::regprocedure) INTO src;
  IF src ~ 'phone' OR src ~ 'street' OR src ~ 'stripe_' OR src ~ 'fee_cents' OR src ~ 'UPDATE |INSERT |DELETE ' THEN
    RAISE EXCEPTION 'list function is not a read-only allowlist';
  END IF;
  SELECT pg_get_functiondef('public.admin_payments_summary(boolean)'::regprocedure) INTO src;
  IF src ~ 'phone' OR src ~ 'street' OR src ~ 'stripe_' OR src ~ 'UPDATE |INSERT |DELETE ' THEN
    RAISE EXCEPTION 'summary function is not read-only';
  END IF;
  IF has_function_privilege('anon', 'public.admin_list_payments(text,text,text,boolean,boolean,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_payments_summary(boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute';
  END IF;
  UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';
  BEGIN
    PERFORM public.admin_payments_summary(false);
    RAISE EXCEPTION 'aal1 admin was allowed while MFA is required';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
