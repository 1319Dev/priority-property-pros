-- Local regression for customer/contractor blocks.
-- Empty database only. Does not change a shared or production database.
--
--   createdb customer_contractor_blocks
--   psql -d customer_contractor_blocks -v ON_ERROR_STOP=1 -f supabase/tests/customer_contractor_blocks_test.sql

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

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

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

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value_int integer
);

INSERT INTO public.platform_settings (key, value_int) VALUES ('signup_fee_enabled', 1);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  account_type text NOT NULL,
  account_status text NOT NULL,
  signup_fee_status text NOT NULL
);

CREATE TABLE public.contractor_profiles (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles (id),
  business_name text NOT NULL DEFAULT '',
  primary_trade text,
  approval_status text NOT NULL,
  accepting_work boolean NOT NULL DEFAULT true,
  min_job_cents integer,
  max_job_cents integer
);

CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY,
  requires_verified_credential boolean NOT NULL DEFAULT false
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  category_id uuid REFERENCES public.service_categories (id),
  status text NOT NULL,
  zip_code text,
  budget_min_cents integer,
  budget_max_cents integer
);

CREATE TABLE public.project_private_locations (
  project_id uuid PRIMARY KEY REFERENCES public.projects (id),
  lat numeric,
  lng numeric
);

CREATE TABLE public.contractor_services (
  contractor_profile_id uuid NOT NULL,
  category_id uuid NOT NULL,
  PRIMARY KEY (contractor_profile_id, category_id)
);

CREATE TABLE public.contractor_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL
);

CREATE TABLE public.contractor_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL,
  status text NOT NULL,
  expires_at date
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects (id),
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  status text NOT NULL
);

CREATE TABLE public.booking_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id),
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  rating smallint NOT NULL,
  body text,
  reviewer_role text NOT NULL,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_reviews_one_per_role UNIQUE (booking_id, reviewer_role)
);

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  status text NOT NULL
);

CREATE TABLE public.project_connections (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  status text NOT NULL,
  fee_cents integer NOT NULL,
  paid_at timestamptz
);

CREATE TABLE public.estimates (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id)
);

CREATE TABLE public.customer_contractor_relationships (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  status text NOT NULL,
  introduced_at timestamptz,
  last_completed_at timestamptz,
  last_completed_booking_id uuid,
  protected_until timestamptz
);

CREATE OR REPLACE FUNCTION public.signup_fee_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'signup_fee_enabled'), 0) <> 0;
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_is_satisfied(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NOT public.signup_fee_enabled()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_profile_id
        AND p.signup_fee_status IN ('PAID', 'NOT_REQUIRED')
    );
$$;

CREATE OR REPLACE FUNCTION public.location_matches(
  p_zip text,
  p_lat numeric,
  p_lng numeric,
  p_area public.contractor_service_areas
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT true;
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
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.account_type = 'ADMIN'
  );
$$;

