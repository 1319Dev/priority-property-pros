-- Local regression for neutral public pro labels and business-name gating.
-- Empty database only. Does not change a shared or production database.
--
--   createdb public_pro_labels
--   psql -d public_pro_labels -v ON_ERROR_STOP=1 -f supabase/tests/public_pro_labels_test.sql

\set ON_ERROR_STOP on
SET client_min_messages = warning;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT NOLOGIN;
  END IF;
END
$$;

ALTER ROLE anon NOINHERIT NOLOGIN NOSUPERUSER NOBYPASSRLS;
ALTER ROLE authenticated NOINHERIT NOLOGIN NOSUPERUSER NOBYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  first_name text,
  last_name text,
  account_type text NOT NULL,
  account_status text NOT NULL,
  signup_fee_status text NOT NULL DEFAULT 'UNPAID'
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
  website_url text,
  license_number text,
  approval_status text NOT NULL,
  accepting_work boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL
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

CREATE TABLE public.zip_centroids (
  zip text PRIMARY KEY,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  city text,
  state_code text
);

CREATE TABLE public.contractor_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL,
  kind text NOT NULL,
  status text NOT NULL
);

CREATE VIEW public.contractor_public_ratings AS
SELECT
  NULL::uuid AS contractor_profile_id,
  NULL::numeric AS rating_average,
  0::integer AS rating_count
WHERE false;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  title text NOT NULL DEFAULT 'Project',
  city text,
  state text,
  reference_number integer
);

