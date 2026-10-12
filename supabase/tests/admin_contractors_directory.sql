-- Local proof for the read-only contractors directory.
--   psql -d admin_contractors -v ON_ERROR_STOP=1 -f supabase/tests/admin_contractors_directory.sql

\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN coalesce(current_setting('request.jwt.claims', true), '') = '' THEN NULL::jsonb
    ELSE current_setting('request.jwt.claims', true)::jsonb END;
$$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;

CREATE TABLE public.platform_settings (key text PRIMARY KEY, value_int integer);
INSERT INTO public.platform_settings (key, value_int) VALUES ('admin_mfa_required', 0);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  account_type text NOT NULL,
  account_status text NOT NULL DEFAULT 'ACTIVE',
  signup_fee_status text NOT NULL DEFAULT 'UNPAID',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contractor_profiles (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL,
  business_name text NOT NULL DEFAULT '',
  primary_trade text,
  service_area text,
  approval_status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.service_categories (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.contractor_services (id uuid PRIMARY KEY, contractor_profile_id uuid NOT NULL, category_id uuid NOT NULL);
CREATE TABLE public.contractor_service_areas (
  id uuid PRIMARY KEY,
  contractor_profile_id uuid NOT NULL,
  label text,
  center_zip text
);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'POSTED',
  reference_number bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.estimates (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  status text NOT NULL,
  total_cents integer NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.booking_reviews (
  id uuid PRIMARY KEY,
  contractor_profile_id uuid NOT NULL,
  rating integer NOT NULL
);
CREATE TABLE public.signup_fee_charges (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  fulfilled_at timestamptz,
  needs_refund boolean NOT NULL DEFAULT false,
  refund_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.connection_checkout_sessions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  fulfilled_at timestamptz,
  needs_refund boolean NOT NULL DEFAULT false,
  refund_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.admin_account_flags (
  profile_id uuid PRIMARY KEY,
  flag text NOT NULL,
  note text,
  set_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.admin_mfa_required() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'admin_mfa_required'), 0) <> 0;
$$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND account_type = 'ADMIN' AND account_status = 'ACTIVE'
  ) AND (NOT public.admin_mfa_required() OR coalesce(auth.jwt() ->> 'aal', '') = 'aal2');
$$;
CREATE OR REPLACE FUNCTION public.admin_require() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_account_is_excluded(p_profile_id uuid, p_include_test boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT coalesce(p_include_test, false) AND p_profile_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_account_flags f WHERE f.profile_id = p_profile_id AND f.flag = 'TEST'
  );
$$;

\ir ../migrations/20261019300002_admin_contractors_directory.sql

INSERT INTO public.profiles (id, email, first_name, last_name, account_type, account_status, signup_fee_status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com', 'Ada', 'Admin', 'ADMIN', 'ACTIVE', 'NOT_REQUIRED'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pat@example.com', 'Pat', 'Pro', 'CONTRACTOR', 'ACTIVE', 'PAID'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'smoke@example.com', 'Sam', 'Smoke', 'CONTRACTOR', 'ACTIVE', 'PAID'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owen@example.com', 'Owen', 'Home', 'CUSTOMER', 'ACTIVE', 'PAID');
INSERT INTO public.contractor_profiles (id, profile_id, business_name, primary_trade, service_area, approval_status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Plymate Example', 'Handyman', 'Conroe', 'APPROVED'),
  ('22222222-2222-4222-8222-222222222222', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Smoke Test Services', 'Painting', 'Willis', 'APPROVED');
INSERT INTO public.admin_account_flags (profile_id, flag) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'TEST');
INSERT INTO public.service_categories (id, name) VALUES ('33333333-3333-4333-8333-333333333333', 'TV Mounting');
INSERT INTO public.contractor_services (id, contractor_profile_id, category_id) VALUES
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');
INSERT INTO public.contractor_service_areas (id, contractor_profile_id, label, center_zip) VALUES
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Montgomery County', '77301');
INSERT INTO public.projects (id, customer_id, title, reference_number) VALUES
  ('66666666-6666-4666-8666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Fence stain', 1004);
INSERT INTO public.estimates (id, project_id, contractor_profile_id, status, total_cents, submitted_at) VALUES
  ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'VIEWED', 25000, '2026-10-05 15:00:00+00');
INSERT INTO public.bookings (id, project_id, contractor_profile_id, status) VALUES
  ('88888888-8888-4888-8888-888888888888', '66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'COMPLETED');
INSERT INTO public.booking_reviews (id, contractor_profile_id, rating) VALUES
  ('99999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111', 5);
INSERT INTO public.signup_fee_charges (id, profile_id, amount_cents, livemode, status) VALUES
  ('abababab-abab-4bab-8bab-abababababab', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 999, true, 'CONSUMED');
INSERT INTO public.connection_checkout_sessions (id, project_id, contractor_profile_id, amount_cents, livemode, status) VALUES
  ('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd', '66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 499, true, 'PAID');

SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","aal":"aal2","role":"authenticated"}', false);
DO $$
BEGIN
  PERFORM public.admin_list_contractors(NULL, NULL, false, 50, 0);
  RAISE EXCEPTION 'customer was allowed to list contractors';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

DO $$
DECLARE
  listed jsonb;
  detail jsonb;
  keys text[];
  src text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal1","role":"authenticated"}', true);
  listed := public.admin_list_contractors(NULL, NULL, false, 50, 0);
  IF (listed ->> 'total')::int <> 1 OR listed -> 'rows' -> 0 ->> 'business_name' IS DISTINCT FROM 'Plymate Example' THEN
    RAISE EXCEPTION 'expected only Plymate Example, got %', listed;
  END IF;
  IF listed #>> '{rows,0,trades}' NOT LIKE '%TV Mounting%' OR listed #>> '{rows,0,trades}' NOT LIKE '%Handyman%' THEN
    RAISE EXCEPTION 'trades missing %', listed -> 'rows' -> 0 -> 'trades';
  END IF;
  IF listed #>> '{rows,0,area}' NOT LIKE '%Conroe%' OR listed #>> '{rows,0,area}' NOT LIKE '%77301%' THEN
    RAISE EXCEPTION 'area missing %', listed -> 'rows' -> 0 ->> 'area';
  END IF;
  IF (listed #>> '{rows,0,review_count}')::int <> 1 OR (listed #>> '{rows,0,rating}')::numeric <> 5 THEN
    RAISE EXCEPTION 'rating mismatch %', listed -> 'rows' -> 0;
  END IF;
  IF (listed #>> '{rows,0,job_count}')::int <> 1 OR (listed #>> '{rows,0,estimate_count}')::int <> 1 THEN
    RAISE EXCEPTION 'counts mismatch %', listed -> 'rows' -> 0;
  END IF;
  IF listed -> 'rows' -> 0 ->> 'approval_status' IS DISTINCT FROM 'APPROVED'
     OR listed -> 'rows' -> 0 ->> 'signup_fee_status' IS DISTINCT FROM 'PAID' THEN
    RAISE EXCEPTION 'status mismatch %', listed -> 'rows' -> 0;
  END IF;
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO keys FROM jsonb_object_keys(listed -> 'rows' -> 0) AS key;
  IF keys <> ARRAY['account_status','approval_status','area','business_name','contractor_profile_id','estimate_count','flag','job_count','profile_id','rating','review_count','signup_fee_status','trades'] THEN
    RAISE EXCEPTION 'list allowlist mismatch %', keys;
  END IF;
  IF (public.admin_list_contractors('Smoke', NULL, false, 50, 0) ->> 'total')::int <> 0 THEN
    RAISE EXCEPTION 'test business was visible';
  END IF;
  IF (public.admin_list_contractors('pat@example.com', NULL, false, 50, 0) ->> 'total')::int <> 1 THEN
    RAISE EXCEPTION 'email search missed the business';
  END IF;

  detail := public.admin_get_contractor('11111111-1111-4111-8111-111111111111', false);
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO keys FROM jsonb_object_keys(detail) AS key;
  IF keys <> ARRAY['account_status','approval_status','area','business_name','contractor_profile_id','email','estimates','flag','flag_note','jobs','payments','profile_id','rating','review_count','signup_fee_status','trades'] THEN
    RAISE EXCEPTION 'detail allowlist mismatch %', keys;
  END IF;
  IF detail -> 'jobs' -> 0 ->> 'reference_number' IS DISTINCT FROM '1004' THEN
    RAISE EXCEPTION 'job reference missing %', detail -> 'jobs';
  END IF;
  IF (detail -> 'estimates' -> 0 ->> 'total_cents')::int <> 25000 THEN
    RAISE EXCEPTION 'estimate cents mismatch';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(detail -> 'payments') pay WHERE (pay ->> 'amount_cents')::int IN (999, 499)) <> 2 THEN
    RAISE EXCEPTION 'payments mismatch %', detail -> 'payments';
  END IF;
  IF detail::text ~* 'phone|street|stripe_|license_number' THEN
    RAISE EXCEPTION 'detail leaked a forbidden field';
  END IF;

  BEGIN
    PERFORM public.admin_get_contractor('22222222-2222-4222-8222-222222222222', false);
    RAISE EXCEPTION 'hidden test contractor was readable';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;

  UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';
  BEGIN
    PERFORM public.admin_list_contractors(NULL, NULL, false, 50, 0);
    RAISE EXCEPTION 'aal1 admin was allowed while MFA is required';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal2","role":"authenticated"}', true);
  PERFORM public.admin_list_contractors(NULL, NULL, true, 50, 0);

  SELECT pg_get_functiondef('public.admin_list_contractors(text,text,boolean,integer,integer)'::regprocedure) INTO src;
  IF src ~ 'UPDATE |INSERT |DELETE ' OR src ~ 'stripe_' OR src ~ 'phone' OR src ~ 'street' OR src ~ 'fee_cents' THEN
    RAISE EXCEPTION 'list function is not a read-only allowlist';
  END IF;
  IF has_function_privilege('anon', 'public.admin_list_contractors(text,text,boolean,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_get_contractor(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute a contractor directory function';
  END IF;
END $$;
