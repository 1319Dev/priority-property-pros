-- Step-up gate while admin_mfa_required stays 0, then with the flag on.
-- Does not call Stripe and does not update a production database.
--
--   psql -d admin_step_up -v ON_ERROR_STOP=1 -f supabase/tests/admin_sensitive_step_up.sql

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
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pro@example.test', 'Ada', 'Owner', 'CONTRACTOR', 'ACTIVE'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'paused@example.test', 'Dee', 'Paused', 'ADMIN', 'SUSPENDED')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public._step_jwt(p_sub uuid, p_aal text, p_amr jsonb DEFAULT '[]'::jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_sub, 'aal', p_aal, 'role', 'authenticated', 'amr', coalesce(p_amr, '[]'::jsonb))::text,
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._step_clear()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', false);
END;
$$;

CREATE OR REPLACE FUNCTION public._step_ok(p_cond boolean, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_cond, false) THEN
    RAISE EXCEPTION 'admin step-up test failed: %', p_msg;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._step_raises(p_sql text, p_expected text)
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

\ir ../migrations/20261013000001_admin_mfa_required.sql
\ir ../migrations/20261019000001_admin_sensitive_step_up.sql

CREATE OR REPLACE FUNCTION public._sample_sensitive_admin_action()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can do this sample action';
  END IF;
  PERFORM public.assert_admin_sensitive_step_up();
END;
$$;

SELECT public._step_ok(
  (SELECT value_int = 0 FROM public.platform_settings WHERE key = 'admin_mfa_required'),
  'flag stays 0'
);
SELECT public._step_ok(NOT public.admin_mfa_required(), 'helper is false');
SELECT public._step_ok(
  public.admin_sensitive_step_up_max_age() = interval '15 minutes',
  'window is 15 minutes'
);

SELECT public._step_ok(
  NOT has_function_privilege('anon', 'public.assert_admin_sensitive_step_up()', 'EXECUTE'),
  'anon cannot execute assert'
);
SELECT public._step_ok(
  NOT has_function_privilege('authenticated', 'public.assert_admin_sensitive_step_up()', 'EXECUTE'),
  'authenticated cannot execute assert'
);
SELECT public._step_ok(
  NOT has_function_privilege('anon', 'public.admin_sensitive_step_up_ok()', 'EXECUTE'),
  'anon cannot execute the predicate'
);
SELECT public._step_ok(
  NOT has_function_privilege('authenticated', 'public.admin_sensitive_step_up_ok()', 'EXECUTE'),
  'authenticated cannot execute the predicate'
);

-- Flag off: aal1 admin, missing amr, and a non-admin all pass the step-up assert.
-- is_admin() still rejects the non-admin before a real action runs.
SELECT public._step_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1', '[]'::jsonb);
SELECT public._step_ok(public.is_admin(), 'flag off aal1 is admin');
SELECT public._step_ok(public.admin_sensitive_step_up_ok(), 'flag off aal1 step-up passes');
SELECT public._sample_sensitive_admin_action();

SELECT public._step_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal2', '[]'::jsonb);
SELECT public._step_ok(NOT public.is_admin(), 'contractor is not admin');
SELECT public._step_raises(
  'SELECT public._sample_sensitive_admin_action()',
  'only an admin'
);

SELECT public._step_jwt('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aal2', '[]'::jsonb);
SELECT public._step_ok(NOT public.is_admin(), 'suspended admin is not admin');

SELECT public._step_clear();
SELECT public._step_ok(auth.uid() IS NULL AND NOT public.is_admin(), 'no jwt is not admin');
SELECT public._step_ok(public.admin_sensitive_step_up_ok(), 'flag off with no jwt still passes assert');

-- Turn the flag on inside this test database only.
UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';
SELECT public._step_ok(public.admin_mfa_required(), 'test flag is on');

SELECT public._step_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1', '[]'::jsonb);
SELECT public._step_ok(NOT public.is_admin(), 'flag on aal1 is not admin');
SELECT public._step_raises(
  'SELECT public._sample_sensitive_admin_action()',
  'only an admin'
);

