-- Local regression for 20261020300001_abuse_rate_limits_signup_guard.sql.
-- Minimal schema, migration -> rollback -> migration, then every path. Raises on failure.
-- Not a production script.
--
--   createdb abuse && psql -d abuse -v ON_ERROR_STOP=1 -f supabase/tests/abuse_rate_limits_signup_guard_test.sql

\set ON_ERROR_STOP on
SET client_min_messages = warning;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role') $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE IF NOT EXISTS public.profiles (id uuid PRIMARY KEY, account_type text, account_status text);
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type = 'ADMIN' AND account_status = 'ACTIVE') $$;

\ir ../migrations/20261020300001_abuse_rate_limits_signup_guard.sql
\ir ../rollbacks/20261020300001_abuse_rate_limits_signup_guard_rollback.sql
DO $$ BEGIN
  IF to_regclass('public.rate_limit_hits') IS NOT NULL OR to_regclass('public.signup_guard_log') IS NOT NULL
     OR to_regprocedure('public.hook_before_user_created(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left objects behind'; END IF;
END $$;
\ir ../migrations/20261020300001_abuse_rate_limits_signup_guard.sql

DO $$
DECLARE r jsonb; i int;
BEGIN
  -- Rate limit: 3 allowed, 4th refused with retry_after; other subject unaffected; hashes only.
  FOR i IN 1..3 LOOP
    r := public.check_rate_limit('test:bucket', 'user:abc', 3, 600);
    IF (r->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'hit % refused: %', i, r; END IF;
  END LOOP;
  r := public.check_rate_limit('test:bucket', 'user:abc', 3, 600);
  IF (r->>'allowed')::boolean OR (r->>'retry_after_seconds')::int < 1 THEN RAISE EXCEPTION '4th allowed: %', r; END IF;
  IF (SELECT count(*) FROM public.rate_limit_hits WHERE bucket = 'test:bucket') <> 3 THEN RAISE EXCEPTION 'refused hit was stored'; END IF;
  r := public.check_rate_limit('test:bucket', 'user:other', 3, 600);
  IF (r->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'other subject limited'; END IF;
  IF EXISTS (SELECT 1 FROM public.rate_limit_hits WHERE subject_hash = 'user:abc' OR subject_hash !~ '^[0-9a-f]{64}$') THEN RAISE EXCEPTION 'raw subject stored'; END IF;
  -- Window expiry
  UPDATE public.rate_limit_hits SET created_at = now() - interval '11 minutes' WHERE bucket = 'test:bucket';
  r := public.check_rate_limit('test:bucket', 'user:abc', 3, 600);
  IF (r->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'window did not expire'; END IF;
  -- No subject: skipped, not limited
  r := public.check_rate_limit('test:bucket', NULL, 1, 600);
  IF (r->>'skipped')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'null subject not skipped'; END IF;
  -- Bad input
  BEGIN PERFORM public.check_rate_limit('', 'x', 1, 60); RAISE EXCEPTION 'empty bucket accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invalid rate limit bucket' THEN RAISE; END IF; END;
  BEGIN PERFORM public.check_rate_limit('b', 'x', 0, 60); RAISE EXCEPTION 'zero max accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invalid rate limit window' THEN RAISE; END IF; END;
END $$;

DO $$
DECLARE r jsonb; i int;
  ev jsonb := '{"metadata":{"name":"before-user-created","ip_address":"203.0.113.7"},"user":{"email":"Pat@Example.com"}}';
BEGIN
  -- Disposable domain and subdomain rejected (400), logged with domain only.
  r := public.hook_before_user_created('{"metadata":{"ip_address":"198.51.100.1"},"user":{"email":"x@mailinator.com"}}');
  IF (r->'error'->>'http_code')::int <> 400 THEN RAISE EXCEPTION 'disposable allowed: %', r; END IF;
  r := public.hook_before_user_created('{"metadata":{"ip_address":"198.51.100.1"},"user":{"email":"x@inbox.yopmail.com"}}');
  IF r->'error' IS NULL THEN RAISE EXCEPTION 'disposable subdomain allowed'; END IF;
  IF EXISTS (SELECT 1 FROM public.signup_guard_log WHERE email_domain LIKE '%@%' OR ip_hash = '198.51.100.1') THEN RAISE EXCEPTION 'raw email or ip logged'; END IF;
  -- A normal domain that merely contains a blocked word is allowed.
  r := public.hook_before_user_created('{"metadata":{"ip_address":"198.51.100.2"},"user":{"email":"x@notmailinator.com"}}');
  IF r <> '{}'::jsonb THEN RAISE EXCEPTION 'lookalike domain blocked: %', r; END IF;

  -- 3 per IP per hour, 4th 429.
  FOR i IN 1..3 LOOP
    r := public.hook_before_user_created(ev);
    IF r <> '{}'::jsonb THEN RAISE EXCEPTION 'signup % from IP refused: %', i, r; END IF;
  END LOOP;
  r := public.hook_before_user_created(ev);
  IF (r->'error'->>'http_code')::int <> 429 THEN RAISE EXCEPTION '4th signup from IP allowed: %', r; END IF;
  -- Rejected attempts do not count toward the IP limit window.
  IF (SELECT count(*) FROM public.signup_guard_log WHERE decision = 'allowed' AND ip_hash = public.rate_limit_subject_hash('ip:203.0.113.7')) <> 3 THEN
    RAISE EXCEPTION 'allowed count wrong'; END IF;
  -- Missing IP (dashboard-created user): not limited per IP.
  r := public.hook_before_user_created('{"metadata":{},"user":{"email":"admin-made@example.com"}}');
  IF r <> '{}'::jsonb THEN RAISE EXCEPTION 'no-ip signup refused: %', r; END IF;

  -- 50 per hour overall.
  DELETE FROM public.signup_guard_log;
  INSERT INTO public.signup_guard_log (decision, ip_hash, email_domain)
  SELECT 'allowed', public.rate_limit_subject_hash('ip:10.0.0.' || g), 'example.com' FROM generate_series(1, 50) g;
  r := public.hook_before_user_created('{"metadata":{"ip_address":"192.0.2.99"},"user":{"email":"new@example.com"}}');
  IF (r->'error'->>'http_code')::int <> 429 OR r->'error'->>'message' NOT LIKE '%lot of signups%' THEN RAISE EXCEPTION 'global limit not enforced: %', r; END IF;
  UPDATE public.signup_guard_log SET created_at = now() - interval '61 minutes';
  r := public.hook_before_user_created('{"metadata":{"ip_address":"192.0.2.99"},"user":{"email":"new@example.com"}}');
  IF r <> '{}'::jsonb THEN RAISE EXCEPTION 'global window did not expire: %', r; END IF;

  -- Fails open on internal error.
  ALTER TABLE public.blocked_email_domains RENAME TO blocked_email_domains_x;
  r := public.hook_before_user_created('{"metadata":{"ip_address":"192.0.2.50"},"user":{"email":"ok@example.com"}}');
  ALTER TABLE public.blocked_email_domains_x RENAME TO blocked_email_domains;
  IF r <> '{}'::jsonb THEN RAISE EXCEPTION 'internal error did not fail open: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.signup_guard_log WHERE decision = 'error_allowed') THEN RAISE EXCEPTION 'error not logged'; END IF;
END $$;

DO $$
BEGIN
  -- Permissions
  IF has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'clients can call the hook'; END IF;
  IF NOT has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'auth admin cannot call the hook'; END IF;
  IF has_function_privilege('authenticated', 'public.check_rate_limit(text,text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.check_rate_limit(text,text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'clients can call check_rate_limit'; END IF;
  IF has_table_privilege('anon', 'public.signup_guard_log', 'SELECT') OR has_table_privilege('authenticated', 'public.rate_limit_hits', 'SELECT')
     OR has_table_privilege('authenticated', 'public.blocked_email_domains', 'SELECT') THEN
    RAISE EXCEPTION 'clients can read abuse tables'; END IF;

  PERFORM set_config('test.role', 'authenticated', true);
  BEGIN PERFORM public.check_rate_limit('b', 'x', 1, 60); RAISE EXCEPTION 'non-service caller counted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'service role required' THEN RAISE; END IF; END;
  BEGIN PERFORM public.admin_signup_guard_summary(24); RAISE EXCEPTION 'non-admin read summary';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'admin or service role required' THEN RAISE; END IF; END;
  INSERT INTO public.profiles VALUES ('a0000000-0000-4000-8000-000000000001', 'ADMIN', 'ACTIVE');
  PERFORM set_config('test.uid', 'a0000000-0000-4000-8000-000000000001', true);
  PERFORM public.admin_signup_guard_summary(24);
  PERFORM set_config('test.role', '', true);
  PERFORM set_config('test.uid', '', true);
END $$;

SET client_min_messages = notice;
DO $$ BEGIN RAISE NOTICE 'abuse_rate_limits_signup_guard_test: ALL PASS'; END $$;
