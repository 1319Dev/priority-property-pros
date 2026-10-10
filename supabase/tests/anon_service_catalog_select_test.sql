-- Local regression for signed-out service catalog reads.
-- Builds the phase 3 catalog SELECT policies, proves anon fails with
-- "permission denied for function is_admin", applies
-- supabase/migrations/20261013000002_anon_service_catalog_select.sql,
-- then checks migration -> rollback -> migration.
-- Raises on failure. Not a production script. Does not change application data
-- in a shared database: run it on an empty local database.
--
--   psql -d catalog_select_rls -v ON_ERROR_STOP=1 -f supabase/tests/anon_service_catalog_select_test.sql

\set ON_ERROR_STOP on
SET client_min_messages = notice;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOINHERIT NOLOGIN BYPASSRLS;
  END IF;
END
$$;

ALTER ROLE anon NOINHERIT NOLOGIN NOSUPERUSER NOBYPASSRLS;
ALTER ROLE authenticated NOINHERIT NOLOGIN NOSUPERUSER NOBYPASSRLS;
ALTER ROLE service_role NOINHERIT NOLOGIN NOSUPERUSER BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.account_type AS ENUM ('CUSTOMER', 'CONTRACTOR', 'VERIFIER', 'ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.account_status AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED');
  END IF;
END
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  account_type public.account_type NOT NULL,
  account_status public.account_status NOT NULL DEFAULT 'ACTIVE'
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Production is_admin() from supabase/migrations/20260916000007_rls.sql.
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
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.service_questions (
  id uuid PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.service_categories (id) ON DELETE CASCADE,
  prompt text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_questions ENABLE ROW LEVEL SECURITY;

-- Production policies from supabase/migrations/20260917000007_phase3_rls_storage.sql.
CREATE POLICY service_categories_select
  ON public.service_categories FOR SELECT
  TO anon, authenticated
  USING (is_active OR public.is_admin());

CREATE POLICY service_questions_select
  ON public.service_questions FOR SELECT
  TO anon, authenticated
  USING (is_active OR public.is_admin());

REVOKE ALL ON TABLE public.service_categories FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.service_questions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.service_categories TO anon, authenticated;
GRANT SELECT ON TABLE public.service_questions TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- customer 11111111-1111-4111-8111-111111111111
-- admin    22222222-2222-4222-8222-222222222222
-- suspended admin 33333333-3333-4333-8333-333333333333
INSERT INTO public.profiles (id, email, account_type, account_status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'customer@example.com', 'CUSTOMER', 'ACTIVE'),
  ('22222222-2222-4222-8222-222222222222', 'admin@example.com', 'ADMIN', 'ACTIVE'),
  ('33333333-3333-4333-8333-333333333333', 'suspended-admin@example.com', 'ADMIN', 'SUSPENDED');

-- Active category, inactive category.
-- Questions: active under active, inactive under active, active under inactive.
-- Phase 3 question visibility is the question's own is_active, not the parent.
INSERT INTO public.service_categories (id, slug, name, is_active) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'handyman', 'Handyman', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'retired', 'Retired', false);

INSERT INTO public.service_questions (id, category_id, prompt, is_active) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'What needs doing?', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Hidden question', false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Still active on a retired category', true);

CREATE OR REPLACE FUNCTION public.test_fail(p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'FAIL: %', p_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_select_message(p_role text, p_uid uuid, p_table text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid)::text END,
    true
  );
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO n;
  RESET ROLE;
  RETURN 'ok:' || n::text;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_ids(p_role text, p_uid uuid, p_table text)
RETURNS uuid[]
LANGUAGE plpgsql
AS $$
DECLARE
  ids uuid[];
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid)::text END,
    true
  );
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  EXECUTE format(
    'SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::uuid[]) FROM public.%I',
    p_table
  ) INTO ids;
  RESET ROLE;
  RETURN ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_exec_message(p_role text, p_uid uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid)::text END,
    true
  );
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  EXECUTE p_sql;
  RESET ROLE;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_is_admin_message(p_role text, p_uid uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  flag boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid)::text END,
    true
  );
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  SELECT public.is_admin() INTO flag;
  RESET ROLE;
  RETURN flag::text;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;

CREATE TEMP TABLE test_policy_before AS
SELECT tablename, policyname, permissive, roles::text AS roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('service_categories', 'service_questions');

CREATE TEMP TABLE test_grants_before AS
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('service_categories', 'service_questions');

CREATE TEMP TABLE test_fn_priv_before AS
SELECT
  has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE') AS authenticated_exec,
  has_function_privilege('service_role', 'public.is_admin()', 'EXECUTE') AS service_role_exec,
  has_function_privilege('public', 'public.is_admin()', 'EXECUTE') AS public_exec;

