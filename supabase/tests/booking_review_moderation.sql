-- Local proof for booking-review report, response, and hide. Not applied to production.
-- Run: sudo -u postgres psql -d booking_review_moderation -v ON_ERROR_STOP=1 -f supabase/tests/booking_review_moderation.sql

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  account_status text NOT NULL DEFAULT 'ACTIVE',
  account_type text NOT NULL DEFAULT 'CUSTOMER',
  signup_fee_status text NOT NULL DEFAULT 'NOT_REQUIRED',
  first_name text,
  last_name text
);

CREATE TABLE IF NOT EXISTS public.contractor_profiles (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles (id),
  approval_status text NOT NULL DEFAULT 'APPROVED',
  business_name text
);

CREATE TABLE IF NOT EXISTS public.booking_reviews (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  reviewer_role text NOT NULL,
  rating smallint NOT NULL,
  body text,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reviewer_role)
);

CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles (id),
  target_type text NOT NULL,
  target_id uuid,
  reason text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_reason_len CHECK (char_length(btrim(reason)) BETWEEN 3 AND 200)
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
  LIMIT 1
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

CREATE OR REPLACE FUNCTION public.text_contains_contact_info(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_text, '') ~* '(\+?1[\s.\-]?)?\(?[0-9]{3}\)?[\s.\-][0-9]{3}[\s.\-][0-9]{4}'
      OR coalesce(p_text, '') ~* '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}'
$$;

CREATE OR REPLACE FUNCTION public.contact_info_blocked_message()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Please keep communication on Priority Property Pros until you connect. Remove phone numbers, emails, links, social handles, QR codes, and exact street addresses.'
$$;

CREATE OR REPLACE FUNCTION public.signup_fee_enabled()
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT false
$$;

CREATE OR REPLACE FUNCTION public.public_review_body(
  p_body text,
  p_business_name text,
  p_first_name text,
  p_last_name text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_body IS NULL OR btrim(p_body) = '' OR public.text_contains_contact_info(p_body) THEN 'Verified PPP review.'
    ELSE btrim(p_body)
  END
$$;

CREATE OR REPLACE FUNCTION public.contractor_is_directory_listed(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT true
$$;

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

INSERT INTO public.profiles (id, account_type, first_name, last_name)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ADMIN', 'Ada', 'Admin'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CUSTOMER', 'Casey', 'Home'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'CONTRACTOR', 'Riley', 'Pro'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'CUSTOMER', 'Taylor', 'Other')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contractor_profiles (id, profile_id, business_name)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Northside Fence Co.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.booking_reviews (id, booking_id, customer_id, contractor_profile_id, reviewer_role, rating, body)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'a1111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'CUSTOMER',
    1,
    'The gate was left unfinished and the old posts stayed in the yard.'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'a2222222-2222-2222-2222-222222222222',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'CUSTOMER',
    5,
    'The fence line is straight and the yard was cleaned up the same day.'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'a1111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'CONTRACTOR',
    4,
    'The homeowner cleared the side yard before we arrived.'
  )
ON CONFLICT (id) DO NOTHING;

\ir ../migrations/20261019200002_booking_review_moderation.sql

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
REVOKE ALL ON TABLE public.content_reports FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_avg numeric;
  v_count integer;
BEGIN
  SELECT rating_average, rating_count INTO v_avg, v_count
  FROM public.contractor_public_ratings
  WHERE contractor_profile_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_count IS DISTINCT FROM 2 OR v_avg IS DISTINCT FROM 3.0 THEN
    RAISE EXCEPTION 'expected both verified reviews in the rating, got % / %', v_avg, v_count;
  END IF;
END $$;

