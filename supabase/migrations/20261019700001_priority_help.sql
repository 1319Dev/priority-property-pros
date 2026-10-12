-- Priority Help (customer support). Additive only.
--
-- Version 20261019700001. 20261019500001 is taken by the Stripe live price-id
-- PR (#123) and 20261019600001 by admin profile edits (#125); this file was
-- renumbered on 2026-10-11. Checked against main and all 41 open PR branches:
-- no other file uses 20261019700001.
--
-- Automatic retention: guest conversations are deleted 90 days after their
-- last activity (once no ticket is still open), signed-in conversations 365
-- days after they are resolved or closed. support_purge_expired_auto() runs
-- daily at 08:17 UTC through pg_cron when that extension is available; the
-- migration enables pg_cron (CREATE EXTENSION IF NOT EXISTS) and schedules
-- job 'priority-help-retention'. Without pg_cron it raises a WARNING and the
-- admin "Purge expired" button remains the only purge.
--
-- Ships OFF. support_settings.priority_help_enabled and ai_answers_enabled
-- both default false. While priority_help_enabled is false every
-- support_service_* entry point refuses with 'priority help is off', so the
-- widget stays hidden and no conversation, message, or model call happens.
-- AI answers additionally need ai_answers_enabled, the Edge Function secret
-- PRIORITY_HELP_AI_API_KEY, the daily answer cap, and the daily dollar budget.
--
-- Does not CREATE OR REPLACE any existing function. Does not ALTER existing
-- columns. Does not change Stripe, fees, platform_settings values, matching,
-- project workflows, permissions, or public.is_admin().
--
-- Touches an existing table only by adding a BEFORE DELETE trigger on
-- public.profiles so account deletion (auth.users cascade) removes that
-- person's support rows. The trigger function is new.
--
-- Calls the existing public.notify_safely(...) when that function is present.
-- It does not replace it. Notification bodies are ticket references only.
--
-- Tables (each exists because the others cannot hold the data safely):
--   support_conversations     thread plus ticket fields (status, priority, reference)
--   support_messages          customer, assistant, admin, and internal notes
--   support_assignments       takeover history (who joined, and when they left)
--   support_guest_secrets     sha256 of the guest token. No client grants, so a
--                             conversation SELECT cannot return the secret.
--   support_kb_articles       admin-managed knowledge base (markdown, full-text)
--   support_canned_responses  admin reply snippets (markdown, no raw HTML)
--   support_agent_status      available / away / offline plus a heartbeat
--   support_rate_limits       per IP-hash and per session counters
--   support_settings          feature flags (default off), retention days, the
--                             daily AI answer cap, and the daily AI dollar budget
--                             (purge is manual, not scheduled)
--   support_ai_usage          one row per model call: model, tokens, cost in
--                             micro-dollars, outcome. No client grants.
--
-- Guests have no anon table privileges. The Edge Function calls the
-- support_service_* functions with the service role after it hashes the token.
-- Signed-in users can SELECT only their own public rows (Realtime uses that RLS).
-- Admins SELECT everything, including internal notes, and write through
-- admin_support_* which calls public.is_admin() (AAL2 when admin_mfa_required is on).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_ref_seq
  AS bigint
  START WITH 10001
  INCREMENT BY 1
  MINVALUE 10001
  NO CYCLE;

REVOKE ALL ON SEQUENCE public.support_ticket_ref_seq FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number bigint UNIQUE,
  user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ASSISTANT',
  priority text NOT NULL DEFAULT 'NORMAL',
  assigned_admin_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  agent_joined_at timestamptz,
  availability_at_open text,
  first_response_at timestamptz,
  last_message_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_conversations_status_chk CHECK (
    status IN ('ASSISTANT', 'OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED')
  ),
  CONSTRAINT support_conversations_priority_chk CHECK (
    priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')
  ),
  CONSTRAINT support_conversations_availability_chk CHECK (
    availability_at_open IS NULL
    OR availability_at_open IN ('available', 'away', 'offline')
  ),
  CONSTRAINT support_conversations_reference_positive CHECK (
    reference_number IS NULL OR reference_number >= 10001
  )
);

CREATE INDEX support_conversations_queue_idx
  ON public.support_conversations (status, last_message_at DESC NULLS LAST, created_at DESC);

CREATE INDEX support_conversations_user_idx
  ON public.support_conversations (user_id, created_at DESC);

CREATE UNIQUE INDEX support_conversations_one_active_user_idx
  ON public.support_conversations (user_id)
  WHERE user_id IS NOT NULL AND status NOT IN ('RESOLVED', 'CLOSED');

CREATE TABLE public.support_guest_secrets (
  conversation_id uuid PRIMARY KEY REFERENCES public.support_conversations (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_guest_secrets_hash_chk CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX support_guest_secrets_hash_idx
  ON public.support_guest_secrets (token_hash);

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations (id) ON DELETE CASCADE,
  author_role text NOT NULL,
  author_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'public',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_messages_role_chk CHECK (
    author_role IN ('customer', 'assistant', 'admin', 'system')
  ),
  CONSTRAINT support_messages_visibility_chk CHECK (visibility IN ('public', 'internal')),
  CONSTRAINT support_messages_body_len_chk CHECK (char_length(body) BETWEEN 1 AND 4000),
  CONSTRAINT support_messages_internal_is_admin CHECK (
    visibility <> 'internal' OR author_role = 'admin'
  )
);

CREATE INDEX support_messages_conversation_idx
  ON public.support_messages (conversation_id, created_at);

CREATE INDEX support_messages_fts_idx
  ON public.support_messages USING gin (to_tsvector('english', body));

CREATE INDEX support_messages_assistant_recent_idx
  ON public.support_messages (created_at)
  WHERE author_role = 'assistant';

CREATE TABLE public.support_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations (id) ON DELETE CASCADE,
  admin_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  CONSTRAINT support_assignments_release_after CHECK (
    released_at IS NULL OR released_at >= assigned_at
  )
);

CREATE INDEX support_assignments_conversation_idx
  ON public.support_assignments (conversation_id, assigned_at DESC);

CREATE TABLE public.support_kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  body_md text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body_md, ''))
  ) STORED,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_kb_status_chk CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  CONSTRAINT support_kb_title_len_chk CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT support_kb_body_len_chk CHECK (char_length(body_md) BETWEEN 1 AND 20000),
  CONSTRAINT support_kb_slug_chk CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE INDEX support_kb_articles_fts_idx
  ON public.support_kb_articles USING gin (search_vector);

CREATE INDEX support_kb_articles_published_idx
  ON public.support_kb_articles (status)
  WHERE status = 'PUBLISHED';

CREATE TABLE public.support_canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body_md text NOT NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_canned_title_len_chk CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT support_canned_body_len_chk CHECK (char_length(body_md) BETWEEN 1 AND 4000)
);

CREATE TABLE public.support_agent_status (
  admin_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_agent_status_chk CHECK (status IN ('available', 'away', 'offline'))
);

CREATE TABLE public.support_rate_limits (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  CONSTRAINT support_rate_limits_key_chk CHECK (char_length(bucket_key) BETWEEN 3 AND 200),
  CONSTRAINT support_rate_limits_hits_chk CHECK (hits >= 0)
);

CREATE TABLE public.support_settings (
  id boolean PRIMARY KEY DEFAULT true,
  retention_days integer NOT NULL DEFAULT 365,
  guest_retention_days integer NOT NULL DEFAULT 90,
  daily_ai_answer_cap integer NOT NULL DEFAULT 200,
  priority_help_enabled boolean NOT NULL DEFAULT false,
  ai_answers_enabled boolean NOT NULL DEFAULT false,
  daily_ai_budget_usd_micros bigint NOT NULL DEFAULT 1000000,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_settings_singleton_chk CHECK (id),
  CONSTRAINT support_settings_retention_chk CHECK (retention_days BETWEEN 30 AND 3650),
  CONSTRAINT support_settings_guest_retention_chk CHECK (guest_retention_days BETWEEN 7 AND 365),
  CONSTRAINT support_settings_ai_cap_chk CHECK (daily_ai_answer_cap BETWEEN 0 AND 100000),
  CONSTRAINT support_settings_ai_budget_chk CHECK (daily_ai_budget_usd_micros BETWEEN 0 AND 100000000)
);

-- One row per model call. Cost is computed by the Edge Function from the
-- provider's token usage and the published per-token price, in micro-dollars
-- (1,000,000 = $1.00). The daily dollar budget sums this table.
CREATE TABLE public.support_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.support_conversations (id) ON DELETE SET NULL,
  model text NOT NULL,
  outcome text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  cost_usd_micros bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ai_usage_outcome_chk CHECK (outcome IN ('answered', 'blocked', 'provider_error', 'timeout')),
  CONSTRAINT support_ai_usage_model_chk CHECK (char_length(model) BETWEEN 1 AND 100),
  CONSTRAINT support_ai_usage_tokens_chk CHECK (
    (input_tokens IS NULL OR input_tokens >= 0) AND (output_tokens IS NULL OR output_tokens >= 0)
  ),
  CONSTRAINT support_ai_usage_cost_chk CHECK (cost_usd_micros BETWEEN 0 AND 100000000)
);

CREATE INDEX support_ai_usage_recent_idx ON public.support_ai_usage (created_at);

