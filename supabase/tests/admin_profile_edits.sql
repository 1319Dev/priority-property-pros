-- Local proof for admin profile edits.
--   dropdb --if-exists admin_profile_edits && createdb admin_profile_edits
--   psql -d admin_profile_edits -v ON_ERROR_STOP=1 -f supabase/tests/admin_profile_edits.sql

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

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  email_confirmed_at timestamptz,
  email_change text DEFAULT '',
  email_change_token_new text DEFAULT '',
  email_change_token_current text DEFAULT '',
  email_change_confirm_status smallint DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  identity_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.account_type AS ENUM ('CUSTOMER', 'CONTRACTOR', 'VERIFIER', 'ADMIN');
CREATE TYPE public.account_status AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED');
CREATE TYPE public.approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE public.timing_preference AS ENUM ('ASAP', 'WITHIN_A_WEEK', 'WITHIN_A_MONTH', 'SPECIFIC_DATE', 'FLEXIBLE');
CREATE TYPE public.credential_status AS ENUM ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');
CREATE TYPE public.service_area_mode AS ENUM ('ZIPS', 'RADIUS', 'ZIPS_AND_RADIUS');
CREATE TYPE public.portfolio_privacy_state AS ENUM ('PUBLIC_SAFE', 'PRIVATE', 'REVIEW_REQUIRED');

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
  phone text,
  avatar_url text,
  account_type public.account_type NOT NULL,
  account_status public.account_status NOT NULL DEFAULT 'ACTIVE',
  signup_fee_status text NOT NULL DEFAULT 'UNPAID'
);

CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL,
  category_id uuid,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'POSTED',
  city text,
  state text,
  zip_code text,
  timing public.timing_preference,
  preferred_date date,
  reference_number bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_private_locations (
  project_id uuid PRIMARY KEY,
  street_line1 text,
  street_line2 text
);

CREATE TABLE public.contractor_profiles (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL UNIQUE,
  business_name text NOT NULL DEFAULT '',
  primary_trade text,
  service_area text,
  years_experience integer,
  license_number text,
  insurance_carrier text,
  headline text,
  bio text,
  accepting_work boolean NOT NULL DEFAULT true,
  approval_status public.approval_status NOT NULL DEFAULT 'PENDING',
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  rejection_reason text,
  info_requested_at timestamptz,
  info_requested_by uuid,
  info_request_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contractor_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL,
  category_id uuid NOT NULL,
  UNIQUE (contractor_profile_id, category_id)
);

CREATE TABLE public.contractor_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL,
  mode public.service_area_mode NOT NULL DEFAULT 'ZIPS',
  center_zip text,
  radius_miles numeric,
  zip_codes text[] NOT NULL DEFAULT '{}',
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contractor_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'OTHER',
  label text NOT NULL,
  status public.credential_status NOT NULL DEFAULT 'PENDING',
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contractor_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  description text,
  storage_path text NOT NULL DEFAULT 'photo.jpg',
  privacy_state public.portfolio_privacy_state NOT NULL DEFAULT 'REVIEW_REQUIRED',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.booking_reviews (
  id uuid PRIMARY KEY,
  contractor_profile_id uuid NOT NULL,
  rating integer NOT NULL,
  body text,
  is_verified boolean NOT NULL DEFAULT false,
  reviewer_role text NOT NULL
);