SELECT public._step_jwt(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aal2',
  jsonb_build_array(
    jsonb_build_object('method', 'token_refresh', 'timestamp', floor(extract(epoch from now()))::bigint),
    jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now() - interval '2 hours'))::bigint)
  )
);
SELECT public._step_ok(public.is_admin(), 'flag on aal2 is admin');
SELECT public._step_ok(NOT public.admin_sensitive_step_up_ok(), 'refresh does not count as totp');
SELECT public._step_raises(
  'SELECT public._sample_sensitive_admin_action()',
  'admin step-up required'
);

SELECT public._step_jwt(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aal2',
  jsonb_build_array(
    jsonb_build_object('method', 'token_refresh', 'timestamp', floor(extract(epoch from now()))::bigint),
    jsonb_build_object('method', 'totp', 'timestamp', floor(extract(epoch from now() - interval '16 minutes'))::bigint)
  )
);
SELECT public._step_ok(NOT public.admin_sensitive_step_up_ok(), 'totp older than 15 minutes fails');
SELECT public._step_raises(
  $$SELECT public.assert_admin_sensitive_step_up()$$,
  'admin step-up required'
);

SELECT public._step_jwt(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aal2',
  jsonb_build_array(
    jsonb_build_object('method', 'token_refresh', 'timestamp', floor(extract(epoch from now()))::bigint),
    jsonb_build_object('method', 'totp', 'timestamp', floor(extract(epoch from now() - interval '5 minutes'))::bigint),
    jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now() - interval '1 hour'))::bigint)
  )
);
SELECT public._step_ok(public.admin_sensitive_step_up_ok(), 'fresh totp passes even when refresh is newer');
SELECT public._sample_sensitive_admin_action();

-- Put the test database flag back so a reused local database is not left enforcing.
UPDATE public.platform_settings SET value_int = 0 WHERE key = 'admin_mfa_required';
SELECT public._step_ok(NOT public.admin_mfa_required(), 'test flag restored to 0');

-- ---------------------------------------------------------------------------
-- Load 20261019000002 (the wrapped admin RPCs and triggers).
-- Bodies reference production tables this test database does not have, so
-- body checks are off while loading, the same way pg_dump restores functions.
-- Only types used in signatures are stubbed.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portfolio_privacy_state') THEN
    CREATE TYPE public.portfolio_privacy_state AS ENUM ('PENDING_REVIEW', 'PUBLIC_SAFE', 'PRIVATE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_review_status') THEN
    CREATE TYPE public.platform_review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

SET check_function_bodies = off;
\ir ../migrations/20261019000002_admin_sensitive_step_up_calls.sql
RESET check_function_bodies;

SELECT public._step_ok(
  (SELECT count(*) FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN (
       'admin_approve_contractor', 'admin_reject_contractor', 'admin_request_contractor_info',
       'admin_set_account_flag', 'admin_grant_booking_contact_access', 'admin_revoke_booking_contact_access',
       'admin_grant_connection_contact_access', 'admin_revoke_connection_contact_access',
       'admin_set_portfolio_privacy', 'admin_set_platform_review_status',
       'protect_platform_review', 'enforce_contractor_portfolio_privacy')
     AND position('assert_admin_sensitive_step_up()' IN pg_get_functiondef(p.oid)) > 0) = 12,
  '000002 loaded and all 12 functions call the step-up assert'
);