INSERT INTO public.support_settings (id, retention_days)
VALUES (true, 365);

-- ---------------------------------------------------------------------------
-- Helpers. New functions only.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.support_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_conversations_set_updated_at
  BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.support_set_updated_at();

CREATE TRIGGER support_kb_articles_set_updated_at
  BEFORE UPDATE ON public.support_kb_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.support_set_updated_at();

CREATE TRIGGER support_canned_set_updated_at
  BEFORE UPDATE ON public.support_canned_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.support_set_updated_at();

CREATE TRIGGER support_agent_status_set_updated_at
  BEFORE UPDATE ON public.support_agent_status
  FOR EACH ROW
  EXECUTE FUNCTION public.support_set_updated_at();

CREATE TRIGGER support_settings_set_updated_at
  BEFORE UPDATE ON public.support_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.support_set_updated_at();

CREATE FUNCTION public.support_reject_html(p_text text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_text IS NOT NULL AND p_text ~ '<[[:alpha:]/!]' THEN
    RAISE EXCEPTION 'HTML is not allowed in support content' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE FUNCTION public.support_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.visibility = 'public' THEN
    UPDATE public.support_conversations
    SET last_message_at = NEW.created_at,
        updated_at = now()
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_messages_touch_conversation
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.support_touch_conversation();

CREATE FUNCTION public.support_one_active_guest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.support_guest_secrets s
    JOIN public.support_conversations c ON c.id = s.conversation_id
    WHERE s.token_hash = NEW.token_hash
      AND s.conversation_id <> NEW.conversation_id
      AND c.status NOT IN ('RESOLVED', 'CLOSED')
  ) THEN
    RAISE EXCEPTION 'guest session already has an open conversation' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_guest_secrets_one_active
  BEFORE INSERT OR UPDATE ON public.support_guest_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.support_one_active_guest();

CREATE FUNCTION public.support_require_admin()
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

-- Raises when Priority Help is off. Every support_service_* entry point that
-- opens, reads, or writes a conversation calls this first.
CREATE FUNCTION public.support_require_enabled()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT coalesce((SELECT priority_help_enabled FROM public.support_settings WHERE id = true), false) THEN
    RAISE EXCEPTION 'priority help is off' USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE FUNCTION public.support_rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_hits integer;
BEGIN
  IF p_key IS NULL OR char_length(p_key) < 3 OR char_length(p_key) > 200 THEN
    RAISE EXCEPTION 'invalid rate limit key' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid rate limit window' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.support_rate_limits (bucket_key, window_started_at, hits)
  VALUES (p_key, now(), 0)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT window_started_at, hits
  INTO v_start, v_hits
  FROM public.support_rate_limits
  WHERE bucket_key = p_key
  FOR UPDATE;

  IF v_start < now() - make_interval(secs => p_window_seconds) THEN
    UPDATE public.support_rate_limits
    SET window_started_at = now(), hits = 1
    WHERE bucket_key = p_key;
    RETURN;
  END IF;

  IF v_hits >= p_limit THEN
    RAISE EXCEPTION 'too many support requests' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.support_rate_limits
  SET hits = hits + 1
  WHERE bucket_key = p_key;
END;
$$;

CREATE FUNCTION public.support_reference_label(p_number bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_number IS NULL THEN NULL
    ELSE 'PH-' || p_number::text
  END;
$$;

CREATE FUNCTION public.support_message_json(p_row public.support_messages)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'role', p_row.author_role,
    'visibility', p_row.visibility,
    'body', p_row.body,
    'created_at', p_row.created_at
  );
$$;

CREATE FUNCTION public.support_conversation_payload(
  p_conversation_id uuid,
  p_include_internal boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.support_conversations%ROWTYPE;
  v_messages jsonb;
  v_profile public.profiles%ROWTYPE;
  v_contractor_id uuid;
  v_business text;
BEGIN
  SELECT * INTO v_row FROM public.support_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(jsonb_agg(public.support_message_json(m) ORDER BY m.created_at), '[]'::jsonb)
  INTO v_messages
  FROM public.support_messages m
  WHERE m.conversation_id = p_conversation_id
    AND (p_include_internal OR m.visibility = 'public');

  IF p_include_internal AND v_row.user_id IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_row.user_id;
    SELECT cp.id, cp.business_name
    INTO v_contractor_id, v_business
    FROM public.contractor_profiles cp
    WHERE cp.profile_id = v_row.user_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'reference', public.support_reference_label(v_row.reference_number),
    'reference_number', v_row.reference_number,
    'status', v_row.status,
    'priority', v_row.priority,
    'assigned_admin_id', CASE WHEN p_include_internal THEN v_row.assigned_admin_id ELSE NULL END,
    'agent_joined_at', v_row.agent_joined_at,
    'availability_at_open', v_row.availability_at_open,
    'first_response_at', CASE WHEN p_include_internal THEN v_row.first_response_at ELSE NULL END,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'human_joined', v_row.agent_joined_at IS NOT NULL,
    'messages', v_messages,
    'account', CASE
      WHEN NOT p_include_internal OR v_row.user_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'profile_id', v_profile.id,
        'role', v_profile.account_type,
        'account_status', v_profile.account_status,
        'first_name', v_profile.first_name,
        'last_name', v_profile.last_name,
        'email', v_profile.email,
        'contractor_profile_id', v_contractor_id,
        'business_name', v_business,
        'profile_href', CASE
          WHEN v_contractor_id IS NOT NULL THEN '/app/admin/approvals/' || v_contractor_id::text
          ELSE NULL
        END
      )
    END
  );
END;
$$;

CREATE FUNCTION public.support_assert_owner(
  p_conversation_id uuid,
  p_user_id uuid,
  p_guest_token_hash text
)
RETURNS public.support_conversations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.support_conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.support_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF v_row.user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'not your conversation' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  IF p_guest_token_hash IS NULL OR p_guest_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid guest session' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.support_guest_secrets s
    WHERE s.conversation_id = p_conversation_id
      AND s.token_hash = p_guest_token_hash
  ) THEN
    RAISE EXCEPTION 'not your conversation' USING ERRCODE = '42501';
  END IF;

  RETURN v_row;
END;
$$;

CREATE FUNCTION public.support_notify_admins(
  p_conversation_id uuid,
  p_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_admin uuid;
  v_title text := 'Priority Help';
  v_body text;
  v_path text;
  v_payload jsonb;
BEGIN
  SELECT public.support_reference_label(reference_number)
  INTO v_ref
  FROM public.support_conversations
  WHERE id = p_conversation_id;

  v_body := CASE
    WHEN v_ref IS NULL THEN 'A Priority Help conversation is waiting.'
    ELSE 'Ticket ' || v_ref || ' is waiting.'
  END;
  v_path := '/app/admin/support/' || p_conversation_id::text;
  v_payload := jsonb_build_object('path', v_path, 'reference', v_ref);

  FOR v_admin IN
    SELECT id
    FROM public.profiles
    WHERE account_type = 'ADMIN'
      AND account_status = 'ACTIVE'
  LOOP
    IF to_regprocedure('public.notify_safely(uuid,text,text,text,text,uuid,jsonb)') IS NOT NULL THEN
      EXECUTE 'SELECT public.notify_safely($1, $2, $3, $4, $5, $6, $7)'
      USING v_admin, p_kind, v_title, v_body, 'support', p_conversation_id, v_payload;
    ELSIF to_regclass('public.notifications') IS NOT NULL THEN
      PERFORM set_config('ppp.notify', '1', true);
      INSERT INTO public.notifications (recipient_profile_id, kind, title, body, entity_type, entity_id, payload)
      VALUES (v_admin, p_kind, v_title, v_body, 'support', p_conversation_id, v_payload);
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.support_desk_availability()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.support_agent_status
      WHERE status = 'available'
        AND last_seen_at > now() - interval '90 seconds'
    ) THEN 'available'
    WHEN EXISTS (
      SELECT 1 FROM public.support_agent_status
      WHERE status = 'away'
        AND last_seen_at > now() - interval '90 seconds'
    ) THEN 'away'
    ELSE 'offline'
  END;
$$;

-- Live public prices only. Reads activation and Connect keys, never the legacy basis-point setting.
CREATE FUNCTION public.support_public_pricing()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'signup_fee_cents', (
      SELECT value_int FROM public.platform_settings WHERE key = 'signup_fee_cents'
    ),
    'signup_fee_enabled', coalesce((
      SELECT value_int FROM public.platform_settings WHERE key = 'signup_fee_enabled'
    ), 0) <> 0,
    'connection_fee_cents', (
      SELECT value_int FROM public.platform_settings WHERE key = 'connection_fee_cents'
    ),
    'connection_fee_enabled', coalesce((
      SELECT value_int FROM public.platform_settings WHERE key = 'connection_fee_checkout_enabled'
    ), 0) <> 0,
    'payments_live', coalesce((
      SELECT value_int FROM public.platform_settings WHERE key = 'payments_live'
    ), 0) <> 0,
    'charges_live', coalesce((
      SELECT value_int FROM public.platform_settings WHERE key = 'charges_live'
    ), 0) <> 0
  );
$$;

CREATE FUNCTION public.support_search_kb(p_query text, p_limit integer DEFAULT 4)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := left(btrim(coalesce(p_query, '')), 240);
  v_limit integer := least(greatest(coalesce(p_limit, 4), 1), 8);
  v_rows jsonb;
