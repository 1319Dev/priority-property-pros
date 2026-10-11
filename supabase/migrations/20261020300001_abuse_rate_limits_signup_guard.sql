-- Abuse protection using only Supabase. No third-party service.
--
--   1. rate_limit_hits + check_rate_limit(): DB-backed fixed-window limits for edge functions
--      (per user, per IP, per email). Subjects are stored only as SHA-256 hashes.
--   2. hook_before_user_created(event): Postgres function for the Supabase Auth
--      "Before User Created" hook. Rejects disposable email domains, more than 3 signups per IP
--      per hour, and more than 50 signups per hour overall. NOT ENABLED by this migration:
--      it only runs after the owner turns it on in Authentication -> Hooks.
--   3. signup_guard_log: one row per decision (hashed IP, email domain only, decision, reason).
--
-- No fee, payment, or existing table is changed.

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  subject_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_limit_hits_bucket_len CHECK (char_length(bucket) BETWEEN 1 AND 64),
  CONSTRAINT rate_limit_hits_hash_len CHECK (char_length(subject_hash) = 64)
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_lookup ON public.rate_limit_hits (bucket, subject_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_hits_created ON public.rate_limit_hits (created_at);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_hits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.rate_limit_hits_id_seq FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.rate_limit_hits IS
  'Fixed-window rate limit counters. Subjects (user id, IP, email) are SHA-256 hashed. Rows older than 2 days are purged automatically.';

CREATE OR REPLACE FUNCTION public.rate_limit_subject_hash(p_subject text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(sha256(convert_to('ppp-rl:' || lower(btrim(coalesce(p_subject, ''))), 'UTF8')), 'hex');
$$;

-- Counts allowed hits in the window. Records a hit only when allowed, so a flood cannot grow the table
-- beyond p_max rows per subject per window. Serialized per bucket+subject with an advisory lock.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket text,
  p_subject text,
  p_max integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
  v_count integer;
  v_oldest timestamptz;
  v_window interval;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF p_bucket IS NULL OR btrim(p_bucket) = '' OR char_length(p_bucket) > 64 THEN
    RAISE EXCEPTION 'invalid rate limit bucket';
  END IF;
  IF p_max IS NULL OR p_max < 1 OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate limit window';
  END IF;
  -- No subject (for example, no client IP header): do not limit on it.
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RETURN jsonb_build_object('allowed', true, 'count', 0, 'limit', p_max, 'retry_after_seconds', 0, 'skipped', true);
  END IF;

  v_hash := public.rate_limit_subject_hash(p_subject);
  v_window := make_interval(secs => p_window_seconds);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || v_hash, 0));

  SELECT count(*), min(created_at) INTO v_count, v_oldest
  FROM public.rate_limit_hits
  WHERE bucket = p_bucket AND subject_hash = v_hash AND created_at > now() - v_window;

  IF v_count >= p_max THEN
    RETURN jsonb_build_object(
      'allowed', false, 'count', v_count, 'limit', p_max,
      'retry_after_seconds', greatest(1, ceil(extract(epoch FROM (v_oldest + v_window - now())))::int)
    );
  END IF;

  INSERT INTO public.rate_limit_hits (bucket, subject_hash) VALUES (p_bucket, v_hash);
  -- Opportunistic cleanup, about 1 call in 50.
  IF random() < 0.02 THEN
    DELETE FROM public.rate_limit_hits WHERE created_at < now() - interval '2 days';
  END IF;
  RETURN jsonb_build_object('allowed', true, 'count', v_count + 1, 'limit', p_max, 'retry_after_seconds', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO service_role;

-- Disposable email domains. Admins can add rows from the SQL editor.
CREATE TABLE IF NOT EXISTS public.blocked_email_domains (
  domain text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_email_domains_lower CHECK (domain = lower(btrim(domain)) AND position('@' in domain) = 0)
);
ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.blocked_email_domains FROM PUBLIC, anon, authenticated;

INSERT INTO public.blocked_email_domains (domain, note)
SELECT d, 'disposable (seed 2026-10-20)'
FROM unnest(ARRAY[
  '10minutemail.com','10minutemail.net','20minutemail.com','33mail.com','anonaddy.me','burnermail.io',
  'byom.de','discard.email','dispostable.com','dropmail.me','emailondeck.com','fakeinbox.com',
  'fakemail.net','getairmail.com','getnada.com','guerrillamail.biz','guerrillamail.com','guerrillamail.de',
  'guerrillamail.info','guerrillamail.net','guerrillamail.org','guerrillamailblock.com','harakirimail.com',
  'inboxkitten.com','incognitomail.org','mail.tm','mail-temp.com','mailcatch.com','maildrop.cc',
  'mailinator.com','mailinator.net','mailinator2.com','mailnesia.com','mailpoof.com','mintemail.com',
  'moakt.com','mohmal.com','mytemp.email','mytrashmail.com','nada.email','sharklasers.com','spam4.me',
  'spambox.us','spamgourmet.com','temp-mail.io','temp-mail.org','tempail.com','tempmail.com',
  'tempmail.dev','tempmail.net','tempmailo.com','tempr.email','throwawaymail.com','trash-mail.com',
  'trashmail.com','trashmail.de','trashmail.net','yopmail.com','yopmail.fr','yopmail.net','emailfake.com',
  'grr.la','pokemail.net','spamex.com','mailsac.com','tmail.ws','tmpmail.net','tmpmail.org','luxusmail.org',
  'linshiyouxiang.net','cuvox.de','dayrep.com','einrot.com','fleckens.hu','gustr.com','jourrapide.com',
  'rhyta.com','superrito.com','teleworm.us','armyspy.com'
]) AS d
ON CONFLICT (domain) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.signup_guard_log (
  id bigserial PRIMARY KEY,
  decision text NOT NULL,
  reason text,
  ip_hash text,
  email_domain text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signup_guard_log_decision CHECK (decision IN ('allowed', 'rejected', 'error_allowed'))
);
CREATE INDEX IF NOT EXISTS signup_guard_log_recent ON public.signup_guard_log (decision, created_at DESC);
CREATE INDEX IF NOT EXISTS signup_guard_log_ip ON public.signup_guard_log (ip_hash, created_at DESC) WHERE decision = 'allowed';
ALTER TABLE public.signup_guard_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.signup_guard_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.signup_guard_log_id_seq FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.signup_guard_log IS
  'Before User Created hook decisions. IP is SHA-256 hashed; only the email domain is kept. Allowed rows feed the per-IP and global hourly limits.';

CREATE OR REPLACE FUNCTION public.email_domain_is_blocked(p_domain text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Exact domain or any parent domain (sub.mailinator.com matches mailinator.com).
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_email_domains b
    WHERE lower(btrim(coalesce(p_domain, ''))) = b.domain
       OR lower(btrim(coalesce(p_domain, ''))) LIKE '%.' || b.domain
  );
$$;
REVOKE ALL ON FUNCTION public.email_domain_is_blocked(text) FROM PUBLIC, anon, authenticated;

-- Supabase Auth "Before User Created" hook. Returns {} to allow, {"error": {...}} to reject.
-- Limits: 3 new accounts per IP per hour, 50 per hour overall. Internal errors fail OPEN (allow + log)
-- so a bug here can never lock everyone out of signup.
CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(event->'user'->>'email', '')));
  v_domain text;
  v_ip text := nullif(btrim(coalesce(event->'metadata'->>'ip_address', '')), '');
  v_ip_hash text;
  v_ip_count integer := 0;
  v_total integer := 0;
  c_per_ip_hour constant integer := 3;
  c_total_hour constant integer := 50;
