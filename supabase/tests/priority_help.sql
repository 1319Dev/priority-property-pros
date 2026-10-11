-- Priority Help role-access checks.
-- Repo style: psql assertions (RAISE EXCEPTION), grouped like a pgTAP plan.
-- Not a production script. Does not call Stripe and does not change fees.
--
--   psql -d priority_help -v ON_ERROR_STOP=1 -f supabase/tests/priority_help.sql

\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

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

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(auth.jwt() ->> 'role', current_user);
$$;

CREATE TYPE public.account_type AS ENUM ('CUSTOMER', 'CONTRACTOR', 'VERIFIER', 'ADMIN');
CREATE TYPE public.account_status AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED');

CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value_int integer,
  value_text text,
  description text
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
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT ''
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

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  entity_type text NOT NULL DEFAULT 'support',
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel text NOT NULL DEFAULT 'in_app',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
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

CREATE OR REPLACE FUNCTION public.notify_safely(
  p_recipient uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_profile_id, kind, title, body, entity_type, entity_id, payload)
  VALUES (p_recipient, p_kind, p_title, p_body, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.require_service_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'admin_mfa_required'),
    0
  ) <> 0;
$$;

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
  )
  AND (
    NOT public.admin_mfa_required()
    OR coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

INSERT INTO public.platform_settings (key, value_int) VALUES
  ('signup_fee_cents', 999),
  ('signup_fee_enabled', 1),
  ('connection_fee_cents', 499),
  ('connection_fee_checkout_enabled', 1),
  ('payments_live', 0),
  ('charges_live', 0),
  ('contractor_fee_bps', 700),
  ('admin_mfa_required', 0);

INSERT INTO public.profiles (id, email, first_name, last_name, account_type, account_status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'homeowner@example.com', 'Ada', 'Home', 'CUSTOMER', 'ACTIVE'),
  ('22222222-2222-4222-8222-222222222222', 'pro@example.com', 'Ben', 'Pro', 'CONTRACTOR', 'ACTIVE'),
  ('33333333-3333-4333-8333-333333333333', 'admin@example.com', 'Casey', 'Admin', 'ADMIN', 'ACTIVE'),
  ('44444444-4444-4444-8444-444444444444', 'other@example.com', 'Dee', 'Other', 'CUSTOMER', 'ACTIVE');

INSERT INTO public.contractor_profiles (id, profile_id, business_name) VALUES
  ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', 'Hidden Business Name LLC');

CREATE OR REPLACE FUNCTION public._ph_ok(p_cond boolean, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_cond, false) THEN
    RAISE EXCEPTION 'priority help test failed: %', p_msg;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._ph_raises(p_sql text, p_sqlstate text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'expected sqlstate % from %', p_sqlstate, p_sql;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM ILIKE 'expected sqlstate %' THEN
      RAISE;
    END IF;
    IF SQLSTATE IS DISTINCT FROM p_sqlstate THEN
      RAISE EXCEPTION 'expected % got % (%) from %', p_sqlstate, SQLSTATE, SQLERRM, p_sql;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._ph_ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public._ph_raises(text, text) TO PUBLIC;

\ir ../migrations/20261014000001_priority_help.sql

SELECT public._ph_ok(
  NOT has_table_privilege('anon', 'public.support_conversations', 'SELECT'),
  'anon has no select on conversations'
);
SELECT public._ph_ok(
  NOT has_table_privilege('anon', 'public.support_messages', 'SELECT'),
  'anon has no select on messages'
);
SELECT public._ph_ok(
  NOT has_table_privilege('anon', 'public.support_guest_secrets', 'SELECT'),
  'anon has no select on guest secrets'
);
SELECT public._ph_ok(
  NOT has_table_privilege('authenticated', 'public.support_guest_secrets', 'SELECT'),
  'authenticated has no select on guest secrets'
);
SELECT public._ph_ok(
  NOT has_table_privilege('authenticated', 'public.support_conversations', 'INSERT'),
  'authenticated cannot insert conversations'
);
SELECT public._ph_ok(
  NOT has_function_privilege('anon', 'public.support_service_open(uuid, text, text)', 'EXECUTE'),
  'anon cannot execute guest open'
);
SELECT public._ph_ok(
  NOT has_function_privilege('anon', 'public.admin_support_list(text, integer)', 'EXECUTE'),
  'anon cannot execute admin list'
);
SELECT public._ph_ok(
  NOT has_function_privilege('authenticated', 'public.support_service_open(uuid, text, text)', 'EXECUTE'),
  'authenticated cannot execute service open'
);
SELECT public._ph_ok(
  has_function_privilege('authenticated', 'public.admin_support_list(text, integer)', 'EXECUTE'),
  'authenticated can call admin list, which still checks is_admin()'
);

SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
SET ROLE anon;
SELECT public._ph_raises('SELECT * FROM public.support_conversations', '42501');
SELECT public._ph_raises('SELECT * FROM public.support_guest_secrets', '42501');
SELECT public._ph_raises(
  $$SELECT public.support_service_open(NULL, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', NULL)$$,
  '42501'
);
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SET ROLE service_role;
SELECT public.support_service_open(
  NULL,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
)::text AS guest_a \gset
SELECT public.support_service_open(
  NULL,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
)::text AS guest_b \gset
RESET ROLE;

SELECT public._ph_ok((:'guest_a'::jsonb ->> 'status') = 'ASSISTANT', 'guest A starts as assistant');
SELECT public._ph_ok((:'guest_b'::jsonb ->> 'id') IS DISTINCT FROM (:'guest_a'::jsonb ->> 'id'), 'guest A and B are different conversations');
SELECT public._ph_ok((:'guest_a'::jsonb ->> 'reference') IS NULL, 'assistant thread has no ticket reference yet');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SET ROLE service_role;
SELECT public._ph_raises(
  format(
    'SELECT public.support_service_history(NULL, %L, %L)',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    (:'guest_b'::jsonb ->> 'id')
  ),
  '42501'
);
SELECT public.support_service_escalate(
  NULL,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  (:'guest_a'::jsonb ->> 'id')::uuid,
  'I need a person to look at my activation.',
  '',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
)::text AS guest_a_ticket \gset
SELECT public.support_service_escalate(
  NULL,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  (:'guest_b'::jsonb ->> 'id')::uuid,
  'Different guest.',
  '',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
)::text AS guest_b_ticket \gset
RESET ROLE;

SELECT public._ph_ok((:'guest_a_ticket'::jsonb ->> 'reference') = 'PH-10001', 'first ticket is PH-10001');
SELECT public._ph_ok((:'guest_b_ticket'::jsonb ->> 'reference') = 'PH-10002', 'second ticket is PH-10002');
SELECT public._ph_ok((:'guest_a_ticket'::jsonb ->> 'human_joined') = 'false', 'escalate does not claim a human joined');
SELECT public._ph_ok((:'guest_a_ticket'::jsonb ->> 'availability') = 'offline', 'no heartbeat means offline');
SELECT public._ph_ok(
  (SELECT count(*) FROM public.notifications WHERE kind = 'support.escalated') = 2,
  'each escalation notifies the admin once'
);
SELECT public._ph_ok(
  NOT EXISTS (SELECT 1 FROM public.notifications WHERE body ILIKE '%Hidden Business%' OR body ILIKE '%activation.%'),
  'admin notification does not include the customer message or a business name'
);

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SET ROLE service_role;
SELECT public.support_service_open(
  '11111111-1111-4111-8111-111111111111',
  NULL,
  NULL
)::text AS customer_thread \gset
SELECT public.support_service_open(
  '22222222-2222-4222-8222-222222222222',
  NULL,
  NULL
)::text AS contractor_thread \gset
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SET ROLE service_role;
SELECT public._ph_raises(
  format(
    'SELECT public.support_service_customer_message(%L, NULL, %L, %L, %L, NULL)',
    '22222222-2222-4222-8222-222222222222',
    (:'customer_thread'::jsonb ->> 'id'),
    'I am the wrong person',
    '',
    NULL
  ),
  '42501'
);
SELECT public._ph_raises(
  format(
    'SELECT public.support_service_customer_message(%L, NULL, %L, %L, %L, NULL)',
    '11111111-1111-4111-8111-111111111111',
    (:'customer_thread'::jsonb ->> 'id'),
    repeat('x', 2001),
    '',
    NULL
  ),
  '22023'
);
SELECT public.support_service_customer_message(
  '11111111-1111-4111-8111-111111111111',
  NULL,
  (:'customer_thread'::jsonb ->> 'id')::uuid,
  'How much is activation?',
  'https://spam.example',
  NULL
)::text AS honeypot \gset
RESET ROLE;

SELECT public._ph_ok((:'honeypot'::jsonb ->> 'dropped') = 'true', 'honeypot is dropped');
SELECT public._ph_ok(
  NOT EXISTS (
    SELECT 1 FROM public.support_messages
    WHERE conversation_id = (:'customer_thread'::jsonb ->> 'id')::uuid
      AND body ILIKE '%spam.example%'
  ),
  'honeypot body is not stored'
);

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SET ROLE service_role;
SELECT public.support_service_customer_message(
  '11111111-1111-4111-8111-111111111111',
  NULL,
  (:'customer_thread'::jsonb ->> 'id')::uuid,
  'How much is activation?',
  '',
  NULL
)::text AS customer_msg \gset
SELECT public.support_service_assistant_message(
  (:'customer_thread'::jsonb ->> 'id')::uuid,
  'Activation is a one-time fee. I cannot see your account.'
);
RESET ROLE;

INSERT INTO public.support_messages (conversation_id, author_role, author_id, visibility, body)
VALUES (
  (:'customer_thread'::jsonb ->> 'id')::uuid,
  'admin',
  '33333333-3333-4333-8333-333333333333',
  'internal',
  'Internal only: do not show the homeowner this note.'
);

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'aal', 'aal1')::text,
  false
);
SET ROLE authenticated;
SELECT public._ph_ok(
  (SELECT count(*) FROM public.support_conversations) = 1,
  'customer sees only their conversation'
);
SELECT public._ph_ok(
  NOT EXISTS (SELECT 1 FROM public.support_messages WHERE visibility = 'internal'),
  'customer cannot read internal notes'
);
SELECT public._ph_ok(
  NOT EXISTS (
    SELECT 1 FROM public.support_conversations
    WHERE id = (:'contractor_thread'::jsonb ->> 'id')::uuid
  ),
  'customer cannot see the contractor thread'
);
SELECT public._ph_raises('SELECT public.admin_support_list(''open'', 20)', '42501');
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated', 'aal', 'aal1')::text,
  false
);
SET ROLE authenticated;
SELECT public._ph_ok(
  (SELECT count(*) FROM public.support_conversations) = 1,
  'contractor sees only their conversation'
);
SELECT public._ph_ok(
  (SELECT id FROM public.support_conversations) = (:'contractor_thread'::jsonb ->> 'id')::uuid,
  'contractor row is their own'
);
SELECT public._ph_raises('SELECT public.admin_support_note(' || quote_literal((:'customer_thread'::jsonb ->> 'id')::uuid) || ', ''nope'')', '42501');
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated', 'aal', 'aal2')::text,
  false
);
SET ROLE authenticated;
SELECT public._ph_ok((SELECT count(*) FROM public.support_conversations) = 0, 'other customer sees no support rows');
SELECT public._ph_raises('SELECT public.admin_support_get(' || quote_literal((:'guest_a'::jsonb ->> 'id')::uuid) || ')', '42501');
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated', 'aal', 'aal1')::text,
  false
);
SET ROLE authenticated;
SELECT public._ph_ok((SELECT count(*) FROM public.support_conversations) = 4, 'admin sees every conversation');
SELECT public._ph_ok(
  (SELECT count(*) FROM public.support_messages WHERE visibility = 'internal') = 1,
  'admin sees the internal note'
);
SELECT public._ph_raises('SELECT * FROM public.support_guest_secrets', '42501');
SELECT (public.admin_support_get((:'customer_thread'::jsonb ->> 'id')::uuid) -> 'account' ->> 'role') AS customer_role \gset
SELECT public._ph_ok(:'customer_role' = 'CUSTOMER', 'admin payload identifies the customer role');
SELECT public._ph_ok(
  (public.admin_support_get((:'customer_thread'::jsonb ->> 'id')::uuid) -> 'messages')::text ILIKE '%Internal only%',
  'admin get includes the internal note'
);
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SET ROLE service_role;
SELECT public._ph_ok(
  (public.support_service_history(
    '11111111-1111-4111-8111-111111111111',
    NULL,
    (:'customer_thread'::jsonb ->> 'id')::uuid
  ) -> 'messages')::text NOT ILIKE '%Internal only%',
  'service history hides internal notes'
);
SELECT public._ph_ok(
  (:'contractor_thread')::jsonb::text NOT ILIKE '%Hidden Business%',
  'customer and contractor payloads do not include a business name'
);
RESET ROLE;

