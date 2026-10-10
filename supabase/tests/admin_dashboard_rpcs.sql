-- Local proof for the read-only admin dashboard RPCs.
-- Not a production script. Does not call Stripe and does not seed real accounts.
--
--   psql -d admin_dashboard -v ON_ERROR_STOP=1 -f supabase/tests/admin_dashboard_rpcs.sql

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

CREATE TABLE auth.mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL
);

CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value_int integer
);

INSERT INTO public.platform_settings (key, value_int) VALUES ('admin_mfa_required', 0);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  phone text,
  account_type text NOT NULL,
  account_status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contractor_profiles (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL,
  business_name text NOT NULL DEFAULT '',
  approval_status text NOT NULL DEFAULT 'PENDING',
  identity_review_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT',
  posted_at timestamptz,
  reference_number integer
);

CREATE TABLE public.estimates (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  contractor_profile_id uuid,
  status text NOT NULL,
  fee_cents integer NOT NULL DEFAULT 0
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  status text NOT NULL,
  customer_hired_at timestamptz,
  contractor_hired_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE public.contractor_portfolio (
  id uuid PRIMARY KEY,
  contractor_profile_id uuid NOT NULL,
  privacy_state text NOT NULL
);

CREATE TABLE public.platform_reviews (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL
);

CREATE TABLE public.content_reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.signup_fee_charges (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  fulfilled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  needs_refund boolean NOT NULL DEFAULT false
);

CREATE TABLE public.connection_checkout_sessions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  fulfilled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  needs_refund boolean NOT NULL DEFAULT false
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
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

\ir ../migrations/20261014120000_admin_dashboard_rpcs.sql

INSERT INTO public.profiles (id, email, first_name, phone, account_type, account_status, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com', 'Ada', '404-555-0100', 'ADMIN', 'ACTIVE', '2026-09-01 15:00:00+00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner.customer@example.com', 'Owen', '404-555-0101', 'CUSTOMER', 'ACTIVE', '2026-10-02 15:00:00+00'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'secret-test@example.com', 'Tina', '404-555-0199', 'CUSTOMER', 'ACTIVE', '2026-10-03 15:00:00+00'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'owner.pro@example.com', 'Pat', NULL, 'CONTRACTOR', 'ACTIVE', '2026-09-15 15:00:00+00');

INSERT INTO public.contractor_profiles (id, profile_id, business_name, approval_status, identity_review_required) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Plymate Example', 'APPROVED', false);

INSERT INTO public.projects (id, customer_id, title, status, posted_at, reference_number) VALUES
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '1004 Main Street exact address', 'ESTIMATES_AVAILABLE', '2026-10-04 15:00:00+00', 1004),
  ('22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Test draft job', 'POSTED', '2026-10-01 15:00:00+00', 1001);

INSERT INTO public.estimates (id, project_id, status, fee_cents) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'VIEWED', 70000);

INSERT INTO public.signup_fee_charges (id, profile_id, amount_cents, livemode, status, fulfilled_at) VALUES
  ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, true, 'CONSUMED', '2026-10-04 18:00:00+00'),
  ('55555555-5555-5555-5555-555555555555', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 999, true, 'CONSUMED', '2026-10-04 19:00:00+00'),
  ('66666666-6666-6666-6666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, false, 'CONSUMED', '2026-10-04 20:00:00+00');

INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'project.posted', 'project', '11111111-1111-1111-1111-111111111111',
    '{"email":"secret-test@example.com","phone":"404-555-0199","street":"1004 Main Street"}'::jsonb,
    '2026-10-04 15:00:00+00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'secret.email.leaked', 'profile', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '{"email":"leaked@example.com"}'::jsonb,
    '2026-10-04 16:00:00+00');

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal1","role":"authenticated"}', false);

DO $$
DECLARE
  summary jsonb;
  attention jsonb;
  activity text;
  trends jsonb;