CREATE OR REPLACE FUNCTION public.test_expect_catalog(
  p_label text,
  p_anon_ok boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  msg text;
  ids uuid[];
  active_categories uuid[] := ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1']::uuid[];
  all_categories uuid[] := ARRAY[
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
  ]::uuid[];
  active_questions uuid[] := ARRAY[
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'
  ]::uuid[];
  all_questions uuid[] := ARRAY[
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'
  ]::uuid[];
  customer uuid := '11111111-1111-4111-8111-111111111111';
  admin uuid := '22222222-2222-4222-8222-222222222222';
  suspended uuid := '33333333-3333-4333-8333-333333333333';
  stmt text;
  writer text;
BEGIN
  IF p_anon_ok THEN
    ids := public.test_ids('anon', NULL, 'service_categories');
    IF ids IS DISTINCT FROM active_categories THEN
      PERFORM public.test_fail(p_label || ' anon categories ' || coalesce(ids::text, 'null'));
    END IF;
    ids := public.test_ids('anon', NULL, 'service_questions');
    IF ids IS DISTINCT FROM active_questions THEN
      PERFORM public.test_fail(p_label || ' anon questions ' || coalesce(ids::text, 'null'));
    END IF;
    msg := public.test_is_admin_message('anon', NULL);
    IF msg NOT ILIKE '%permission denied for function is_admin%' THEN
      PERFORM public.test_fail(p_label || ' anon is_admin() execute changed: ' || msg);
    END IF;
  ELSE
    msg := public.test_select_message('anon', NULL, 'service_categories');
    IF msg NOT ILIKE '%permission denied for function is_admin%' THEN
      PERFORM public.test_fail(p_label || ' anon categories: ' || msg);
    END IF;
    msg := public.test_select_message('anon', NULL, 'service_questions');
    IF msg NOT ILIKE '%permission denied for function is_admin%' THEN
      PERFORM public.test_fail(p_label || ' anon questions: ' || msg);
    END IF;
  END IF;

  ids := public.test_ids('authenticated', customer, 'service_categories');
  IF ids IS DISTINCT FROM active_categories THEN
    PERFORM public.test_fail(p_label || ' customer categories ' || coalesce(ids::text, 'null'));
  END IF;
  ids := public.test_ids('authenticated', customer, 'service_questions');
  IF ids IS DISTINCT FROM active_questions THEN
    PERFORM public.test_fail(p_label || ' customer questions ' || coalesce(ids::text, 'null'));
  END IF;

  ids := public.test_ids('authenticated', suspended, 'service_categories');
  IF ids IS DISTINCT FROM active_categories THEN
    PERFORM public.test_fail(p_label || ' suspended admin categories ' || coalesce(ids::text, 'null'));
  END IF;
  ids := public.test_ids('authenticated', suspended, 'service_questions');
  IF ids IS DISTINCT FROM active_questions THEN
    PERFORM public.test_fail(p_label || ' suspended admin questions ' || coalesce(ids::text, 'null'));
  END IF;

  ids := public.test_ids('authenticated', admin, 'service_categories');
  IF ids IS DISTINCT FROM all_categories THEN
    PERFORM public.test_fail(p_label || ' admin categories ' || coalesce(ids::text, 'null'));
  END IF;
  ids := public.test_ids('authenticated', admin, 'service_questions');
  IF ids IS DISTINCT FROM all_questions THEN
    PERFORM public.test_fail(p_label || ' admin questions ' || coalesce(ids::text, 'null'));
  END IF;

  msg := public.test_is_admin_message('authenticated', customer);
  IF msg IS DISTINCT FROM 'false' THEN
    PERFORM public.test_fail(p_label || ' customer is_admin() ' || msg);
  END IF;
  msg := public.test_is_admin_message('authenticated', suspended);
  IF msg IS DISTINCT FROM 'false' THEN
    PERFORM public.test_fail(p_label || ' suspended admin is_admin() ' || msg);
  END IF;
  msg := public.test_is_admin_message('authenticated', admin);
  IF msg IS DISTINCT FROM 'true' THEN
    PERFORM public.test_fail(p_label || ' admin is_admin() ' || msg);
  END IF;

  FOREACH writer IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    FOREACH stmt IN ARRAY ARRAY[
      'INSERT INTO public.service_categories (id, slug, name, is_active) VALUES (''cccccccc-cccc-4ccc-8ccc-ccccccccccc1'', ''injected'', ''Injected'', true)',
      'UPDATE public.service_categories SET name = ''hacked'' WHERE id = ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1''',
      'DELETE FROM public.service_categories WHERE id = ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1''',
      'INSERT INTO public.service_questions (id, category_id, prompt, is_active) VALUES (''dddddddd-dddd-4ddd-8ddd-ddddddddddd1'', ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'', ''Injected'', true)',
      'UPDATE public.service_questions SET prompt = ''hacked'' WHERE id = ''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1''',
      'DELETE FROM public.service_questions WHERE id = ''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'''
    ]
    LOOP
      msg := public.test_exec_message(
        writer,
        CASE WHEN writer = 'authenticated' THEN admin ELSE NULL END,
        stmt
      );
      IF msg NOT ILIKE '%permission denied for table%' THEN
        PERFORM public.test_fail(p_label || ' ' || writer || ' write: ' || msg || ' sql=' || stmt);
      END IF;
    END LOOP;
  END LOOP;

  IF (SELECT count(*) FROM public.service_categories) <> 2
     OR (SELECT count(*) FROM public.service_questions) <> 3
     OR (SELECT name FROM public.service_categories WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') IS DISTINCT FROM 'Handyman'
     OR (SELECT prompt FROM public.service_questions WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1') IS DISTINCT FROM 'What needs doing?' THEN
    PERFORM public.test_fail(p_label || ' catalog rows changed');
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('service_categories', 'service_questions')
      AND cmd <> 'SELECT'
  ) <> 0 THEN
    PERFORM public.test_fail(p_label || ' write policy appeared');
  END IF;

  RAISE NOTICE 'PASS: %', p_label;
END;
$$;

SELECT public.test_expect_catalog('before migration', false);

\ir ../migrations/20261013000002_anon_service_catalog_select.sql

DO $$
DECLARE
  rec record;
  anon_exec boolean;
  authenticated_exec boolean;
  service_role_exec boolean;
  public_exec boolean;
BEGIN
  IF EXISTS (
    SELECT table_name, grantee, privilege_type FROM test_grants_before
    EXCEPT
    SELECT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('service_categories', 'service_questions')
  ) OR EXISTS (
    SELECT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('service_categories', 'service_questions')
    EXCEPT
    SELECT table_name, grantee, privilege_type FROM test_grants_before
  ) THEN
    PERFORM public.test_fail('table grants changed');
  END IF;

  SELECT b.anon_exec, b.authenticated_exec, b.service_role_exec, b.public_exec
  INTO anon_exec, authenticated_exec, service_role_exec, public_exec
  FROM test_fn_priv_before b;
  IF anon_exec
     OR NOT authenticated_exec
     OR NOT service_role_exec
     OR public_exec
     OR has_function_privilege('anon', 'public.is_admin()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.is_admin()', 'EXECUTE')
     OR has_function_privilege('public', 'public.is_admin()', 'EXECUTE') THEN
    PERFORM public.test_fail('is_admin() execute grants changed');
  END IF;

  FOR rec IN
    SELECT *
    FROM (VALUES
      ('service_categories', 'service_categories_select_anon', '{anon}', 'is_active'),
      ('service_categories', 'service_categories_select', '{authenticated}', '(is_active OR is_admin())'),
      ('service_questions', 'service_questions_select_anon', '{anon}', 'is_active'),
      ('service_questions', 'service_questions_select', '{authenticated}', '(is_active OR is_admin())')
    ) AS expected(tablename, policyname, roles, qual)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = rec.tablename
        AND p.policyname = rec.policyname
        AND p.permissive = 'PERMISSIVE'
        AND p.roles::text = rec.roles
        AND p.cmd = 'SELECT'
        AND p.with_check IS NULL
        AND replace(p.qual, 'public.', '') = rec.qual
    ) THEN
      PERFORM public.test_fail(
        'policy mismatch for ' || rec.policyname || ' actual=' || coalesce((
          SELECT p.roles::text || ' ' || coalesce(p.qual, '') || ' check=' || coalesce(p.with_check, '')
          FROM pg_policies p
          WHERE p.schemaname = 'public'
            AND p.tablename = rec.tablename
            AND p.policyname = rec.policyname
        ), 'missing')
      );
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('service_categories', 'service_questions')
  ) <> 4 THEN
    PERFORM public.test_fail('expected exactly four catalog select policies');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service_questions'
      AND policyname LIKE '%anon%'
      AND (
        qual ILIKE '%is_admin%'
        OR qual ILIKE '%service_categories%'
        OR qual ILIKE '%category_id%'
      )
  ) THEN
    PERFORM public.test_fail('anon question policy changed active semantics');
  END IF;

  RAISE NOTICE 'PASS: policies split and grants unchanged';
END
$$;

SELECT public.test_expect_catalog('after migration', true);

\ir ../rollbacks/20261013000002_anon_service_catalog_select_rollback.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM test_policy_before
    EXCEPT
    SELECT tablename, policyname, permissive, roles::text, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('service_categories', 'service_questions')
  ) OR EXISTS (
    SELECT tablename, policyname, permissive, roles::text, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('service_categories', 'service_questions')
    EXCEPT
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM test_policy_before
  ) THEN
    PERFORM public.test_fail('rollback policies differ from the phase 3 definitions');
  END IF;
  RAISE NOTICE 'PASS: rollback restored the phase 3 select policies';
END
$$;

SELECT public.test_expect_catalog('after rollback', false);

\ir ../migrations/20261013000002_anon_service_catalog_select.sql

SELECT public.test_expect_catalog('after re-apply', true);

SELECT 'anon_service_catalog_select_test: all assertions passed' AS result;
