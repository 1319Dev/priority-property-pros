-- Local regression for unpaid contractor gates.
-- Builds a minimal schema, applies supabase/migrations/20261012000003_unpaid_contractor_gates.sql,
-- and raises on failure. Not a production script. Does not call Stripe.
--
--   psql -d unpaid_gates -v ON_ERROR_STOP=1 -f supabase/tests/unpaid_contractor_gates_test.sql

\set ON_ERROR_STOP on
SET client_min_messages = notice;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'service_role'::text $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TYPE public.account_type AS ENUM ('CUSTOMER', 'CONTRACTOR', 'VERIFIER', 'ADMIN');
CREATE TYPE public.account_status AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED');
CREATE TYPE public.approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE public.signup_fee_status AS ENUM ('UNPAID', 'PAID', 'NOT_REQUIRED');
CREATE TYPE public.project_status AS ENUM (
  'DRAFT', 'POSTED', 'MATCHING', 'CONTRACTORS_RESPONDING', 'ESTIMATES_AVAILABLE', 'CONTRACTOR_SELECTED', 'CANCELLED'
);
CREATE TYPE public.opportunity_status AS ENUM ('AVAILABLE', 'ACCEPTED', 'PASSED', 'EXPIRED', 'CLOSED');
CREATE TYPE public.project_connection_status AS ENUM (
  'INITIATED', 'RESERVED', 'PAYMENT_DISABLED', 'PAID', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'
);

CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value_int integer
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  account_type public.account_type NOT NULL,
  account_status public.account_status NOT NULL DEFAULT 'ACTIVE',
  signup_fee_status public.signup_fee_status NOT NULL DEFAULT 'UNPAID'
);

CREATE TABLE public.contractor_profiles (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id),
  business_name text NOT NULL DEFAULT '',
  primary_trade text,
  service_area text,
  years_experience integer,
  headline text,
  bio text,
  approval_status public.approval_status NOT NULL DEFAULT 'PENDING',
  accepting_work boolean NOT NULL DEFAULT true,
  min_job_cents integer,
  max_job_cents integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  requires_verified_credential boolean NOT NULL DEFAULT false
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  category_id uuid REFERENCES public.service_categories (id),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status public.project_status NOT NULL DEFAULT 'DRAFT',
  zip_code text,
  budget_min_cents integer,
  budget_max_cents integer,
  accepting_connections boolean NOT NULL DEFAULT true
);

CREATE TABLE public.project_private_locations (
  project_id uuid PRIMARY KEY REFERENCES public.projects (id),
  lat numeric,
  lng numeric
);

CREATE TABLE public.contractor_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  category_id uuid NOT NULL REFERENCES public.service_categories (id)
);

CREATE TABLE public.contractor_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  center_zip text,
  radius_miles numeric,
  zip_codes text[] NOT NULL DEFAULT '{}',
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contractor_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  kind text NOT NULL DEFAULT 'OTHER',
  status text NOT NULL DEFAULT 'PENDING',
  expires_at date
);

CREATE TABLE public.contractor_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  title text NOT NULL DEFAULT '',
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  privacy_state text NOT NULL DEFAULT 'REVIEW_REQUIRED'
);

CREATE TABLE public.booking_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  rating smallint NOT NULL,
  body text,
  is_verified boolean NOT NULL DEFAULT true,
  reviewer_role text NOT NULL DEFAULT 'CUSTOMER'
);

CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  score integer NOT NULL DEFAULT 0,
  rank_order integer NOT NULL DEFAULT 0,
  UNIQUE (project_id, contractor_profile_id)
);

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  match_id uuid REFERENCES public.matches (id),
  status public.opportunity_status NOT NULL DEFAULT 'AVAILABLE',
  expires_at timestamptz,
  UNIQUE (project_id, contractor_profile_id)
);

CREATE TABLE public.opportunity_slots (
  project_id uuid NOT NULL REFERENCES public.projects (id),
  slot_number smallint NOT NULL,
  opportunity_id uuid NOT NULL UNIQUE REFERENCES public.opportunities (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  PRIMARY KEY (project_id, slot_number),
  CONSTRAINT opportunity_slots_range CHECK (slot_number BETWEEN 1 AND 3)
);

CREATE TABLE public.project_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  status public.project_connection_status NOT NULL DEFAULT 'INITIATED',
  fee_cents integer NOT NULL DEFAULT 499,
  idempotency_key text,
  reservation_slot integer,
  payments_live boolean NOT NULL DEFAULT false,
  charges_live boolean NOT NULL DEFAULT false,
  reserved_at timestamptz,
  reserved_until timestamptz,
  needs_refund boolean NOT NULL DEFAULT false,
  refund_reason text,
  stripe_checkout_session_id text,
  paid_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_connections_fee_cents_check CHECK (fee_cents = 499),
  CONSTRAINT project_connections_payments_not_live CHECK (payments_live = false),
  CONSTRAINT project_connections_charges_not_live CHECK (charges_live = false),
  CONSTRAINT project_connections_pair UNIQUE (project_id, contractor_profile_id)
);