BEGIN
  v_domain := nullif(split_part(v_email, '@', 2), '');
  v_ip_hash := CASE WHEN v_ip IS NULL THEN NULL ELSE public.rate_limit_subject_hash('ip:' || v_ip) END;

  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('ppp-signup-guard', 0));

    IF v_domain IS NOT NULL AND public.email_domain_is_blocked(v_domain) THEN
      INSERT INTO public.signup_guard_log (decision, reason, ip_hash, email_domain) VALUES ('rejected', 'disposable_email', v_ip_hash, v_domain);
      RETURN jsonb_build_object('error', jsonb_build_object(
        'http_code', 400,
        'message', 'Please sign up with a permanent email address. Temporary inbox services are not accepted.'));
    END IF;

    SELECT count(*) INTO v_total FROM public.signup_guard_log
    WHERE decision IN ('allowed', 'error_allowed') AND created_at > now() - interval '1 hour';
    IF v_total >= c_total_hour THEN
      INSERT INTO public.signup_guard_log (decision, reason, ip_hash, email_domain) VALUES ('rejected', 'global_hourly_limit', v_ip_hash, v_domain);
      RETURN jsonb_build_object('error', jsonb_build_object(
        'http_code', 429,
        'message', 'We are getting a lot of signups right now. Please try again in a little while.'));
    END IF;

    IF v_ip_hash IS NOT NULL THEN
      SELECT count(*) INTO v_ip_count FROM public.signup_guard_log
      WHERE decision IN ('allowed', 'error_allowed') AND ip_hash = v_ip_hash AND created_at > now() - interval '1 hour';
      IF v_ip_count >= c_per_ip_hour THEN
        INSERT INTO public.signup_guard_log (decision, reason, ip_hash, email_domain) VALUES ('rejected', 'ip_hourly_limit', v_ip_hash, v_domain);
        RETURN jsonb_build_object('error', jsonb_build_object(
          'http_code', 429,
          'message', 'Too many new accounts from this network. Please try again in an hour.'));
      END IF;
    END IF;

    INSERT INTO public.signup_guard_log (decision, reason, ip_hash, email_domain) VALUES ('allowed', NULL, v_ip_hash, v_domain);
    IF random() < 0.02 THEN
      DELETE FROM public.signup_guard_log WHERE created_at < now() - interval '90 days';
    END IF;
    RETURN '{}'::jsonb;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.signup_guard_log (decision, reason, ip_hash, email_domain)
      VALUES ('error_allowed', left(SQLERRM, 200), v_ip_hash, v_domain);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN '{}'::jsonb;
  END;
END;
$$;

-- Only the Auth server may call the hook.
REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO supabase_auth_admin';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin';
  END IF;
END
$$;

-- Admin read-out (SQL editor or a later admin screen).
CREATE OR REPLACE FUNCTION public.admin_signup_guard_summary(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin or service role required';
  END IF;
  RETURN jsonb_build_object(
    'hours', greatest(1, least(coalesce(p_hours, 24), 720)),
    'by_decision', coalesce((
      SELECT jsonb_object_agg(decision || ':' || coalesce(reason, '-'), n)
      FROM (SELECT decision, reason, count(*) n FROM public.signup_guard_log
            WHERE created_at > now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 720)))
            GROUP BY 1, 2) x), '{}'::jsonb),
    'rate_limited_buckets', coalesce((
      SELECT jsonb_object_agg(bucket, n)
      FROM (SELECT bucket, count(*) n FROM public.rate_limit_hits
            WHERE created_at > now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 720)))
            GROUP BY 1) y), '{}'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_signup_guard_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_signup_guard_summary(integer) TO authenticated, service_role;
