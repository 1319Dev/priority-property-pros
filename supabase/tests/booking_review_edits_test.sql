-- Local regression for author-visible booking review edits.
-- Empty database only. Does not change a shared or production database.
--
--   createdb booking_review_edits
--   psql -d booking_review_edits -v ON_ERROR_STOP=1 -f supabase/tests/booking_review_edits_test.sql

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

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  account_type text NOT NULL,
  account_status text NOT NULL,
  signup_fee_status text NOT NULL DEFAULT 'NOT_REQUIRED'
);

CREATE TABLE public.contractor_profiles (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles (id),
  approval_status text NOT NULL
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  status text NOT NULL,
  customer_hired_at timestamptz,
  contractor_hired_at timestamptz
);

CREATE TABLE public.booking_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  rating smallint NOT NULL,
  body text,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewer_role text NOT NULL DEFAULT 'CUSTOMER',
  CONSTRAINT booking_reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT booking_reviews_reviewer_role_check CHECK (reviewer_role IN ('CUSTOMER', 'CONTRACTOR')),
  CONSTRAINT booking_reviews_one_per_role UNIQUE (booking_id, reviewer_role)
);

CREATE TABLE public.booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
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

CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value_int integer,
  value_text text,
  description text
);

CREATE OR REPLACE FUNCTION public.signup_fee_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'signup_fee_enabled'), 0) <> 0;
$$;