-- Minimal stubs so admin_set_account_flag and the platform review trigger can run.
CREATE OR REPLACE FUNCTION public.admin_require()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.admin_account_flags (
  profile_id uuid PRIMARY KEY,
  flag text NOT NULL,
  note text,
  set_by uuid,
  set_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.audit_logs_stub (action text);
CREATE OR REPLACE FUNCTION public.write_audit_log(p_actor uuid, p_action text, p_entity text, p_entity_id uuid, p_meta jsonb)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.audit_logs_stub (action) VALUES (p_action);
$$;

CREATE TABLE IF NOT EXISTS public.platform_reviews (
  id uuid PRIMARY KEY,
  user_id uuid,
  display_name text NOT NULL,
  body text NOT NULL,
  city text,
  status public.platform_review_status NOT NULL DEFAULT 'APPROVED',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_reviews (id, user_id, display_name, body) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ada', 'one'),
  ('e0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ada', 'two'),
  ('e0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ada', 'three'),
  ('e0000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ada', 'four'),
  ('e0000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ada', 'five');

DROP TRIGGER IF EXISTS platform_reviews_protect ON public.platform_reviews;
CREATE TRIGGER platform_reviews_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_review();

-- Enforcement OFF (production today): Garrett is not locked out.
UPDATE public.platform_settings SET value_int = 0 WHERE key = 'admin_mfa_required';
SELECT public._step_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1', '[]'::jsonb);
SELECT public._step_ok(
  (public.admin_set_account_flag('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'TEST', 'off') ->> 'flag') = 'TEST',
  'flag off: password-only admin can still set an account flag'
);
DELETE FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000001';
SELECT public._step_ok(
  NOT EXISTS (SELECT 1 FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000001'),
  'flag off: password-only admin can still delete a review'
);

-- PR #90: account deletion purge has no signed-in user and must be allowed.
SELECT public._step_clear();
DELETE FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000002';
SELECT public._step_ok(
  NOT EXISTS (SELECT 1 FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000002'),
  'flag off: null-uid account-deletion purge deletes the review'
);

-- Enforcement ON.
UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';

SELECT public._step_clear();
DELETE FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000003';
SELECT public._step_ok(
  NOT EXISTS (SELECT 1 FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000003'),
  'flag on: null-uid account-deletion purge still deletes the review'
);

SELECT public._step_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal2', '[]'::jsonb);
SELECT public._step_raises(
  $$DELETE FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000004'$$,
  'only an admin can delete a platform review'
);

-- Stale code: AAL2 session, but the newest TOTP is 16 minutes old.
SELECT public._step_jwt(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aal2',
  jsonb_build_array(
    jsonb_build_object('method', 'token_refresh', 'timestamp', floor(extract(epoch from now()))::bigint),
    jsonb_build_object('method', 'totp', 'timestamp', floor(extract(epoch from now() - interval '16 minutes'))::bigint)
  )
);
SELECT public._step_ok(public.is_admin(), 'stale-code session is still an admin');
SELECT public._step_raises(
  $$SELECT public.admin_set_account_flag('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'OWNER', 'stale')$$,
  'admin step-up required'
);
SELECT public._step_ok(
  (SELECT flag FROM public.admin_account_flags WHERE profile_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 'TEST',
  'stale code: account flag unchanged'
);
SELECT public._step_raises(
  $$DELETE FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000004'$$,
  'admin step-up required'
);
SELECT public._step_raises(
  $$UPDATE public.platform_reviews SET status = 'REJECTED' WHERE id = 'e0000000-0000-4000-8000-000000000004'$$,
  'admin step-up required'
);
SELECT public._step_ok(
  (SELECT status::text FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000004') = 'APPROVED',
  'stale code: review unchanged'
);

-- AAL1 admin with enforcement on is not an admin at all.
SELECT public._step_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1', '[]'::jsonb);
SELECT public._step_raises(
  $$SELECT public.admin_set_account_flag('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'OWNER', 'aal1')$$,
  'not authorized'
);

-- Fresh code: AAL2 with a TOTP from 2 minutes ago.
SELECT public._step_jwt(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aal2',
  jsonb_build_array(
    jsonb_build_object('method', 'totp', 'timestamp', floor(extract(epoch from now() - interval '2 minutes'))::bigint)
  )
);
SELECT public._step_ok(
  (public.admin_set_account_flag('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'OWNER', 'fresh') ->> 'flag') = 'OWNER',
  'fresh code: account flag set'
);
DELETE FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000004';
SELECT public._step_ok(
  NOT EXISTS (SELECT 1 FROM public.platform_reviews WHERE id = 'e0000000-0000-4000-8000-000000000004'),
  'fresh code: admin deletes the review'
);

UPDATE public.platform_settings SET value_int = 0 WHERE key = 'admin_mfa_required';
SELECT public._step_clear();
SELECT public._step_ok(NOT public.admin_mfa_required(), 'test flag restored to 0 after 000002 checks');
SELECT 'loaded 20261019000002: flag off no lockout, null-uid purge allowed, stale code refused, fresh code accepted' AS admin_step_up_calls;