DO $$
BEGIN
  PERFORM set_config('test.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  BEGIN
    PERFORM public.admin_hide_booking_review(
      '11111111-1111-1111-1111-111111111111',
      'The description names a gate that was not part of this job.'
    );
    RAISE EXCEPTION 'customer was allowed to hide a review';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT ILIKE '%not authorized%' THEN
        RAISE EXCEPTION 'unexpected customer denial: %', SQLERRM;
      END IF;
  END;
END $$;

DO $$
BEGIN
  PERFORM set_config('test.uid', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.admin_hide_booking_review(
      '11111111-1111-1111-1111-111111111111',
      'The description names a gate that was not part of this job.'
    );
    RAISE EXCEPTION 'anon was allowed to hide a review';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.admin_hide_booking_review(uuid,text)'::regprocedure);
  IF v_def ~* 'rating\s*[<>=]' THEN
    RAISE EXCEPTION 'hide function branches on the rating';
  END IF;
  IF v_def ILIKE '%DELETE FROM public.booking_reviews%' THEN
    RAISE EXCEPTION 'hide function deletes reviews';
  END IF;
END $$;

-- While PR #110's assert function is present and raising, hide must not change the row.
-- The read-only admin list stays available.
CREATE OR REPLACE FUNCTION public.assert_admin_sensitive_step_up()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin step-up required' USING ERRCODE = 'P0001';
END;
$$;

DO $$
BEGIN
  PERFORM set_config('test.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  IF public.admin_list_booking_reviews() IS NULL THEN
    RAISE EXCEPTION 'admin list failed while step-up was required';
  END IF;
  BEGIN
    PERFORM public.admin_hide_booking_review(
      '11111111-1111-1111-1111-111111111111',
      'The description names a gate that was not part of this job.'
    );
    RAISE EXCEPTION 'admin hide ran without step-up';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%admin step-up required%' THEN
        RAISE EXCEPTION 'unexpected step-up failure: %', SQLERRM;
      END IF;
  END;
  IF (SELECT hidden_at FROM public.booking_reviews WHERE id = '11111111-1111-1111-1111-111111111111') IS NOT NULL THEN
    RAISE EXCEPTION 'step-up failure hid the review';
  END IF;
END $$;

DROP FUNCTION public.assert_admin_sensitive_step_up();

DO $$
BEGIN
  PERFORM set_config('test.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  BEGIN
    PERFORM public.admin_hide_booking_review(
      '11111111-1111-1111-1111-111111111111',
      'just a poor one star score'
    );
    RAISE EXCEPTION 'rating-only reason was accepted';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT ILIKE '%cannot be hidden only because of its rating%' THEN
        RAISE EXCEPTION 'unexpected rating-only denial: %', SQLERRM;
      END IF;
  END;
  IF (SELECT hidden_at FROM public.booking_reviews WHERE id = '11111111-1111-1111-1111-111111111111') IS NOT NULL THEN
    RAISE EXCEPTION 'rating-only reason hid the review';
  END IF;
  IF (SELECT rating FROM public.booking_reviews WHERE id = '11111111-1111-1111-1111-111111111111') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'rating changed';
  END IF;
END $$;

DO $$
BEGIN
  PERFORM set_config('test.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  BEGIN
    PERFORM public.report_booking_review('11111111-1111-1111-1111-111111111111', 'This is my own review');
    RAISE EXCEPTION 'author was allowed to report';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT ILIKE '%only the other party%' THEN
        RAISE EXCEPTION 'unexpected author denial: %', SQLERRM;
      END IF;
  END;

  PERFORM set_config('test.uid', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', true);
  BEGIN
    PERFORM public.report_booking_review('11111111-1111-1111-1111-111111111111', 'I am not on this job');
    RAISE EXCEPTION 'third party was allowed to report';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT ILIKE '%only the other party%' THEN
        RAISE EXCEPTION 'unexpected third-party denial: %', SQLERRM;
      END IF;
  END;

  PERFORM set_config('test.uid', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);
  PERFORM public.report_booking_review(
    '11111111-1111-1111-1111-111111111111',
    'The gate in the review was not on this job.'
  );
  BEGIN
    PERFORM public.report_booking_review(
      '11111111-1111-1111-1111-111111111111',
      'The gate in the review was not on this job.'
    );
    RAISE EXCEPTION 'duplicate report was accepted';
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM NOT ILIKE '%already reported%' THEN
        RAISE EXCEPTION 'unexpected duplicate denial: %', SQLERRM;
      END IF;
  END;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE action = 'booking_review.reported'
      AND entity_id = '11111111-1111-1111-1111-111111111111'
  ) THEN
    RAISE EXCEPTION 'report was not audited';
  END IF;
  IF (SELECT hidden_at FROM public.booking_reviews WHERE id = '11111111-1111-1111-1111-111111111111') IS NOT NULL THEN
    RAISE EXCEPTION 'reporting hid the review';
  END IF;
  IF (SELECT count(*) FROM public.booking_reviews) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'reporting deleted a review';
  END IF;
END $$;

DO $$
BEGIN
  PERFORM set_config('test.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  BEGIN
    PERFORM public.submit_booking_review_response(
      '11111111-1111-1111-1111-111111111111',
      'We finished the remaining gate hardware the next morning.'
    );
    RAISE EXCEPTION 'customer was allowed to respond';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM NOT ILIKE '%only the contractor%' THEN
        RAISE EXCEPTION 'unexpected customer response denial: %', SQLERRM;
      END IF;
  END;

  PERFORM set_config('test.uid', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);
  BEGIN
    PERFORM public.submit_booking_review_response(
      '11111111-1111-1111-1111-111111111111',
      'Call me at 512-555-0199 and I will explain the gate.'
    );
    RAISE EXCEPTION 'phone number was accepted in a response';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT ILIKE '%phone numbers%' THEN
        RAISE EXCEPTION 'unexpected contact denial: %', SQLERRM;
      END IF;
  END;
  IF (SELECT contractor_response FROM public.booking_reviews WHERE id = '11111111-1111-1111-1111-111111111111') IS NOT NULL THEN
    RAISE EXCEPTION 'rejected response was stored';
  END IF;

  PERFORM public.submit_booking_review_response(
    '11111111-1111-1111-1111-111111111111',
    'We finished the remaining gate hardware the next morning.'
  );
  BEGIN
    PERFORM public.submit_booking_review_response(
      '11111111-1111-1111-1111-111111111111',
      'We finished the remaining gate hardware the next morning.'
    );
    RAISE EXCEPTION 'a second response was accepted';
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM NOT ILIKE '%already posted%' THEN
        RAISE EXCEPTION 'unexpected second-response denial: %', SQLERRM;
      END IF;
  END;
END $$;

DO $$
DECLARE
  v_public text;
BEGIN
  SELECT contractor_response INTO v_public
  FROM public.contractor_public_reviews
  WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_public IS DISTINCT FROM 'We finished the remaining gate hardware the next morning.' THEN
    RAISE EXCEPTION 'public response missing, got %', v_public;
  END IF;
  IF (SELECT rating FROM public.booking_reviews WHERE id = '11111111-1111-1111-1111-111111111111') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'response changed the rating';
  END IF;
END $$;

DO $$
DECLARE
  v_avg numeric;
  v_count integer;
BEGIN
  PERFORM set_config('test.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  PERFORM public.admin_hide_booking_review_response(
    '11111111-1111-1111-1111-111111111111',
    'The response names a gate that was not part of the written scope.'
  );
  IF (SELECT contractor_response FROM public.contractor_public_reviews WHERE id = '11111111-1111-1111-1111-111111111111') IS NOT NULL THEN
    RAISE EXCEPTION 'hidden response stayed public';
  END IF;
  IF (SELECT contractor_response FROM public.booking_reviews WHERE id = '11111111-1111-1111-1111-111111111111')
     IS DISTINCT FROM 'We finished the remaining gate hardware the next morning.' THEN
    RAISE EXCEPTION 'hiding the response deleted its text';
  END IF;
  SELECT rating_average, rating_count INTO v_avg, v_count
  FROM public.contractor_public_ratings
  WHERE contractor_profile_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_count IS DISTINCT FROM 2 OR v_avg IS DISTINCT FROM 3.0 THEN
    RAISE EXCEPTION 'hiding a response changed the rating, got % / %', v_avg, v_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs WHERE action = 'booking_review.response_hidden'
  ) THEN
    RAISE EXCEPTION 'response hide was not audited';
  END IF;
END $$;

DO $$
DECLARE
  v_avg numeric;
  v_count integer;
  v_rows integer;
BEGIN
  PERFORM set_config('test.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  PERFORM public.admin_hide_booking_review(
    '11111111-1111-1111-1111-111111111111',
    'The description names a gate that was not part of this job.'
  );
  SELECT rating_average, rating_count INTO v_avg, v_count
  FROM public.contractor_public_ratings
  WHERE contractor_profile_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_count IS DISTINCT FROM 1 OR v_avg IS DISTINCT FROM 5.0 THEN
    RAISE EXCEPTION 'hidden review still affects the rating, got % / %', v_avg, v_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.contractor_public_reviews WHERE id = '11111111-1111-1111-1111-111111111111'
  ) THEN
    RAISE EXCEPTION 'hidden review stayed on the public profile';
  END IF;
  IF (SELECT rating FROM public.booking_reviews WHERE id = '11111111-1111-1111-1111-111111111111') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'hide changed the rating';
  END IF;
  SELECT count(*) INTO v_rows FROM public.booking_reviews;
  IF v_rows IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'hide deleted a review, count %', v_rows;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE action = 'booking_review.hidden'
      AND metadata ->> 'reason' = 'The description names a gate that was not part of this job.'
  ) THEN
    RAISE EXCEPTION 'hide was not audited';
  END IF;
END $$;

DO $$
DECLARE
  v_seen integer;
  v_list jsonb;
  v_keys text[];
BEGIN
  PERFORM set_config('test.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_seen
  FROM public.booking_reviews
  WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_seen IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'customer lost the hidden review';
  END IF;
  RESET ROLE;

  PERFORM set_config('test.uid', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_seen
  FROM public.booking_reviews
  WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_seen IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'contractor lost the hidden review';
  END IF;
  RESET ROLE;

  PERFORM set_config('test.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  v_list := public.admin_list_booking_reviews();
  SELECT array_agg(DISTINCT key) INTO v_keys
  FROM jsonb_array_elements(v_list) item, jsonb_object_keys(item) key;
  IF v_keys && ARRAY['business_name', 'email', 'phone', 'first_name', 'last_name'] THEN
    RAISE EXCEPTION 'admin list included a private field: %', v_keys;
  END IF;
  IF v_list::text ILIKE '%Northside Fence Co.%' THEN
    RAISE EXCEPTION 'admin list included the business name';
  END IF;
END $$;

DO $$
DECLARE
  v_seen integer;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_seen
  FROM public.contractor_public_reviews
  WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_seen IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'anon still sees the hidden review';
  END IF;
  SELECT count(*) INTO v_seen
  FROM public.contractor_public_reviews
  WHERE id = '22222222-2222-2222-2222-222222222222';
  IF v_seen IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'anon lost the visible review';
  END IF;
  SELECT count(*) INTO v_seen
  FROM public.list_public_directory_reviews('dddddddd-dddd-dddd-dddd-dddddddddddd')
  WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_seen IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'public directory RPC still returns the hidden review';
  END IF;
  BEGIN
    PERFORM count(*) FROM public.booking_reviews;
    RAISE EXCEPTION 'anon could read booking_reviews';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

\echo booking_review_moderation_ok