CREATE OR REPLACE FUNCTION public.assert_signup_fee_paid(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.signup_fee_enabled() THEN
    RAISE EXCEPTION 'signup fee unpaid';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
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

CREATE OR REPLACE FUNCTION public.write_booking_event(
  p_booking_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.booking_events (booking_id, actor_id, event_type, payload)
  VALUES (p_booking_id, auth.uid(), p_event_type, coalesce(p_payload, '{}'::jsonb));
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

-- Production contact filter used by contractor_public_reviews (read-time, not a reject trigger).
CREATE OR REPLACE FUNCTION public.text_contains_contact_info(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN false
    WHEN p_text ~* '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}' THEN true
    WHEN p_text ~* '(https?://|www\.)' THEN true
    WHEN p_text ~* '(instagram|facebook|tiktok|twitter|linkedin|snapchat|whatsapp|telegram|threads\.net|x\.com)' THEN true
    WHEN p_text ~* '(^|[^[:alnum:]])@[A-Za-z][A-Za-z0-9._]{2,}' THEN true
    WHEN p_text ~* '(\+?1[\s.\-]?)?\(?[0-9]{3}\)?[\s.\-][0-9]{3}[\s.\-][0-9]{4}' THEN true
    WHEN p_text ~* 'tel:\+?[0-9]{7,}' THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.text_contains_pre_hire_contact(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN false
    WHEN public.text_contains_contact_info(p_text) THEN true
    WHEN p_text ~* '[A-Za-z0-9.-]+\.(com|net|org|io|co|us|biz|info|app)(/|\y)' THEN true
    WHEN p_text ~ '[^0-9][0-9]{10}([^0-9]|$)' OR p_text ~ '^[0-9]{10}([^0-9]|$)' THEN true
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.text_contains_pre_hire_contact(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.text_contains_pre_hire_contact(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.text_contains_contact_info(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_fee_enabled() TO anon, authenticated;
GRANT SELECT ON TABLE public.platform_settings TO anon, authenticated;

-- Current public views (security_invoker false). The edit migration must not replace these.
CREATE OR REPLACE VIEW public.contractor_public_ratings
WITH (security_invoker = false)
AS
SELECT
  r.contractor_profile_id,
  round(avg(r.rating)::numeric, 1) AS rating_average,
  count(*)::integer AS rating_count
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'))
GROUP BY r.contractor_profile_id;

CREATE OR REPLACE VIEW public.contractor_public_reviews
WITH (security_invoker = false)
AS
SELECT
  r.id,
  r.contractor_profile_id,
  r.rating,
  CASE
    WHEN r.body IS NULL OR btrim(r.body) = '' OR public.text_contains_pre_hire_contact(r.body)
      THEN 'Verified PPP review.'
    WHEN char_length(regexp_replace(btrim(r.body), '\s+', ' ', 'g')) > 280
      THEN left(regexp_replace(btrim(r.body), '\s+', ' ', 'g'), 277) || '…'
    ELSE regexp_replace(btrim(r.body), '\s+', ' ', 'g')
  END AS body
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

CREATE OR REPLACE FUNCTION public.protect_review_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'reviews cannot be deleted from the client';
    END IF;
    RETURN OLD;
  END IF;
  IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'reviews cannot be written from the client';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_reviews_protect_row ON public.booking_reviews;
CREATE TRIGGER booking_reviews_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.booking_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_review_row();

ALTER TABLE public.booking_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_reviews_select_participants ON public.booking_reviews;
CREATE POLICY booking_reviews_select_participants
  ON public.booking_reviews FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

REVOKE ALL ON TABLE public.booking_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.booking_reviews TO authenticated;
GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;
GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_contractor_profile_id() TO authenticated;

INSERT INTO public.profiles (id, account_type, account_status, signup_fee_status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'CUSTOMER', 'ACTIVE', 'NOT_REQUIRED'),
  ('22222222-2222-4222-8222-222222222222', 'CONTRACTOR', 'ACTIVE', 'NOT_REQUIRED'),
  ('33333333-3333-4333-8333-333333333333', 'CUSTOMER', 'ACTIVE', 'NOT_REQUIRED');

INSERT INTO public.contractor_profiles (id, profile_id, approval_status) VALUES
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'APPROVED');

INSERT INTO public.bookings (id, customer_id, contractor_profile_id, status, customer_hired_at, contractor_hired_at) VALUES
  (
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444',
    'IN_PROGRESS',
    now(),
    now()
  );

INSERT INTO public.booking_reviews (
  id, booking_id, customer_id, contractor_profile_id, rating, body, is_verified, reviewer_role, created_at
) VALUES (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  4,
  'Finished the fence.',
  true,
  'CUSTOMER',
  now()
);

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

CREATE OR REPLACE FUNCTION public.test_review_body(p_role text, p_uid uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_body text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid)::text END,
    true
  );
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  SELECT r.body INTO v_body
  FROM public.booking_reviews r
  WHERE r.id = '66666666-6666-4666-8666-666666666666';
  RESET ROLE;
  RETURN v_body;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'ERR:' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_public_body()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_body text;
BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT body INTO v_body
  FROM public.contractor_public_reviews
  WHERE id = '66666666-6666-4666-8666-666666666666';
  RESET ROLE;
  RETURN v_body;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'ERR:' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_public_rating()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_avg numeric;
  v_count integer;
BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT rating_average, rating_count INTO v_avg, v_count
  FROM public.contractor_public_ratings
  WHERE contractor_profile_id = '44444444-4444-4444-8444-444444444444';
  RESET ROLE;
  RETURN coalesce(v_avg::text, 'null') || '/' || coalesce(v_count::text, 'null');
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'ERR:' || SQLERRM;
END;
$$;

CREATE TEMP TABLE test_viewdef_before AS
SELECT c.relname, pg_get_viewdef(c.oid, true) AS def
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('contractor_public_ratings', 'contractor_public_reviews');

CREATE TEMP TABLE test_policy_before AS
SELECT policyname, permissive, roles::text AS roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'booking_reviews';

\ir ../migrations/20261013000003_booking_review_edits.sql

DO $$
DECLARE
  msg text;
  v_rating smallint;
  v_verified boolean;
  v_edited timestamptz;
  v_updated timestamptz;
  v_created timestamptz;
  v_meta jsonb;
  v_count integer;
BEGIN
  IF (SELECT value_int FROM public.platform_settings WHERE key = 'booking_review_edit_window_days') IS DISTINCT FROM 30 THEN
    PERFORM public.test_fail('edit window setting is not 30');
  END IF;

  SELECT created_at, updated_at, edited_at INTO v_created, v_updated, v_edited
  FROM public.booking_reviews
  WHERE id = '66666666-6666-4666-8666-666666666666';
  IF v_edited IS NOT NULL OR v_updated IS DISTINCT FROM v_created THEN
    PERFORM public.test_fail('backfill changed edit metadata');
  END IF;
  IF (SELECT body FROM public.booking_reviews WHERE id = '66666666-6666-4666-8666-666666666666') IS DISTINCT FROM 'Finished the fence.'
     OR (SELECT rating FROM public.booking_reviews WHERE id = '66666666-6666-4666-8666-666666666666') IS DISTINCT FROM 4 THEN
    PERFORM public.test_fail('migration changed review content');
  END IF;

  IF public.test_review_body('authenticated', '11111111-1111-4111-8111-111111111111') IS DISTINCT FROM 'Finished the fence.' THEN
    PERFORM public.test_fail('author cannot see own review body: ' || coalesce(public.test_review_body('authenticated', '11111111-1111-4111-8111-111111111111'), 'null'));
  END IF;

  IF public.test_review_body('authenticated', '33333333-3333-4333-8333-333333333333') IS NOT NULL THEN
    PERFORM public.test_fail('stranger can see the review');
  END IF;

  msg := public.test_review_body('anon', NULL);
  IF msg NOT ILIKE 'ERR:%permission denied%' THEN
    PERFORM public.test_fail('anon table read: ' || coalesce(msg, 'null'));
  END IF;

  IF public.test_public_body() IS DISTINCT FROM 'Finished the fence.' THEN
    PERFORM public.test_fail('anon public review before edit: ' || coalesce(public.test_public_body(), 'null'));
  END IF;
  IF public.test_public_rating() IS DISTINCT FROM '4.0/1' THEN
    PERFORM public.test_fail('anon rating before edit: ' || public.test_public_rating());
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    '22222222-2222-4222-8222-222222222222',
    $sql$SELECT public.update_booking_review('55555555-5555-4555-8555-555555555555', 1, 'not my review')$sql$
  );
  IF msg NOT ILIKE '%you have not reviewed this booking%' THEN
    PERFORM public.test_fail('other party edit: ' || msg);
  END IF;
  IF (SELECT rating FROM public.booking_reviews WHERE id = '66666666-6666-4666-8666-666666666666') IS DISTINCT FROM 4 THEN
    PERFORM public.test_fail('other party changed the rating');
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    '33333333-3333-4333-8333-333333333333',
    $sql$SELECT public.update_booking_review('55555555-5555-4555-8555-555555555555', 1, 'nope')$sql$
  );
  IF msg NOT ILIKE '%only booking participants can review after mutual hire%' THEN
    PERFORM public.test_fail('stranger edit: ' || msg);
  END IF;

  msg := public.test_exec_message(
    'anon',
    NULL,
    $sql$SELECT public.update_booking_review('55555555-5555-4555-8555-555555555555', 1, 'nope')$sql$
  );
  IF msg NOT ILIKE '%permission denied%' THEN
    PERFORM public.test_fail('anon execute: ' || msg);
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    '11111111-1111-4111-8111-111111111111',
    $sql$UPDATE public.booking_reviews SET rating = 1 WHERE id = '66666666-6666-4666-8666-666666666666'$sql$
  );
  IF msg NOT ILIKE '%permission denied%' AND msg NOT ILIKE '%reviews cannot be written from the client%' THEN
    PERFORM public.test_fail('direct update: ' || msg);
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    '11111111-1111-4111-8111-111111111111',
    $sql$SELECT public.update_booking_review('55555555-5555-4555-8555-555555555555', 9, 'too high')$sql$
  );
  IF msg NOT ILIKE '%rating must be 1 through 5%' THEN
    PERFORM public.test_fail('rating range: ' || msg);
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    '11111111-1111-4111-8111-111111111111',
    $sql$SELECT public.update_booking_review('55555555-5555-4555-8555-555555555555', 2, 'Finished the fence, a day late.')$sql$
  );
  IF msg IS DISTINCT FROM 'ok' THEN
    PERFORM public.test_fail('author edit: ' || msg);
  END IF;

  SELECT rating, is_verified, edited_at INTO v_rating, v_verified, v_edited
  FROM public.booking_reviews
  WHERE id = '66666666-6666-4666-8666-666666666666';
  IF v_rating IS DISTINCT FROM 2 OR v_verified IS DISTINCT FROM true OR v_edited IS NULL THEN
    PERFORM public.test_fail('edit did not store rating, verified, and edited_at');
  END IF;
  IF public.test_review_body('authenticated', '11111111-1111-4111-8111-111111111111') IS DISTINCT FROM 'Finished the fence, a day late.' THEN
    PERFORM public.test_fail('author cannot see edited body');
  END IF;
  IF public.test_public_rating() IS DISTINCT FROM '2.0/1' THEN
    PERFORM public.test_fail('aggregate after edit: ' || public.test_public_rating());
  END IF;

  SELECT metadata INTO v_meta
  FROM public.audit_logs
  WHERE action = 'review.edited' AND entity_id = '66666666-6666-4666-8666-666666666666';
  IF v_meta IS NULL
     OR (v_meta ->> 'old_rating') IS DISTINCT FROM '4'
     OR (v_meta ->> 'new_rating') IS DISTINCT FROM '2'
     OR (v_meta ->> 'old_body') IS DISTINCT FROM 'Finished the fence.'
     OR (v_meta ->> 'new_body') IS DISTINCT FROM 'Finished the fence, a day late.' THEN
    PERFORM public.test_fail('audit log missing old and new rating/text');
  END IF;

  msg := public.test_exec_message(
    'authenticated',
    '11111111-1111-4111-8111-111111111111',
    $sql$SELECT public.update_booking_review('55555555-5555-4555-8555-555555555555', 2, 'Call me at 404-555-0199')$sql$
  );
  IF msg IS DISTINCT FROM 'ok' THEN
    PERFORM public.test_fail('contact edit: ' || msg);
  END IF;
  IF public.test_public_body() IS DISTINCT FROM 'Verified PPP review.' THEN
    PERFORM public.test_fail('public filter after edit: ' || coalesce(public.test_public_body(), 'null'));
  END IF;
  IF public.test_review_body('authenticated', '11111111-1111-4111-8111-111111111111') IS DISTINCT FROM 'Call me at 404-555-0199' THEN
    PERFORM public.test_fail('author should still see their own unredacted edit');
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('ppp.rpc', '', true);

  BEGIN
    INSERT INTO public.booking_reviews (
      booking_id, customer_id, contractor_profile_id, rating, body, is_verified, reviewer_role
    ) VALUES (
      '55555555-5555-4555-8555-555555555555',
      '11111111-1111-4111-8111-111111111111',
      '44444444-4444-4444-8444-444444444444',
      5,
      'second',
      true,
      'CUSTOMER'
    );
    PERFORM public.test_fail('duplicate customer review was inserted');
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  SELECT count(*) INTO v_count FROM public.booking_reviews
  WHERE booking_id = '55555555-5555-4555-8555-555555555555' AND reviewer_role = 'CUSTOMER';
  IF v_count IS DISTINCT FROM 1 THEN
    PERFORM public.test_fail('customer review count ' || v_count::text);
  END IF;

  INSERT INTO public.booking_reviews (
    id, booking_id, customer_id, contractor_profile_id, rating, body, is_verified, reviewer_role
  ) VALUES (
    '77777777-7777-4777-8777-777777777777',
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    '44444444-4444-4444-8444-444444444444',
    1,
    'Late start.',
    true,
    'CONTRACTOR'
  );
  IF public.test_public_rating() IS DISTINCT FROM '2.0/1' THEN
    PERFORM public.test_fail('contractor review changed the public aggregate: ' || public.test_public_rating());
  END IF;

  UPDATE public.booking_reviews
  SET created_at = now() - interval '40 days'
  WHERE id = '66666666-6666-4666-8666-666666666666';
  msg := public.test_exec_message(
    'authenticated',
    '11111111-1111-4111-8111-111111111111',
    $sql$SELECT public.update_booking_review('55555555-5555-4555-8555-555555555555', 3, 'too late')$sql$
  );
  IF msg NOT ILIKE '%the review edit window has closed%' THEN
    PERFORM public.test_fail('closed window: ' || msg);
  END IF;

  UPDATE public.platform_settings SET value_int = -1 WHERE key = 'booking_review_edit_window_days';
  msg := public.test_exec_message(
    'authenticated',
    '11111111-1111-4111-8111-111111111111',
    $sql$SELECT public.update_booking_review('55555555-5555-4555-8555-555555555555', 3, 'still editable when unlimited')$sql$
  );
  IF msg IS DISTINCT FROM 'ok' THEN
    PERFORM public.test_fail('unlimited window: ' || msg);
  END IF;
  IF public.test_public_rating() IS DISTINCT FROM '3.0/1' THEN
    PERFORM public.test_fail('aggregate after unlimited edit: ' || public.test_public_rating());
  END IF;

  IF EXISTS (
    SELECT relname, def FROM test_viewdef_before
    EXCEPT
    SELECT c.relname, pg_get_viewdef(c.oid, true)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('contractor_public_ratings', 'contractor_public_reviews')
  ) THEN
    PERFORM public.test_fail('public view definition changed');
  END IF;

  IF EXISTS (
    SELECT policyname, permissive, roles, cmd, qual, with_check FROM test_policy_before
    EXCEPT
    SELECT policyname, permissive, roles::text, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_reviews'
  ) THEN
    PERFORM public.test_fail('booking_reviews RLS changed');
  END IF;

  IF has_function_privilege('anon', 'public.update_booking_review(uuid, integer, text)', 'EXECUTE') THEN
    PERFORM public.test_fail('anon can execute update_booking_review');
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.update_booking_review(uuid, integer, text)', 'EXECUTE') THEN
    PERFORM public.test_fail('authenticated cannot execute update_booking_review');
  END IF;

  RAISE NOTICE 'PASS: author edit, filter, duplicate, aggregate, anon views';
END
$$;

\ir ../rollbacks/20261013000003_booking_review_edits_rollback.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_booking_review'
  ) THEN
    PERFORM public.test_fail('rollback left update_booking_review');
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'booking_reviews'
      AND column_name IN ('updated_at', 'edited_at')
  ) THEN
    PERFORM public.test_fail('rollback left edit columns');
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'booking_review_edit_window_days') THEN
    PERFORM public.test_fail('rollback left the edit window setting');
  END IF;
  IF (SELECT body FROM public.booking_reviews WHERE id = '66666666-6666-4666-8666-666666666666') IS NULL THEN
    PERFORM public.test_fail('rollback deleted the review');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_reviews_one_per_role'
  ) THEN
    PERFORM public.test_fail('rollback dropped the unique constraint');
  END IF;
  RAISE NOTICE 'PASS: rollback restored the prior review table';
END
$$;

\ir ../migrations/20261013000003_booking_review_edits.sql

SELECT 'booking_review_edits_test: all assertions passed' AS result;