CREATE OR REPLACE FUNCTION public.anonymized_pro_label(p_trade text, p_categories text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Approved ' || initcap(coalesce(nullif(btrim(p_trade), ''), 'Local')) || ' Pro';
$$;

CREATE OR REPLACE FUNCTION public.relationship_protection_months()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 12;
$$;

GRANT EXECUTE ON FUNCTION public.anonymized_pro_label(text, text[]) TO anon, authenticated;

INSERT INTO public.profiles (id, account_type, account_status, signup_fee_status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'CUSTOMER', 'ACTIVE', 'PAID'),
  ('33333333-3333-4333-8333-333333333333', 'CUSTOMER', 'ACTIVE', 'PAID'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'ADMIN', 'ACTIVE', 'NOT_REQUIRED'),
  ('22222222-2222-4222-8222-222222222222', 'CONTRACTOR', 'ACTIVE', 'PAID'),
  ('18181818-1818-4181-8181-181818181818', 'CONTRACTOR', 'ACTIVE', 'PAID'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CONTRACTOR', 'ACTIVE', 'UNPAID');

INSERT INTO public.contractor_profiles (
  id, profile_id, business_name, primary_trade, approval_status, accepting_work
) VALUES
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'Secret Blocked LLC', 'Handyman', 'APPROVED', true),
  ('19191919-1919-4191-8191-191919191919', '18181818-1818-4181-8181-181818181818', 'Hidden Plumbing LLC', 'Plumbing', 'APPROVED', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Unpaid Yard Co', 'Landscaping', 'APPROVED', true);

INSERT INTO public.service_categories (id, requires_verified_credential)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', false);

INSERT INTO public.projects (id, customer_id, category_id, status, zip_code) VALUES
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'ESTIMATES_AVAILABLE', '30318'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'MATCHING', '30318'),
  ('12121212-1212-4121-8121-121212121212', '11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'POSTED', '30318'),
  ('13131313-1313-4131-8131-131313131313', '33333333-3333-4333-8333-333333333333', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'POSTED', '30318');

INSERT INTO public.contractor_services (contractor_profile_id, category_id)
SELECT id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
FROM public.contractor_profiles;

INSERT INTO public.contractor_service_areas (contractor_profile_id)
SELECT id FROM public.contractor_profiles;

INSERT INTO public.bookings (id, project_id, customer_id, contractor_profile_id, status) VALUES
  ('55555555-5555-4555-8555-555555555555', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444', 'IN_PROGRESS'),
  ('56565656-5656-4565-8565-565656565656', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', '19191919-1919-4191-8191-191919191919', 'IN_PROGRESS');

-- Written before the migration. Must not become a block when the migration runs.
INSERT INTO public.booking_reviews (
  id, booking_id, customer_id, contractor_profile_id, rating, body, reviewer_role
) VALUES (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  2,
  'Existing low review. Do not backfill.',
  'CUSTOMER'
);

INSERT INTO public.opportunities (id, project_id, contractor_profile_id, status) VALUES
  ('14141414-1414-4141-8141-141414141414', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '44444444-4444-4444-8444-444444444444', 'AVAILABLE'),
  ('15151515-1515-4151-8151-151515151515', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '44444444-4444-4444-8444-444444444444', 'ACCEPTED'),
  ('16161616-1616-4161-8161-161616161616', '13131313-1313-4131-8131-131313131313', '44444444-4444-4444-8444-444444444444', 'AVAILABLE'),
  ('17171717-1717-4171-8171-171717171717', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '19191919-1919-4191-8191-191919191919', 'AVAILABLE'),
  ('18181818-1818-4181-8181-181818181818', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '19191919-1919-4191-8191-191919191919', 'AVAILABLE');

INSERT INTO public.project_connections (
  id, project_id, contractor_profile_id, customer_id, status, fee_cents, paid_at
) VALUES (
  '19191919-1919-4191-8191-191919191919',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'PAID',
  499,
  '2026-10-01 12:00:00+00'
);

INSERT INTO public.estimates (id, project_id, contractor_profile_id) VALUES
  ('1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '19191919-1919-4191-8191-191919191919');

INSERT INTO public.customer_contractor_relationships (
  id, customer_id, contractor_profile_id, status, last_completed_at, last_completed_booking_id, protected_until
) VALUES
  ('1b1b1b1b-1b1b-41b1-81b1-1b1b1b1b1b1b', '11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444', 'ACTIVE', now(), '55555555-5555-4555-8555-555555555555', now() + interval '1 year'),
  ('1c1c1c1c-1c1c-41c1-81c1-1c1c1c1c1c1c', '11111111-1111-4111-8111-111111111111', '19191919-1919-4191-8191-191919191919', 'ACTIVE', now(), '56565656-5656-4565-8565-565656565656', now() + interval '1 year'),
  ('1d1d1d1d-1d1d-41d1-81d1-1d1d1d1d1d1d', '33333333-3333-4333-8333-333333333333', '19191919-1919-4191-8191-191919191919', 'ACTIVE', now(), '56565656-5656-4565-8565-565656565656', now() + interval '1 year');

CREATE OR REPLACE FUNCTION public.test_fail(p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'FAIL: %', p_msg;
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
  RESET ROLE;
  RETURN SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_block_count(p_role text, p_uid uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid)::text END,
    true
  );
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  SELECT count(*) INTO v_count FROM public.customer_contractor_blocks;
  RESET ROLE;
  RETURN v_count::text;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'ERR:' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_json(p_role text, p_uid uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid)::text END,
    true
  );
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  EXECUTE p_sql INTO v_result;
  RESET ROLE;
  RETURN coalesce(v_result, 'null');
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'ERR:' || SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.test_fail(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.test_exec_message(text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.test_block_count(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.test_json(text, uuid, text) FROM PUBLIC, anon;

-- Install the pre-block function bodies, then snapshot them.
\ir ../rollbacks/20261013000004_customer_contractor_blocks_rollback.sql

CREATE TEMP TABLE fn_before AS
SELECT p.proname,
       pg_get_functiondef(p.oid) AS def,
       obj_description(p.oid) AS comment
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('contractor_eligible_for_project', 'hire_again_contractors');

\ir ../migrations/20261013000004_customer_contractor_blocks.sql

DO $$
DECLARE
  msg text;
  secret uuid := '44444444-4444-4444-8444-444444444444';
  ghost uuid := '19191919-1919-4191-8191-191919191919';
  unpaid uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  proj_new uuid := '12121212-1212-4121-8121-121212121212';
  proj_b uuid := '13131313-1313-4131-8131-131313131313';
  customer_a uuid := '11111111-1111-4111-8111-111111111111';
  customer_b uuid := '33333333-3333-4333-8333-333333333333';
  admin_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  contractor_user uuid := '22222222-2222-4222-8222-222222222222';
  listed text;
  hire text;
  v_reason text;
  fee integer;
  conn_status text;
  paid_at timestamptz;
  booking_status text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.customer_contractor_blocks) THEN
    PERFORM public.test_fail('migration backfilled a block from the existing review');
  END IF;
  IF (SELECT rating FROM public.booking_reviews WHERE id = '66666666-6666-4666-8666-666666666666') IS DISTINCT FROM 2 THEN
    PERFORM public.test_fail('migration changed the existing review');
  END IF;
  IF NOT public.contractor_eligible_for_project(proj_new, secret) THEN
    PERFORM public.test_fail('existing 2-star review blocked matching without an edit');
  END IF;
  IF (SELECT status FROM public.opportunities WHERE id = '14141414-1414-4141-8141-141414141414') IS DISTINCT FROM 'AVAILABLE' THEN
    PERFORM public.test_fail('migration closed an offer');
  END IF;

  IF public.contractor_eligible_for_project(proj_new, unpaid) THEN
    PERFORM public.test_fail('unpaid contractor is eligible');
  END IF;
  IF NOT public.contractor_eligible_for_project(proj_new, secret) THEN
    PERFORM public.test_fail('paid contractor is not eligible before a block');
  END IF;

  INSERT INTO public.booking_reviews (
    id, booking_id, customer_id, contractor_profile_id, rating, body, reviewer_role
  ) VALUES (
    '67676767-6767-4676-8676-676767676767',
    '56565656-5656-4565-8565-565656565656',
    customer_a,
    ghost,
    5,
    'Would hire again.',
    'CUSTOMER'
  );
  IF EXISTS (
    SELECT 1 FROM public.customer_contractor_blocks WHERE contractor_profile_id = ghost
  ) THEN
    PERFORM public.test_fail('a 5-star customer review created a block');
  END IF;
  IF NOT public.contractor_eligible_for_project(proj_new, ghost) THEN
    PERFORM public.test_fail('5-star review made the pro ineligible');
  END IF;

  UPDATE public.booking_reviews
  SET rating = 3
  WHERE id = '67676767-6767-4676-8676-676767676767';

  SELECT blocks.reason::text INTO v_reason
  FROM public.customer_contractor_blocks blocks
  WHERE blocks.customer_profile_id = customer_a AND blocks.contractor_profile_id = ghost;
  IF v_reason IS DISTINCT FROM 'LOW_RATING' THEN
    PERFORM public.test_fail('3-star edit did not insert LOW_RATING: ' || coalesce(v_reason, 'null'));
  END IF;
  IF public.contractor_eligible_for_project(proj_new, ghost) THEN
    PERFORM public.test_fail('blocked pro is still eligible on a new project');
  END IF;
  IF NOT public.contractor_eligible_for_project(proj_b, ghost) THEN
    PERFORM public.test_fail('another customer lost eligibility');
  END IF;
  IF NOT public.contractor_eligible_for_project(proj_new, secret) THEN
    PERFORM public.test_fail('a different pro was blocked');
  END IF;
  IF public.contractor_eligible_for_project(proj_new, unpaid) THEN
    PERFORM public.test_fail('unpaid gate dropped after a block');
  END IF;
  IF (SELECT status FROM public.opportunities WHERE id = '17171717-1717-4171-8171-171717171717') IS DISTINCT FROM 'CLOSED' THEN
    PERFORM public.test_fail('open offer on another project stayed AVAILABLE');
  END IF;
  IF (SELECT status FROM public.opportunities WHERE id = '18181818-1818-4181-8181-181818181818') IS DISTINCT FROM 'AVAILABLE' THEN
    PERFORM public.test_fail('source project open offer was closed');
  END IF;
  IF (SELECT status FROM public.opportunities WHERE id = '14141414-1414-4141-8141-141414141414') IS DISTINCT FROM 'AVAILABLE' THEN
    PERFORM public.test_fail('a different pro lost an open offer');
  END IF;
  IF (SELECT status FROM public.opportunities WHERE id = '16161616-1616-4161-8161-161616161616') IS DISTINCT FROM 'AVAILABLE' THEN
    PERFORM public.test_fail('another customer''s open offer was closed');
  END IF;
  IF (SELECT status FROM public.opportunities WHERE id = '15151515-1515-4151-8151-151515151515') IS DISTINCT FROM 'ACCEPTED' THEN
    PERFORM public.test_fail('accepted offer changed');
  END IF;

  SELECT pc.status, pc.fee_cents, pc.paid_at INTO conn_status, fee, paid_at
  FROM public.project_connections pc
  WHERE pc.id = '19191919-1919-4191-8191-191919191919';
  IF conn_status IS DISTINCT FROM 'PAID' OR fee IS DISTINCT FROM 499 OR paid_at IS DISTINCT FROM '2026-10-01 12:00:00+00' THEN
    PERFORM public.test_fail('paid connection changed');
  END IF;
  SELECT bk.status INTO booking_status FROM public.bookings bk WHERE bk.id = '55555555-5555-4555-8555-555555555555';
  IF booking_status IS DISTINCT FROM 'IN_PROGRESS' THEN
    PERFORM public.test_fail('in-progress booking changed');
  END IF;

  UPDATE public.booking_reviews
  SET rating = 5
  WHERE id = '67676767-6767-4676-8676-676767676767';
  SELECT blocks.reason::text INTO v_reason
  FROM public.customer_contractor_blocks blocks
  WHERE blocks.customer_profile_id = customer_a AND blocks.contractor_profile_id = ghost;
  IF v_reason IS DISTINCT FROM 'LOW_RATING' THEN
    PERFORM public.test_fail('raising the rating removed LOW_RATING');
  END IF;
  IF public.contractor_eligible_for_project(proj_new, ghost) THEN
    PERFORM public.test_fail('raising the rating restored eligibility');
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    customer_a,
    format('SELECT public.unblock_contractor_for_customer(%L)', ghost)
  );
  IF msg IS DISTINCT FROM 'ok' THEN
    PERFORM public.test_fail('unblock: ' || msg);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.customer_contractor_blocks WHERE contractor_profile_id = ghost
  ) THEN
    PERFORM public.test_fail('unblock left the row');
  END IF;
  IF NOT public.contractor_eligible_for_project(proj_new, ghost) THEN
    PERFORM public.test_fail('unblock did not restore eligibility');
  END IF;
  IF (SELECT status FROM public.opportunities WHERE id = '17171717-1717-4171-8171-171717171717') IS DISTINCT FROM 'CLOSED' THEN
    PERFORM public.test_fail('unblock reopened a closed offer');
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    customer_a,
    format(
      'SELECT public.block_contractor_for_customer(%L, %L, NULL)',
      ghost,
      '56565656-5656-4565-8565-565656565656'
    )
  );
  IF msg IS DISTINCT FROM 'ok' THEN
    PERFORM public.test_fail('manual block: ' || msg);
  END IF;
  SELECT blocks.reason::text INTO v_reason
  FROM public.customer_contractor_blocks blocks
  WHERE blocks.customer_profile_id = customer_a AND blocks.contractor_profile_id = ghost;
  IF v_reason IS DISTINCT FROM 'CUSTOMER_REQUEST' THEN
    PERFORM public.test_fail('manual block reason: ' || coalesce(v_reason, 'null'));
  END IF;
  IF public.contractor_eligible_for_project(proj_new, ghost) THEN
    PERFORM public.test_fail('manual block left the pro eligible');
  END IF;

  UPDATE public.booking_reviews
  SET rating = 1
  WHERE id = '67676767-6767-4676-8676-676767676767';
  SELECT blocks.reason::text INTO v_reason
  FROM public.customer_contractor_blocks blocks
  WHERE blocks.customer_profile_id = customer_a AND blocks.contractor_profile_id = ghost;
  IF v_reason IS DISTINCT FROM 'CUSTOMER_REQUEST' THEN
    PERFORM public.test_fail('low rating replaced CUSTOMER_REQUEST');
  END IF;

  INSERT INTO public.booking_reviews (
    booking_id, customer_id, contractor_profile_id, rating, reviewer_role
  ) VALUES (
    '56565656-5656-4565-8565-565656565656',
    customer_a,
    ghost,
    1,
    'CONTRACTOR'
  );
  IF (
    SELECT count(*) FROM public.customer_contractor_blocks WHERE contractor_profile_id = ghost
  ) IS DISTINCT FROM 1 THEN
    PERFORM public.test_fail('contractor review created or removed a block');
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    customer_b,
    format('SELECT public.block_contractor_for_customer(%L, %L, NULL)', ghost, '56565656-5656-4565-8565-565656565656')
  );
  IF msg NOT ILIKE '%booking not found%' THEN
    PERFORM public.test_fail('other customer manual block: ' || msg);
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    contractor_user,
    format('SELECT public.block_contractor_for_customer(%L, %L, NULL)', ghost, '56565656-5656-4565-8565-565656565656')
  );
  IF msg NOT ILIKE '%booking not found%' THEN
    PERFORM public.test_fail('contractor manual block: ' || msg);
  END IF;

  msg := public.test_exec_message(
    'anon',
    NULL,
    format('SELECT public.block_contractor_for_customer(%L, %L, NULL)', ghost, '56565656-5656-4565-8565-565656565656')
  );
  IF msg NOT ILIKE '%permission denied%' THEN
    PERFORM public.test_fail('anon block execute: ' || msg);
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    customer_a,
    format('INSERT INTO public.customer_contractor_blocks (customer_profile_id, contractor_profile_id, reason) VALUES (%L, %L, ''CUSTOMER_REQUEST'')', customer_a, secret)
  );
  IF msg NOT ILIKE '%permission denied%' THEN
    PERFORM public.test_fail('customer insert: ' || msg);
  END IF;

  IF public.test_block_count('authenticated', customer_a) IS DISTINCT FROM '1' THEN
    PERFORM public.test_fail('customer cannot read own block: ' || public.test_block_count('authenticated', customer_a));
  END IF;
  IF public.test_block_count('authenticated', customer_b) IS DISTINCT FROM '0' THEN
    PERFORM public.test_fail('other customer can see the block: ' || public.test_block_count('authenticated', customer_b));
  END IF;
  IF public.test_block_count('authenticated', contractor_user) IS DISTINCT FROM '0' THEN
    PERFORM public.test_fail('contractor can see a block: ' || public.test_block_count('authenticated', contractor_user));
  END IF;
  IF public.test_block_count('authenticated', admin_id) IS DISTINCT FROM '1' THEN
    PERFORM public.test_fail('admin cannot read blocks: ' || public.test_block_count('authenticated', admin_id));
  END IF;
  IF public.test_block_count('anon', NULL) NOT ILIKE 'ERR:%permission denied%' THEN
    PERFORM public.test_fail('anon table read: ' || public.test_block_count('anon', NULL));
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    customer_a,
    'DELETE FROM public.customer_contractor_blocks'
  );
  IF msg IS DISTINCT FROM 'ok' THEN
    PERFORM public.test_fail('customer delete statement: ' || msg);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_contractor_blocks WHERE contractor_profile_id = ghost
  ) THEN
    PERFORM public.test_fail('customer delete removed the block');
  END IF;

  listed := public.test_json(
    'authenticated',
    customer_a,
    'SELECT public.list_my_contractor_blocks()::text'
  );
  IF listed ILIKE '%Hidden Plumbing LLC%' OR listed ILIKE '%"business_name"%' THEN
    PERFORM public.test_fail('list leaked the unpaid-connection business name: ' || listed);
  END IF;
  IF listed NOT ILIKE '%Approved Plumbing Pro%' THEN
    PERFORM public.test_fail('list missing the neutral label: ' || listed);
  END IF;
  IF listed ILIKE '%"uses_business_name": true%' THEN
    PERFORM public.test_fail('ghost block was marked as a business name: ' || listed);
  END IF;

  UPDATE public.booking_reviews
  SET rating = 2
  WHERE id = '66666666-6666-4666-8666-666666666666';
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_contractor_blocks
    WHERE contractor_profile_id = secret AND reason = 'LOW_RATING'
  ) THEN
    PERFORM public.test_fail('editing the existing low review did not block');
  END IF;
  IF (SELECT status FROM public.opportunities WHERE id = '14141414-1414-4141-8141-141414141414') IS DISTINCT FROM 'CLOSED' THEN
    PERFORM public.test_fail('secret open offer on the other project stayed open');
  END IF;
  IF (SELECT status FROM public.opportunities WHERE id = '16161616-1616-4161-8161-161616161616') IS DISTINCT FROM 'AVAILABLE' THEN
    PERFORM public.test_fail('other customer offer for secret was closed');
  END IF;
  SELECT pc.status, pc.fee_cents, pc.paid_at INTO conn_status, fee, paid_at
  FROM public.project_connections pc
  WHERE pc.id = '19191919-1919-4191-8191-191919191919';
  IF conn_status IS DISTINCT FROM 'PAID' OR fee IS DISTINCT FROM 499 OR paid_at IS DISTINCT FROM '2026-10-01 12:00:00+00' THEN
    PERFORM public.test_fail('paid connection changed when secret was blocked');
  END IF;
  IF (SELECT status FROM public.bookings WHERE id = '55555555-5555-4555-8555-555555555555') IS DISTINCT FROM 'IN_PROGRESS' THEN
    PERFORM public.test_fail('booking changed when secret was blocked');
  END IF;
  IF public.contractor_eligible_for_project(proj_new, secret) THEN
    PERFORM public.test_fail('secret still eligible after the edited low review');
  END IF;

  listed := public.test_json(
    'authenticated',
    customer_a,
    'SELECT public.list_my_contractor_blocks()::text'
  );
  IF listed NOT ILIKE '%Secret Blocked LLC%' THEN
    PERFORM public.test_fail('paid connection did not reveal the business name: ' || listed);
  END IF;
  IF listed ILIKE '%Hidden Plumbing LLC%' THEN
    PERFORM public.test_fail('paid-name list still leaked the other business: ' || listed);
  END IF;

  hire := public.test_json(
    'authenticated',
    customer_a,
    'SELECT public.hire_again_contractors()::text'
  );
  IF hire ILIKE '%19191919-1919-4191-8191-191919191919%' OR hire ILIKE '%44444444-4444-4444-8444-444444444444%' THEN
    PERFORM public.test_fail('hire again returned a blocked pro: ' || hire);
  END IF;
  hire := public.test_json(
    'authenticated',
    customer_b,
    'SELECT public.hire_again_contractors()::text'
  );
  IF hire NOT ILIKE '%19191919-1919-4191-8191-191919191919%' THEN
    PERFORM public.test_fail('other customer hire again lost the pro: ' || hire);
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    customer_a,
    format(
      'SELECT public.block_contractor_for_customer(%L, NULL, %L)',
      ghost,
      '1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a'
    )
  );
  IF msg IS DISTINCT FROM 'ok' THEN
    PERFORM public.test_fail('estimate block: ' || msg);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND pg_get_functiondef(p.oid) ILIKE '%customer_contractor_blocks%'
  ) THEN
    PERFORM public.test_fail('an anon-executable function reads customer_contractor_blocks');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND pg_get_viewdef(c.oid) ILIKE '%customer_contractor_blocks%'
  ) THEN
    PERFORM public.test_fail('a view reads customer_contractor_blocks');
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    admin_id,
    format('DELETE FROM public.customer_contractor_blocks WHERE contractor_profile_id = %L', ghost)
  );
  IF msg IS DISTINCT FROM 'ok' THEN
    PERFORM public.test_fail('admin delete: ' || msg);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.customer_contractor_blocks WHERE contractor_profile_id = ghost
  ) THEN
    PERFORM public.test_fail('admin delete left the ghost block');
  END IF;
  IF NOT public.contractor_eligible_for_project(proj_new, ghost) THEN
    PERFORM public.test_fail('admin delete did not restore eligibility');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_contractor_blocks WHERE contractor_profile_id = secret
  ) THEN
    PERFORM public.test_fail('admin delete removed a different block');
  END IF;

  SELECT pc.status, pc.fee_cents, pc.paid_at INTO conn_status, fee, paid_at
  FROM public.project_connections pc
  WHERE pc.id = '19191919-1919-4191-8191-191919191919';
  IF conn_status IS DISTINCT FROM 'PAID' OR fee IS DISTINCT FROM 499 OR paid_at IS DISTINCT FROM '2026-10-01 12:00:00+00' THEN
    PERFORM public.test_fail('paid connection changed by the end of the test');
  END IF;

  RAISE NOTICE 'PASS: blocks, matching, offers, privacy, unpaid gate, payments';
