-- Local proof for the read-only homeowners directory.
--   psql -d admin_homeowners -v ON_ERROR_STOP=1 -f supabase/tests/admin_homeowners_directory.sql

\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
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

CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value_int integer
);

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

CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT',
  city text,
  posted_at timestamptz,
  reference_number bigint,
  created_at timestamptz NOT NULL DEFAULT now()
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

CREATE TABLE public.admin_account_flags (
  profile_id uuid PRIMARY KEY,
  flag text NOT NULL,
  note text,
  set_by uuid,
  set_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.admin_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'admin_mfa_required'), 0) <> 0;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND account_type = 'ADMIN'
      AND account_status = 'ACTIVE'
  )
  AND (
    NOT public.admin_mfa_required()
    OR coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  );
$$;

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

CREATE OR REPLACE FUNCTION public.admin_account_is_excluded(p_profile_id uuid, p_include_test boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT coalesce(p_include_test, false)
    AND p_profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_account_flags f
      WHERE f.profile_id = p_profile_id
        AND f.flag = 'TEST'
    );
$$;

\ir ../migrations/20261019300001_admin_homeowners_directory.sql

INSERT INTO public.profiles (id, email, first_name, last_name, account_type, account_status, signup_fee_status, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com', 'Ada', 'Admin', 'ADMIN', 'ACTIVE', 'NOT_REQUIRED', '2026-09-01 15:00:00+00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owen@example.com', 'Owen', 'Home', 'CUSTOMER', 'ACTIVE', 'PAID', '2026-10-02 15:00:00+00'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'tina@example.com', 'Tina', 'Test', 'CUSTOMER', 'ACTIVE', 'PAID', '2026-10-03 15:00:00+00'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pat@example.com', 'Pat', 'Pro', 'CONTRACTOR', 'ACTIVE', 'PAID', '2026-09-15 15:00:00+00');

INSERT INTO public.admin_account_flags (profile_id, flag, note) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'TEST', 'smoke');

INSERT INTO public.projects (id, customer_id, title, status, city, posted_at, reference_number, created_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Fence stain', 'POSTED', 'Conroe', '2026-10-04 15:00:00+00', 1004, '2026-10-04 15:00:00+00');

INSERT INTO public.signup_fee_charges (id, profile_id, amount_cents, livemode, status, fulfilled_at, needs_refund, created_at) VALUES
  ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, true, 'CONSUMED', '2026-10-04 18:00:00+00', false, '2026-10-04 18:00:00+00');

GRANT USAGE ON SCHEMA public TO anon, authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","aal":"aal2","role":"authenticated"}', false);

DO $$
BEGIN
  PERFORM public.admin_list_homeowners(NULL, NULL, false, 50, 0);
  RAISE EXCEPTION 'customer was allowed to list homeowners';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;

