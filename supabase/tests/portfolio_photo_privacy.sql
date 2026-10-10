-- Portfolio photo privacy checks. Raises on failure.
-- Run after portfolio_photo_privacy_bootstrap.sql and
-- 20261010001728_portfolio_photo_privacy.sql. Each case uses
-- SET LOCAL ROLE and request.jwt.claims, then rolls back.

-- Fixed ids (also used as storage folder names).
-- owner     aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
-- stranger  bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
-- admin     cccccccc-cccc-4ccc-8ccc-cccccccccccc
-- pending   dddddddd-dddd-4ddd-8ddd-dddddddddddd
-- inactive  eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee

DELETE FROM public.audit_logs
WHERE entity_id IN (
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999'
);
DELETE FROM public.contractor_portfolio
WHERE id IN (
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999'
);
DELETE FROM storage.objects
WHERE bucket_id = 'contractor-docs'
  AND name IN (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/safe.jpg',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/review.jpg',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/private.jpg',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/credentials/license.pdf',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd/portfolio/unapproved.jpg',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/portfolio/inactive.jpg'
  );
DELETE FROM public.contractor_profiles
WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);
DELETE FROM public.profiles
WHERE id IN (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
);

INSERT INTO public.profiles (id, email, first_name, last_name, account_type, account_status)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner@example.com', 'Ada', 'Owner', 'CONTRACTOR', 'ACTIVE'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'stranger@example.com', 'Bea', 'Stranger', 'CUSTOMER', 'ACTIVE'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'admin@example.com', 'Cam', 'Admin', 'ADMIN', 'ACTIVE'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'pending@example.com', 'Dee', 'Pending', 'CONTRACTOR', 'ACTIVE'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'inactive@example.com', 'Eve', 'Inactive', 'CONTRACTOR', 'SUSPENDED');