END
$$;

\ir ../rollbacks/20261013000004_customer_contractor_blocks_rollback.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT proname, def, comment FROM fn_before
    EXCEPT
    SELECT p.proname, pg_get_functiondef(p.oid), obj_description(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('contractor_eligible_for_project', 'hire_again_contractors')
  ) OR EXISTS (
    SELECT p.proname, pg_get_functiondef(p.oid), obj_description(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('contractor_eligible_for_project', 'hire_again_contractors')
    EXCEPT
    SELECT proname, def, comment FROM fn_before
  ) THEN
    PERFORM public.test_fail('rollback function definition or comment does not match the previous one');
  END IF;
  IF to_regclass('public.customer_contractor_blocks') IS NOT NULL THEN
    PERFORM public.test_fail('rollback left the block table');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_contractor_block_reason') THEN
    PERFORM public.test_fail('rollback left the reason enum');
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'booking_reviews_low_rating_block'
  ) THEN
    PERFORM public.test_fail('rollback left the review trigger');
  END IF;
  IF NOT public.contractor_eligible_for_project(
    '12121212-1212-4121-8121-121212121212',
    '44444444-4444-4444-8444-444444444444'
  ) THEN
    PERFORM public.test_fail('restored eligibility still excludes the paid contractor');
  END IF;
  IF public.contractor_eligible_for_project(
    '12121212-1212-4121-8121-121212121212',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) THEN
    PERFORM public.test_fail('restored eligibility dropped the unpaid gate');
  END IF;
  IF (SELECT rating FROM public.booking_reviews WHERE id = '66666666-6666-4666-8666-666666666666') IS DISTINCT FROM 2 THEN
    PERFORM public.test_fail('rollback changed the review');
  END IF;
  IF (SELECT status FROM public.project_connections WHERE id = '19191919-1919-4191-8191-191919191919') IS DISTINCT FROM 'PAID' THEN
    PERFORM public.test_fail('rollback changed the paid connection');
  END IF;
  RAISE NOTICE 'PASS: rollback restored the previous functions exactly';
END
$$;

\ir ../migrations/20261013000004_customer_contractor_blocks.sql

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.customer_contractor_blocks) THEN
    PERFORM public.test_fail('re-apply backfilled a block');
  END IF;
  UPDATE public.booking_reviews
  SET rating = 2
  WHERE id = '67676767-6767-4676-8676-676767676767';
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_contractor_blocks
    WHERE contractor_profile_id = '19191919-1919-4191-8191-191919191919'
      AND reason = 'LOW_RATING'
  ) THEN
    PERFORM public.test_fail('re-applied trigger did not block a new low edit');
  END IF;
  IF public.contractor_eligible_for_project(
    '12121212-1212-4121-8121-121212121212',
    '19191919-1919-4191-8191-191919191919'
  ) THEN
    PERFORM public.test_fail('re-applied eligibility ignored the block');
  END IF;
  RAISE NOTICE 'PASS: migration re-applies';
END
$$;

SELECT 'customer_contractor_blocks_test: all assertions passed' AS result;