BEGIN
  IF v_query = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY rank DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'slug', a.slug,
      'title', a.title,
      'excerpt', left(a.body_md, 700)
    ) AS item,
    ts_rank(a.search_vector, websearch_to_tsquery('english', v_query)) AS rank
    FROM public.support_kb_articles a
    WHERE a.status = 'PUBLISHED'
      AND a.search_vector @@ websearch_to_tsquery('english', v_query)
    ORDER BY rank DESC, a.updated_at DESC
    LIMIT v_limit
  ) ranked;

  IF v_rows = '[]'::jsonb THEN
    SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT jsonb_build_object(
        'slug', a.slug,
        'title', a.title,
        'excerpt', left(a.body_md, 700)
      ) AS item
      FROM public.support_kb_articles a
      WHERE a.status = 'PUBLISHED'
        AND (a.title ILIKE '%' || replace(v_query, '%', '') || '%'
          OR a.body_md ILIKE '%' || replace(v_query, '%', '') || '%')
      ORDER BY a.updated_at DESC
      LIMIT v_limit
    ) fallback;
  END IF;

  RETURN v_rows;
END;
$$;

-- ---------------------------------------------------------------------------
-- Service-role session API. The Edge Function is the only caller.
-- The raw guest token never reaches Postgres; only its sha256 hex does.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.support_service_open(
  p_user_id uuid,
  p_guest_token_hash text,
  p_ip_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.support_conversations%ROWTYPE;
  v_ip text := nullif(left(coalesce(p_ip_hash, ''), 128), '');
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.support_require_enabled();

  IF p_user_id IS NOT NULL AND coalesce(p_guest_token_hash, '') <> '' THEN
    RAISE EXCEPTION 'pass a user or a guest session, not both' USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS NULL AND coalesce(p_guest_token_hash, '') = '' THEN
    RAISE EXCEPTION 'a user or guest session is required' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_guest_token_hash, '') <> '' AND p_guest_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid guest session' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND account_status IS DISTINCT FROM 'DELETED'
    ) THEN
      RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_row
    FROM public.support_conversations
    WHERE user_id = p_user_id
      AND status NOT IN ('RESOLVED', 'CLOSED')
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    SELECT c.* INTO v_row
    FROM public.support_conversations c
    JOIN public.support_guest_secrets s ON s.conversation_id = c.id
    WHERE s.token_hash = p_guest_token_hash
      AND c.status NOT IN ('RESOLVED', 'CLOSED')
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    IF v_ip IS NOT NULL THEN
      PERFORM public.support_rate_limit_hit('ip-open:' || v_ip, 6, 3600);
    END IF;
    INSERT INTO public.support_conversations (user_id, status)
    VALUES (p_user_id, 'ASSISTANT')
    RETURNING * INTO v_row;
    IF coalesce(p_guest_token_hash, '') <> '' THEN
      INSERT INTO public.support_guest_secrets (conversation_id, token_hash)
      VALUES (v_row.id, p_guest_token_hash);
    END IF;
  END IF;

  RETURN public.support_conversation_payload(v_row.id, false)
    || jsonb_build_object('availability', public.support_desk_availability());
END;
$$;