INSERT INTO public.contractor_profiles (id, profile_id, business_name, approval_status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Cedar Works', 'APPROVED'),
  ('22222222-2222-4222-8222-222222222222', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Pending Porch', 'PENDING'),
  ('33333333-3333-4333-8333-333333333333', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Inactive Patio', 'APPROVED');

INSERT INTO public.contractor_portfolio (
  id, contractor_profile_id, title, description, storage_path, privacy_state, sort_order
)
VALUES
  (
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'Cedar panel',
    'Replaced a broken panel',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/safe.jpg',
    'PUBLIC_SAFE',
    0
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    'Driveway before review',
    'Not screened yet',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/review.jpg',
    'REVIEW_REQUIRED',
    1
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '11111111-1111-4111-8111-111111111111',
    'Hidden gate',
    'Owner only',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/private.jpg',
    'PRIVATE',
    2
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    '22222222-2222-4222-8222-222222222222',
    'Unapproved porch',
    'Pending contractor',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd/portfolio/unapproved.jpg',
    'PUBLIC_SAFE',
    0
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    '33333333-3333-4333-8333-333333333333',
    'Inactive patio',
    'Suspended account',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/portfolio/inactive.jpg',
    'PUBLIC_SAFE',
    0
  ),
  (
    '99999999-9999-4999-8999-999999999999',
    '11111111-1111-4111-8111-111111111111',
    'Cedar panel contact placeholder',
    'Clean description',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/contact.jpg',
    'PUBLIC_SAFE',
    3
  );

-- A legacy PUBLIC_SAFE caption can still contain contact text if it was stored
-- before the pre-hire trigger. The public view must keep hiding it.
ALTER TABLE public.contractor_portfolio DISABLE TRIGGER trg_reject_pre_hire_contact_portfolio;
UPDATE public.contractor_portfolio
SET title = 'Email me at secret@example.com'
WHERE id = '99999999-9999-4999-8999-999999999999';
ALTER TABLE public.contractor_portfolio ENABLE TRIGGER trg_reject_pre_hire_contact_portfolio;

INSERT INTO storage.objects (bucket_id, name)
VALUES
  ('contractor-docs', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/safe.jpg'),
  ('contractor-docs', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/review.jpg'),
  ('contractor-docs', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/private.jpg'),
  ('contractor-docs', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/credentials/license.pdf'),
  ('contractor-docs', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd/portfolio/unapproved.jpg'),
  ('contractor-docs', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/portfolio/inactive.jpg');

-- 1. A contractor cannot insert PUBLIC_SAFE. The row is stored as REVIEW_REQUIRED.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
INSERT INTO public.contractor_portfolio (contractor_profile_id, title, storage_path, privacy_state)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Forced photo',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/forced.jpg',
  'PUBLIC_SAFE'
);
INSERT INTO public.contractor_portfolio (contractor_profile_id, title, storage_path)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Default photo',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/default.jpg'
);
DO $$
DECLARE
  v_forced text;
  v_default text;
BEGIN
  SELECT privacy_state::text INTO v_forced
  FROM public.contractor_portfolio
  WHERE storage_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/forced.jpg';
  SELECT privacy_state::text INTO v_default
  FROM public.contractor_portfolio
  WHERE storage_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/default.jpg';
  IF v_forced IS DISTINCT FROM 'REVIEW_REQUIRED' THEN
    RAISE EXCEPTION '1. insert PUBLIC_SAFE stored %', coalesce(v_forced, 'NULL');
  END IF;
  IF v_default IS DISTINCT FROM 'REVIEW_REQUIRED' THEN
    RAISE EXCEPTION '1. insert without privacy_state stored %', coalesce(v_default, 'NULL');
  END IF;
END
$$;
ROLLBACK;

-- 2. A contractor cannot update their own privacy_state.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  UPDATE public.contractor_portfolio
  SET privacy_state = 'PUBLIC_SAFE'
  WHERE id = '55555555-5555-4555-8555-555555555555';
  RAISE EXCEPTION '2. privacy update succeeded';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '2. privacy update succeeded%' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%reviewed by Priority Property Pros%' THEN
      RAISE EXCEPTION '2. unexpected error: %', SQLERRM;
    END IF;
END
$$;
DO $$
DECLARE
  v_state text;
BEGIN
  SELECT privacy_state::text INTO v_state
  FROM public.contractor_portfolio
  WHERE id = '55555555-5555-4555-8555-555555555555';
  IF v_state IS DISTINCT FROM 'REVIEW_REQUIRED' THEN
    RAISE EXCEPTION '2. privacy_state changed to %', coalesce(v_state, 'NULL');
  END IF;
END
$$;
ROLLBACK;

-- 3. Changing storage_path, title, or description resets the item to REVIEW_REQUIRED.
--    Changing sort_order or rewriting the same title does not.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
UPDATE public.contractor_portfolio
SET title = 'Fresh cedar caption'
WHERE id = '44444444-4444-4444-8444-444444444444';
UPDATE public.contractor_portfolio
SET description = 'Added a private note'
WHERE id = '66666666-6666-4666-8666-666666666666';
UPDATE public.contractor_portfolio
SET storage_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/replaced.jpg'
WHERE id = '55555555-5555-4555-8555-555555555555';
DO $$
DECLARE
  v_title text;
  v_description text;
  v_path text;
BEGIN
  SELECT privacy_state::text INTO v_title
  FROM public.contractor_portfolio
  WHERE id = '44444444-4444-4444-8444-444444444444';
  SELECT privacy_state::text INTO v_description
  FROM public.contractor_portfolio
  WHERE id = '66666666-6666-4666-8666-666666666666';
  SELECT privacy_state::text INTO v_path
  FROM public.contractor_portfolio
  WHERE id = '55555555-5555-4555-8555-555555555555';
  IF v_title IS DISTINCT FROM 'REVIEW_REQUIRED' THEN
    RAISE EXCEPTION '3. title change left privacy %', v_title;
  END IF;
  IF v_description IS DISTINCT FROM 'REVIEW_REQUIRED' THEN
    RAISE EXCEPTION '3. description change left privacy %', v_description;
  END IF;
  IF v_path IS DISTINCT FROM 'REVIEW_REQUIRED' THEN
    RAISE EXCEPTION '3. storage_path change left privacy %', v_path;
  END IF;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
UPDATE public.contractor_portfolio
SET sort_order = 9, title = title
WHERE id = '44444444-4444-4444-8444-444444444444';
DO $$
DECLARE
  v_state text;
BEGIN
  SELECT privacy_state::text INTO v_state
  FROM public.contractor_portfolio
  WHERE id = '44444444-4444-4444-8444-444444444444';
  IF v_state IS DISTINCT FROM 'PUBLIC_SAFE' THEN
    RAISE EXCEPTION '3. sort order reset privacy to %', coalesce(v_state, 'NULL');
  END IF;
END
$$;
ROLLBACK;

-- 4. A contractor cannot point storage_path at another user's folder,
--    and cannot move the row to another contractor.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  UPDATE public.contractor_portfolio
  SET storage_path = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/portfolio/stolen.jpg'
  WHERE id = '55555555-5555-4555-8555-555555555555';
  RAISE EXCEPTION '4. foreign folder update succeeded';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '4. foreign folder update succeeded%' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%own portfolio folder%' THEN
      RAISE EXCEPTION '4. unexpected path error: %', SQLERRM;
    END IF;
END
$$;
DO $$
DECLARE
  v_path text;
BEGIN
  SELECT storage_path INTO v_path
  FROM public.contractor_portfolio
  WHERE id = '55555555-5555-4555-8555-555555555555';
  IF v_path IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/review.jpg' THEN
    RAISE EXCEPTION '4. storage_path changed to %', coalesce(v_path, 'NULL');
  END IF;
END
$$;
DO $$
BEGIN
  UPDATE public.contractor_portfolio
  SET contractor_profile_id = '22222222-2222-4222-8222-222222222222'
  WHERE id = '44444444-4444-4444-8444-444444444444';
  RAISE EXCEPTION '4. owner change succeeded';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE '4. owner change succeeded%' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%another contractor%' THEN
      RAISE EXCEPTION '4. unexpected owner error: %', SQLERRM;
    END IF;
END
$$;
ROLLBACK;

-- 5 and 6. A stranger can read only PUBLIC_SAFE files of an APPROVED + ACTIVE contractor.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_names text;
BEGIN
  SELECT coalesce(string_agg(name, ',' ORDER BY name), '') INTO v_names
  FROM storage.objects
  WHERE bucket_id = 'contractor-docs';
  IF v_names IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/safe.jpg' THEN
    RAISE EXCEPTION '5/6. stranger saw [%]', v_names;
  END IF;
  IF v_names LIKE '%review.jpg%' OR v_names LIKE '%private.jpg%' THEN
    RAISE EXCEPTION '5. stranger saw a non-public portfolio file';
  END IF;
  IF v_names LIKE '%unapproved.jpg%' OR v_names LIKE '%inactive.jpg%' THEN
    RAISE EXCEPTION '6. stranger saw a file for an unapproved or inactive contractor';
  END IF;
END
$$;
ROLLBACK;

-- 7. The owner and admins can always read.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'contractor-docs'
    AND name LIKE 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/%';
  IF v_count <> 4 THEN
    RAISE EXCEPTION '7. owner saw % of their objects', v_count;
  END IF;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'contractor-docs';
  IF v_count <> 6 THEN
    RAISE EXCEPTION '7. admin saw % contractor-docs objects', v_count;
  END IF;
END
$$;
ROLLBACK;

-- 8. anon cannot read any contractor-docs object.
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM storage.objects;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '8. anon saw % storage objects', v_count;
  END IF;
END
$$;
ROLLBACK;

-- 9. Credentials stay owner/admin only.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/credentials/license.pdf';
  IF v_count <> 0 THEN
    RAISE EXCEPTION '9. stranger read a credential';
  END IF;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/credentials/license.pdf';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '9. owner could not read their credential';
  END IF;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/credentials/license.pdf';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '9. admin could not read a credential';
  END IF;
END
$$;
ROLLBACK;

-- 10. Only admins can call admin_set_portfolio_privacy, and it writes an audit row.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.admin_set_portfolio_privacy(
    '55555555-5555-4555-8555-555555555555',
    'PUBLIC_SAFE',
    'nope'
  );
  RAISE EXCEPTION '10. contractor RPC succeeded';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '10. contractor RPC succeeded%' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%only an admin can set portfolio photo privacy%' THEN
      RAISE EXCEPTION '10. unexpected contractor RPC error: %', SQLERRM;
    END IF;
END
$$;
DO $$
BEGIN
  PERFORM public.admin_list_portfolio_review_queue();
  RAISE EXCEPTION '10. contractor list RPC succeeded';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '10. contractor list RPC succeeded%' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%only an admin can list the portfolio review queue%' THEN
      RAISE EXCEPTION '10. unexpected list error: %', SQLERRM;
    END IF;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT public.admin_set_portfolio_privacy(
  '55555555-5555-4555-8555-555555555555',
  'PUBLIC_SAFE',
  'screened caption'
);
RESET ROLE;
DO $$
DECLARE
  v_state text;
  v_audit integer;
  v_queue integer;
BEGIN
  SELECT privacy_state::text INTO v_state
  FROM public.contractor_portfolio
  WHERE id = '55555555-5555-4555-8555-555555555555';
  IF v_state IS DISTINCT FROM 'PUBLIC_SAFE' THEN
    RAISE EXCEPTION '10. admin RPC left privacy %', coalesce(v_state, 'NULL');
  END IF;
  SELECT count(*) INTO v_audit
  FROM public.audit_logs
  WHERE action = 'portfolio.privacy_set'
    AND entity_type = 'contractor_portfolio'
    AND entity_id = '55555555-5555-4555-8555-555555555555'
    AND actor_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    AND metadata ->> 'previous_privacy_state' = 'REVIEW_REQUIRED'
    AND metadata ->> 'privacy_state' = 'PUBLIC_SAFE'
    AND metadata ->> 'note' = 'screened caption';
  IF v_audit <> 1 THEN
    RAISE EXCEPTION '10. expected 1 audit row, found %', v_audit;
  END IF;
END
$$;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
  true
);
DO $$
DECLARE
  v_queue integer;
BEGIN
  SELECT count(*) INTO v_queue
  FROM public.admin_list_portfolio_review_queue() q
  WHERE q.id = '55555555-5555-4555-8555-555555555555';
  IF v_queue <> 0 THEN
    RAISE EXCEPTION '10. approved photo stayed in the review queue';
  END IF;
  SELECT count(*) INTO v_queue FROM public.admin_list_portfolio_review_queue();
  IF v_queue <> 0 THEN
    RAISE EXCEPTION '10. review queue was not empty (% rows)', v_queue;
  END IF;
END
$$;
ROLLBACK;

-- 11. A non-admin cannot overwrite a PUBLIC_SAFE object.
--     A new upload and a not-yet-approved object can still be written.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  n integer;
BEGIN
  UPDATE storage.objects
  SET metadata = '{"swap":true}'::jsonb
  WHERE name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/safe.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION '11. overwrote PUBLIC_SAFE object (% rows)', n;
  END IF;

  UPDATE storage.objects
  SET metadata = '{"ok":true}'::jsonb
  WHERE name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/review.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION '11. could not update a REVIEW_REQUIRED object (% rows)', n;
  END IF;

  UPDATE storage.objects
  SET metadata = '{"cred":true}'::jsonb
  WHERE name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/credentials/license.pdf';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION '11. could not update a credential object (% rows)', n;
  END IF;
END
$$;
INSERT INTO storage.objects (bucket_id, name)
VALUES ('contractor-docs', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/new-upload.jpg');
ROLLBACK;

-- 12. list_public_directory_portfolio still returns PUBLIC_SAFE items only.
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_ids text;
BEGIN
  SELECT coalesce(string_agg(id::text, ',' ORDER BY id::text), '') INTO v_ids
  FROM public.list_public_directory_portfolio('11111111-1111-4111-8111-111111111111');
  IF v_ids IS DISTINCT FROM '44444444-4444-4444-8444-444444444444' THEN
    RAISE EXCEPTION '12. anon directory portfolio returned [%]', v_ids;
  END IF;
  SELECT coalesce(string_agg(id::text, ',' ORDER BY id::text), '') INTO v_ids
  FROM public.list_public_directory_portfolio('22222222-2222-4222-8222-222222222222');
  IF v_ids <> '' THEN
    RAISE EXCEPTION '12. unapproved contractor portfolio returned [%]', v_ids;
  END IF;
  SELECT coalesce(string_agg(id::text, ',' ORDER BY id::text), '') INTO v_ids
  FROM public.list_public_directory_portfolio('33333333-3333-4333-8333-333333333333');
  IF v_ids <> '' THEN
    RAISE EXCEPTION '12. inactive contractor portfolio returned [%]', v_ids;
  END IF;
END
$$;
ROLLBACK;

BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_caption text;
BEGIN
  SELECT caption INTO v_caption
  FROM public.list_public_directory_portfolio('11111111-1111-4111-8111-111111111111');
  IF v_caption IS DISTINCT FROM 'Cedar panel' THEN
    RAISE EXCEPTION '12. authenticated directory caption was %', coalesce(v_caption, 'NULL');
  END IF;
END
$$;
ROLLBACK;

-- 13. Service role is unaffected: it can store PUBLIC_SAFE and overwrite bytes.
BEGIN;
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE service_role;
INSERT INTO public.contractor_portfolio (contractor_profile_id, title, storage_path, privacy_state)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Service photo',
  'service-role/portfolio/svc.jpg',
  'PUBLIC_SAFE'
);
UPDATE public.contractor_portfolio
SET privacy_state = 'PRIVATE'
WHERE storage_path = 'service-role/portfolio/svc.jpg';
DO $$
DECLARE
  n integer;
  v_state text;
BEGIN
  SELECT privacy_state::text INTO v_state
  FROM public.contractor_portfolio
  WHERE storage_path = 'service-role/portfolio/svc.jpg';
  IF v_state IS DISTINCT FROM 'PRIVATE' THEN
    RAISE EXCEPTION '13. service role privacy ended as %', coalesce(v_state, 'NULL');
  END IF;
  UPDATE public.contractor_portfolio
  SET privacy_state = 'PUBLIC_SAFE'
  WHERE storage_path = 'service-role/portfolio/svc.jpg';
  SELECT privacy_state::text INTO v_state
  FROM public.contractor_portfolio
  WHERE storage_path = 'service-role/portfolio/svc.jpg';
  IF v_state IS DISTINCT FROM 'PUBLIC_SAFE' THEN
    RAISE EXCEPTION '13. service role could not keep PUBLIC_SAFE (% )', coalesce(v_state, 'NULL');
  END IF;
  UPDATE storage.objects
  SET metadata = '{"svc":true}'::jsonb
  WHERE name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/portfolio/safe.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION '13. service role could not overwrite a PUBLIC_SAFE object (% rows)', n;
  END IF;
END
$$;
ROLLBACK;

-- The replaced SELECT policy no longer publishes every approved contractor folder.
DO $$
DECLARE
  v_qual text;
  v_using text;
  v_readable text;
  v_locked text;
BEGIN
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'storage' AND policyname = 'contractor_docs_storage_select';
  SELECT qual INTO v_using
  FROM pg_policies
  WHERE schemaname = 'storage' AND policyname = 'contractor_docs_storage_update';
  SELECT pg_get_functiondef('public.portfolio_storage_is_publicly_readable(text)'::regprocedure) INTO v_readable;
  SELECT pg_get_functiondef('public.portfolio_storage_is_public_safe(text)'::regprocedure) INTO v_locked;
  IF v_qual NOT ILIKE '%portfolio_storage_is_publicly_readable%' OR v_qual ILIKE '%approval_status%' THEN
    RAISE EXCEPTION 'select policy was not replaced: %', v_qual;
  END IF;
  IF v_using NOT ILIKE '%portfolio_storage_is_public_safe%' THEN
    RAISE EXCEPTION 'update policy was not replaced: %', v_using;
  END IF;
  IF v_readable NOT ILIKE '%PUBLIC_SAFE%' OR v_readable NOT ILIKE '%APPROVED%' OR v_readable NOT ILIKE '%ACTIVE%' THEN
    RAISE EXCEPTION 'readable helper is missing the public gate';
  END IF;
  IF v_locked NOT ILIKE '%PUBLIC_SAFE%' THEN
    RAISE EXCEPTION 'lock helper is missing PUBLIC_SAFE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'enforce_contractor_portfolio_privacy'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'privacy trigger function is SECURITY DEFINER; it must be SECURITY INVOKER';
  END IF;
END
$$;
