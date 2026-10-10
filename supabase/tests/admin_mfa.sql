-- Local checks for admin authenticator enforcement.
-- Minimal auth schema stub. Not a production script. Does not call Stripe.
--
--   psql -d admin_mfa -v ON_ERROR_STOP=1 -f supabase/tests/admin_mfa.sql

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

CREATE TYPE public.account_type AS ENUM ('CUSTOMER', 'CONTRACTOR', 'VERIFIER', 'ADMIN');
CREATE TYPE public.account_status AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED');
CREATE TYPE public.approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE public.portfolio_privacy_state AS ENUM ('PUBLIC_SAFE', 'PRIVATE', 'REVIEW_REQUIRED');

CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value_int integer,
  value_text text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  first_name text,
  last_name text,
  account_type public.account_type NOT NULL,
  account_status public.account_status NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE public.contractor_profiles (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id),
  business_name text NOT NULL DEFAULT '',
  approval_status public.approval_status NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE public.contractor_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  title text NOT NULL DEFAULT '',
  description text,
  storage_path text,
  privacy_state public.portfolio_privacy_state NOT NULL DEFAULT 'REVIEW_REQUIRED',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
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

-- Production portfolio privacy trigger. Service role (auth.uid() null) and
-- is_admin() skip the contractor rules. A false is_admin() must still let the
-- owning contractor save their own photo.
CREATE OR REPLACE FUNCTION public.contractor_portfolio_owner_profile_id(p_contractor_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.profile_id
  FROM public.contractor_profiles cp
  WHERE cp.id = p_contractor_profile_id;
$$;

CREATE OR REPLACE FUNCTION public.enforce_contractor_portfolio_privacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_prefix text;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.contractor_profile_id IS DISTINCT FROM OLD.contractor_profile_id THEN
    RAISE EXCEPTION 'You cannot move a portfolio photo to another contractor.';
  END IF;

  v_owner := public.contractor_portfolio_owner_profile_id(NEW.contractor_profile_id);
  v_prefix := coalesce(v_owner::text, '') || '/portfolio/';
  IF v_owner IS NULL OR coalesce(NEW.storage_path, '') = '' OR position(v_prefix in NEW.storage_path) <> 1 THEN
    RAISE EXCEPTION 'Portfolio photos must stay in your own portfolio folder.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.privacy_state := 'REVIEW_REQUIRED';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description THEN
      NEW.privacy_state := 'REVIEW_REQUIRED';
    ELSIF NEW.privacy_state IS DISTINCT FROM OLD.privacy_state THEN
      RAISE EXCEPTION 'Photo visibility is reviewed by Priority Property Pros. You cannot change it yourself.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_contractor_portfolio_privacy
  BEFORE INSERT OR UPDATE ON public.contractor_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_contractor_portfolio_privacy();

-- Production approval trigger pattern: auth.uid() null is allowed through.
-- A non-admin JWT cannot change approval_status. Other columns stay editable.
CREATE OR REPLACE FUNCTION public.protect_contractor_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'contractors cannot self-approve or change approval fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_contractor_approval
  BEFORE UPDATE ON public.contractor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_contractor_approval();

-- Same authorization prelude as production admin_approve_contractor.
CREATE OR REPLACE FUNCTION public.admin_approve_contractor(p_contractor_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can approve a contractor';
  END IF;
  UPDATE public.contractor_profiles
  SET approval_status = 'APPROVED'
  WHERE id = p_contractor_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contractor profile not found';
  END IF;
  RETURN jsonb_build_object('id', p_contractor_profile_id, 'approval_status', 'APPROVED');
END;
$$;

-- Same authorization prelude and write as production admin_set_portfolio_privacy.
CREATE OR REPLACE FUNCTION public.admin_set_portfolio_privacy(
  p_item_id uuid,
  p_state public.portfolio_privacy_state,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.contractor_portfolio;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can set portfolio photo privacy';
  END IF;

  SELECT * INTO v_row
  FROM public.contractor_portfolio
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portfolio photo not found';
  END IF;

  UPDATE public.contractor_portfolio
  SET privacy_state = p_state
  WHERE id = v_row.id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'portfolio.privacy_set',
    'contractor_portfolio',
    v_row.id,
    jsonb_build_object('privacy_state', p_state, 'note', v_note)
  );

  RETURN jsonb_build_object('id', v_row.id, 'privacy_state', p_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_portfolio_review_queue()
RETURNS TABLE (
  id uuid,
  contractor_profile_id uuid,
  contractor_label text,
  title text,
  description text,
  storage_path text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can list the portfolio review queue';
  END IF;

  RETURN QUERY
  SELECT
    pf.id,
    pf.contractor_profile_id,
    coalesce(nullif(btrim(cp.business_name), ''), 'Contractor') AS contractor_label,
    pf.title,
    pf.description,
    pf.storage_path,
    pf.created_at
  FROM public.contractor_portfolio pf
  JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
  WHERE pf.privacy_state = 'REVIEW_REQUIRED'
  ORDER BY pf.created_at ASC, pf.id;
END;
$$;

-- Prior is_admin(), created before seed writes so portfolio triggers can resolve it.
-- The migration's CREATE OR REPLACE is what adds the authenticator check.
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

INSERT INTO public.profiles (id, email, first_name, last_name, account_type, account_status)
VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'admin@example.com', 'Cam', 'Admin', 'ADMIN', 'ACTIVE'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner@example.com', 'Ada', 'Owner', 'CONTRACTOR', 'ACTIVE'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'customer@example.com', 'Bea', 'Buyer', 'CUSTOMER', 'ACTIVE'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'paused@example.com', 'Dee', 'Paused', 'ADMIN', 'SUSPENDED');

INSERT INTO public.contractor_profiles (id, profile_id, business_name, approval_status)
VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Cedar Works', 'PENDING');

INSERT INTO public.contractor_portfolio (
  id, contractor_profile_id, title, description, storage_path, privacy_state
)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'Cedar panel',
  'Before',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/safe.jpg',
  'REVIEW_REQUIRED'
);

CREATE OR REPLACE FUNCTION public._mfa_jwt(p_sub uuid, p_aal text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'aal', p_aal, 'role', 'authenticated')::text,
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._mfa_service()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', false);
END;
$$;

CREATE OR REPLACE FUNCTION public._mfa_ok(p_cond boolean, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_cond, false) THEN
    RAISE EXCEPTION 'admin mfa test failed: %', p_msg;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._mfa_raises(p_sql text, p_expected text)
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

SELECT public._mfa_ok(
  (SELECT value_int = 0 FROM public.platform_settings WHERE key = 'admin_mfa_required'),
  'flag defaults off'
);
SELECT public._mfa_ok(NOT public.admin_mfa_required(), 'helper is false by default');

-- Flag off: aal1 and aal2 admins, non-admins, suspended admins, service role.
SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');
SELECT public._mfa_ok(public.is_admin(), 'flag off aal1 admin');
SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal2');
SELECT public._mfa_ok(public.is_admin(), 'flag off aal2 admin');
SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', NULL);
SELECT public._mfa_ok(public.is_admin(), 'flag off admin with no aal claim');

SELECT public._mfa_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal1');
SELECT public._mfa_ok(NOT public.is_admin(), 'flag off contractor aal1');
SELECT public._mfa_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal2');
SELECT public._mfa_ok(NOT public.is_admin(), 'flag off contractor aal2');
SELECT public._mfa_jwt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aal2');
SELECT public._mfa_ok(NOT public.is_admin(), 'flag off customer');
SELECT public._mfa_jwt('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aal2');
SELECT public._mfa_ok(NOT public.is_admin(), 'flag off suspended admin');
SELECT public._mfa_service();
SELECT public._mfa_ok(auth.uid() IS NULL, 'service role has no uid');
SELECT public._mfa_ok(NOT public.is_admin(), 'flag off service role');

-- Owning contractor can still save a photo. Privacy is forced to review.
SELECT public._mfa_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal1');
INSERT INTO public.contractor_portfolio (
  id, contractor_profile_id, title, storage_path, privacy_state
)
VALUES (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  'Porch',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/porch.jpg',
  'PUBLIC_SAFE'
);
SELECT public._mfa_ok(
  (SELECT privacy_state = 'REVIEW_REQUIRED' FROM public.contractor_portfolio WHERE id = '66666666-6666-4666-8666-666666666666'),
  'contractor insert is forced to review'
);
UPDATE public.contractor_portfolio
SET title = 'Porch repaired'
WHERE id = '66666666-6666-4666-8666-666666666666';
SELECT public._mfa_ok(
  (SELECT title = 'Porch repaired' AND privacy_state = 'REVIEW_REQUIRED'
   FROM public.contractor_portfolio WHERE id = '66666666-6666-4666-8666-666666666666'),
  'contractor can still retitle their own photo'
);
UPDATE public.contractor_profiles
SET business_name = 'Cedar Works LLC'
WHERE id = '11111111-1111-4111-8111-111111111111';
SELECT public._mfa_ok(
  (SELECT business_name = 'Cedar Works LLC' FROM public.contractor_profiles WHERE id = '11111111-1111-4111-8111-111111111111'),
  'contractor can still edit their own business name'
);
SELECT public._mfa_raises(
  $$UPDATE public.contractor_profiles SET approval_status = 'APPROVED' WHERE id = '11111111-1111-4111-8111-111111111111'$$,
  'contractors cannot self-approve'
);

-- Service role bypasses the portfolio trigger and the approval trigger.
SELECT public._mfa_service();
INSERT INTO public.contractor_portfolio (
  id, contractor_profile_id, title, storage_path, privacy_state
)
VALUES (
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  'Service',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/service.jpg',
  'PUBLIC_SAFE'
);
SELECT public._mfa_ok(
  (SELECT privacy_state = 'PUBLIC_SAFE' FROM public.contractor_portfolio WHERE id = '55555555-5555-4555-8555-555555555555'),
  'service role portfolio insert keeps the requested privacy'
);
UPDATE public.contractor_profiles
SET approval_status = 'APPROVED'
WHERE id = '11111111-1111-4111-8111-111111111111';
SELECT public._mfa_ok(
  (SELECT approval_status = 'APPROVED' FROM public.contractor_profiles WHERE id = '11111111-1111-4111-8111-111111111111'),
  'service role can still change approval'
);
UPDATE public.contractor_profiles
SET approval_status = 'PENDING'
WHERE id = '11111111-1111-4111-8111-111111111111';

-- Admin RPCs with the flag off.
SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');
SELECT public.admin_approve_contractor('11111111-1111-4111-8111-111111111111');
SELECT public._mfa_ok(
  (SELECT approval_status = 'APPROVED' FROM public.contractor_profiles WHERE id = '11111111-1111-4111-8111-111111111111'),
  'flag off aal1 admin can approve'
);
UPDATE public.contractor_profiles SET approval_status = 'PENDING' WHERE id = '11111111-1111-4111-8111-111111111111';
SELECT public.admin_set_portfolio_privacy('44444444-4444-4444-8444-444444444444', 'PUBLIC_SAFE', 'ok');
SELECT public._mfa_ok(
  (SELECT privacy_state = 'PUBLIC_SAFE' FROM public.contractor_portfolio WHERE id = '44444444-4444-4444-8444-444444444444'),
  'flag off aal1 admin can set portfolio privacy'
);
UPDATE public.contractor_portfolio
SET privacy_state = 'REVIEW_REQUIRED'
WHERE id = '44444444-4444-4444-8444-444444444444';

SELECT public._mfa_service();
SELECT public._mfa_raises(
  $$SELECT public.admin_approve_contractor('11111111-1111-4111-8111-111111111111')$$,
  'only an admin can approve a contractor'
);
SELECT public._mfa_raises(
  $$SELECT public.admin_set_portfolio_privacy('44444444-4444-4444-8444-444444444444', 'PRIVATE', NULL)$$,
  'only an admin can set portfolio photo privacy'
);
SELECT public._mfa_raises(
  $$SELECT * FROM public.admin_list_portfolio_review_queue()$$,
  'only an admin can list the portfolio review queue'
);

SELECT public._mfa_jwt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aal2');
SELECT public._mfa_raises(
  $$SELECT public.admin_approve_contractor('11111111-1111-4111-8111-111111111111')$$,
  'only an admin can approve a contractor'
);

-- Flag on.
UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';
SELECT public._mfa_ok(public.admin_mfa_required(), 'helper reads the flag');

SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');
SELECT public._mfa_ok(NOT public.is_admin(), 'flag on aal1 admin is not admin');
SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', NULL);
SELECT public._mfa_ok(NOT public.is_admin(), 'flag on admin missing aal is not admin');
SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal2');
SELECT public._mfa_ok(public.is_admin(), 'flag on aal2 admin');

SELECT public._mfa_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal1');
SELECT public._mfa_ok(NOT public.is_admin(), 'flag on contractor still not admin');
SELECT public._mfa_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal2');
SELECT public._mfa_ok(NOT public.is_admin(), 'flag on contractor aal2 still not admin');
SELECT public._mfa_jwt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aal1');
SELECT public._mfa_ok(NOT public.is_admin(), 'flag on customer still not admin');
SELECT public._mfa_service();
SELECT public._mfa_ok(NOT public.is_admin(), 'flag on service role still not admin');

-- Contractor actions still succeed with the flag on.
SELECT public._mfa_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal1');
UPDATE public.contractor_portfolio
SET description = 'After the flag'
WHERE id = '66666666-6666-4666-8666-666666666666';
SELECT public._mfa_ok(
  (SELECT description = 'After the flag' FROM public.contractor_portfolio WHERE id = '66666666-6666-4666-8666-666666666666'),
  'flag on contractor can still update their own photo'
);
UPDATE public.contractor_profiles
SET business_name = 'Cedar Still Mine'
WHERE id = '11111111-1111-4111-8111-111111111111';
SELECT public._mfa_ok(
  (SELECT business_name = 'Cedar Still Mine' FROM public.contractor_profiles WHERE id = '11111111-1111-4111-8111-111111111111'),
  'flag on contractor can still edit business name'
);

-- Service role writes still succeed with the flag on.
SELECT public._mfa_service();
UPDATE public.contractor_profiles
SET approval_status = 'APPROVED'
WHERE id = '11111111-1111-4111-8111-111111111111';
SELECT public._mfa_ok(
  (SELECT approval_status = 'APPROVED' FROM public.contractor_profiles WHERE id = '11111111-1111-4111-8111-111111111111'),
  'flag on service role can still change approval'
);
UPDATE public.contractor_portfolio
SET privacy_state = 'PRIVATE'
WHERE id = '55555555-5555-4555-8555-555555555555';
SELECT public._mfa_ok(
  (SELECT privacy_state = 'PRIVATE' FROM public.contractor_portfolio WHERE id = '55555555-5555-4555-8555-555555555555'),
  'flag on service role can still set portfolio privacy directly'
);
UPDATE public.contractor_profiles
SET approval_status = 'PENDING'
WHERE id = '11111111-1111-4111-8111-111111111111';

-- Admin RPCs require aal2 once the flag is on.
SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');
SELECT public._mfa_raises(
  $$SELECT public.admin_approve_contractor('11111111-1111-4111-8111-111111111111')$$,
  'only an admin can approve a contractor'
);
SELECT public._mfa_raises(
  $$SELECT public.admin_set_portfolio_privacy('44444444-4444-4444-8444-444444444444', 'PUBLIC_SAFE', NULL)$$,
  'only an admin can set portfolio photo privacy'
);
SELECT public._mfa_raises(
  $$SELECT * FROM public.admin_list_portfolio_review_queue()$$,
  'only an admin can list the portfolio review queue'
);
SELECT public._mfa_ok(
  (SELECT approval_status = 'PENDING' FROM public.contractor_profiles WHERE id = '11111111-1111-4111-8111-111111111111'),
  'aal1 approve did not change the contractor'
);

SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal2');
SELECT public.admin_approve_contractor('11111111-1111-4111-8111-111111111111');
SELECT public._mfa_ok(
  (SELECT approval_status = 'APPROVED' FROM public.contractor_profiles WHERE id = '11111111-1111-4111-8111-111111111111'),
  'flag on aal2 admin can approve'
);
SELECT public.admin_set_portfolio_privacy('44444444-4444-4444-8444-444444444444', 'PUBLIC_SAFE', 'reviewed');
SELECT public._mfa_ok(
  (SELECT privacy_state = 'PUBLIC_SAFE' FROM public.contractor_portfolio WHERE id = '44444444-4444-4444-8444-444444444444'),
  'flag on aal2 admin can set portfolio privacy'
);
SELECT public._mfa_ok(
  (SELECT count(*) = 1 FROM public.admin_list_portfolio_review_queue()),
  'flag on aal2 admin can list the review queue'
);
SELECT public._mfa_service();
SELECT public._mfa_raises(
  $$SELECT public.admin_approve_contractor('11111111-1111-4111-8111-111111111111')$$,
  'only an admin can approve a contractor'
);
SELECT public._mfa_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal2');
SELECT public._mfa_raises(
  $$SELECT public.admin_set_portfolio_privacy('44444444-4444-4444-8444-444444444444', 'PRIVATE', NULL)$$,
  'only an admin can set portfolio photo privacy'
);

-- Missing setting row is the same as off.
DELETE FROM public.platform_settings WHERE key = 'admin_mfa_required';
SELECT public._mfa_ok(NOT public.admin_mfa_required(), 'missing flag row is off');
SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');
SELECT public._mfa_ok(public.is_admin(), 'missing flag row keeps aal1 admin');

\ir ../rollbacks/20261013000001_admin_mfa_required_rollback.sql

SELECT public._mfa_ok(
  to_regprocedure('public.admin_mfa_required()') IS NULL,
  'rollback drops the helper'
);
SELECT public._mfa_ok(
  NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'admin_mfa_required'),
  'rollback removes the flag'
);
SELECT public._mfa_ok(
  position('admin_mfa_required' in pg_get_functiondef('public.is_admin()'::regprocedure)) = 0,
  'rollback restores is_admin without the flag'
);
SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');
SELECT public._mfa_ok(public.is_admin(), 'restored is_admin treats aal1 admin as admin');
SELECT public._mfa_jwt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal2');
SELECT public._mfa_ok(NOT public.is_admin(), 'restored is_admin still rejects a contractor');
SELECT public._mfa_service();
SELECT public._mfa_ok(NOT public.is_admin(), 'restored is_admin still rejects service role');

\ir ../migrations/20261013000001_admin_mfa_required.sql

SELECT public._mfa_ok(
  (SELECT value_int = 0 FROM public.platform_settings WHERE key = 'admin_mfa_required'),
  'reapplying the migration keeps the flag off'
);
SELECT public._mfa_jwt('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal1');
SELECT public._mfa_ok(public.is_admin(), 'reapplied migration still allows aal1 until the flag is on');