CREATE FUNCTION public.support_service_history(
  p_user_id uuid,
  p_guest_token_hash text,
  p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.support_conversations%ROWTYPE;
  v_key text;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.support_require_enabled();
  v_row := public.support_assert_owner(p_conversation_id, p_user_id, p_guest_token_hash);
  v_key := CASE
    WHEN p_user_id IS NOT NULL THEN 'user-read:' || p_user_id::text
    ELSE 'guest-read:' || p_guest_token_hash
  END;
  PERFORM public.support_rate_limit_hit(v_key, 80, 600);
  RETURN public.support_conversation_payload(v_row.id, false)
    || jsonb_build_object('availability', public.support_desk_availability());
END;
$$;

CREATE FUNCTION public.support_service_customer_message(
  p_user_id uuid,
  p_guest_token_hash text,
  p_conversation_id uuid,
  p_body text,
  p_honeypot text,
  p_ip_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.support_conversations%ROWTYPE;
  v_body text := btrim(coalesce(p_body, ''));
  v_session text;
  v_ip text := nullif(left(coalesce(p_ip_hash, ''), 128), '');
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.support_require_enabled();

  IF v_ip IS NOT NULL THEN
    PERFORM public.support_rate_limit_hit('ip-msg:' || v_ip, 40, 3600);
  END IF;

  IF coalesce(btrim(p_honeypot), '') <> '' THEN
    RETURN jsonb_build_object('ok', true, 'dropped', true);
  END IF;

  v_row := public.support_assert_owner(p_conversation_id, p_user_id, p_guest_token_hash);

  IF v_row.status IN ('RESOLVED', 'CLOSED') THEN
    RAISE EXCEPTION 'this conversation is closed' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) < 1 THEN
    RAISE EXCEPTION 'message is empty' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'message is too long' USING ERRCODE = '22023';
  END IF;

  v_session := CASE
    WHEN p_user_id IS NOT NULL THEN 'user-msg:' || p_user_id::text
    ELSE 'guest-msg:' || p_guest_token_hash
  END;
  PERFORM public.support_rate_limit_hit(v_session, 8, 600);

  INSERT INTO public.support_messages (conversation_id, author_role, author_id, visibility, body)
  VALUES (
    v_row.id,
    'customer',
    p_user_id,
    'public',
    v_body
  );

  IF v_row.status = 'WAITING_ON_CUSTOMER' THEN
    UPDATE public.support_conversations
    SET status = CASE WHEN assigned_admin_id IS NULL THEN 'OPEN' ELSE 'IN_PROGRESS' END
    WHERE id = v_row.id;
  END IF;

  IF v_row.reference_number IS NOT NULL AND v_row.status IS DISTINCT FROM 'ASSISTANT' THEN
    PERFORM public.support_notify_admins(v_row.id, 'support.customer_reply');
  END IF;

  RETURN public.support_conversation_payload(v_row.id, false)
    || jsonb_build_object('availability', public.support_desk_availability(), 'ok', true);
END;
$$;

CREATE FUNCTION public.support_service_assistant_message(
  p_conversation_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
BEGIN
  PERFORM public.require_service_role();
  IF NOT EXISTS (SELECT 1 FROM public.support_conversations WHERE id = p_conversation_id) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;
  IF char_length(v_body) < 1 OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'message is too long' USING ERRCODE = '22023';
  END IF;
  PERFORM public.support_reject_html(v_body);

  INSERT INTO public.support_messages (conversation_id, author_role, visibility, body)
  VALUES (p_conversation_id, 'assistant', 'public', v_body)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Records one model call. Called by the Edge Function after every call it
-- makes, including failures, so the dollar budget counts what was spent.
CREATE FUNCTION public.support_service_record_ai_usage(
  p_conversation_id uuid,
  p_model text,
  p_outcome text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_usd_micros bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.require_service_role();
  INSERT INTO public.support_ai_usage (
    conversation_id, model, outcome, input_tokens, output_tokens, cost_usd_micros
  )
  VALUES (
    p_conversation_id,
    left(coalesce(nullif(btrim(p_model), ''), 'unknown'), 100),
    p_outcome,
    p_input_tokens,
    p_output_tokens,
    greatest(coalesce(p_cost_usd_micros, 0), 0)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.support_service_escalate(
  p_user_id uuid,
  p_guest_token_hash text,
  p_conversation_id uuid,
  p_body text,
  p_honeypot text,
  p_ip_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.support_conversations%ROWTYPE;
  v_body text := btrim(coalesce(p_body, ''));
  v_availability text;
  v_session text;
  v_ip text := nullif(left(coalesce(p_ip_hash, ''), 128), '');
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.support_require_enabled();

  IF coalesce(btrim(p_honeypot), '') <> '' THEN
    RETURN jsonb_build_object('ok', true, 'dropped', true);
  END IF;

  v_row := public.support_assert_owner(p_conversation_id, p_user_id, p_guest_token_hash);
  v_availability := public.support_desk_availability();

  IF v_row.reference_number IS NOT NULL AND v_row.status NOT IN ('RESOLVED', 'CLOSED') THEN
    RETURN public.support_conversation_payload(v_row.id, false)
      || jsonb_build_object(
        'ok', true,
        'availability', v_availability,
        'human_joined', v_row.agent_joined_at IS NOT NULL,
        'already_open', true
      );
  END IF;

  IF char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'message is too long' USING ERRCODE = '22023';
  END IF;

  v_session := CASE
    WHEN p_user_id IS NOT NULL THEN 'user-esc:' || p_user_id::text
    ELSE 'guest-esc:' || p_guest_token_hash
  END;
  PERFORM public.support_rate_limit_hit(v_session, 4, 3600);
  IF v_ip IS NOT NULL THEN
    PERFORM public.support_rate_limit_hit('ip-esc:' || v_ip, 10, 3600);
  END IF;

  IF char_length(v_body) > 0 THEN
    INSERT INTO public.support_messages (conversation_id, author_role, author_id, visibility, body)
    VALUES (v_row.id, 'customer', p_user_id, 'public', v_body);
  END IF;

  UPDATE public.support_conversations
  SET reference_number = coalesce(reference_number, nextval('public.support_ticket_ref_seq')),
      status = 'OPEN',
      availability_at_open = v_availability,
      resolved_at = NULL,
      closed_at = NULL
  WHERE id = v_row.id;

  INSERT INTO public.support_messages (conversation_id, author_role, visibility, body)
  VALUES (
    v_row.id,
    'system',
    'public',
    CASE v_availability
      WHEN 'offline' THEN 'Support is offline. Your message is saved. A person has not joined this chat.'
      WHEN 'away' THEN 'Support is away. Your message is saved. A person has not joined this chat.'
      ELSE 'Your message is with the support queue. A person has not joined this chat yet.'
    END
  );

  PERFORM public.support_notify_admins(v_row.id, 'support.escalated');
  PERFORM public.write_audit_log(
    p_user_id,
    'support.escalated',
    'support_conversation',
    v_row.id,
    jsonb_build_object('availability', v_availability)
  );

  RETURN public.support_conversation_payload(v_row.id, false)
    || jsonb_build_object(
      'ok', true,
      'availability', v_availability,
      'human_joined', false
    );
END;
$$;

CREATE FUNCTION public.support_service_context(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_service_role();
  RETURN jsonb_build_object(
    'enabled', coalesce((SELECT priority_help_enabled FROM public.support_settings WHERE id = true), false),
    'ai_enabled', coalesce((SELECT priority_help_enabled AND ai_answers_enabled FROM public.support_settings WHERE id = true), false),
    'pricing', public.support_public_pricing(),
    'articles', public.support_search_kb(p_query, 4),
    'availability', public.support_desk_availability()
  );
END;
$$;

-- Model calls and dollars spent in the last 24 hours against the daily answer
-- cap and the daily dollar budget. allowed is false when Priority Help or AI
-- answers are off, the cap is 0 or used, or the budget is 0 or used.
-- Granted only to service_role.
CREATE FUNCTION public.support_service_ai_budget()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.support_settings%ROWTYPE;
  v_used integer;
  v_spent bigint;
  v_cap integer;
  v_budget bigint;
  v_on boolean;
BEGIN
  PERFORM public.require_service_role();
  SELECT * INTO v_settings FROM public.support_settings WHERE id = true;
  v_cap := coalesce(v_settings.daily_ai_answer_cap, 0);
  v_budget := coalesce(v_settings.daily_ai_budget_usd_micros, 0);
  v_on := coalesce(v_settings.priority_help_enabled, false) AND coalesce(v_settings.ai_answers_enabled, false);
  SELECT count(*)::integer, coalesce(sum(cost_usd_micros), 0)::bigint
  INTO v_used, v_spent
  FROM public.support_ai_usage
  WHERE created_at >= now() - interval '24 hours';
  RETURN jsonb_build_object(
    'allowed', v_on AND v_cap > 0 AND v_used < v_cap AND v_budget > 0 AND v_spent < v_budget,
    'enabled', v_on,
    'used', coalesce(v_used, 0),
    'cap', v_cap,
    'spent_usd_micros', coalesce(v_spent, 0),
    'budget_usd_micros', v_budget
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin Support Center. Every function calls public.is_admin().
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.admin_support_list(
  p_queue text DEFAULT 'open',
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue text := lower(btrim(coalesce(p_queue, 'open')));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_rows jsonb;
BEGIN
  PERFORM public.support_require_admin();
  IF v_queue NOT IN ('open', 'assigned', 'waiting', 'resolved', 'closed', 'all', 'mine') THEN
    RAISE EXCEPTION 'unknown support queue' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY sort_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'reference', public.support_reference_label(c.reference_number),
      'status', c.status,
      'priority', c.priority,
      'assigned_admin_id', c.assigned_admin_id,
      'agent_joined_at', c.agent_joined_at,
      'created_at', c.created_at,
      'last_message_at', c.last_message_at,
      'role', p.account_type,
      'display_name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
      'guest', c.user_id IS NULL
    ) AS item,
    coalesce(c.last_message_at, c.created_at) AS sort_at
    FROM public.support_conversations c
    LEFT JOIN public.profiles p ON p.id = c.user_id
    WHERE c.reference_number IS NOT NULL
      AND (
        (v_queue = 'open' AND c.status = 'OPEN')
        OR (v_queue = 'assigned' AND c.status = 'IN_PROGRESS')
        OR (v_queue = 'waiting' AND c.status = 'WAITING_ON_CUSTOMER')
        OR (v_queue = 'resolved' AND c.status = 'RESOLVED')
        OR (v_queue = 'closed' AND c.status = 'CLOSED')
        OR (v_queue = 'all')
        OR (
          v_queue = 'mine'
          AND c.assigned_admin_id = auth.uid()
          AND c.status IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER')
        )
      )
    ORDER BY coalesce(c.last_message_at, c.created_at) DESC
    LIMIT v_limit
  ) listed;

  RETURN jsonb_build_object(
    'queue', v_queue,
    'availability', public.support_desk_availability(),
    'rows', v_rows
  );
END;
$$;

CREATE FUNCTION public.admin_support_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.support_require_admin();
  RETURN public.support_conversation_payload(p_id, true)
    || jsonb_build_object('availability', public.support_desk_availability());
END;
$$;

CREATE FUNCTION public.admin_support_search(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := left(btrim(coalesce(p_query, '')), 200);
  v_number text;
  v_rows jsonb;
BEGIN
  PERFORM public.support_require_admin();
  IF v_query = '' THEN
    RETURN '[]'::jsonb;
  END IF;
  v_number := nullif(regexp_replace(upper(v_query), '[^0-9]', '', 'g'), '');

  SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'reference', public.support_reference_label(c.reference_number),
      'status', c.status,
      'visibility', m.visibility,
      'excerpt', left(m.body, 180),
      'created_at', m.created_at
    ) AS item
    FROM public.support_messages m
    JOIN public.support_conversations c ON c.id = m.conversation_id
    WHERE (
      v_number IS NOT NULL AND c.reference_number::text = v_number
    ) OR (
      to_tsvector('english', m.body) @@ websearch_to_tsquery('english', v_query)
    )
    ORDER BY m.created_at DESC
    LIMIT 40
  ) found;

  RETURN v_rows;
END;
$$;

CREATE FUNCTION public.admin_support_set_status(p_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := upper(btrim(coalesce(p_status, '')));
BEGIN
  PERFORM public.support_require_admin();
  IF v_status NOT IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED') THEN
    RAISE EXCEPTION 'unknown support status' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_conversations WHERE id = p_id AND reference_number IS NOT NULL) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.support_conversations
  SET status = v_status,
      resolved_at = CASE
        WHEN v_status = 'RESOLVED' THEN coalesce(resolved_at, now())
        WHEN v_status IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER') THEN NULL
        ELSE resolved_at
      END,
      closed_at = CASE
        WHEN v_status = 'CLOSED' THEN coalesce(closed_at, now())
        WHEN v_status IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER') THEN NULL
        ELSE closed_at
      END
  WHERE id = p_id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'support.status_changed',
    'support_conversation',
    p_id,
    jsonb_build_object('status', v_status)
  );
  RETURN public.support_conversation_payload(p_id, true);
END;
$$;

CREATE FUNCTION public.admin_support_set_priority(p_id uuid, p_priority text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_priority text := upper(btrim(coalesce(p_priority, '')));
BEGIN
  PERFORM public.support_require_admin();
  IF v_priority NOT IN ('LOW', 'NORMAL', 'HIGH', 'URGENT') THEN
    RAISE EXCEPTION 'unknown support priority' USING ERRCODE = '22023';
  END IF;
  UPDATE public.support_conversations
  SET priority = v_priority
  WHERE id = p_id AND reference_number IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.write_audit_log(
    auth.uid(),
    'support.priority_changed',
    'support_conversation',
    p_id,
    jsonb_build_object('priority', v_priority)
  );
  RETURN public.support_conversation_payload(p_id, true);
END;
$$;

CREATE FUNCTION public.admin_support_takeover(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.support_conversations%ROWTYPE;
  v_new_assignment boolean := false;
BEGIN
  PERFORM public.support_require_admin();
  SELECT * INTO v_row FROM public.support_conversations WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.support_assignments
  SET released_at = now()
  WHERE conversation_id = p_id
    AND released_at IS NULL
    AND admin_id IS DISTINCT FROM auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.support_assignments
    WHERE conversation_id = p_id AND admin_id = auth.uid() AND released_at IS NULL
  ) THEN
    INSERT INTO public.support_assignments (conversation_id, admin_id)
    VALUES (p_id, auth.uid());
    v_new_assignment := true;
  END IF;

  UPDATE public.support_conversations
  SET assigned_admin_id = auth.uid(),
      agent_joined_at = coalesce(agent_joined_at, now()),
      reference_number = coalesce(reference_number, nextval('public.support_ticket_ref_seq')),
      status = CASE
        WHEN status IN ('ASSISTANT', 'OPEN') THEN 'IN_PROGRESS'
        ELSE status
      END,
      availability_at_open = coalesce(availability_at_open, public.support_desk_availability())
  WHERE id = p_id;

  IF v_row.agent_joined_at IS NULL THEN
    INSERT INTO public.support_messages (conversation_id, author_role, author_id, visibility, body)
    VALUES (p_id, 'system', auth.uid(), 'public', 'A support teammate has joined.');
  END IF;

  IF v_new_assignment THEN
    PERFORM public.write_audit_log(
      auth.uid(),
      'support.assigned',
      'support_conversation',
      p_id,
      '{}'::jsonb
    );
  END IF;
  RETURN public.support_conversation_payload(p_id, true);
END;
$$;

CREATE FUNCTION public.admin_support_reply(p_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text := btrim(coalesce(p_body, ''));
BEGIN
  PERFORM public.support_require_admin();
  IF char_length(v_body) < 1 OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'message is too long' USING ERRCODE = '22023';
  END IF;
  PERFORM public.support_reject_html(v_body);
  IF NOT EXISTS (SELECT 1 FROM public.support_conversations WHERE id = p_id) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.admin_support_takeover(p_id);

  INSERT INTO public.support_messages (conversation_id, author_role, author_id, visibility, body)
  VALUES (p_id, 'admin', auth.uid(), 'public', v_body);

  UPDATE public.support_conversations
  SET first_response_at = coalesce(first_response_at, now()),
      status = CASE WHEN status = 'OPEN' THEN 'IN_PROGRESS' ELSE status END
  WHERE id = p_id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'support.replied',
    'support_conversation',
    p_id,
    jsonb_build_object('chars', char_length(v_body))
  );
  RETURN public.support_conversation_payload(p_id, true);
END;
$$;

CREATE FUNCTION public.admin_support_note(p_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text := btrim(coalesce(p_body, ''));
BEGIN
  PERFORM public.support_require_admin();
  IF char_length(v_body) < 1 OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'note is too long' USING ERRCODE = '22023';
  END IF;
  PERFORM public.support_reject_html(v_body);
  IF NOT EXISTS (SELECT 1 FROM public.support_conversations WHERE id = p_id) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.support_messages (conversation_id, author_role, author_id, visibility, body)
  VALUES (p_id, 'admin', auth.uid(), 'internal', v_body);

  PERFORM public.write_audit_log(
    auth.uid(),
    'support.note_added',
    'support_conversation',
    p_id,
    jsonb_build_object('chars', char_length(v_body))
  );
  RETURN public.support_conversation_payload(p_id, true);
END;
$$;

CREATE FUNCTION public.admin_support_set_presence(p_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := lower(btrim(coalesce(p_status, '')));
BEGIN
  PERFORM public.support_require_admin();
  IF v_status NOT IN ('available', 'away', 'offline') THEN
    RAISE EXCEPTION 'unknown support presence' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.support_agent_status (admin_id, status, last_seen_at)
  VALUES (auth.uid(), v_status, now())
  ON CONFLICT (admin_id) DO UPDATE
  SET status = EXCLUDED.status,
      last_seen_at = now();
  PERFORM public.write_audit_log(
    auth.uid(),
    'support.presence_set',
    'support_agent_status',
    auth.uid(),
    jsonb_build_object('status', v_status)
  );
  RETURN public.support_desk_availability();
END;
$$;

CREATE FUNCTION public.admin_support_heartbeat()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.support_require_admin();
  UPDATE public.support_agent_status
  SET last_seen_at = now()
  WHERE admin_id = auth.uid();
  RETURN public.support_desk_availability();
END;
$$;

CREATE FUNCTION public.admin_support_analytics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 366);
  v_from timestamptz := now() - make_interval(days => v_days);
  v_median numeric;
  v_responded integer;
  v_opened integer;
  v_by_status jsonb;
  v_by_day jsonb;
BEGIN
  PERFORM public.support_require_admin();

  SELECT count(*) INTO v_opened
  FROM public.support_conversations
  WHERE reference_number IS NOT NULL
    AND created_at >= v_from;

  SELECT count(*), percentile_cont(0.5) WITHIN GROUP (
    ORDER BY extract(epoch FROM (first_response_at - created_at))
  )
  INTO v_responded, v_median
  FROM public.support_conversations
  WHERE reference_number IS NOT NULL
    AND first_response_at IS NOT NULL
    AND created_at >= v_from;

  SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
  INTO v_by_status
  FROM (
    SELECT status, count(*) AS n
    FROM public.support_conversations
    WHERE reference_number IS NOT NULL
    GROUP BY status
  ) counts;

  SELECT coalesce(jsonb_agg(jsonb_build_object('day', day, 'opened', opened) ORDER BY day), '[]'::jsonb)
  INTO v_by_day
  FROM (
    SELECT (created_at AT TIME ZONE 'America/Chicago')::date AS day, count(*) AS opened
    FROM public.support_conversations
    WHERE reference_number IS NOT NULL
      AND created_at >= v_from
    GROUP BY 1
  ) days;

  RETURN jsonb_build_object(
    'days', v_days,
    'timezone', 'America/Chicago',
    'opened', v_opened,
    'with_first_response', coalesce(v_responded, 0),
    'median_first_response_seconds', v_median,
    'by_status', v_by_status,
    'by_day', v_by_day,
    'availability', public.support_desk_availability()
  );
END;
$$;

CREATE FUNCTION public.admin_support_kb_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  PERFORM public.support_require_admin();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'slug', slug,
    'title', title,
    'body_md', body_md,
    'status', status,
    'updated_at', updated_at
  ) ORDER BY updated_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.support_kb_articles;
  RETURN v_rows;
END;
$$;

CREATE FUNCTION public.admin_support_kb_save(
  p_id uuid,
  p_title text,
  p_body text,
  p_status text,
  p_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_status text := upper(btrim(coalesce(p_status, 'DRAFT')));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_id uuid := p_id;
BEGIN
  PERFORM public.support_require_admin();
  IF v_status NOT IN ('DRAFT', 'PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'unknown article status' USING ERRCODE = '22023';
  END IF;
  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'article slug must be lowercase words' USING ERRCODE = '22023';
  END IF;
  PERFORM public.support_reject_html(v_title);
  PERFORM public.support_reject_html(v_body);
  IF char_length(v_title) < 1 OR char_length(v_title) > 160
     OR char_length(v_body) < 1 OR char_length(v_body) > 20000 THEN
    RAISE EXCEPTION 'article is empty or too long' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.support_kb_articles (slug, title, body_md, status, updated_by)
    VALUES (v_slug, v_title, v_body, v_status, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.support_kb_articles
    SET slug = v_slug,
        title = v_title,
        body_md = v_body,
        status = v_status,
        updated_by = auth.uid()
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'article not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM public.write_audit_log(
    auth.uid(),
    'support.kb_saved',
    'support_kb_article',
    v_id,
    jsonb_build_object('slug', v_slug, 'status', v_status)
  );
  RETURN public.admin_support_kb_list();
END;
$$;

CREATE FUNCTION public.admin_support_canned_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  PERFORM public.support_require_admin();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'title', title,
    'body_md', body_md,
    'updated_at', updated_at
  ) ORDER BY title), '[]'::jsonb)
  INTO v_rows
  FROM public.support_canned_responses;
  RETURN v_rows;
END;
$$;

CREATE FUNCTION public.admin_support_canned_save(
  p_id uuid,
  p_title text,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid := p_id;
BEGIN
  PERFORM public.support_require_admin();
  PERFORM public.support_reject_html(v_title);
  PERFORM public.support_reject_html(v_body);
  IF char_length(v_title) < 1 OR char_length(v_title) > 160
     OR char_length(v_body) < 1 OR char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'canned response is empty or too long' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.support_canned_responses (title, body_md, updated_by)
    VALUES (v_title, v_body, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.support_canned_responses
    SET title = v_title, body_md = v_body, updated_by = auth.uid()
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'canned response not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM public.write_audit_log(
    auth.uid(),
    'support.canned_saved',
    'support_canned_response',
    v_id,
    jsonb_build_object('title', v_title)
  );
  RETURN public.admin_support_canned_list();
END;
$$;

CREATE FUNCTION public.admin_support_canned_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.support_require_admin();
  DELETE FROM public.support_canned_responses WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'canned response not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.write_audit_log(
    auth.uid(),
    'support.canned_deleted',
    'support_canned_response',
    p_id,
    '{}'::jsonb
  );
  RETURN public.admin_support_canned_list();
END;
$$;

CREATE FUNCTION public.admin_support_set_retention(p_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.support_require_admin();
  IF p_days IS NULL OR p_days < 30 OR p_days > 3650 THEN
    RAISE EXCEPTION 'retention must be between 30 and 3650 days' USING ERRCODE = '22023';
  END IF;
  UPDATE public.support_settings
  SET retention_days = p_days, updated_by = auth.uid()
  WHERE id = true;
  PERFORM public.write_audit_log(
    auth.uid(),
    'support.retention_set',
    'support_settings',
    NULL,
    jsonb_build_object('retention_days', p_days)
  );
  RETURN p_days;
END;
$$;

-- Feature flags, cap, and dollar budget. Admin only, audited. This is the
-- kill switch: p_enabled false hides the widget and stops every model call.
CREATE FUNCTION public.admin_support_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.support_settings%ROWTYPE;
BEGIN
  PERFORM public.support_require_admin();
  SELECT * INTO v_settings FROM public.support_settings WHERE id = true;
  RETURN jsonb_build_object(
    'priority_help_enabled', v_settings.priority_help_enabled,
    'ai_answers_enabled', v_settings.ai_answers_enabled,
    'daily_ai_answer_cap', v_settings.daily_ai_answer_cap,
    'daily_ai_budget_usd_micros', v_settings.daily_ai_budget_usd_micros,
    'retention_days', v_settings.retention_days,
    'guest_retention_days', v_settings.guest_retention_days,
    'calls_24h', (SELECT count(*) FROM public.support_ai_usage WHERE created_at >= now() - interval '24 hours'),
    'spent_24h_usd_micros', (SELECT coalesce(sum(cost_usd_micros), 0) FROM public.support_ai_usage WHERE created_at >= now() - interval '24 hours'),
    'spent_30d_usd_micros', (SELECT coalesce(sum(cost_usd_micros), 0) FROM public.support_ai_usage WHERE created_at >= now() - interval '30 days')
  );
END;
$$;

CREATE FUNCTION public.admin_support_set_settings(
  p_priority_help_enabled boolean,
  p_ai_answers_enabled boolean,
  p_daily_ai_answer_cap integer,
  p_daily_ai_budget_usd_micros bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.support_require_admin();
  IF p_priority_help_enabled IS NULL OR p_ai_answers_enabled IS NULL THEN
    RAISE EXCEPTION 'flags are required' USING ERRCODE = '22023';
  END IF;
  IF p_daily_ai_answer_cap IS NULL OR p_daily_ai_answer_cap < 0 OR p_daily_ai_answer_cap > 100000 THEN
    RAISE EXCEPTION 'daily answer cap must be between 0 and 100000' USING ERRCODE = '22023';
  END IF;
  IF p_daily_ai_budget_usd_micros IS NULL OR p_daily_ai_budget_usd_micros < 0 OR p_daily_ai_budget_usd_micros > 100000000 THEN
    RAISE EXCEPTION 'daily budget must be between $0 and $100' USING ERRCODE = '22023';
  END IF;
  UPDATE public.support_settings
  SET priority_help_enabled = p_priority_help_enabled,
      ai_answers_enabled = p_ai_answers_enabled,
      daily_ai_answer_cap = p_daily_ai_answer_cap,
      daily_ai_budget_usd_micros = p_daily_ai_budget_usd_micros,
      updated_by = auth.uid()
  WHERE id = true;
  PERFORM public.write_audit_log(
    auth.uid(),
    'support.settings_set',
    'support_settings',
    NULL,
    jsonb_build_object(
      'priority_help_enabled', p_priority_help_enabled,
      'ai_answers_enabled', p_ai_answers_enabled,
      'daily_ai_answer_cap', p_daily_ai_answer_cap,
      'daily_ai_budget_usd_micros', p_daily_ai_budget_usd_micros
    )
  );
  RETURN public.admin_support_settings();
END;
$$;

-- Retention. Shared by the daily job and the admin button.
--   Guests (user_id IS NULL): deleted guest_retention_days (default 90) after
--   the last message, unless a ticket is still OPEN, IN_PROGRESS, or
--   WAITING_ON_CUSTOMER.
--   Signed-in users: RESOLVED or CLOSED conversations are deleted
--   retention_days (default 365) after they were resolved or closed; an
--   AI-only (ASSISTANT) conversation is deleted retention_days after its
--   last message.
-- Messages, assignments, and guest secrets cascade. support_ai_usage keeps
-- token counts and cost with no conversation link. Old rate-limit rows go too.
CREATE FUNCTION public.support_purge_expired_core(p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_guest_days integer;
  v_guests integer;
  v_users integer;
BEGIN
  SELECT retention_days, guest_retention_days INTO v_days, v_guest_days
  FROM public.support_settings WHERE id = true;
  v_days := coalesce(v_days, 365);
  v_guest_days := coalesce(v_guest_days, 90);

  DELETE FROM public.support_conversations
  WHERE user_id IS NULL
    AND status IN ('ASSISTANT', 'RESOLVED', 'CLOSED')
    AND greatest(coalesce(last_message_at, created_at), coalesce(closed_at, resolved_at, created_at), created_at)
        < now() - make_interval(days => v_guest_days);
  GET DIAGNOSTICS v_guests = ROW_COUNT;

  DELETE FROM public.support_conversations
  WHERE user_id IS NOT NULL
    AND (
      (status IN ('RESOLVED', 'CLOSED')
        AND coalesce(closed_at, resolved_at, updated_at) < now() - make_interval(days => v_days))
      OR (status = 'ASSISTANT'
        AND coalesce(last_message_at, created_at) < now() - make_interval(days => v_days))
    );
  GET DIAGNOSTICS v_users = ROW_COUNT;

  DELETE FROM public.support_rate_limits
  WHERE window_started_at < now() - interval '2 days';

  PERFORM public.write_audit_log(
    p_actor,
    'support.purged',
    'support_conversation',
    NULL,
    jsonb_build_object(
      'guest_conversations', v_guests,
      'user_conversations', v_users,
      'guest_retention_days', v_guest_days,
      'retention_days', v_days,
      'automatic', p_actor IS NULL
    )
  );
  RETURN jsonb_build_object('guest_conversations', v_guests, 'user_conversations', v_users);
END;
$$;

-- Called by pg_cron only. No client grants.
CREATE FUNCTION public.support_purge_expired_auto()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.support_purge_expired_core(NULL);
$$;

-- The admin button runs the same rules now instead of waiting for the job.
CREATE FUNCTION public.admin_support_purge_expired()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.support_require_admin();
  v_result := public.support_purge_expired_core(auth.uid());
  RETURN coalesce((v_result ->> 'guest_conversations')::integer, 0)
    + coalesce((v_result ->> 'user_conversations')::integer, 0);
END;
$$;

-- Account deletion. Runs when the profile row is removed (auth.users cascade
-- after delete-account). Does not replace purge_account_owned_rows.
CREATE FUNCTION public.purge_support_on_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.support_conversations
  WHERE user_id = OLD.id;

  DELETE FROM public.support_conversations WHERE user_id = OLD.id;

  UPDATE public.support_conversations
  SET assigned_admin_id = NULL
  WHERE assigned_admin_id = OLD.id;

  PERFORM public.write_audit_log(
    NULL,
    'support.account_purged',
    'profile',
    OLD.id,
    jsonb_build_object('conversations', v_count)
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER support_purge_on_profile_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_support_on_profile_delete();

-- ---------------------------------------------------------------------------
-- Privileges. Anon gets nothing. Authenticated gets SELECT only where RLS
-- can express ownership. Writes go through the functions above.
-- ---------------------------------------------------------------------------

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_guest_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_canned_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_agent_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ai_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_guest_secrets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_kb_articles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_canned_responses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_agent_status FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_rate_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_ai_usage FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.support_conversations TO authenticated;
GRANT SELECT ON TABLE public.support_messages TO authenticated;
GRANT SELECT ON TABLE public.support_agent_status TO authenticated;

CREATE POLICY support_conversations_select_own_or_admin
  ON public.support_conversations
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY support_messages_select_public_own_or_admin
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      visibility = 'public'
      AND EXISTS (
        SELECT 1
        FROM public.support_conversations c
        WHERE c.id = conversation_id
          AND c.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY support_agent_status_select_admin
  ON public.support_agent_status
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policies. Clients cannot write these tables.

REVOKE ALL ON FUNCTION public.support_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_reject_html(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_touch_conversation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_one_active_guest() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_require_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_require_enabled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_reference_label(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_message_json(public.support_messages) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_conversation_payload(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_assert_owner(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_notify_admins(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_desk_availability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_public_pricing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_search_kb(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_support_on_profile_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_purge_expired_core(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_purge_expired_auto() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.support_service_open(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_service_history(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_service_customer_message(uuid, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_service_assistant_message(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_service_escalate(uuid, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_service_context(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_service_ai_budget() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_service_record_ai_usage(uuid, text, text, integer, integer, bigint) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.support_service_open(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.support_service_history(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.support_service_customer_message(uuid, text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.support_service_assistant_message(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.support_service_escalate(uuid, text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.support_service_context(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.support_service_ai_budget() TO service_role;
GRANT EXECUTE ON FUNCTION public.support_service_record_ai_usage(uuid, text, text, integer, integer, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.support_public_pricing() TO service_role;
GRANT EXECUTE ON FUNCTION public.support_search_kb(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.support_desk_availability() TO service_role;

REVOKE ALL ON FUNCTION public.admin_support_list(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_search(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_set_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_set_priority(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_takeover(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_reply(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_note(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_set_presence(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_heartbeat() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_analytics(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_kb_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_kb_save(uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_canned_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_canned_save(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_canned_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_set_retention(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_purge_expired() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_set_settings(boolean, boolean, integer, bigint) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_support_list(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_search(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_set_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_set_priority(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_takeover(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_reply(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_set_presence(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_heartbeat() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_analytics(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_kb_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_kb_save(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_canned_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_canned_save(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_canned_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_set_retention(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_purge_expired() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_set_settings(boolean, boolean, integer, bigint) TO authenticated;

-- Realtime. Postgres Changes are filtered by the SELECT policies above.
-- Private broadcast/presence on topic support:desk is admin-only when the
-- realtime.messages table exists. Guests are not members of that channel.
ALTER TABLE public.support_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
ALTER TABLE public.support_agent_status REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_conversations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_agent_status'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.support_agent_status;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RETURN;
  END IF;
  IF to_regprocedure('realtime.topic()') IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    EXECUTE $policy$
      CREATE POLICY support_desk_presence_select
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        realtime.topic() = 'support:desk'
        AND public.is_admin()
      )
    $policy$;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    EXECUTE $policy$
      CREATE POLICY support_desk_presence_insert
      ON realtime.messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        realtime.topic() = 'support:desk'
        AND public.is_admin()
      )
    $policy$;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- Daily retention job (pg_cron). 08:17 UTC is 3:17 AM Central (CDT).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE WARNING 'pg_cron is not available: Priority Help retention runs only from the admin Purge expired button';
    RETURN;
  END IF;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'priority-help-retention') THEN
      PERFORM cron.unschedule('priority-help-retention');
    END IF;
    PERFORM cron.schedule('priority-help-retention', '17 8 * * *', 'SELECT public.support_purge_expired_auto()');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'could not schedule Priority Help retention with pg_cron (%): schedule it manually', SQLERRM;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- Seed knowledge. Plain markdown. Live prices are still read from
-- platform_settings at answer time; these articles describe the public rules.
-- Idempotent: slug conflict does nothing, so a re-run does not overwrite edits.
--
-- Policy limits (owner, 2026-10-11): Priority Property Pros is a marketplace.
-- It does not guarantee, employ, supervise, inspect, insure, or verify
-- contractors' work, and it does not resolve construction disputes. Fees are
-- generally non-refundable once delivered. Exception requests and complaints
-- go to a person. This seed does not change Stripe or payment functions.
--
-- Updated 2026-10-11 to match the live site at activation: legal documents
-- published (Terms v3, Privacy v2, Refund v1, Community v1, Review & Content
-- v1, Contractor Participation v1); undeliverable $4.99 Connect refunded
-- automatically; the homeowner controls contact sharing after Connect;
-- account deletion works (also for unpaid accounts); the support email is
-- shown only on the Contact us page, so articles point there and never give
-- an email address.
-- ---------------------------------------------------------------------------

INSERT INTO public.support_kb_articles (slug, title, body_md, status)
VALUES
(
  'independent-marketplace',
  'Independent marketplace and contractor responsibility',
  $md$
Priority Property Pros is an online platform that connects homeowners with independent contractors. It is not a construction company. It does not perform the work.

Contractors are independent third parties. They are not employees or agents of Priority Property Pros. Priority Property Pros does not employ contractors. It is not a party to the agreement between a homeowner and a contractor.

Contractors are responsible for their workmanship, their employees, their subcontractors, the licenses they need, their insurance obligations, safety, permits, warranties, and damage they cause. Homeowners are responsible for selecting a contractor, reviewing estimates, and agreeing to the project terms.

Priority Property Pros does not guarantee a contractor's performance, qualifications, or the outcome of a job. It does not supervise the work. It does not manage the project. It does not inspect the work. It does not insure the work. It does not verify the contractor's work.

Approving a contractor profile is not verification of workmanship, a license, or insurance, and it is not employment. A public listing is not a promise that Priority Property Pros checked the work.
  $md$,
  'PUBLISHED'
),
(
  'registration-and-activation',
  'Registration and the one-time activation',
  $md$
Homeowners and contractors both create an account and confirm their email.

A one-time account activation applies to homeowners and to contractors. The amount is the live activation fee, currently $9.99, charged only while that checkout is turned on. It is charged once through Stripe Checkout. It is not a subscription and it is not a commission.

The activation service is delivered when the server verifies the Stripe payment and marks the fee paid, not when the checkout page succeeds. That purchase is the right to use the paid marketplace: a homeowner can post a project into matching, and a contractor can use the paid parts of the account. The assistant must quote the live amount it was given, not a remembered number.

Once that service is delivered, the activation fee is generally non-refundable. A $9.99 charge that does not result in the account being marked paid is an erroneous charge; the owner reviews it and, if confirmed, refunds it through Stripe. This chat cannot see whether a specific person has paid, and it cannot mark an account paid.

At signup every new account must agree to the current Terms of Service and policies and affirm that they are 18 or older. Someone who already had an account is asked to accept the current versions at their next sign-in. Until they accept, they can still view their information and delete the account, but new marketplace actions such as posting a project or paying Connect are paused.

An account that has not paid the activation yet can still open its account settings: change the email or password, see notifications, and delete the account. The paid marketplace pages wait until activation is paid.
  $md$,
  'PUBLISHED'
),
(
  'contractor-approval',
  'Contractor approval',
  $md$
New contractors submit a profile. An admin reviews it. Statuses are pending, approved, or rejected. The admin may ask for more information.

Approval is a person at Priority Property Pros. This chat cannot approve, reject, or speed up a review.

Approval of a profile is not verification of workmanship, a license, or insurance. It does not mean Priority Property Pros employs the contractor or guarantees the work.

Find a Pro shows an approved contractor only in the public-safe way: no business name until a paid Connect, and no phone, email, or street address.
  $md$,
  'PUBLISHED'
),
(
  'posting-a-project',
  'Posting a project',
  $md$
A homeowner describes the work, the property city and ZIP, timing, and photos if they want. Drafts stay private. Posting sends the project into matching after activation is satisfied.

The project gets a PPP reference number. Contractors in range can be offered the job. The homeowner compares estimates on the project and chooses who to hire. Priority Property Pros does not supervise the job and does not select the contractor for the homeowner.

The homeowner does not get the contractor's private contact details from the posting itself. The assistant must not repeat a private project description, address, or photo back as if it looked the account up. It does not have that access.
  $md$,
  'PUBLISHED'
),
(
  'estimates',
  'Estimates',
  $md$
An approved contractor who accepted an opportunity can send an estimate. The homeowner can view, compare, decline, or select one estimate.

Selecting an estimate starts the hire path. It does not by itself publish the contractor's business name or contact details. The homeowner and the contractor agree the project terms between themselves. Priority Property Pros is not a party to that agreement and does not guarantee the estimate.

There is no platform commission on the estimate. Any percentage shown in an old estimate preview is not a fee Priority Property Pros charges. Do not describe a contractor percentage fee.
  $md$,
  'PUBLISHED'
),
(
  'payments-and-fees',
  'Payments and fees',
  $md$
Two public fees exist. There is no subscription and no commission on the job.

1. One-time account activation for homeowners and contractors. The live amount is currently $9.99. The activation service is delivered when the server verifies the Stripe payment and marks the fee paid, not when the checkout page succeeds.
2. Contractor Connect. The live amount is currently $4.99. The contractor pays it to connect on one project. It opens messaging between that homeowner and that contractor on that project. The homeowner decides whether and when to share their own contact details; Connect does not hand the contractor the homeowner's phone, email, or address. It does not promise the homeowner will hire that contractor. The Connect service is delivered when the server verifies that payment and unlocks that connection. A contractor cannot pay Connect on a job that is cancelled, closed, expired, or where the homeowner blocked them.

Job payments through the platform are not live. Priority Property Pros does not take a cut of the contractor's price. Workmanship payments are between the homeowner and the contractor.

Activation and Connect are collected by Stripe Checkout. Fees are generally non-refundable once the applicable service is delivered.

Automatic Connect refunds: if a contractor is charged the $4.99 but the connection can't be provided (the project was cancelled or closed, the opportunity expired or is no longer open, the homeowner blocked the contractor or stopped new connections, the reservation expired before payment finished, or the same connection was charged twice), Priority Property Pros refunds the $4.99 automatically, once, to the original payment method. The contractor does not need to ask. A delivered connection is not refunded automatically.

Other exceptions are a duplicate charge, an erroneous charge, a legally required refund, or an approved exception. This chat cannot start any of those. Ask the person to use Talk to Support or the Contact us page. A person reviews the exception, and an approved refund is issued through Stripe by the owner. Do not promise a refund.

Never mention a hidden legacy contractor percentage. It is not charged.
  $md$,
  'PUBLISHED'
),
(
  'reviews',
  'Reviews',
  $md$
After a booked job, the people on that job can leave a review. Reviews can be edited inside the published edit window.

Platform reviews on the public reviews page are separate. They are moderated. Moderating a review is not a guarantee of the contractor's work.

The assistant cannot delete a review, change a star rating, or confirm what a specific review says. A report about a suspected fake review goes to a person through Talk to Support.
  $md$,
  'PUBLISHED'
),
(
  'find-a-pro',
  'Find a Pro',
  $md$
Find a Pro is the public directory. Visitors can browse approved pros by service and area.

Until a contractor pays the Connect fee on a project, the public card does not show the business name. It also never shows phone, email, or a street address. After Connect, the homeowner and the contractor message inside the project, and the homeowner chooses whether and when to share their contact details.

A directory card is not verification of the contractor's work, license, or insurance. Priority Property Pros does not insure the contractor and does not employ the contractor.

The assistant must not invent a contractor name, license, insurance, or rating. If it was not in the knowledge excerpt, say so and point the person to Find a Pro.
  $md$,
  'PUBLISHED'
),
(
  'complaints-and-reports',
  'Complaints and reports',
  $md$
A homeowner can report fraud or impersonation, harassment or threats, a misleading profile, a suspected fake review, serious contractor misconduct, or a marketplace rule violation. That report goes to a person through Talk to Support or the Contact us page (prioritypropertypros.com/contact). This chat cannot file, investigate, or close the report.

Priority Property Pros may review a report, ask for evidence, moderate content, suspend an account, or remove a contractor. Reviewing a complaint is not guaranteeing workmanship, taking responsibility for the work, or deciding a construction dispute. Priority Property Pros does not resolve construction disputes. It does not promise to investigate or resolve every complaint.

Workmanship, job payments, damage, delays, and warranties are between the homeowner and the contractor. Priority Property Pros is not automatically part of those disagreements. Court and venue for a homeowner-and-contractor disagreement follow applicable law and any enforceable agreement between them.

A disagreement that is directly with Priority Property Pros is separate. Where the law allows, Texas law applies, and Montgomery County, Texas is the proposed venue when that venue is legally enforceable. There is no mandatory arbitration.
  $md$,
  'PUBLISHED'
),
(
  'what-support-can-and-cannot-do',
  'What Priority Help can and cannot do',
  $md$
Priority Help is an automated assistant, not a person. It answers general questions from the published policy: registration, contractor approval, posting a project, estimates, the activation fee, the Connect fee and its automatic refunds, reviews, Find a Pro, account settings and deletion, the legal documents, and what the marketplace does not do. Its answers are general information. They can be wrong, they are not legal, tax, or construction advice, and they do not change the Terms of Service or any policy. The published policies control.

If the published policy does not cover the question, it says so and offers Talk to Support. It does not guess.

It cannot:
- look up another person's account, project, payment, or message
- read admin-only notes or settings
- approve a contractor, post a project, accept an offer, pay, or change an account
- start a refund, even for a duplicate charge, an erroneous charge, a legally required refund, or an approved exception
- share contact details or a contractor business name
- say that Priority Property Pros guarantees, employs, supervises, inspects, insures, or verifies a contractor's work
- say that Priority Property Pros resolves a construction dispute

Those requests are handed to a person through Talk to Support. A ticket reference is created only when the person chooses Talk to Support. A human is not in the chat until a teammate actually joins.
  $md$,
  'PUBLISHED'
),
(
  'contact-refund-and-privacy-requests',
  'Contacting Priority Property Pros, refund exceptions, and privacy requests',
  $md$
Priority Property Pros LLC is a Texas limited liability company. To reach Priority Property Pros, use the Contact us page (prioritypropertypros.com/contact), or choose Talk to Support in this chat. Mail: Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US. The assistant never gives an email address; it points people to the Contact us page.

Refund exceptions: use the Contact us page with the account email, which fee ($9.99 activation or $4.99 Connect), the amount, the date if known, and why it is a duplicate charge, an erroneous charge, a refund the law requires, or another exception. The same information can be mailed to the address above. The owner reviews the request. If it is approved, the refund is issued through Stripe. Sending a request does not by itself create a refund, and not every request is approved. Closing an account does not by itself refund a fee. A $4.99 Connect that could not be delivered is refunded automatically, so no request is needed for that.

Privacy requests: use the Contact us page or mail the address above. Say whether you want access, a correction, a copy, deletion, or an opt-out, and include the email on the account. Priority Property Pros may ask you to confirm that you control that email. Priority Property Pros answers within 45 days, and may take up to 45 more days after telling you. Priority Property Pros does not sell personal information and does not use it for targeted advertising.

Deleting an account: use Delete account on the account settings page and type DELETE to confirm. It works for accounts that have not paid the activation too. The product asks for the current password or a recent sign-in. Deletion is refused while a job is still active, while a booking or card dispute is open, while a refund is unfinished, or for the last active admin. Deleting an account also deletes its Priority Help chats. If the delete control is ever temporarily unavailable, use the Contact us page from the account email with the subject "Account deletion request".
  $md$,
  'PUBLISHED'
),
(
  'legal-documents',
  'Terms of Service and policies',
  $md$
The legal documents are published on the site, dated October 11, 2026: Terms of Service (prioritypropertypros.com/terms), Privacy Policy (/privacy), Refund & Cancellation Policy (/refunds), Community Guidelines (/community-guidelines), Review & Content Guidelines (/content-guidelines), and Contractor Participation Terms (/contractor-terms, for contractors). They are linked in the site footer and on the sign-up form.

Signing up requires agreeing to them and affirming you are 18 or older. Priority Property Pros records which version was accepted and when. Existing accounts are asked to accept the current versions at the next sign-in.

The assistant summarizes; the published documents control. For the exact wording, point the person to the document page. Questions about the terms go through the Contact us page.
  $md$,
  'PUBLISHED'
),
(
  'priority-help-privacy',
  'How Priority Help handles chats',
  $md$
Priority Help stores the messages typed in the chat, the replies, and their times. A signed-in chat is linked to the account. A chat without signing in is linked to a random code kept in that browser, and Priority Property Pros stores a one-way hash of the IP address to limit abuse.

To write an automatic reply, the question and a few recent messages of the same chat are sent to the AI provider, OpenAI, after Priority Property Pros removes the email addresses, phone numbers, and street addresses its filter detects. If the person chooses Talk to Support, a Priority Property Pros teammate can read the whole conversation. Do not type card numbers or passwords in the chat.

A chat started without signing in is deleted automatically 90 days after its last message, unless it became a support ticket that is still open. A signed-in chat is deleted automatically 365 days after it is resolved or closed. Deleting the account deletes its Priority Help chats. The Privacy Policy (prioritypropertypros.com/privacy) has the details.
  $md$,
  'PUBLISHED'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.support_canned_responses (title, body_md)
SELECT title, body_md
FROM (
  VALUES
    (
      'Greeting',
      'Thanks for writing in. I have your ticket and I am looking at it now.'
    ),
    (
      'Offline follow-up',
      'We were offline when you wrote. I have the ticket open now. Tell me the account email on the profile if you want me to look up a payment or an application.'
    ),
    (
      'No refund from chat',
      'Activation is delivered when the server verifies the Stripe payment and marks the fee paid, not when the checkout page succeeds. Connect is delivered when the server verifies that payment and unlocks that connection. Activation and Connect fees are generally non-refundable once the service is delivered. A $4.99 Connect that could not be delivered is refunded automatically. I cannot start a refund from this chat. A duplicate charge, an erroneous charge, a legally required refund, or an approved exception has to be reviewed by a person. I will not promise a refund.'
    ),
    (
      'Pricing',
      'Account activation is a one-time fee for homeowners and contractors. It is delivered when the server verifies the Stripe payment and marks the fee paid, not when the checkout page succeeds. Connect is a one-time fee a contractor pays to open messaging with the homeowner on a project; the homeowner decides whether to share contact details. It is delivered when the server verifies that payment and unlocks that connection. There is no subscription and no commission. Both fees are generally non-refundable once delivered, and a Connect that could not be delivered is refunded automatically. I will confirm the live amounts in settings before I quote them.'
    ),
    (
      'Complaint report',
      'Thank you for the report. I will review what you sent. Reviewing a report is not a guarantee of the contractor''s work, and it is not a decision of a construction dispute. Workmanship, job payments, damage, delays, and warranties stay between you and the contractor. I will say if I need more evidence.'
    )
) AS seed(title, body_md)
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_canned_responses existing WHERE existing.title = seed.title
);

COMMENT ON TABLE public.support_conversations IS
  'Priority Help thread. Ticket reference, status, and priority live here. ASSISTANT means AI-only and is not a queue ticket.';
COMMENT ON TABLE public.support_messages IS
  'Messages and internal notes. visibility internal is admin-only under RLS.';
COMMENT ON TABLE public.support_assignments IS
  'Who took a ticket and when they released it.';
COMMENT ON TABLE public.support_guest_secrets IS
  'SHA-256 of the guest token. No anon or authenticated grants.';
COMMENT ON TABLE public.support_kb_articles IS
  'Admin-managed markdown knowledge base. Retrieval is Postgres full-text, not vectors.';
COMMENT ON TABLE public.support_canned_responses IS
  'Admin reply snippets. Plain text or markdown. HTML is rejected.';
COMMENT ON TABLE public.support_agent_status IS
  'Admin availability plus heartbeat. Offline when the heartbeat is older than 90 seconds.';
COMMENT ON TABLE public.support_rate_limits IS
  'Server-side counters keyed by a hash, never a raw IP.';
COMMENT ON TABLE public.support_settings IS
  'Feature flags (both default off), retention days (365 signed-in, 90 guests, purged daily by pg_cron job priority-help-retention), the daily AI answer cap, and the daily AI dollar budget in micro-dollars. admin_support_purge_expired runs the same purge on demand. Cap 0 or budget 0 stops model answers.';
COMMENT ON TABLE public.support_ai_usage IS
  'One row per model call with tokens and cost in micro-dollars. No client grants. Feeds the daily dollar budget and cost monitoring.';

COMMENT ON FUNCTION public.support_service_ai_budget() IS
  'Model calls and micro-dollars spent in the last 24 hours versus daily_ai_answer_cap and daily_ai_budget_usd_micros. Service role only. allowed is false when Priority Help or AI answers are off, or the cap or budget is 0 or used.';

COMMENT ON FUNCTION public.support_public_pricing() IS
  'Live activation and Connect amounts from platform_settings. Does not read the legacy basis-point setting.';