DO $$
DECLARE
  listed jsonb;
  keys text[];
  detail jsonb;
  detail_keys text[];
  project_keys text[];
  payment_keys text[];
  payload text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal1","role":"authenticated"}', true);
  listed := public.admin_list_homeowners(NULL, NULL, false, 50, 0);
  IF (listed ->> 'total')::int <> 1 THEN
    RAISE EXCEPTION 'test homeowner was not hidden, got %', listed;
  END IF;
  IF listed -> 'rows' -> 0 ->> 'email' IS DISTINCT FROM 'owen@example.com' THEN
    RAISE EXCEPTION 'expected Owen, got %', listed -> 'rows';
  END IF;
  IF (listed -> 'rows' -> 0 ->> 'project_count')::int <> 1 THEN
    RAISE EXCEPTION 'project count mismatch %', listed -> 'rows' -> 0;
  END IF;

  SELECT coalesce(array_agg(key ORDER BY key), '{}')
  INTO keys
  FROM jsonb_object_keys(listed -> 'rows' -> 0) AS key;
  IF keys <> ARRAY['account_status','created_at','display_name','email','flag','flag_note','profile_id','project_count','signup_fee_status'] THEN
    RAISE EXCEPTION 'list allowlist mismatch %', keys;
  END IF;

  listed := public.admin_list_homeowners('owen@example.com', NULL, false, 50, 0);
  IF (listed ->> 'total')::int <> 1 THEN
    RAISE EXCEPTION 'email search missed Owen';
  END IF;
  listed := public.admin_list_homeowners('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL, false, 50, 0);
  IF (listed ->> 'total')::int <> 1 THEN
    RAISE EXCEPTION 'id search missed Owen';
  END IF;
  listed := public.admin_list_homeowners('Tina', NULL, false, 50, 0);
  IF (listed ->> 'total')::int <> 0 THEN
    RAISE EXCEPTION 'hidden test account matched search';
  END IF;
  listed := public.admin_list_homeowners('Tina', NULL, true, 50, 0);
  IF listed -> 'rows' -> 0 ->> 'flag' IS DISTINCT FROM 'TEST' THEN
    RAISE EXCEPTION 'include-test did not return the flag, got %', listed;
  END IF;

  detail := public.admin_get_homeowner('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO detail_keys FROM jsonb_object_keys(detail) AS key;
  IF detail_keys <> ARRAY['account_status','created_at','display_name','email','flag','flag_note','payments','profile_id','projects','signup_fee_status'] THEN
    RAISE EXCEPTION 'detail allowlist mismatch %', detail_keys;
  END IF;
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO project_keys FROM jsonb_object_keys(detail -> 'projects' -> 0) AS key;
  IF project_keys <> ARRAY['city','posted_at','project_id','reference_number','status','title'] THEN
    RAISE EXCEPTION 'project allowlist mismatch %', project_keys;
  END IF;
  IF (detail -> 'projects' -> 0 ->> 'reference_number')::int <> 1004 THEN
    RAISE EXCEPTION 'missing PPP number %', detail -> 'projects';
  END IF;
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO payment_keys FROM jsonb_object_keys(detail -> 'payments' -> 0) AS key;
  IF payment_keys <> ARRAY['amount_cents','charge_id','created_at','fulfilled_at','kind','livemode','needs_refund','refund_reason','status'] THEN
    RAISE EXCEPTION 'payment allowlist mismatch %', payment_keys;
  END IF;
  IF (detail -> 'payments' -> 0 ->> 'amount_cents')::int <> 999 THEN
    RAISE EXCEPTION 'activation cents mismatch';
  END IF;

  payload := detail::text || listed::text;
  IF payload ~* 'phone|street|stripe_' THEN
    RAISE EXCEPTION 'payload leaked a forbidden field';
  END IF;

  BEGIN
    PERFORM public.admin_get_homeowner('cccccccc-cccc-cccc-cccc-cccccccccccc', false);
    RAISE EXCEPTION 'hidden test homeowner was readable';
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      NULL;
  END;

  UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';
  BEGIN
    PERFORM public.admin_list_homeowners(NULL, NULL, false, 50, 0);
    RAISE EXCEPTION 'aal1 admin was allowed while MFA is required';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal2","role":"authenticated"}', true);
  PERFORM public.admin_list_homeowners(NULL, NULL, false, 50, 0);
  UPDATE public.platform_settings SET value_int = 0 WHERE key = 'admin_mfa_required';
END $$;

DO $$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef('public.admin_list_homeowners(text,text,boolean,integer,integer)'::regprocedure) INTO src;
  IF src ~ 'UPDATE |INSERT |DELETE ' OR src ~ 'stripe_' OR src ~ '\bphone\b' OR src ~ 'street' THEN
    RAISE EXCEPTION 'list function is not a read-only allowlist';
  END IF;
  SELECT pg_get_functiondef('public.admin_get_homeowner(uuid,boolean)'::regprocedure) INTO src;
  IF src ~ 'UPDATE |INSERT |DELETE ' OR src ~ 'stripe_' OR src ~ '\bphone\b' OR src ~ 'street' THEN
    RAISE EXCEPTION 'detail function is not a read-only allowlist';
  END IF;
  IF has_function_privilege('anon', 'public.admin_list_homeowners(text,text,boolean,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute admin_list_homeowners';
  END IF;
  IF has_function_privilege('anon', 'public.admin_get_homeowner(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute admin_get_homeowner';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.admin_list_homeowners(text,text,boolean,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute the list';
  END IF;
END $$;
