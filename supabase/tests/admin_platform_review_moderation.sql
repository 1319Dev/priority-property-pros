-- Local proof for admin_set_platform_review_status. Not applied to production.
-- Run: sudo -u postgres psql -d admin_platform_review -v ON_ERROR_STOP=1 -f supabase/tests/admin_platform_review_moderation.sql

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_review_status') THEN
    CREATE TYPE public.platform_review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id),
  display_name text NOT NULL,
  city text,
  rating smallint NOT NULL,
  body text NOT NULL,
  status public.platform_review_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid() = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
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

CREATE OR REPLACE FUNCTION public.protect_platform_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can change a platform review';
    END IF;
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_reviews_protect ON public.platform_reviews;
CREATE TRIGGER platform_reviews_protect
  BEFORE UPDATE ON public.platform_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_platform_review();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

\ir ../migrations/20261014130000_admin_platform_review_moderation.sql

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, UPDATE ON public.platform_reviews TO authenticated;

INSERT INTO public.profiles (id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_reviews (id, user_id, display_name, city, rating, body, status)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Alex',
  'Atlanta',
  5,
  'Clear marketplace review with no contact details.',
  'PENDING'
);

DO $$
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM public.admin_set_platform_review_status(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'APPROVED',
      'Looks fine'
    );
    RAISE EXCEPTION 'anon was allowed to moderate';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

DO $$
BEGIN
  PERFORM set_config('test.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.admin_set_platform_review_status(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'APPROVED',
      'Looks fine'
    );
    RAISE EXCEPTION 'customer was allowed to moderate';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM ILIKE '%permission denied for function%' THEN
        RAISE EXCEPTION 'customer should fail inside the function, not on EXECUTE';
      END IF;
      IF SQLERRM NOT ILIKE '%not authorized%' THEN
        RAISE EXCEPTION 'unexpected customer denial: %', SQLERRM;
      END IF;
  END;
END $$;

DO $$
BEGIN
  PERFORM set_config('test.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  BEGIN
    PERFORM public.admin_set_platform_review_status(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'APPROVED',
      'no'
    );
    RAISE EXCEPTION 'short reason was accepted';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      NULL;
  END;

  PERFORM public.admin_set_platform_review_status(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'APPROVED',
    'Specific and on topic'
  );
END $$;

DO $$
DECLARE
  v_meta jsonb;
  v_action text;
BEGIN
  SELECT action, metadata INTO v_action, v_meta
  FROM public.audit_logs
  WHERE entity_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  IF v_action IS DISTINCT FROM 'platform_review.approved' THEN
    RAISE EXCEPTION 'expected platform_review.approved, got %', v_action;
  END IF;
  IF v_meta ->> 'reason' IS DISTINCT FROM 'Specific and on topic' THEN
    RAISE EXCEPTION 'reason was not stored';
  END IF;
  IF v_meta ? 'email' OR v_meta ? 'phone' THEN
    RAISE EXCEPTION 'audit metadata included contact fields';
  END IF;
  IF (SELECT status::text FROM public.platform_reviews WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')
     IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'status was not approved';
  END IF;
END $$;

DO $$
BEGIN
  PERFORM set_config('test.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  PERFORM public.admin_set_platform_review_status(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'REJECTED',
    'Spam and off topic'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE action = 'platform_review.rejected'
      AND metadata ->> 'reason' = 'Spam and off topic'
  ) THEN
    RAISE EXCEPTION 'reject was not audited';
  END IF;
END $$;

-- Existing direct update still works for an admin. This migration does not revoke it.
DO $$
BEGIN
  PERFORM set_config('test.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  UPDATE public.platform_reviews
  SET status = 'APPROVED'
  WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  IF (SELECT status::text FROM public.platform_reviews WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')
     IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'direct admin update stopped working';
  END IF;
END $$;

\echo admin_platform_review_moderation_ok