CREATE TABLE public.connection_slots (
  project_id uuid NOT NULL REFERENCES public.projects (id),
  slot_number integer NOT NULL,
  connection_id uuid NOT NULL UNIQUE REFERENCES public.project_connections (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  PRIMARY KEY (project_id, slot_number),
  CONSTRAINT connection_slots_range CHECK (slot_number BETWEEN 1 AND 3)
);

CREATE TABLE public.connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.project_connections (id),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.booking_contact_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid,
  status text NOT NULL DEFAULT 'LOCKED',
  revoked_at timestamptz
);

CREATE TABLE public.connection_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid,
  stripe_checkout_session_id text,
  price_id text,
  livemode boolean,
  status text,
  payment_status text,
  consumed_at timestamptz,
  fulfilled_at timestamptz,
  stripe_payment_intent_id text,
  fulfillment_reference text,
  needs_refund boolean NOT NULL DEFAULT false,
  refund_reason text
);

CREATE TABLE public.test_match_log (
  id bigserial PRIMARY KEY,
  project_id uuid,
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.normalize_zip(z text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(substr(regexp_replace(coalesce(z, ''), '[^0-9]', '', 'g'), 1, 5), '');
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_enabled()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'signup_fee_enabled'), 0) <> 0;
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_is_satisfied(p_profile_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles;
BEGIN
  IF NOT public.signup_fee_enabled() THEN
    RETURN true;
  END IF;
  IF p_profile_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') THEN
    RETURN true;
  END IF;
  IF p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR') THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_signup_fee_paid(p_profile_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.signup_fee_is_satisfied(p_profile_id) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'signup fee required';
END;
$$;

CREATE OR REPLACE FUNCTION public.anonymized_pro_label(p_trade text, p_categories text[])
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'Approved ' || coalesce(nullif(btrim(p_trade), ''), 'Local') || ' Pro' $$;
CREATE OR REPLACE FUNCTION public.general_service_area(p_area text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(nullif(btrim(p_area), ''), 'Local service area') $$;
CREATE OR REPLACE FUNCTION public.public_safe_blurb(p_headline text, p_bio text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(nullif(btrim(p_headline), ''), 'Independent local contractor.') $$;
CREATE OR REPLACE FUNCTION public.public_safe_about(p_bio text, p_headline text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(nullif(btrim(p_bio), ''), 'Independent local contractor.') $$;
CREATE OR REPLACE FUNCTION public.generic_credential_badge_label(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(p_kind, 'Credential') $$;
CREATE OR REPLACE FUNCTION public.public_safe_portfolio_caption(p_title text, p_description text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(nullif(btrim(p_title), ''), 'Project photo') $$;
CREATE OR REPLACE FUNCTION public.text_contains_pre_hire_contact(p_text text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.contractor_public_service_label(p_contractor_profile_id uuid)
RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

CREATE OR REPLACE FUNCTION public.location_matches(
  p_zip text, p_lat numeric, p_lng numeric, p_area public.contractor_service_areas
) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN public.normalize_zip(p_zip) IS NOT NULL
    AND (
      public.normalize_zip(p_zip) = public.normalize_zip(p_area.center_zip)
      OR public.normalize_zip(p_zip) = ANY (
        SELECT public.normalize_zip(z) FROM unnest(coalesce(p_area.zip_codes, '{}'::text[])) AS z
      )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.require_service_role()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ppp_set_rpc(p_name text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('ppp.rpc', p_name, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.connection_fee_checkout_enabled()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'connection_fee_checkout_enabled'), 0) <> 0;
$$;

CREATE OR REPLACE FUNCTION public.connection_reservation_ttl_seconds()
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'connection_reservation_ttl_seconds'), 1800);
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_connection_reservations()
RETURNS integer LANGUAGE plpgsql AS $$ BEGIN RETURN 0; END $$;

CREATE OR REPLACE FUNCTION public.project_connection_occupancy(p_project_id uuid)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer
  FROM public.connection_slots s
  JOIN public.project_connections c ON c.id = s.connection_id
  WHERE s.project_id = p_project_id
    AND (
      c.status IN ('PAID', 'COMPLETED', 'PAYMENT_DISABLED')
      OR (c.status = 'RESERVED' AND (c.reserved_until IS NULL OR c.reserved_until > now()))
    );
$$;

CREATE OR REPLACE FUNCTION public.write_connection_event(p_connection_id uuid, p_event_type text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.connection_events (connection_id, event_type, payload)
  VALUES (p_connection_id, p_event_type, coalesce(p_payload, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.rank_project_matches(p_project_id uuid)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;

CREATE OR REPLACE FUNCTION public.assert_connection_stripe_environment(p_livemode boolean, p_session text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE OR REPLACE FUNCTION public.stripe_activation_price_id()
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'price_activation_test'::text $$;
CREATE OR REPLACE FUNCTION public.normalized_stripe_payment_intent_id(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::text $$;
CREATE OR REPLACE FUNCTION public.record_connection_checkout_event(
  p_processor_event_id text, p_event_type text, p_stripe_checkout_session_id text DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('duplicate', false) $$;
CREATE OR REPLACE FUNCTION public.grant_booking_contact_access_from_connection_fee(p_connection_id uuid, p_reason text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('contact_unlocked', true) $$;

CREATE OR REPLACE FUNCTION public.contractor_eligible_for_project(p_project_id uuid, p_contractor_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.match_project(p_project_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.test_match_log (project_id) VALUES (p_project_id);
  RETURN 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.call_match_project_for_contractor(p_contractor_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj_id uuid;
BEGIN
  IF p_contractor_profile_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('ppp.rpc', 'match_project', true);
  FOR proj_id IN
    SELECT p.id
    FROM public.projects p
    WHERE p.status IN ('POSTED', 'MATCHING', 'CONTRACTORS_RESPONDING', 'ESTIMATES_AVAILABLE')
      AND public.signup_fee_is_satisfied(p.customer_id)
      AND public.contractor_eligible_for_project(p.id, p_contractor_profile_id)
    ORDER BY p.id
  LOOP
    PERFORM public.match_project(proj_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.call_match_project_after_eligibility_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  contractor_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    SELECT cp.id INTO contractor_id
    FROM public.contractor_profiles cp
    WHERE cp.profile_id = COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'contractor_profiles' THEN
    contractor_id := COALESCE(NEW.id, OLD.id);
  ELSE
    contractor_id := COALESCE(NEW.contractor_profile_id, OLD.contractor_profile_id);
  END IF;
  PERFORM public.call_match_project_for_contractor(contractor_id);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

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

\ir ../migrations/20261012000003_unpaid_contractor_gates.sql

INSERT INTO public.platform_settings (key, value_int) VALUES
  ('signup_fee_enabled', 1),
  ('connection_fee_checkout_enabled', 1),
  ('max_participating_contractors', 3),
  ('opportunity_ttl_hours', 168),
  ('connection_reservation_ttl_seconds', 1800);

INSERT INTO public.service_categories (id, slug, name) VALUES
  ('10000000-0000-4000-8000-000000000001', 'fence', 'Fence'),
  ('10000000-0000-4000-8000-000000000002', 'paint', 'Paint');

INSERT INTO public.profiles (id, email, account_type, account_status, signup_fee_status) VALUES
  ('20000000-0000-4000-8000-000000000001', 'customer@example.test', 'CUSTOMER', 'ACTIVE', 'NOT_REQUIRED');

CREATE OR REPLACE FUNCTION public.test_seed_pro(
  p_profile uuid,
  p_cp uuid,
  p_fee public.signup_fee_status,
  p_type public.account_type,
  p_zip text,
  p_category uuid,
  p_trade text DEFAULT 'Fence'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, email, account_type, account_status, signup_fee_status)
  VALUES (p_profile, p_profile::text || '@example.test', p_type, 'ACTIVE', p_fee);
  INSERT INTO public.contractor_profiles (
    id, profile_id, business_name, primary_trade, service_area, approval_status, accepting_work, headline, bio
  ) VALUES (
    p_cp, p_profile, 'Hidden Business', p_trade, 'Conroe, TX', 'APPROVED', true, 'Local work', 'Independent local contractor.'
  );
  INSERT INTO public.contractor_services (contractor_profile_id, category_id) VALUES (p_cp, p_category);
  INSERT INTO public.contractor_service_areas (contractor_profile_id, center_zip, zip_codes)
  VALUES (p_cp, p_zip, ARRAY[p_zip]);
END;
$$;

SELECT public.test_seed_pro('30000000-0000-4000-8000-000000000001', 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6', 'UNPAID', 'CONTRACTOR', '77301', '10000000-0000-4000-8000-000000000001');
SELECT public.test_seed_pro('30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'PAID', 'CONTRACTOR', '77301', '10000000-0000-4000-8000-000000000001');
SELECT public.test_seed_pro('30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000013', 'NOT_REQUIRED', 'CONTRACTOR', '77301', '10000000-0000-4000-8000-000000000001');
SELECT public.test_seed_pro('30000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000014', 'UNPAID', 'ADMIN', '77301', '10000000-0000-4000-8000-000000000001');
SELECT public.test_seed_pro('30000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000015', 'UNPAID', 'VERIFIER', '77301', '10000000-0000-4000-8000-000000000001');
SELECT public.test_seed_pro('30000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000016', 'UNPAID', 'CONTRACTOR', '30301', '10000000-0000-4000-8000-000000000002', 'Paint');
SELECT public.test_seed_pro('30000000-0000-4000-8000-000000000021', '30000000-0000-4000-8000-000000000031', 'UNPAID', 'CONTRACTOR', '77301', '10000000-0000-4000-8000-000000000001');
SELECT public.test_seed_pro('30000000-0000-4000-8000-000000000022', '30000000-0000-4000-8000-000000000032', 'UNPAID', 'CONTRACTOR', '77301', '10000000-0000-4000-8000-000000000001');
SELECT public.test_seed_pro('30000000-0000-4000-8000-000000000023', '30000000-0000-4000-8000-000000000033', 'UNPAID', 'CONTRACTOR', '77301', '10000000-0000-4000-8000-000000000001');
SELECT public.test_seed_pro('30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000b1', 'PAID', 'CONTRACTOR', '77301', '10000000-0000-4000-8000-000000000001');
SELECT public.test_seed_pro('30000000-0000-4000-8000-0000000000a2', '30000000-0000-4000-8000-0000000000b2', 'PAID', 'CONTRACTOR', '77301', '10000000-0000-4000-8000-000000000001');
SELECT public.test_seed_pro('30000000-0000-4000-8000-0000000000a3', '30000000-0000-4000-8000-0000000000b3', 'PAID', 'CONTRACTOR', '77301', '10000000-0000-4000-8000-000000000001');

INSERT INTO public.projects (id, customer_id, category_id, status, zip_code) VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'POSTED', '77301'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'POSTED', '30301'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'POSTED', '77301'),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'POSTED', '77301'),
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'POSTED', '77301'),
  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'POSTED', '77301'),
  ('40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'POSTED', '77301'),
  ('40000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'POSTED', '77301'),
  ('40000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'POSTED', '77301'),
  ('40000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'POSTED', '77301');

INSERT INTO public.contractor_portfolio (contractor_profile_id, title, privacy_state) VALUES
  ('af55cdfe-b3aa-421d-84b3-0411d9d7e3b6', 'Unpaid gate', 'PUBLIC_SAFE'),
  ('30000000-0000-4000-8000-000000000012', 'Paid gate', 'PUBLIC_SAFE');
INSERT INTO public.booking_reviews (contractor_profile_id, rating, body, is_verified, reviewer_role) VALUES
  ('af55cdfe-b3aa-421d-84b3-0411d9d7e3b6', 5, 'Should stay hidden', true, 'CUSTOMER'),
  ('30000000-0000-4000-8000-000000000012', 5, 'Visible review', true, 'CUSTOMER');

CREATE OR REPLACE FUNCTION public.get_public_directory_contractor(p_id uuid)
RETURNS TABLE (id uuid, about text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT listed.id, public.public_safe_about(cp.bio, cp.headline)
  FROM public.list_public_directory_contractors() listed
  JOIN public.contractor_profiles cp ON cp.id = listed.id
  WHERE listed.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.test_fail(p_message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FAIL: %', p_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_expect_error(p_sql text, p_like text, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM public.test_fail(p_label || ' did not raise');
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM ILIKE 'FAIL:%' THEN
    RAISE;
  END IF;
  IF SQLERRM NOT ILIKE '%' || p_like || '%' THEN
    RAISE EXCEPTION 'FAIL: % got [%]', p_label, SQLERRM;
  END IF;
  RAISE NOTICE 'PASS: % (%)', p_label, SQLERRM;
END;
$$;

DO $$
DECLARE
  n int;
  smoke uuid := 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6';
  paid uuid := '30000000-0000-4000-8000-000000000012';
  grandfathered uuid := '30000000-0000-4000-8000-000000000013';
  admin_cp uuid := '30000000-0000-4000-8000-000000000014';
  verifier_cp uuid := '30000000-0000-4000-8000-000000000015';
BEGIN
  IF public.contractor_is_directory_listed(smoke) THEN
    PERFORM public.test_fail('UNPAID smoke contractor is directory listed');
  END IF;
  IF NOT public.contractor_is_directory_listed(paid) THEN
    PERFORM public.test_fail('PAID contractor is not directory listed');
  END IF;
  IF NOT public.contractor_is_directory_listed(grandfathered) THEN
    PERFORM public.test_fail('NOT_REQUIRED contractor is not directory listed');
  END IF;
  SELECT count(*) INTO n FROM public.list_public_directory_contractors() WHERE id = smoke;
  IF n <> 0 THEN PERFORM public.test_fail('list includes UNPAID'); END IF;
  SELECT count(*) INTO n FROM public.list_public_directory_contractors() WHERE id = paid;
  IF n <> 1 THEN PERFORM public.test_fail('list misses PAID'); END IF;
  SELECT count(*) INTO n FROM public.list_public_directory_contractors() WHERE id = grandfathered;
  IF n <> 1 THEN PERFORM public.test_fail('list misses NOT_REQUIRED'); END IF;
  SELECT count(*) INTO n FROM public.get_public_directory_contractor(smoke);
  IF n <> 0 THEN PERFORM public.test_fail('get_public_directory_contractor returned UNPAID'); END IF;
  SELECT count(*) INTO n FROM public.get_public_directory_contractor(paid);
  IF n <> 1 THEN PERFORM public.test_fail('get_public_directory_contractor missed PAID'); END IF;
  SELECT count(*) INTO n FROM public.contractor_public_profiles WHERE id = smoke;
  IF n <> 0 THEN PERFORM public.test_fail('contractor_public_profiles includes UNPAID'); END IF;
  SELECT count(*) INTO n FROM public.contractor_public_services WHERE contractor_profile_id = smoke;
  IF n <> 0 THEN PERFORM public.test_fail('contractor_public_services includes UNPAID'); END IF;
  SELECT count(*) INTO n FROM public.contractor_public_areas WHERE contractor_profile_id = smoke;
  IF n <> 0 THEN PERFORM public.test_fail('contractor_public_areas includes UNPAID'); END IF;
  SELECT count(*) INTO n FROM public.contractor_public_portfolio WHERE contractor_profile_id = smoke;
  IF n <> 0 THEN PERFORM public.test_fail('contractor_public_portfolio includes UNPAID'); END IF;
  SELECT count(*) INTO n FROM public.contractor_public_ratings WHERE contractor_profile_id = smoke;
  IF n <> 0 THEN PERFORM public.test_fail('contractor_public_ratings includes UNPAID'); END IF;
  SELECT count(*) INTO n FROM public.contractor_public_reviews WHERE contractor_profile_id = smoke;
  IF n <> 0 THEN PERFORM public.test_fail('contractor_public_reviews includes UNPAID'); END IF;
  SELECT count(*) INTO n FROM public.contractor_public_portfolio WHERE contractor_profile_id = paid;
  IF n <> 1 THEN PERFORM public.test_fail('portfolio hid PAID'); END IF;
  SELECT count(*) INTO n FROM public.contractor_public_reviews WHERE contractor_profile_id = paid;
  IF n <> 1 THEN PERFORM public.test_fail('reviews hid PAID'); END IF;

  IF NOT public.signup_fee_is_satisfied('30000000-0000-4000-8000-000000000004') THEN
    PERFORM public.test_fail('ADMIN was treated as unpaid');
  END IF;
  IF NOT public.signup_fee_is_satisfied('30000000-0000-4000-8000-000000000005') THEN
    PERFORM public.test_fail('VERIFIER was treated as unpaid');
  END IF;
  PERFORM public.assert_signup_fee_paid('30000000-0000-4000-8000-000000000004');
  PERFORM public.assert_signup_fee_paid('30000000-0000-4000-8000-000000000005');
  IF NOT public.contractor_is_directory_listed(admin_cp) THEN
    PERFORM public.test_fail('ADMIN contractor profile was hidden by the fee gate');
  END IF;
  IF NOT public.contractor_is_directory_listed(verifier_cp) THEN
    PERFORM public.test_fail('VERIFIER contractor profile was hidden by the fee gate');
  END IF;
  -- Admins are not contractors. Eligibility stays false because account_type is not CONTRACTOR.
  IF public.contractor_eligible_for_project('40000000-0000-4000-8000-000000000001', admin_cp) THEN
    PERFORM public.test_fail('ADMIN became match-eligible');
  END IF;

  IF public.contractor_eligible_for_project('40000000-0000-4000-8000-000000000001', smoke) THEN
    PERFORM public.test_fail('UNPAID contractor is eligible');
  END IF;
  IF NOT public.contractor_eligible_for_project('40000000-0000-4000-8000-000000000001', paid) THEN
    PERFORM public.test_fail('PAID contractor is not eligible');
  END IF;
  IF NOT public.contractor_eligible_for_project('40000000-0000-4000-8000-000000000001', grandfathered) THEN
    PERFORM public.test_fail('NOT_REQUIRED contractor is not eligible');
  END IF;
  RAISE NOTICE 'PASS: directory, views, admins, verifiers, and eligibility';
END $$;

INSERT INTO public.opportunities (project_id, contractor_profile_id, status, expires_at) VALUES
  ('40000000-0000-4000-8000-000000000005', 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6', 'AVAILABLE', now() + interval '2 days'),
  ('40000000-0000-4000-8000-000000000006', 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6', 'AVAILABLE', now() + interval '2 days'),
  ('40000000-0000-4000-8000-000000000007', 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6', 'AVAILABLE', now() + interval '2 days'),
  ('40000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000012', 'ACCEPTED', now() + interval '2 days');

-- Historical rows that already existed before this gate. The INSERT trigger now
-- rejects a new unpaid connection, so seed them with the trigger off.
ALTER TABLE public.project_connections DISABLE TRIGGER project_connections_require_signup_fee;
INSERT INTO public.project_connections (
  id, project_id, contractor_profile_id, customer_id, status, fee_cents, reservation_slot, payments_live, charges_live
) VALUES
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006', 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6', '20000000-0000-4000-8000-000000000001', 'PAYMENT_DISABLED', 499, 1, false, false),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000007', 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6', '20000000-0000-4000-8000-000000000001', 'EXPIRED', 499, NULL, false, false);
ALTER TABLE public.project_connections ENABLE TRIGGER project_connections_require_signup_fee;

INSERT INTO public.connection_slots (project_id, slot_number, connection_id, contractor_profile_id)
VALUES ('40000000-0000-4000-8000-000000000006', 1, '50000000-0000-4000-8000-000000000001', 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6');

SELECT public.test_expect_error(
  $$SELECT public.reserve_connection_checkout('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', NULL)$$,
  'signup fee required',
  'UNPAID new reserve'
);
SELECT public.test_expect_error(
  $$SELECT public.reserve_connection_checkout('40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000001', NULL)$$,
  'signup fee required',
  'UNPAID PAYMENT_DISABLED resume'
);
SELECT public.test_expect_error(
  $$SELECT public.reserve_connection_checkout('40000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000001', NULL)$$,
  'signup fee required',
  'UNPAID EXPIRED resume'
);

DO $$
DECLARE
  n int;
  result jsonb;
BEGIN
  SELECT count(*) INTO n FROM public.project_connections
  WHERE project_id = '40000000-0000-4000-8000-000000000005';
  IF n <> 0 THEN PERFORM public.test_fail('UNPAID new reserve inserted a connection'); END IF;
  IF (SELECT status FROM public.project_connections WHERE id = '50000000-0000-4000-8000-000000000001') IS DISTINCT FROM 'PAYMENT_DISABLED' THEN
    PERFORM public.test_fail('PAYMENT_DISABLED row changed');
  END IF;
  IF (SELECT status FROM public.project_connections WHERE id = '50000000-0000-4000-8000-000000000002') IS DISTINCT FROM 'EXPIRED' THEN
    PERFORM public.test_fail('EXPIRED row changed');
  END IF;

  result := public.reserve_connection_checkout(
    '40000000-0000-4000-8000-000000000008',
    '30000000-0000-4000-8000-000000000002',
    NULL
  );
  IF result->>'status' IS DISTINCT FROM 'RESERVED' THEN
    PERFORM public.test_fail('PAID reserve status ' || coalesce(result->>'status', 'null'));
  END IF;
  IF (result->>'fee_cents')::int IS DISTINCT FROM 499 THEN
    PERFORM public.test_fail('PAID reserve fee changed');
  END IF;
  IF coalesce((result->>'contact_unlocked')::boolean, true) THEN
    PERFORM public.test_fail('PAID reserve unlocked contact');
  END IF;
  IF coalesce((result->>'paid')::boolean, true) THEN
    PERFORM public.test_fail('PAID reserve marked paid');
  END IF;
  RAISE NOTICE 'PASS: reserve blocks UNPAID paths and allows PAID';
END $$;

DO $$
BEGIN
  UPDATE public.project_connections
  SET status = 'RESERVED', reserved_until = now() + interval '30 minutes', updated_at = now()
  WHERE id = '50000000-0000-4000-8000-000000000001';
  PERFORM public.test_fail('direct UPDATE to RESERVED was not blocked');
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM ILIKE 'FAIL:%' THEN
    RAISE;
  END IF;
  IF SQLERRM NOT ILIKE '%signup fee required%' THEN
    RAISE EXCEPTION 'FAIL: direct RESERVED update got [%]', SQLERRM;
  END IF;
  RAISE NOTICE 'PASS: direct UPDATE to RESERVED blocked (%)', SQLERRM;
END $$;

DO $$
DECLARE
  conn_id uuid;
BEGIN
  IF (SELECT status FROM public.project_connections WHERE id = '50000000-0000-4000-8000-000000000001') IS DISTINCT FROM 'PAYMENT_DISABLED' THEN
    PERFORM public.test_fail('blocked update still changed status');
  END IF;
  SELECT id INTO conn_id FROM public.project_connections
  WHERE project_id = '40000000-0000-4000-8000-000000000008'
    AND contractor_profile_id = '30000000-0000-4000-8000-000000000012';
  UPDATE public.project_connections
  SET status = 'PAID', paid_at = now(), updated_at = now()
  WHERE id = conn_id AND status = 'RESERVED';
  IF (SELECT status FROM public.project_connections WHERE id = conn_id) IS DISTINCT FROM 'PAID' THEN
    PERFORM public.test_fail('webhook-style RESERVED to PAID did not stick for a paid contractor');
  END IF;
  RAISE NOTICE 'PASS: webhook-style RESERVED to PAID works for a paid contractor';
END $$;

DO $$
DECLARE
  n int;
  accepted_status text;
  slot_count int;
BEGIN
  INSERT INTO public.opportunities (id, project_id, contractor_profile_id, status, expires_at)
  VALUES (
    '60000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003',
    'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6',
    'ACCEPTED',
    now() + interval '5 days'
  );
  INSERT INTO public.opportunity_slots (project_id, slot_number, opportunity_id, contractor_profile_id)
  VALUES (
    '40000000-0000-4000-8000-000000000003',
    1,
    '60000000-0000-4000-8000-000000000001',
    'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6'
  );
  INSERT INTO public.matches (project_id, contractor_profile_id, score, rank_order) VALUES
    ('40000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000031', 10, 1),
    ('40000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000032', 10, 2),
    ('40000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000033', 10, 3),
    ('40000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000012', 20, 4);
  INSERT INTO public.opportunities (project_id, contractor_profile_id, status, expires_at) VALUES
    ('40000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000031', 'AVAILABLE', now() + interval '7 days'),
    ('40000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000032', 'AVAILABLE', now() + interval '7 days'),
    ('40000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000033', 'AVAILABLE', now() + interval '7 days');

  PERFORM public.fill_project_opportunity_offers('40000000-0000-4000-8000-000000000003');
  PERFORM public.fill_project_opportunity_offers('40000000-0000-4000-8000-00000000000a');

  SELECT status::text INTO accepted_status FROM public.opportunities WHERE id = '60000000-0000-4000-8000-000000000001';
  IF accepted_status IS DISTINCT FROM 'ACCEPTED' THEN
    PERFORM public.test_fail('ACCEPTED opportunity was changed to ' || coalesce(accepted_status, 'missing'));
  END IF;
  SELECT count(*) INTO slot_count FROM public.opportunity_slots
  WHERE opportunity_id = '60000000-0000-4000-8000-000000000001';
  IF slot_count <> 1 THEN
    PERFORM public.test_fail('ACCEPTED opportunity slot was deleted');
  END IF;
  SELECT count(*) INTO n FROM public.opportunities
  WHERE project_id = '40000000-0000-4000-8000-00000000000a'
    AND contractor_profile_id IN (
      '30000000-0000-4000-8000-000000000031',
      '30000000-0000-4000-8000-000000000032',
      '30000000-0000-4000-8000-000000000033'
    )
    AND status = 'CLOSED';
  IF n <> 3 THEN
    PERFORM public.test_fail('unpaid AVAILABLE offers were not closed, count=' || n);
  END IF;
  SELECT count(*) INTO n FROM public.opportunities
  WHERE project_id = '40000000-0000-4000-8000-00000000000a'
    AND status = 'AVAILABLE';
  IF n <> 1 THEN
    PERFORM public.test_fail('freed offer slot did not go to one eligible contractor, available=' || n);
  END IF;
  IF (SELECT contractor_profile_id FROM public.opportunities
      WHERE project_id = '40000000-0000-4000-8000-00000000000a' AND status = 'AVAILABLE')
     IS DISTINCT FROM '30000000-0000-4000-8000-000000000012' THEN
    PERFORM public.test_fail('AVAILABLE offer was not the PAID contractor');
  END IF;
  SELECT count(*) INTO n FROM public.opportunity_slots WHERE project_id = '40000000-0000-4000-8000-00000000000a';
  IF n > 3 THEN
    PERFORM public.test_fail('opportunity slot cap exceeded');
  END IF;
  RAISE NOTICE 'PASS: ACCEPTED rows kept, unpaid AVAILABLE slots released, offer cap holds';
END $$;

DO $$
DECLARE
  calls int;
BEGIN
  DELETE FROM public.test_match_log;
  UPDATE public.profiles
  SET signup_fee_status = 'PAID'
  WHERE id = '30000000-0000-4000-8000-000000000006';
  SELECT count(*) INTO calls FROM public.test_match_log
  WHERE project_id = '40000000-0000-4000-8000-000000000002';
  IF calls <> 1 THEN
    PERFORM public.test_fail('paying did not re-run matching, calls=' || calls);
  END IF;
  IF NOT public.contractor_eligible_for_project(
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000016'
  ) THEN
    PERFORM public.test_fail('payer is not eligible after PAID');
  END IF;
  RAISE NOTICE 'PASS: UNPAID to PAID re-ran matching';
END $$;

DO $$
DECLARE
  i int;
  filler uuid;
  result jsonb;
  n int;
BEGIN
  FOR i, filler IN
    SELECT * FROM (VALUES
      (1, '30000000-0000-4000-8000-0000000000b1'::uuid),
      (2, '30000000-0000-4000-8000-0000000000b2'::uuid),
      (3, '30000000-0000-4000-8000-0000000000b3'::uuid)
    ) AS v(slot, cp)
  LOOP
    INSERT INTO public.opportunities (project_id, contractor_profile_id, status)
    VALUES ('40000000-0000-4000-8000-000000000009', filler, 'ACCEPTED');
    INSERT INTO public.project_connections (
      id, project_id, contractor_profile_id, customer_id, status, fee_cents, reservation_slot, payments_live, charges_live, paid_at
    ) VALUES (
      ('70000000-0000-4000-8000-00000000000' || i::text)::uuid,
      '40000000-0000-4000-8000-000000000009',
      filler,
      '20000000-0000-4000-8000-000000000001',
      'PAID',
      499,
      i,
      false,
      false,
      now()
    );
    INSERT INTO public.connection_slots (project_id, slot_number, connection_id, contractor_profile_id)
    VALUES (
      '40000000-0000-4000-8000-000000000009',
      i,
      ('70000000-0000-4000-8000-00000000000' || i::text)::uuid,
      filler
    );
  END LOOP;
  INSERT INTO public.opportunities (project_id, contractor_profile_id, status)
  VALUES ('40000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000013', 'ACCEPTED');
  IF public.project_connection_occupancy('40000000-0000-4000-8000-000000000009') <> 3 THEN
    PERFORM public.test_fail('expected 3 occupied connection slots');
  END IF;
  RAISE NOTICE 'PASS: seeded 3 connection slots';
END $$;

SELECT public.test_expect_error(
  $$SELECT public.reserve_connection_checkout('40000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000003', NULL)$$,
  'connections full',
  'fourth connection still blocked by the 3-slot cap'
);

DO $$
DECLARE
  n int;
  result jsonb;
BEGIN
  UPDATE public.platform_settings SET value_int = 0 WHERE key = 'signup_fee_enabled';
  IF NOT public.contractor_is_directory_listed('af55cdfe-b3aa-421d-84b3-0411d9d7e3b6') THEN
    PERFORM public.test_fail('fee disabled still hid UNPAID');
  END IF;
  SELECT count(*) INTO n FROM public.list_public_directory_contractors()
  WHERE id = 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6';
  IF n <> 1 THEN PERFORM public.test_fail('fee disabled list still hid UNPAID'); END IF;
  IF NOT public.contractor_eligible_for_project(
    '40000000-0000-4000-8000-000000000001',
    'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6'
  ) THEN
    PERFORM public.test_fail('fee disabled eligibility still false');
  END IF;
  IF NOT public.signup_fee_is_satisfied('30000000-0000-4000-8000-000000000001') THEN
    PERFORM public.test_fail('fee disabled did not satisfy UNPAID');
  END IF;
  INSERT INTO public.opportunities (project_id, contractor_profile_id, status)
  VALUES ('40000000-0000-4000-8000-000000000004', 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6', 'AVAILABLE');
  result := public.reserve_connection_checkout(
    '40000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    NULL
  );
  IF result->>'status' IS DISTINCT FROM 'RESERVED' OR (result->>'fee_cents')::int IS DISTINCT FROM 499 THEN
    PERFORM public.test_fail('fee disabled reserve did not succeed at 499');
  END IF;
  UPDATE public.platform_settings SET value_int = 1 WHERE key = 'signup_fee_enabled';
  IF public.contractor_is_directory_listed('af55cdfe-b3aa-421d-84b3-0411d9d7e3b6') THEN
    PERFORM public.test_fail('re-enabling the fee left UNPAID listed');
  END IF;
  RAISE NOTICE 'PASS: signup_fee_enabled=false lets everyone through, and turning it back on hides UNPAID again';
END $$;

SELECT 'unpaid_contractor_gates_test: all assertions passed' AS result;
