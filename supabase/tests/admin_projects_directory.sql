-- Local proof for the read-only projects directory.
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
  id uuid PRIMARY KEY, profile_id uuid NOT NULL, business_name text NOT NULL DEFAULT '', primary_trade text
);
CREATE TABLE public.service_categories (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY, customer_id uuid NOT NULL, category_id uuid, title text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT', city text, state text, selected_contractor_profile_id uuid,
  posted_at timestamptz, reference_number bigint, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.estimates (
  id uuid PRIMARY KEY, project_id uuid NOT NULL, contractor_profile_id uuid NOT NULL, status text NOT NULL,
  total_cents integer NOT NULL DEFAULT 0, submitted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY, project_id uuid NOT NULL, contractor_profile_id uuid NOT NULL, status text NOT NULL,
  customer_hired_at timestamptz, contractor_hired_at timestamptz, started_at timestamptz, completed_at timestamptz,
  disputed_at timestamptz, cancelled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.project_status_history (
  id uuid PRIMARY KEY, project_id uuid NOT NULL, from_status text, to_status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
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

\ir ../migrations/20261019300003_admin_projects_directory.sql

INSERT INTO public.profiles (id, email, first_name, last_name, account_type) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com', 'Ada', 'Admin', 'ADMIN'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owen@example.com', 'Owen', 'Home', 'CUSTOMER'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'tina@example.com', 'Tina', 'Test', 'CUSTOMER'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pat@example.com', 'Pat', 'Pro', 'CONTRACTOR');
INSERT INTO public.contractor_profiles (id, profile_id, business_name, primary_trade) VALUES
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Plymate Example', 'Handyman');
INSERT INTO public.service_categories (id, name) VALUES ('33333333-3333-4333-8333-333333333333', 'Painting');
INSERT INTO public.admin_account_flags (profile_id, flag) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'TEST');
INSERT INTO public.projects (id, customer_id, category_id, title, description, status, city, state, selected_contractor_profile_id, posted_at, reference_number) VALUES
  ('66666666-6666-4666-8666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'Fence stain', 'Paint the fence', 'POSTED', 'Conroe', 'TX', '11111111-1111-4111-8111-111111111111', '2026-10-04 18:00:00+00', 1004),
  ('77777777-7777-4777-8777-777777777777', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NULL, 'Hidden job', 'secret', 'POSTED', 'Willis', 'TX', NULL, '2026-10-01 18:00:00+00', 1001),
  ('88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL, 'Disputed gate', 'Gate', 'CONTRACTOR_SELECTED', 'Conroe', 'TX', '11111111-1111-4111-8111-111111111111', '2026-09-01 18:00:00+00', 1008);
INSERT INTO public.bookings (id, project_id, contractor_profile_id, status, disputed_at) VALUES
  ('99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888', '11111111-1111-4111-8111-111111111111', 'DISPUTED', '2026-10-06 18:00:00+00');
INSERT INTO public.estimates (id, project_id, contractor_profile_id, status, total_cents, submitted_at) VALUES
  ('abababab-abab-4bab-8bab-abababababab', '66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'VIEWED', 25000, '2026-10-05 15:00:00+00');
INSERT INTO public.project_status_history (id, project_id, from_status, to_status, created_at) VALUES
  ('bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc', '66666666-6666-4666-8666-666666666666', 'DRAFT', 'POSTED', '2026-10-04 18:00:00+00');

SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","aal":"aal2"}', false);
DO $$ BEGIN
  PERFORM public.admin_list_projects(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,false,50,0);
  RAISE EXCEPTION 'customer was allowed to list projects';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

DO $$
DECLARE
  listed jsonb;
  detail jsonb;
  keys text[];
  src text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal1"}', true);
  listed := public.admin_list_projects(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,false,50,0);
  IF (listed ->> 'total')::int <> 2 THEN RAISE EXCEPTION 'test project was not hidden, got %', listed ->> 'total'; END IF;
  listed := public.admin_list_projects('PPP-1004',NULL,NULL,'POSTED','Conroe','Paint',DATE '2026-10-01',DATE '2026-10-31',false,false,50,0);
  IF (listed ->> 'total')::int <> 1 OR listed #>> '{rows,0,reference_number}' IS DISTINCT FROM '1004' THEN
    RAISE EXCEPTION 'filtered project missing %', listed;
  END IF;
  IF listed #>> '{rows,0,customer_name}' IS DISTINCT FROM 'Owen Home' THEN RAISE EXCEPTION 'customer name %', listed; END IF;
  IF listed #>> '{rows,0,contractor_business_name}' IS DISTINCT FROM 'Plymate Example' THEN RAISE EXCEPTION 'contractor name %', listed; END IF;
  IF listed #>> '{rows,0,trade}' IS DISTINCT FROM 'Painting' OR listed #>> '{rows,0,city}' IS DISTINCT FROM 'Conroe' THEN
    RAISE EXCEPTION 'trade or city %', listed -> 'rows' -> 0;
  END IF;
  IF (listed #>> '{rows,0,disputed}')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'dispute filter failed'; END IF;
  listed := public.admin_list_projects(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,true,false,50,0);
  IF listed #>> '{rows,0,reference_number}' IS DISTINCT FROM '1008' THEN RAISE EXCEPTION 'dispute list %', listed; END IF;
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO keys FROM jsonb_object_keys(public.admin_list_projects('1004',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,false,50,0) -> 'rows' -> 0) key;
  IF keys <> ARRAY['booking_id','city','contractor_business_name','contractor_profile_id','customer_id','customer_name','disputed','posted_at','project_id','reference_number','state','status','title','trade'] THEN
    RAISE EXCEPTION 'list allowlist mismatch %', keys;
  END IF;

  detail := public.admin_get_project('66666666-6666-4666-8666-666666666666');
  IF detail #>> '{status_history,0,to_status}' IS DISTINCT FROM 'POSTED' THEN RAISE EXCEPTION 'history %', detail -> 'status_history'; END IF;
  IF (detail #>> '{estimates,0,total_cents}')::int <> 25000 THEN RAISE EXCEPTION 'estimate'; END IF;
  IF detail::text ~* 'phone|street_line|stripe_' THEN RAISE EXCEPTION 'lifecycle leaked contact'; END IF;
  SELECT pg_get_functiondef('public.admin_list_projects(text,text,text,text,text,text,date,date,boolean,boolean,integer,integer)'::regprocedure) INTO src;
  IF src ~ 'phone' OR src ~ 'street' OR src ~ 'project_private' OR src ~ 'UPDATE |INSERT |DELETE ' THEN
    RAISE EXCEPTION 'list function is not a read-only allowlist';
  END IF;
  IF has_function_privilege('anon', 'public.admin_list_projects(text,text,text,text,text,text,date,date,boolean,boolean,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_get_project(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute';
  END IF;
  UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';
  BEGIN
    PERFORM public.admin_list_projects(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,false,50,0);
    RAISE EXCEPTION 'aal1 admin was allowed while MFA is required';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