UPDATE public.platform_settings SET value_int = 1 WHERE key = 'admin_mfa_required';
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated', 'aal', 'aal1')::text,
  false
);
SET ROLE authenticated;
SELECT public._ph_raises('SELECT public.admin_support_list(''open'', 10)', '42501');
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated', 'aal', 'aal2')::text,
  false
);
SET ROLE authenticated;
SELECT public._ph_ok(
  (public.admin_support_list('open', 10) -> 'rows') @> jsonb_build_array(jsonb_build_object('reference', 'PH-10001')),
  'aal2 admin lists the open queue when mfa is required'
);
SELECT public.admin_support_set_presence('available') AS presence \gset
SELECT public._ph_ok(:'presence' = 'available', 'fresh available heartbeat is available');
SELECT public.admin_support_takeover((:'guest_a'::jsonb ->> 'id')::uuid) ->> 'human_joined' AS joined \gset
SELECT public._ph_ok(:'joined' = 'true', 'takeover marks a human as joined');
SELECT public._ph_raises(
  $$SELECT public.admin_support_kb_save(NULL, 'Bad', '<script>alert(1)</script>', 'DRAFT', 'bad-html')$$,
  '22023'
);
RESET ROLE;

UPDATE public.support_agent_status
SET last_seen_at = now() - interval '5 minutes'
WHERE admin_id = '33333333-3333-4333-8333-333333333333';
SELECT public._ph_ok(public.support_desk_availability() = 'offline', 'stale heartbeat is offline');