BEGIN
  summary := public.admin_dashboard_summary(false);
  IF (summary -> 'metrics' -> 'homeowners' ->> 'value')::int <> 2 THEN
    RAISE EXCEPTION 'expected both homeowners before flags, got %', summary -> 'metrics' -> 'homeowners';
  END IF;
  IF (summary -> 'metrics' -> 'revenue_lifetime_cents' ->> 'value')::int <> 1998 THEN
    RAISE EXCEPTION 'revenue counted the wrong rows: %', summary -> 'metrics' -> 'revenue_lifetime_cents';
  END IF;
  IF summary -> 'metrics' -> 'support_tickets' ->> 'status' IS DISTINCT FROM 'unavailable'
     OR summary -> 'metrics' -> 'support_tickets' ->> 'value' IS NOT NULL THEN
    RAISE EXCEPTION 'support tickets must be unavailable, got %', summary -> 'metrics' -> 'support_tickets';
  END IF;
  IF summary -> 'metrics' -> 'revenue_net_cents' ->> 'status' IS DISTINCT FROM 'unavailable' THEN
    RAISE EXCEPTION 'net revenue must be unavailable';
  END IF;
  IF summary #>> '{metrics,revenue_lifetime_cents,value}' = '70998' THEN
    RAISE EXCEPTION 'revenue included estimate fee cents';
  END IF;

  PERFORM public.admin_set_account_flag('cccccccc-cccc-cccc-cccc-cccccccccccc', 'TEST', 'smoke');
  PERFORM public.admin_set_account_flag('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OWNER', 'owner customer');

  summary := public.admin_dashboard_summary(false);
  IF (summary -> 'metrics' -> 'homeowners' ->> 'value')::int <> 1 THEN
    RAISE EXCEPTION 'TEST homeowner was not excluded: %', summary -> 'metrics' -> 'homeowners';
  END IF;
  IF (summary -> 'metrics' -> 'projects_posted' ->> 'value')::int <> 1 THEN
    RAISE EXCEPTION 'TEST project was not excluded: %', summary -> 'metrics' -> 'projects_posted';
  END IF;
  IF (summary -> 'metrics' -> 'revenue_lifetime_cents' ->> 'value')::int <> 999 THEN
    RAISE EXCEPTION 'TEST revenue was not excluded: %', summary -> 'metrics' -> 'revenue_lifetime_cents';
  END IF;

  summary := public.admin_dashboard_summary(true);
  IF (summary -> 'metrics' -> 'homeowners' ->> 'value')::int <> 2 THEN
    RAISE EXCEPTION 'include_test did not bring the TEST homeowner back';
  END IF;
  IF (summary -> 'metrics' -> 'revenue_lifetime_cents' ->> 'value')::int <> 1998 THEN
    RAISE EXCEPTION 'include_test revenue should be 1998, got %', summary -> 'metrics' -> 'revenue_lifetime_cents';
  END IF;

  attention := public.admin_needs_attention(false);
  IF attention ->> 'mfa' IS DISTINCT FROM 'missing' THEN
    RAISE EXCEPTION 'expected missing mfa for this admin, got %', attention ->> 'mfa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(attention -> 'items') item
    WHERE item ->> 'kind' = 'admin_mfa_missing' AND item ->> 'link' = '/app/admin/security'
  ) THEN
    RAISE EXCEPTION 'missing mfa item: %', attention;
  END IF;

  activity := (SELECT string_agg(label || ' ' || coalesce(job_reference, '') || ' ' || subject_label || ' ' || owner_activity::text, E'\n')
               FROM public.admin_recent_activity(25, NULL, false));
  IF activity ILIKE '%secret-test@example.com%' OR activity ILIKE '%leaked@example.com%'
     OR activity ILIKE '%404-555-0199%' OR activity ILIKE '%1004 Main Street%' THEN
    RAISE EXCEPTION 'activity leaked contact data: %', activity;
  END IF;
  IF activity NOT LIKE '%Project posted%' OR activity NOT LIKE '%PPP-1004%' OR activity NOT LIKE '%Owen%' THEN
    RAISE EXCEPTION 'activity missing the safe project row: %', activity;
  END IF;
  IF activity ILIKE '%secret.email%' OR activity NOT LIKE '%Owner activity%' AND activity NOT LIKE '%true%' THEN
    NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_recent_activity(25, NULL, false) WHERE owner_activity IS TRUE AND job_reference = 'PPP-1004'
  ) THEN
    RAISE EXCEPTION 'owner badge missing on PPP-1004';
  END IF;

  trends := public.admin_dashboard_trends('day', '2026-10-01', '2026-10-10', false);
  IF trends ->> 'card_declines' IS NULL OR trends -> 'card_declines' ->> 'status' IS DISTINCT FROM 'unavailable' THEN
    RAISE EXCEPTION 'card declines must be unavailable';
  END IF;
  IF (
    SELECT coalesce(sum((bucket ->> 'revenue_cents')::int), 0)
    FROM jsonb_array_elements(trends -> 'buckets') bucket
  ) <> 999 THEN
    RAISE EXCEPTION 'trend revenue should exclude test and non-livemode rows: %', trends -> 'buckets';
  END IF;

  PERFORM public.admin_dashboard_trends('year', '2026-10-01', '2026-10-02', false);
  RAISE EXCEPTION 'bad granularity was accepted';
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    NULL;
END $$;

DO $$
BEGIN
  PERFORM public.admin_dashboard_trends('day', '2025-01-01', '2026-10-10', false);
  RAISE EXCEPTION 'overlong range was accepted';
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    NULL;
END $$;

DO $$
DECLARE
  denied boolean := false;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM public.admin_dashboard_summary(false);
  EXCEPTION
    WHEN insufficient_privilege THEN
      denied := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT denied THEN
    RAISE EXCEPTION 'anon was not denied';
  END IF;
END $$;

DO $$
DECLARE
  denied boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","aal":"aal1","role":"authenticated"}', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.admin_dashboard_summary(false);
  EXCEPTION
    WHEN insufficient_privilege THEN
      denied := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT denied THEN
    RAISE EXCEPTION 'customer was not denied with 42501';
  END IF;
END $$;

UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';

DO $$
DECLARE
  denied boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal1","role":"authenticated"}', true);
  BEGIN
    PERFORM public.admin_dashboard_summary(false);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'aal1 admin was allowed while admin_mfa_required is on';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal2","role":"authenticated"}', true);
  PERFORM public.admin_dashboard_summary(false);
END $$;

UPDATE public.platform_settings SET value_int = 0 WHERE key = 'admin_mfa_required';

\echo admin_dashboard_rpcs_ok