CREATE TABLE public.project_connections (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.booking_contact_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  booking_id uuid,
  status text NOT NULL,
  grant_source text NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE public.booking_reviews (
  id uuid PRIMARY KEY,
  contractor_profile_id uuid NOT NULL,
  rating integer NOT NULL,
  body text,
  is_verified boolean NOT NULL,
  reviewer_role text NOT NULL
);

CREATE TABLE public.project_message_threads (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  contractor_profile_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  sender_profile_id uuid,
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_message_reads (
  thread_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  entity_type text,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel text NOT NULL DEFAULT 'in_app',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
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

CREATE OR REPLACE FUNCTION public.text_contains_contact_info(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_text, '') ~* '(@|[0-9]{3}[^0-9]+[0-9]{3}|https?://|www\.)';
$$;

CREATE OR REPLACE FUNCTION public.text_contains_pre_hire_contact(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.text_contains_contact_info(p_text);
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_enabled()
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT true;
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_is_satisfied(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.signup_fee_status IN ('PAID', 'NOT_REQUIRED')
  );
$$;

CREATE OR REPLACE FUNCTION public.contractor_is_directory_listed(p_contractor_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_profiles cp
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE cp.id = p_contractor_profile_id
      AND cp.approval_status = 'APPROVED'
      AND p.account_status = 'ACTIVE'
      AND public.signup_fee_is_satisfied(cp.profile_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_zip(z text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN btrim(coalesce(z, '')) ~ '^[0-9]{5}' THEN left(regexp_replace(btrim(z), '[^0-9]', '', 'g'), 5)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.format_serves_within(
  p_miles numeric,
  p_city text,
  p_state text,
  p_zip text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_miles IS NULL OR p_miles <= 0 THEN NULL
    WHEN nullif(btrim(coalesce(p_city, '')), '') IS NOT NULL
         AND nullif(btrim(coalesce(p_state, '')), '') IS NOT NULL THEN
      'Serves within ' || trunc(p_miles)::integer::text || ' miles of '
        || btrim(p_city) || ', ' || upper(btrim(p_state))
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.contractor_profile_place(p_service_area text)
RETURNS TABLE (city text, state_code text)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULL::text, NULL::text WHERE false;
$$;

CREATE OR REPLACE FUNCTION public.general_service_area(p_area text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN nullif(btrim(coalesce(p_area, '')), '') IS NULL THEN 'Local service area'
    WHEN public.text_contains_pre_hire_contact(p_area) THEN 'Local service area'
    ELSE btrim(p_area) || ' Area'
  END;
$$;

CREATE OR REPLACE FUNCTION public.public_safe_blurb(p_headline text, p_bio text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.text_contains_pre_hire_contact(p_headline) THEN coalesce(nullif(btrim(p_bio), ''), 'Independent local contractor.')
    ELSE coalesce(nullif(btrim(p_headline), ''), nullif(btrim(p_bio), ''), 'Independent local contractor.')
  END;
$$;

CREATE OR REPLACE FUNCTION public.public_safe_about(p_bio text, p_headline text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(nullif(btrim(p_bio), ''), nullif(btrim(p_headline), ''), 'Independent local contractor.');
$$;

CREATE OR REPLACE FUNCTION public.generic_credential_badge_label(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Credential reviewed';
$$;

CREATE OR REPLACE FUNCTION public.anonymized_pro_label(p_trade text, p_categories text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Approved ' || initcap(coalesce(nullif(btrim(p_trade), ''), 'Local')) || ' Pro';
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.account_type = 'ADMIN'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_contractor_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.id FROM public.contractor_profiles cp WHERE cp.profile_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.contractor_owner_profile_id(p_contractor_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.profile_id FROM public.contractor_profiles cp WHERE cp.id = p_contractor_profile_id;
$$;

CREATE OR REPLACE FUNCTION public.strip_private_contact_keys(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL THEN '{}'::jsonb
    ELSE p - 'phone' - 'email' - 'street'
  END;
$$;

CREATE OR REPLACE FUNCTION public.relationship_protection_months()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 24;
$$;

CREATE OR REPLACE FUNCTION public.contact_info_blocked_message()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Contact info is shared after connection through Priority Property Pros. Please remove phone numbers, emails, links, and social handles.';
$$;

CREATE OR REPLACE FUNCTION public.ppp_set_rpc(p_name text)
RETURNS void
LANGUAGE sql
AS $$
  SELECT NULL::void;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_recipient_profile_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE sql
AS $$
  SELECT NULL::uuid;
$$;

-- Same gate the product uses. This test must not replace the rule, only call it.
CREATE OR REPLACE FUNCTION public.message_pair_has_connection_entitlement(
  p_project_id uuid,
  p_contractor_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_contact_access a
    JOIN public.projects p ON p.id = a.project_id
    WHERE a.project_id = p_project_id
      AND a.contractor_profile_id = p_contractor_profile_id
      AND a.revoked_at IS NULL
      AND (
        (a.status = 'UNLOCKED' AND a.grant_source = 'CONNECTION_FEE_PAYMENT')
        OR (a.status = 'ADMIN_OVERRIDE' AND a.grant_source = 'ADMIN_OVERRIDE')
      )
      AND (
        p.customer_id = auth.uid()
        OR a.contractor_profile_id = public.current_contractor_profile_id()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.signup_fee_is_satisfied(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contractor_is_directory_listed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_fee_enabled() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.text_contains_contact_info(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.text_contains_pre_hire_contact(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.general_service_area(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_safe_blurb(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_safe_about(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generic_credential_badge_label(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymized_pro_label(text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.format_serves_within(numeric, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_zip(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.message_pair_has_connection_entitlement(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.message_pair_has_connection_entitlement(uuid, uuid) FROM PUBLIC, anon;

INSERT INTO public.profiles (id, email, first_name, last_name, account_type, account_status, signup_fee_status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'owner@example.com', 'Pat', 'Homeowner', 'CUSTOMER', 'ACTIVE', 'PAID'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.com', 'Sam', 'Other', 'CUSTOMER', 'ACTIVE', 'PAID'),
  ('33333333-3333-4333-8333-333333333333', 'pro@example.com', 'Jamie', 'Plymate', 'CONTRACTOR', 'ACTIVE', 'PAID'),
  ('44444444-4444-4444-8444-444444444444', 'admin@example.com', 'Ada', 'Min', 'ADMIN', 'ACTIVE', 'NOT_REQUIRED'),
  ('77777777-7777-4777-8777-777777777777', 'unpaid@example.com', 'Una', 'Paid', 'CONTRACTOR', 'ACTIVE', 'UNPAID');

INSERT INTO public.contractor_profiles (
  id, profile_id, business_name, primary_trade, service_area, headline, bio, website_url, license_number, approval_status
)
VALUES
  (
    'a6208af2-2f61-41ca-bd4b-51f81fe61638',
    '33333333-3333-4333-8333-333333333333',
    'Plymate Property Maintenance',
    'Handyman',
    'Montgomery County, TX',
    'Fence and handyman work',
    'Local repairs.',
    'https://plymate.example',
    'TX-SECRET-1',
    'APPROVED'
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    '77777777-7777-4777-8777-777777777777',
    'Unpaid Co',
    'Handyman',
    'Houston, TX',
    'Should stay hidden',
    'Hidden',
    NULL,
    NULL,
    'APPROVED'
  );

INSERT INTO public.service_categories (id, slug, name)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'fence-repair', 'Fence Repair'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'handyman', 'Handyman'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'other', 'Other'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'appliance', 'Appliance Installation');

INSERT INTO public.contractor_services (contractor_profile_id, category_id)
VALUES
  ('a6208af2-2f61-41ca-bd4b-51f81fe61638', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('a6208af2-2f61-41ca-bd4b-51f81fe61638', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),
  ('a6208af2-2f61-41ca-bd4b-51f81fe61638', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');

INSERT INTO public.zip_centroids (zip, lat, lng, city, state_code)
VALUES ('77301', 30.311800, -95.456100, 'Conroe', 'TX');

INSERT INTO public.contractor_service_areas (contractor_profile_id, center_zip, radius_miles, label)
VALUES ('a6208af2-2f61-41ca-bd4b-51f81fe61638', '77301', 25, 'Montgomery County, TX');

INSERT INTO public.projects (id, customer_id, title, city, state)
VALUES (
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  'Fence repair',
  'Conroe',
  'TX'
);

INSERT INTO public.project_connections (id, project_id, contractor_profile_id, status)
VALUES (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  'a6208af2-2f61-41ca-bd4b-51f81fe61638',
  'INITIATED'
);

INSERT INTO public.booking_reviews (id, contractor_profile_id, rating, body, is_verified, reviewer_role)
VALUES (
  '99999999-9999-4999-8999-999999999999',
  'a6208af2-2f61-41ca-bd4b-51f81fe61638',
  5,
  'Plymate Property Maintenance fixed the fence and Jamie was careful.',
  true,
  'CUSTOMER'
);

INSERT INTO public.notifications (recipient_profile_id, kind, title, body, payload)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'message.received',
  'New message',
  'New message from Plymate Property Maintenance.',
  jsonb_build_object(
    'project_id', '55555555-5555-4555-8555-555555555555',
    'contractor_profile_id', 'a6208af2-2f61-41ca-bd4b-51f81fe61638'
  )
);

INSERT INTO public.bookings (id, project_id, contractor_profile_id, status)
VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '55555555-5555-4555-8555-555555555555',
  'a6208af2-2f61-41ca-bd4b-51f81fe61638',
  'COMPLETED'
);

INSERT INTO public.customer_contractor_relationships (
  id, customer_id, contractor_profile_id, status, last_completed_at, last_completed_booking_id, protected_until
)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'a6208af2-2f61-41ca-bd4b-51f81fe61638',
  'ACTIVE',
  now(),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  now() + interval '24 months'
);

\ir ../migrations/20261013000004_public_pro_labels.sql

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.contractor_public_profiles TO anon, authenticated;
GRANT SELECT ON public.contractor_public_services TO anon, authenticated;
GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_eq(p_label text, p_got text, p_want text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION '%: got [%] want [%]', p_label, coalesce(p_got, '<null>'), coalesce(p_want, '<null>');
  END IF;
END;
$$;

DO $$
DECLARE
  v_label text;
  v_area text;
  v_trade text;
  v_cats text[];
  v_body text;
  v_name text;
  v_card text;
  v_note text;
  v_hire text;
  v_blob text;
BEGIN
  IF has_function_privilege('anon', 'public.signup_fee_is_satisfied(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute signup_fee_is_satisfied';
  END IF;
  IF NOT has_function_privilege('anon', 'public.public_pro_label(text, text[], text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must execute public_pro_label';
  END IF;
  IF has_function_privilege('anon', 'public.contractor_name_for_my_project(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute contractor_name_for_my_project';
  END IF;

  PERFORM public.assert_eq(
    'pure label',
    public.public_pro_label('Handyman', ARRAY['Other', 'Fence Repair', 'Handyman'], 'Conroe'),
    'Fence Repair & Handyman pro in Conroe'
  );
  PERFORM public.assert_eq(
    'free text trade is not a catalog name',
    public.public_primary_trade('Handyman', ARRAY['Appliance Installation', 'Other']),
    'Appliance Installation'
  );
  PERFORM public.assert_eq(
    'phone trade is ignored',
    public.public_pro_label('Text 936-555-1212', ARRAY['Other', 'Fence Repair', 'Handyman'], 'Conroe'),
    'Fence Repair pro in Conroe'
  );
  PERFORM public.assert_eq(
    'other is not a trade',
    public.public_primary_trade('Other', ARRAY['Other', 'Fence Repair']),
    'Fence Repair'
  );

  SELECT display_label, service_area, primary_trade
  INTO v_label, v_area, v_trade
  FROM public.contractor_public_profiles
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  PERFORM public.assert_eq('profile label', v_label, 'Fence Repair & Handyman pro in Conroe');
  PERFORM public.assert_eq('profile area', v_area, 'Serves within 25 miles of Conroe, TX');
  PERFORM public.assert_eq('profile trade', v_trade, 'Handyman');

  IF v_label ILIKE '%Plymate%' OR v_area ~ '[0-9]{5}' OR v_area ILIKE '%Montgomery County%' THEN
    RAISE EXCEPTION 'public profile leaked name, zip, or free-text county: % / %', v_label, v_area;
  END IF;

  SELECT categories INTO v_cats
  FROM public.list_public_directory_contractors()
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  IF v_cats @> ARRAY['Other'] THEN
    RAISE EXCEPTION 'directory categories include Other: %', v_cats;
  END IF;
  IF NOT (v_cats @> ARRAY['Fence Repair', 'Handyman']) THEN
    RAISE EXCEPTION 'directory categories missing a real service: %', v_cats;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.list_public_directory_contractors()
    WHERE id = '88888888-8888-4888-8888-888888888888'
  ) THEN
    RAISE EXCEPTION 'unpaid contractor is in the directory';
  END IF;

  SELECT body INTO v_body
  FROM public.contractor_public_reviews
  WHERE id = '99999999-9999-4999-8999-999999999999';
  PERFORM public.assert_eq('review name scrub', v_body, 'Verified PPP review.');

  SELECT string_agg(column_name, ',') INTO v_blob
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'contractor_public_profiles';
  IF v_blob ~ 'business_name|website|license|email|phone|street' THEN
    RAISE EXCEPTION 'public profile view has an identifying column: %', v_blob;
  END IF;
END
$$;

-- Signed-out read. The view must not call signup_fee_is_satisfied.
SET ROLE anon;
DO $$
DECLARE
  v_label text;
  v_names text;
BEGIN
  SELECT display_label INTO v_label
  FROM public.contractor_public_profiles
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  IF v_label IS DISTINCT FROM 'Fence Repair & Handyman pro in Conroe' THEN
    RAISE EXCEPTION 'anon label: %', coalesce(v_label, '<null>');
  END IF;
  IF v_label ILIKE '%Plymate%' THEN
    RAISE EXCEPTION 'anon saw the business name';
  END IF;

  SELECT string_agg(category_name, ',') INTO v_names
  FROM public.contractor_public_services
  WHERE contractor_profile_id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  IF v_names ILIKE '%Other%' OR v_names ILIKE '%Plymate%' THEN
    RAISE EXCEPTION 'anon services leaked: %', v_names;
  END IF;

  BEGIN
    PERFORM public.contractor_name_for_my_project(
      '55555555-5555-4555-8555-555555555555',
      'a6208af2-2f61-41ca-bd4b-51f81fe61638'
    );
    RAISE EXCEPTION 'anon name rpc should be denied';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;
RESET ROLE;

-- Project customer before a paid connection.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE
  v_name text;
  v_card text;
  v_note text;
  v_hire text;
BEGIN
  v_name := public.contractor_name_for_my_project(
    '55555555-5555-4555-8555-555555555555',
    'a6208af2-2f61-41ca-bd4b-51f81fe61638'
  );
  IF v_name IS DISTINCT FROM 'Fence Repair & Handyman pro in Conroe' OR v_name ILIKE '%Plymate%' THEN
    RAISE EXCEPTION 'pre-connect name: %', v_name;
  END IF;

  SELECT card ->> 'display_name' INTO v_card
  FROM jsonb_array_elements(public.list_my_project_connection_cards('55555555-5555-4555-8555-555555555555')) card;
  IF v_card ILIKE '%Plymate%' THEN
    RAISE EXCEPTION 'pre-connect card: %', v_card;
  END IF;

  SELECT item ->> 'body' INTO v_note
  FROM jsonb_array_elements(public.list_my_notifications()) item
  WHERE item ->> 'kind' = 'message.received';
  IF v_note ILIKE '%Plymate%' THEN
    RAISE EXCEPTION 'pre-connect notification: %', v_note;
  END IF;
  IF v_note IS DISTINCT FROM 'New message about your project.' THEN
    RAISE EXCEPTION 'pre-connect notification body: %', v_note;
  END IF;

  SELECT item ->> 'business_name' INTO v_hire
  FROM jsonb_array_elements(public.hire_again_contractors()) item;
  IF v_hire ILIKE '%Plymate%' THEN
    RAISE EXCEPTION 'pre-connect hire again: %', v_hire;
  END IF;
END
$$;
RESET ROLE;

-- Unrelated customer.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.contractor_name_for_my_project(
      '55555555-5555-4555-8555-555555555555',
      'a6208af2-2f61-41ca-bd4b-51f81fe61638'
    );
    RAISE EXCEPTION 'unrelated customer should not read the project';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not found%' THEN
        RAISE;
      END IF;
  END;

  IF jsonb_array_length(public.list_my_project_connection_cards('55555555-5555-4555-8555-555555555555')) <> 0 THEN
    RAISE EXCEPTION 'unrelated customer saw connection cards';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.list_public_directory_contractors() AS row
    WHERE row::text ILIKE '%Plymate%'
  ) THEN
    RAISE EXCEPTION 'signed-in directory contains the business name';
  END IF;
END
$$;
RESET ROLE;

-- Paid connection, then the same customer sees the business name.
INSERT INTO public.booking_contact_access (project_id, contractor_profile_id, status, grant_source)
VALUES (
  '55555555-5555-4555-8555-555555555555',
  'a6208af2-2f61-41ca-bd4b-51f81fe61638',
  'UNLOCKED',
  'CONNECTION_FEE_PAYMENT'
);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE
  v_name text;
  v_card text;
  v_note text;
  v_hire text;
BEGIN
  v_name := public.contractor_name_for_my_project(
    '55555555-5555-4555-8555-555555555555',
    'a6208af2-2f61-41ca-bd4b-51f81fe61638'
  );
  IF v_name IS DISTINCT FROM 'Plymate Property Maintenance' THEN
    RAISE EXCEPTION 'post-connect name: %', v_name;
  END IF;

  SELECT card ->> 'display_name' INTO v_card
  FROM jsonb_array_elements(public.list_my_project_connection_cards('55555555-5555-4555-8555-555555555555')) card;
  IF v_card IS DISTINCT FROM 'Plymate Property Maintenance' THEN
    RAISE EXCEPTION 'post-connect card: %', v_card;
  END IF;

  SELECT item ->> 'body' INTO v_note
  FROM jsonb_array_elements(public.list_my_notifications()) item
  WHERE item ->> 'kind' = 'message.received';
  IF v_note NOT ILIKE '%Plymate Property Maintenance%' THEN
    RAISE EXCEPTION 'post-connect notification: %', v_note;
  END IF;

  SELECT item ->> 'business_name' INTO v_hire
  FROM jsonb_array_elements(public.hire_again_contractors()) item;
  IF v_hire IS DISTINCT FROM 'Plymate Property Maintenance' THEN
    RAISE EXCEPTION 'post-connect hire again: %', v_hire;
  END IF;
END
$$;
RESET ROLE;

-- Contractor sees their own business name. Admin sees it without a payment.
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
SET ROLE authenticated;
DO $$
DECLARE
  v_name text;
BEGIN
  v_name := public.contractor_name_for_my_project(
    '55555555-5555-4555-8555-555555555555',
    'a6208af2-2f61-41ca-bd4b-51f81fe61638'
  );
  IF v_name IS DISTINCT FROM 'Plymate Property Maintenance' THEN
    RAISE EXCEPTION 'contractor self name: %', v_name;
  END IF;
END
$$;
RESET ROLE;

DELETE FROM public.booking_contact_access;

SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);
SET ROLE authenticated;
DO $$
DECLARE
  v_name text;
  v_card text;
BEGIN
  v_name := public.contractor_name_for_my_project(
    '55555555-5555-4555-8555-555555555555',
    'a6208af2-2f61-41ca-bd4b-51f81fe61638'
  );
  IF v_name IS DISTINCT FROM 'Plymate Property Maintenance' THEN
    RAISE EXCEPTION 'admin name: %', v_name;
  END IF;
  SELECT card ->> 'display_name' INTO v_card
  FROM jsonb_array_elements(public.list_my_project_connection_cards('55555555-5555-4555-8555-555555555555')) card;
  IF v_card IS DISTINCT FROM 'Plymate Property Maintenance' THEN
    RAISE EXCEPTION 'admin card: %', v_card;
  END IF;
END
$$;
RESET ROLE;

-- A stored phone in primary_trade must not reach the signed-out label.
UPDATE public.contractor_profiles
SET primary_trade = 'Text 936-555-1212'
WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';

SET ROLE anon;
DO $$
DECLARE
  v_label text;
  v_trade text;
BEGIN
  SELECT display_label, primary_trade INTO v_label, v_trade
  FROM public.contractor_public_profiles
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  IF v_label ILIKE '%936%' OR v_label ILIKE '%Text%' OR coalesce(v_trade, '') ILIKE '%936%' THEN
    RAISE EXCEPTION 'anon label used free-text trade: % / %', v_label, v_trade;
  END IF;
  IF v_label IS DISTINCT FROM 'Fence Repair pro in Conroe' THEN
    RAISE EXCEPTION 'anon catalog label: %', coalesce(v_label, '<null>');
  END IF;
END
$$;
RESET ROLE;

UPDATE public.contractor_profiles
SET primary_trade = 'Handyman'
WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';

\ir ../migrations/20261013000005_contractor_public_text_guards.sql

GRANT UPDATE ON TABLE public.contractor_profiles TO authenticated;

DO $$
BEGIN
  UPDATE public.contractor_profiles
  SET website_url = 'javascript:alert(1)'
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  RAISE EXCEPTION 'javascript website should have been rejected';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%http://%' THEN
      RAISE;
    END IF;
END
$$;

DO $$
BEGIN
  UPDATE public.contractor_profiles
  SET primary_trade = 'Text 936-555-1212'
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  RAISE EXCEPTION 'phone trade should have been rejected';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%phone numbers%' THEN
      RAISE;
    END IF;
END
$$;

DO $$
BEGIN
  UPDATE public.contractor_profiles
  SET business_name = 'Plymate call 936-555-1212 plymate@gmail.com'
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  RAISE EXCEPTION 'business name contact should have been rejected';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%phone numbers%' THEN
      RAISE;
    END IF;
END
$$;

DO $$
BEGIN
  UPDATE public.contractor_profiles
  SET service_area = 'email plymate@gmail.com'
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  RAISE EXCEPTION 'service area email should have been rejected';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%phone numbers%' THEN
      RAISE;
    END IF;
END
$$;

DO $$
BEGIN
  UPDATE public.contractor_profiles
  SET bio = repeat('a', 200000)
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  RAISE EXCEPTION 'long bio should have been rejected';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%2000%' THEN
      RAISE;
    END IF;
END
$$;

DO $$
BEGIN
  UPDATE public.contractor_profiles
  SET years_experience = 999999
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  RAISE EXCEPTION 'years 999999 should have been rejected';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%80%' THEN
      RAISE;
    END IF;
END
$$;

UPDATE public.contractor_profiles
SET website_url = 'https://example.com',
    headline = 'Fence and handyman work',
    years_experience = 15
WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';

DO $$
DECLARE
  v_name text;
  v_years integer;
BEGIN
  SELECT business_name, years_experience INTO v_name, v_years
  FROM public.contractor_profiles
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  IF v_name IS DISTINCT FROM 'Plymate Property Maintenance' THEN
    RAISE EXCEPTION 'rejected writes changed the business name: %', v_name;
  END IF;
  IF v_years IS DISTINCT FROM 15 THEN
    RAISE EXCEPTION 'rejected writes changed years: %', v_years;
  END IF;
  IF (SELECT website_url FROM public.contractor_profiles WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638')
     IS DISTINCT FROM 'https://example.com' THEN
    RAISE EXCEPTION 'https website was not stored';
  END IF;
END
$$;

-- An unrelated column update must not trim a business name that was already stored.
SET session_replication_role = replica;
UPDATE public.contractor_profiles
SET business_name = 'Plymate Property Maintenance '
WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
SET session_replication_role = origin;

UPDATE public.contractor_profiles
SET accepting_work = false
WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';

DO $$
BEGIN
  IF (SELECT business_name FROM public.contractor_profiles WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638')
     IS DISTINCT FROM 'Plymate Property Maintenance ' THEN
    RAISE EXCEPTION 'an unrelated update rewrote the business name';
  END IF;
END
$$;

UPDATE public.contractor_profiles
SET business_name = 'Plymate Property Maintenance',
    accepting_work = true,
    website_url = NULL
WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';

-- Rollback restores the previous write rules, then the guard migration applies again.
\ir ../rollbacks/20261013000005_contractor_public_text_guards_rollback.sql

UPDATE public.contractor_profiles
SET primary_trade = 'Text 936-555-1212'
WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';

UPDATE public.contractor_profiles
SET primary_trade = 'Handyman'
WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';

-- Rollback restores the previous anonymized label, then both migrations apply again.
\ir ../rollbacks/20261013000004_public_pro_labels_rollback.sql

DO $$
DECLARE
  v_label text;
BEGIN
  IF to_regprocedure('public.public_pro_label(text,text[],text)') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left public_pro_label in place';
  END IF;
  SELECT display_label INTO v_label
  FROM public.contractor_public_profiles
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  IF v_label IS DISTINCT FROM 'Approved Handyman Pro' THEN
    RAISE EXCEPTION 'rolled-back label: %', coalesce(v_label, '<null>');
  END IF;
END
$$;

\ir ../migrations/20261013000004_public_pro_labels.sql
\ir ../migrations/20261013000005_contractor_public_text_guards.sql

DO $$
DECLARE
  v_label text;
BEGIN
  SELECT display_label INTO v_label
  FROM public.contractor_public_profiles
  WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
  IF v_label IS DISTINCT FROM 'Fence Repair & Handyman pro in Conroe' THEN
    RAISE EXCEPTION 'reapplied label: %', coalesce(v_label, '<null>');
  END IF;
  BEGIN
    UPDATE public.contractor_profiles
    SET website_url = 'javascript:alert(1)'
    WHERE id = 'a6208af2-2f61-41ca-bd4b-51f81fe61638';
    RAISE EXCEPTION 'reapplied guard did not reject javascript';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%http://%' THEN
        RAISE;
      END IF;
  END;
END
$$;
