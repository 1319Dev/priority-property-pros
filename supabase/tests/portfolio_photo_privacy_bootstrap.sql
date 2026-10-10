-- LOCAL TEST FIXTURE ONLY. Not a migration and not for production.
-- Recreates the portfolio, profile, audit, and storage pieces described as the
-- current production state, including the vulnerable contractor-docs policies,
-- so 20261010001728_portfolio_photo_privacy.sql can be applied on top.
-- Re-running this file puts those vulnerable policies back.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
CREATE SCHEMA IF NOT EXISTS storage;

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

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END
$$;

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb,
  UNIQUE (bucket_id, name)
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE public.account_type AS ENUM ('CUSTOMER', 'CONTRACTOR', 'VERIFIER', 'ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
    CREATE TYPE public.account_status AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_status') THEN
    CREATE TYPE public.onboarding_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE public.approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portfolio_privacy_state') THEN
    CREATE TYPE public.portfolio_privacy_state AS ENUM ('PUBLIC_SAFE', 'PRIVATE', 'REVIEW_REQUIRED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text,
  avatar_url text,
  account_type public.account_type NOT NULL DEFAULT 'CUSTOMER',
  account_status public.account_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contractor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT '',
  approval_status public.approval_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contractor_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text,
  storage_path text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  privacy_state public.portfolio_privacy_state NOT NULL DEFAULT 'REVIEW_REQUIRED'
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
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

DROP TRIGGER IF EXISTS contractor_portfolio_set_updated_at ON public.contractor_portfolio;
CREATE TRIGGER contractor_portfolio_set_updated_at
  BEFORE UPDATE ON public.contractor_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

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

CREATE OR REPLACE FUNCTION public.current_contractor_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.id
  FROM public.contractor_profiles cp
  WHERE cp.profile_id = auth.uid()
  LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.text_contains_pre_hire_contact(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_text, '') ~* '([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})|([0-9][0-9().[:space:]-]{8,}[0-9])|(https?://)';
$$;

CREATE OR REPLACE FUNCTION public.assert_no_pre_hire_contact(p_text text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.text_contains_pre_hire_contact(p_text) THEN
    RAISE EXCEPTION 'For your privacy and protection, contact information is shared after you''re connected through Priority Property Pros.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_pre_hire_contact_portfolio()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_no_pre_hire_contact(NEW.title);
  PERFORM public.assert_no_pre_hire_contact(NEW.description);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_pre_hire_contact_portfolio ON public.contractor_portfolio;
CREATE TRIGGER trg_reject_pre_hire_contact_portfolio
  BEFORE INSERT OR UPDATE OF title, description ON public.contractor_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_pre_hire_contact_portfolio();

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
  );
$$;

DROP VIEW IF EXISTS public.contractor_public_portfolio;
CREATE VIEW public.contractor_public_portfolio
WITH (security_invoker = false)
AS
SELECT
  pf.id,
  pf.contractor_profile_id,
  pf.sort_order,
  coalesce(nullif(btrim(pf.title), ''), 'Screened project photo') AS caption
FROM public.contractor_portfolio pf
JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE pf.privacy_state = 'PUBLIC_SAFE'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND NOT public.text_contains_pre_hire_contact(pf.title)
  AND NOT public.text_contains_pre_hire_contact(coalesce(pf.description, ''));

CREATE OR REPLACE FUNCTION public.list_public_directory_portfolio(p_id uuid)
RETURNS TABLE (
  id uuid,
  caption text,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pf.id, pf.caption, pf.sort_order
  FROM public.contractor_public_portfolio pf
  WHERE pf.contractor_profile_id = p_id
    AND public.contractor_is_directory_listed(p_id)
  ORDER BY pf.sort_order, pf.id;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractor_portfolio_select_own_or_admin ON public.contractor_portfolio;
CREATE POLICY contractor_portfolio_select_own_or_admin
  ON public.contractor_portfolio FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS contractor_portfolio_insert_own ON public.contractor_portfolio;
CREATE POLICY contractor_portfolio_insert_own
  ON public.contractor_portfolio FOR INSERT TO authenticated
  WITH CHECK (contractor_profile_id = public.current_contractor_profile_id());

DROP POLICY IF EXISTS contractor_portfolio_update_own ON public.contractor_portfolio;
CREATE POLICY contractor_portfolio_update_own
  ON public.contractor_portfolio FOR UPDATE TO authenticated
  USING (contractor_profile_id = public.current_contractor_profile_id())
  WITH CHECK (contractor_profile_id = public.current_contractor_profile_id());

DROP POLICY IF EXISTS contractor_portfolio_delete_own ON public.contractor_portfolio;
CREATE POLICY contractor_portfolio_delete_own
  ON public.contractor_portfolio FOR DELETE TO authenticated
  USING (contractor_profile_id = public.current_contractor_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS contractor_docs_storage_select ON storage.objects;
CREATE POLICY contractor_docs_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'contractor-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
      OR (
        (storage.foldername(name))[2] = 'portfolio'
        AND EXISTS (
          SELECT 1
          FROM public.contractor_profiles cp
          WHERE cp.profile_id::text = (storage.foldername(objects.name))[1]
            AND cp.approval_status = 'APPROVED'
        )
      )
    )
  );

DROP POLICY IF EXISTS contractor_docs_storage_insert ON storage.objects;
CREATE POLICY contractor_docs_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contractor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('portfolio', 'credentials')
  );

DROP POLICY IF EXISTS contractor_docs_storage_update ON storage.objects;
CREATE POLICY contractor_docs_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contractor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'contractor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS contractor_docs_storage_delete ON storage.objects;
CREATE POLICY contractor_docs_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'contractor-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

REVOKE ALL ON TABLE public.contractor_portfolio FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contractor_portfolio TO authenticated;
GRANT ALL ON TABLE public.contractor_portfolio TO service_role;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

REVOKE ALL ON TABLE public.contractor_profiles FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.contractor_profiles TO authenticated;
GRANT ALL ON TABLE public.contractor_profiles TO service_role;

REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

GRANT SELECT ON storage.objects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT ALL ON storage.objects TO service_role;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_contractor_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_contractor_profile_id() TO authenticated;
REVOKE ALL ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.contractor_is_directory_listed(uuid) FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contractor_public_portfolio TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_directory_portfolio(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role;

-- Confirm the fixture still matches the production SELECT hole before the fix.
DO $$
DECLARE
  v_qual text;
  v_check text;
BEGIN
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'contractor_docs_storage_select';
  SELECT with_check INTO v_check
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'contractor_docs_storage_update';

  IF v_qual IS NULL OR v_qual NOT ILIKE '%APPROVED%' OR v_qual ILIKE '%PUBLIC_SAFE%' OR v_qual NOT ILIKE '%portfolio%' THEN
    RAISE EXCEPTION 'prod-shaped select policy missing before the privacy migration: %', v_qual;
  END IF;
  IF v_qual NOT ILIKE '%objects.name%' AND v_qual NOT ILIKE '%foldername(name)%' THEN
    RAISE EXCEPTION 'prod-shaped select policy lost the folder check: %', v_qual;
  END IF;
  IF v_check IS NULL OR v_check NOT ILIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'prod-shaped update policy missing before the privacy migration: %', v_check;
  END IF;
END
$$;