UPDATE public.platform_settings SET value_int = 0 WHERE key = 'admin_mfa_required';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SET ROLE service_role;
SELECT public._ph_ok(
  (public.support_public_pricing() ->> 'signup_fee_cents')::int = 999,
  'live activation cents come from platform_settings'
);
SELECT public._ph_ok(
  (public.support_public_pricing() ->> 'connection_fee_cents')::int = 499,
  'live connect cents come from platform_settings'
);
SELECT public._ph_ok(
  (public.support_public_pricing() ->> 'payments_live') = 'false',
  'job payments stay off in the pricing payload'
);
SELECT public._ph_ok(
  public.support_public_pricing()::text NOT ILIKE '%contractor_fee%'
  AND public.support_public_pricing()::text NOT LIKE '%700%',
  'pricing payload does not include the legacy bps'
);
SELECT public._ph_ok(
  public.support_search_kb('activation fee', 4)::text ILIKE '%one-time%',
  'full-text search finds the activation article'
);
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SET ROLE service_role;
SELECT public.support_service_customer_message(
  '11111111-1111-4111-8111-111111111111',
  NULL,
  (:'customer_thread'::jsonb ->> 'id')::uuid,
  'rate ' || g::text,
  '',
  NULL
)
FROM generate_series(1, 7) AS g;
SELECT public._ph_raises(
  format(
    'SELECT public.support_service_customer_message(%L, NULL, %L, %L, %L, NULL)',
    '11111111-1111-4111-8111-111111111111',
    (:'customer_thread'::jsonb ->> 'id'),
    'one too many',
    ''
  ),
  'P0001'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated', 'aal', 'aal2')::text,
  false
);
SET ROLE authenticated;
SELECT public.admin_support_set_status((:'guest_b'::jsonb ->> 'id')::uuid, 'RESOLVED');
SELECT public.admin_support_set_retention(30);
RESET ROLE;
UPDATE public.support_conversations
SET resolved_at = now() - interval '40 days'
WHERE id = (:'guest_b'::jsonb ->> 'id')::uuid;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '33333333-3333-4333-8333-333333333333', 'role', 'authenticated', 'aal', 'aal2')::text,
  false
);
SET ROLE authenticated;
SELECT public._ph_ok(public.admin_support_purge_expired() >= 1, 'manual purge removes an old resolved ticket');
RESET ROLE;
SELECT public._ph_ok(
  NOT EXISTS (SELECT 1 FROM public.support_conversations WHERE id = (:'guest_b'::jsonb ->> 'id')::uuid),
  'purged ticket is gone'
);
SELECT public._ph_ok(
  EXISTS (SELECT 1 FROM public.support_conversations WHERE reference_number = 10001),
  'open ticket is kept'
);
SELECT public._ph_ok(
  EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'support.purged'),
  'purge writes an audit row'
);
SELECT public._ph_ok(
  EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'support.escalated'),
  'escalation writes an audit row'
);

DELETE FROM public.profiles WHERE id = '11111111-1111-4111-8111-111111111111';
SELECT public._ph_ok(
  NOT EXISTS (SELECT 1 FROM public.support_conversations WHERE user_id = '11111111-1111-4111-8111-111111111111'),
  'deleting the profile removes that person''s support rows'
);
SELECT public._ph_ok(
  EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE action = 'support.account_purged'
      AND entity_id = '11111111-1111-4111-8111-111111111111'
  ),
  'account deletion records a support purge'
);

SELECT public._ph_ok(
  (SELECT proname FROM pg_proc WHERE proname = 'is_admin' LIMIT 1) = 'is_admin',
  'is_admin still exists'
);