CREATE TABLE public.notification_preferences (
  user_id uuid NOT NULL,
  category text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  push boolean NOT NULL DEFAULT false,
  email boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
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

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE
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
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND account_type = 'ADMIN' AND account_status = 'ACTIVE'
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

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.ppp_set_rpc(p_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('ppp.rpc', p_name, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ppp_rpc_is(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('ppp.rpc', true), '') = p_name;
$$;

CREATE OR REPLACE FUNCTION public.assert_admin_sensitive_step_up()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(current_setting('ppp.step_up_fail', true), '') = 'on' THEN
    RAISE EXCEPTION 'admin step-up required' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.text_contains_pre_hire_contact(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_text, '') ~* '@|https?://|[0-9]{3}[^0-9]{0,2}[0-9]{3}[^0-9]{0,2}[0-9]{4}';
$$;

CREATE OR REPLACE FUNCTION public.contact_info_blocked_message()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Please keep communication on Priority Property Pros until you connect. Remove phone numbers, emails, links, social handles, QR codes, and exact street addresses.';
$$;

CREATE OR REPLACE FUNCTION public.normalize_zip(z text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(substr(regexp_replace(coalesce(z, ''), '[^0-9]', '', 'g'), 1, 5), '');
$$;

CREATE OR REPLACE FUNCTION public.normalize_city(p_city text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(btrim(coalesce(p_city, '')), '');
$$;

CREATE OR REPLACE FUNCTION public.normalize_us_state(p_state text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF btrim(coalesce(p_state, '')) = '' THEN
    RETURN NULL;
  END IF;
  IF length(btrim(p_state)) = 2 THEN
    RETURN upper(btrim(p_state));
  END IF;
  RETURN btrim(p_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_is_satisfied(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT true;
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.public_directory_label(p_id uuid)
RETURNS text LANGUAGE sql AS $$ SELECT 'Pro'::text $$;
CREATE OR REPLACE FUNCTION public.public_directory_primary_trade(p_id uuid)
RETURNS text LANGUAGE sql AS $$ SELECT 'Trade'::text $$;
CREATE OR REPLACE FUNCTION public.public_directory_categories(p_id uuid)
RETURNS text[] LANGUAGE sql AS $$ SELECT '{}'::text[] $$;
CREATE OR REPLACE FUNCTION public.public_safe_blurb(a text, b text)
RETURNS text LANGUAGE sql AS $$ SELECT 'blurb'::text $$;
CREATE OR REPLACE FUNCTION public.public_safe_about(a text, b text)
RETURNS text LANGUAGE sql AS $$ SELECT 'about'::text $$;
CREATE OR REPLACE FUNCTION public.contractor_public_service_label(p_id uuid)
RETURNS text LANGUAGE sql AS $$ SELECT 'area'::text $$;
CREATE OR REPLACE FUNCTION public.public_service_is_other(p_name text)
RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.public_review_body(a text, b text, c text, d text)
RETURNS text LANGUAGE sql AS $$ SELECT 'review'::text $$;
CREATE OR REPLACE FUNCTION public.general_service_area(p_area text)
RETURNS text LANGUAGE sql AS $$ SELECT 'area'::text $$;
CREATE OR REPLACE FUNCTION public.public_safe_portfolio_caption(a text, b text)
RETURNS text LANGUAGE sql AS $$ SELECT 'caption'::text $$;
CREATE OR REPLACE FUNCTION public.generic_credential_badge_label(p_kind text)
RETURNS text LANGUAGE sql AS $$ SELECT 'badge'::text $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

\ir ../migrations/20261019600001_admin_profile_edits.sql

CREATE TRIGGER contractor_profiles_protect_approval
  BEFORE UPDATE ON public.contractor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_contractor_approval();

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owen@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pat@example.com'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'taken@example.com');

INSERT INTO auth.identities (user_id, provider, identity_data)
SELECT id, 'email', jsonb_build_object('sub', id::text, 'email', email) FROM auth.users;

INSERT INTO public.profiles (id, email, first_name, last_name, phone, account_type, account_status, signup_fee_status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com', 'Ada', 'Admin', NULL, 'ADMIN', 'ACTIVE', 'NOT_REQUIRED'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owen@example.com', 'Owen', 'Home', '2815550100', 'CUSTOMER', 'ACTIVE', 'PAID'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pat@example.com', 'Pat', 'Pro', '7135550100', 'CONTRACTOR', 'ACTIVE', 'PAID');

INSERT INTO public.service_categories (id, name, slug) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'Fence repair', 'fence-repair');

INSERT INTO public.projects (id, customer_id, category_id, title, description, status, city, state, zip_code, timing, reference_number) VALUES
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c1111111-1111-1111-1111-111111111111', 'Fence stain', 'South fence', 'POSTED', 'Conroe', 'TX', '77301', 'FLEXIBLE', 1004);

INSERT INTO public.contractor_profiles (
  id, profile_id, business_name, primary_trade, approval_status, license_number, headline, bio
) VALUES (
  'f1111111-1111-1111-1111-111111111111',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Pat Painting',
  'Painting',
  'APPROVED',
  'TX-998877',
  'Local painter',
  'Interior rooms'
);

INSERT INTO public.contractor_services (contractor_profile_id, category_id) VALUES
  ('f1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111');

INSERT INTO public.contractor_credentials (id, contractor_profile_id, kind, label, status) VALUES
  ('c2222222-2222-2222-2222-222222222222', 'f1111111-1111-1111-1111-111111111111', 'LICENSE', 'State license', 'PENDING');

INSERT INTO public.contractor_portfolio (id, contractor_profile_id, title, description, privacy_state) VALUES
  ('33333333-3333-3333-3333-333333333333', 'f1111111-1111-1111-1111-111111111111', 'Living room', 'Before the coat', 'REVIEW_REQUIRED');

INSERT INTO public.contractor_service_areas (id, contractor_profile_id, mode, label, center_zip, radius_miles, zip_codes) VALUES
  ('44444444-4444-4444-4444-444444444444', 'f1111111-1111-1111-1111-111111111111', 'RADIUS', 'Conroe', '77301', 25, '{}');

GRANT USAGE ON SCHEMA auth TO authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","aal":"aal2","role":"authenticated"}', false);

DO $$
BEGIN
  PERFORM public.admin_get_customer_editor('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  RAISE EXCEPTION 'customer was allowed to open the editor';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;

DO $$
DECLARE
  editor jsonb;
  keys text[];
  audits integer;
  listed boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal1","role":"authenticated"}', true);
  UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';
  BEGIN
    PERFORM public.admin_get_customer_editor('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    RAISE EXCEPTION 'aal1 admin was allowed while MFA is required';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  UPDATE public.platform_settings SET value_int = 0 WHERE key = 'admin_mfa_required';
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal2","role":"authenticated"}', true);

  editor := public.admin_get_customer_editor('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO keys FROM jsonb_object_keys(editor) AS key;
  IF keys <> ARRAY['account_status','avatar_url','categories','email','first_name','last_name','location','notifications','phone','profile_id','projects'] THEN
    RAISE EXCEPTION 'customer editor allowlist mismatch %', keys;
  END IF;
  IF editor::text ~* 'stripe_|signup_fee|amount_cents|fee_cents' THEN
    RAISE EXCEPTION 'customer editor leaked a payment field';
  END IF;

  BEGIN
    PERFORM public.admin_update_customer_profile(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '{"first_name":"Olivia"}'::jsonb,
      'no'
    );
    RAISE EXCEPTION 'short reason was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Enter a reason%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.admin_update_customer_profile(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '{"phone":"555"}'::jsonb,
      'Correct a bad phone'
    );
    RAISE EXCEPTION 'bad phone was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Enter a 10-digit phone number.%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.admin_update_customer_profile(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '{"signup_fee_status":"PAID"}'::jsonb,
      'Try to edit a fee'
    );
    RAISE EXCEPTION 'fee status was editable';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'payment records and fee status%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('ppp.step_up_fail', 'on', true);
  editor := public.admin_update_customer_profile(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '{"first_name":"Olivia"}'::jsonb,
    'Corrected spelling from the owner call'
  );
  IF editor->>'first_name' IS DISTINCT FROM 'Olivia' THEN
    RAISE EXCEPTION 'name change did not save %', editor->>'first_name';
  END IF;
  BEGIN
    PERFORM public.admin_update_customer_profile(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '{"email":"owen.home@example.com"}'::jsonb,
      'Owner asked to change email'
    );
    RAISE EXCEPTION 'email change skipped step-up';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM NOT LIKE '%admin step-up required%' THEN
        RAISE;
      END IF;
  END;
  PERFORM set_config('ppp.step_up_fail', 'off', true);
  IF (SELECT email FROM auth.users WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') IS DISTINCT FROM 'owen@example.com' THEN
    RAISE EXCEPTION 'auth email changed without step-up';
  END IF;

  editor := public.admin_update_customer_profile(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    jsonb_build_object(
      'email', 'owen.home@example.com',
      'phone', '(281) 555-0142',
      'location', jsonb_build_object('street_line1', '10 Oak Lane', 'city', 'conroe', 'state', 'tx', 'zip_code', '77301'),
      'projects', jsonb_build_array(jsonb_build_object(
        'project_id', '11111111-1111-1111-1111-111111111111',
        'title', 'Fence stain and gate',
        'description', 'South fence only'
      ))
    ),
    'Owner confirmed the corrected contact and job title'
  );
  IF (SELECT email FROM auth.users WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') IS DISTINCT FROM 'owen.home@example.com' THEN
    RAISE EXCEPTION 'auth email was not updated';
  END IF;
  IF (SELECT identity_data->>'email' FROM auth.identities WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND provider = 'email') IS DISTINCT FROM 'owen.home@example.com' THEN
    RAISE EXCEPTION 'email identity was not updated';
  END IF;
  IF (SELECT email FROM public.profiles WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') IS DISTINCT FROM 'owen.home@example.com' THEN
    RAISE EXCEPTION 'profile email was not updated';
  END IF;
  IF (SELECT phone FROM public.profiles WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') IS DISTINCT FROM '2815550142' THEN
    RAISE EXCEPTION 'phone was not normalized';
  END IF;
  IF (SELECT street_line1 FROM public.profile_private_locations WHERE profile_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') IS DISTINCT FROM '10 Oak Lane' THEN
    RAISE EXCEPTION 'customer address was not saved';
  END IF;
  IF (SELECT title FROM public.projects WHERE id = '11111111-1111-1111-1111-111111111111') IS DISTINCT FROM 'Fence stain and gate' THEN
    RAISE EXCEPTION 'project title was not saved';
  END IF;

  SELECT count(*) INTO audits
  FROM public.audit_logs
  WHERE action = 'admin.customer_profile_updated'
    AND entity_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    AND metadata->>'reason' = 'Owner confirmed the corrected contact and job title'
    AND metadata->'after'->>'email' = 'owen.home@example.com'
    AND metadata->'before'->>'email' = 'owen@example.com';
  IF audits <> 1 THEN
    RAISE EXCEPTION 'customer audit row missing, count %', audits;
  END IF;

  BEGIN
    PERFORM public.admin_update_customer_profile(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '{"first_name":"Call me at 281-555-0199"}'::jsonb,
      'This should fail contact checks'
    );
    RAISE EXCEPTION 'contact text in a name was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Please keep communication%' THEN
        RAISE;
      END IF;
  END;

  IF NOT public.contractor_is_directory_listed('f1111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'approved contractor should be listed';
  END IF;
  PERFORM set_config('ppp.step_up_fail', 'on', true);
  BEGIN
    PERFORM public.admin_update_contractor_profile(
      'f1111111-1111-1111-1111-111111111111',
      '{"directory_hidden":true}'::jsonb,
      'Hide this pro from the directory'
    );
    RAISE EXCEPTION 'directory hide skipped step-up';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      NULL;
  END;
  PERFORM set_config('ppp.step_up_fail', 'off', true);
  PERFORM public.admin_update_contractor_profile(
    'f1111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'directory_hidden', true,
      'license_number', '1234567890',
      'bio', 'Interior rooms',
      'portfolio', jsonb_build_array(jsonb_build_object(
        'id', '33333333-3333-3333-3333-333333333333',
        'title', 'Living room after',
        'privacy_state', 'PUBLIC_SAFE'
      ))
    ),
    'Hide the pro and approve the photo caption'
  );
  IF public.contractor_is_directory_listed('f1111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'hidden contractor is still listed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contractor_public_profiles WHERE id = 'f1111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'hidden contractor is still in the public view';
  END IF;
  IF (SELECT signup_fee_status FROM public.profiles WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') IS DISTINCT FROM 'PAID' THEN
    RAISE EXCEPTION 'fee status changed';
  END IF;
  IF (SELECT license_number FROM public.contractor_profiles WHERE id = 'f1111111-1111-1111-1111-111111111111') IS DISTINCT FROM '1234567890' THEN
    RAISE EXCEPTION 'license was rejected';
  END IF;
  IF (SELECT privacy_state::text FROM public.contractor_portfolio WHERE id = '33333333-3333-3333-3333-333333333333') IS DISTINCT FROM 'PUBLIC_SAFE' THEN
    RAISE EXCEPTION 'photo approval state was not saved';
  END IF;

  BEGIN
    PERFORM public.admin_update_contractor_profile(
      'f1111111-1111-1111-1111-111111111111',
      '{"bio":"Email pat@example.com for a quote"}'::jsonb,
      'This bio should be rejected'
    );
    RAISE EXCEPTION 'contact text in a bio was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Please keep communication%' THEN
        RAISE;
      END IF;
  END;

  SELECT count(*) INTO audits
  FROM public.audit_logs
  WHERE action = 'admin.contractor_profile_updated'
    AND metadata->>'reason' = 'Hide the pro and approve the photo caption'
    AND metadata->'after'->>'directory_hidden' = 'true'
    AND metadata->'before'->>'license_number' = 'TX-998877';
  IF audits <> 1 THEN
    RAISE EXCEPTION 'contractor audit row missing, count %', audits;
  END IF;

  PERFORM set_config('ppp.rpc', '', true);
  BEGIN
    UPDATE public.contractor_profiles
    SET approval_status = 'SUSPENDED'
    WHERE id = 'f1111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION 'direct approval update was allowed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%admin RPCs%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('ppp.rpc', '', true);
  BEGIN
    UPDATE public.contractor_profiles
    SET directory_hidden = NOT directory_hidden
    WHERE id = 'f1111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION 'direct directory visibility update was allowed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%directory visibility is set%' THEN
        RAISE;
      END IF;
  END;

  editor := public.admin_get_contractor_editor('f1111111-1111-1111-1111-111111111111');
  IF editor::text ~* 'stripe_|document_path|center_lat|center_lng|signup_fee' THEN
    RAISE EXCEPTION 'contractor editor leaked a private or payment field';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.admin_update_customer_profile(uuid,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute the customer save';
  END IF;
  IF has_function_privilege('anon', 'public.admin_get_customer_editor(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_get_contractor_editor(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_update_customer_profile(uuid,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_update_contractor_profile(uuid,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute an editor function';
  END IF;
  listed := public.contractor_is_directory_listed('f1111111-1111-1111-1111-111111111111');
  IF listed THEN
    RAISE EXCEPTION 'listing flag did not stick';
  END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","aal":"aal2","role":"authenticated"}', false);
DO $$
DECLARE
  seen integer;
BEGIN
  SELECT count(*) INTO seen FROM public.profile_private_locations;
  IF seen <> 0 THEN
    RAISE EXCEPTION 'contractor read the customer address, count %', seen;
  END IF;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","aal":"aal2","role":"authenticated"}', false);
DO $$
DECLARE
  seen integer;
BEGIN
  SELECT count(*) INTO seen FROM public.profile_private_locations;
  IF seen <> 1 THEN
    RAISE EXCEPTION 'customer could not read their own address, count %', seen;
  END IF;
END $$;
RESET ROLE;

-- Without PR #110: the guard helper must be a no-op, so sensitive saves still work.
DROP FUNCTION public.assert_admin_sensitive_step_up();
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","aal":"aal1","role":"authenticated"}', false);
DO $$
DECLARE
  editor jsonb;
BEGIN
  PERFORM set_config('ppp.step_up_fail', 'on', true);
  editor := public.admin_update_customer_profile(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    jsonb_build_object('phone', '281-555-0111'),
    'Phone correction before step-up exists'
  );
  IF editor->>'phone' IS DISTINCT FROM '2815550111' THEN
    RAISE EXCEPTION 'sensitive save failed without PR #110';
  END IF;
END $$;
RESET ROLE;

\ir ../rollbacks/20261019600001_admin_profile_edits_rollback.sql

DO $$
BEGIN
  IF to_regprocedure('public.admin_update_customer_profile(uuid,jsonb,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left the customer save';
  END IF;
  IF to_regclass('public.profile_private_locations') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left profile_private_locations';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contractor_profiles' AND column_name = 'directory_hidden'
  ) THEN
    RAISE EXCEPTION 'rollback left directory_hidden';
  END IF;
  IF NOT public.contractor_is_directory_listed('f1111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'rollback listing predicate is wrong';
  END IF;
  IF (SELECT count(*) FROM public.audit_logs WHERE action = 'admin.customer_profile_updated') < 1 THEN
    RAISE EXCEPTION 'rollback deleted audit rows';
  END IF;
END $$;
