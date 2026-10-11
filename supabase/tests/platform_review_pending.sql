-- Local proof for pending platform reviews. Not applied to production.
-- Run: sudo -u postgres psql -d platform_review_pending -v ON_ERROR_STOP=1 -f supabase/tests/platform_review_pending.sql

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

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_review_status') THEN
    CREATE TYPE public.platform_review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  signup_fee_status text NOT NULL DEFAULT 'UNPAID'
);

CREATE TABLE IF NOT EXISTS public.platform_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  city text,
  rating smallint NOT NULL,
  body text NOT NULL,
  status public.platform_review_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT platform_reviews_body_len CHECK (char_length(btrim(body)) BETWEEN 20 AND 1000),
  CONSTRAINT platform_reviews_one_per_user UNIQUE (user_id)
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

CREATE OR REPLACE FUNCTION public.text_contains_contact_info(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_text, '') ~* '(512-555-0199|@example\.com|https?://)'
$$;

CREATE OR REPLACE FUNCTION public.contact_info_blocked_message()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Please keep phone numbers, emails, and links out of platform reviews.'
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

INSERT INTO public.profiles (id, signup_fee_status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'NOT_REQUIRED'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PAID'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'UNPAID')
ON CONFLICT (id) DO UPDATE SET signup_fee_status = EXCLUDED.signup_fee_status;

-- A review that was already approved before this migration. The migration must leave it.
INSERT INTO public.platform_reviews (id, user_id, display_name, city, rating, body, status)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Existing',
  'Conroe',
  5,
  'This approved review was already on the site.',
  'APPROVED'
);

\ir ../migrations/20261019200001_platform_reviews_pending_activation.sql

ALTER TABLE public.platform_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_reviews_select_approved ON public.platform_reviews;
CREATE POLICY platform_reviews_select_approved
  ON public.platform_reviews
  FOR SELECT
  TO anon, authenticated
  USING (status = 'APPROVED');

DROP POLICY IF EXISTS platform_reviews_select_own ON public.platform_reviews;
CREATE POLICY platform_reviews_select_own
  ON public.platform_reviews
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS platform_reviews_select_admin ON public.platform_reviews;
CREATE POLICY platform_reviews_select_admin
  ON public.platform_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS platform_reviews_insert_own ON public.platform_reviews;
CREATE POLICY platform_reviews_insert_own
  ON public.platform_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT SELECT ON public.platform_reviews TO anon, authenticated;
GRANT INSERT ON public.platform_reviews TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_review_status(uuid, text, text) TO authenticated;

DO $$
BEGIN
  IF (SELECT status::text FROM public.platform_reviews WHERE id = '11111111-1111-4111-8111-111111111111')
     IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'existing approved review was changed';
  END IF;
END $$;

-- Unpaid account cannot submit.
DO $$
BEGIN
  PERFORM set_config('test.uid', 'dddddddd-dddd-dddd-dddd-dddddddddddd', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.platform_reviews (user_id, display_name, city, rating, body)
    VALUES (
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      'Unpaid',
      'Conroe',
      5,
      'An unpaid account should not publish a marketplace review.'
    );
    RAISE EXCEPTION 'unpaid account was allowed to submit';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT ILIKE '%account activation is required%' THEN
        RAISE EXCEPTION 'unexpected unpaid denial: %', SQLERRM;
      END IF;
  END;
END $$;

-- Activated account submits PENDING, not APPROVED.
DO $$
DECLARE
  v_status text;
BEGIN
  PERFORM set_config('test.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.platform_reviews (id, user_id, display_name, city, rating, body, status)
  VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Jordan',
    'Decatur',
    4,
    'The marketplace was easy to follow from posting to hiring.',
    'APPROVED'
  );
  SELECT status::text INTO v_status
  FROM public.platform_reviews
  WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  IF v_status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'new review was %, expected PENDING', v_status;
  END IF;
END $$;

-- Pending is not public. The older approved row still is.
DO $$
DECLARE
  n_pending integer;
  n_approved integer;
BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO n_pending FROM public.platform_reviews WHERE status = 'PENDING';
  SELECT count(*) INTO n_approved FROM public.platform_reviews WHERE status = 'APPROVED';
  IF n_pending <> 0 THEN
    RAISE EXCEPTION 'anon saw % pending reviews', n_pending;
  END IF;
  IF n_approved <> 1 THEN
    RAISE EXCEPTION 'anon saw % approved reviews, expected 1', n_approved;
  END IF;
END $$;

-- Non-admin cannot moderate.
DO $$
BEGIN
  PERFORM set_config('test.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.admin_set_platform_review_status(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'APPROVED',
      'Looks fine to me'
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
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM public.admin_set_platform_review_status(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'REJECTED',
      'Spam and off topic'
    );
    RAISE EXCEPTION 'anon was allowed to moderate';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

-- Direct status update is denied, including for an admin session.
DO $$
BEGIN
  PERFORM set_config('test.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.platform_reviews
    SET status = 'REJECTED'
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    RAISE EXCEPTION 'direct status update was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

-- Reject without a usable reason fails. Reject with a reason is audited.
DO $$
BEGIN
  PERFORM set_config('test.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  BEGIN
    PERFORM public.admin_set_platform_review_status(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'REJECTED',
      'no'
    );
    RAISE EXCEPTION 'short reject reason was accepted';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      NULL;
  END;

  PERFORM public.admin_set_platform_review_status(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'REJECTED',
    'Spam and off topic'
  );
END $$;

DO $$
DECLARE
  v_action text;
  v_reason text;
BEGIN
  SELECT action, metadata ->> 'reason' INTO v_action, v_reason
  FROM public.audit_logs
  WHERE entity_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    AND action = 'platform_review.rejected';
  IF v_action IS NULL THEN
    RAISE EXCEPTION 'reject was not audited';
  END IF;
  IF v_reason IS DISTINCT FROM 'Spam and off topic' THEN
    RAISE EXCEPTION 'reject reason was not stored';
  END IF;
  IF (SELECT status::text FROM public.platform_reviews WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')
     IS DISTINCT FROM 'REJECTED' THEN
    RAISE EXCEPTION 'review was not rejected';
  END IF;
  IF (SELECT status::text FROM public.platform_reviews WHERE id = '11111111-1111-4111-8111-111111111111')
     IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'reject changed an unrelated approved review';
  END IF;
END $$;

-- Rejected stays off the public select.
DO $$
DECLARE
  n integer;
BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO n
  FROM public.platform_reviews
  WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  IF n <> 0 THEN
    RAISE EXCEPTION 'anon can see a rejected review';
  END IF;
END $$;

\echo platform_review_pending_ok
