-- Public contact form storage.
-- Written only by the contact-form Edge Function (service role).
-- Anon and authenticated clients cannot read or write.
-- Admins may SELECT via is_admin(), and may mark a row handled only through
-- admin_mark_contact_message_handled (audited). They cannot UPDATE the table directly.
--
-- Retention: keep rows for support follow-up, then delete messages older than 24 months.
-- This table is not a mailing list.
-- contact_rate_buckets stores a salted hash of the caller IP and a window start.
-- It does not store raw IP addresses. Delete windows older than 7 days.
--
-- Do not apply this migration until the owner approves it.
-- Do not deploy the contact-form function from this change.

CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  topic text NOT NULL,
  message text NOT NULL,
  email_status text NOT NULL DEFAULT 'pending',
  ip_hash text,
  handled_at timestamptz,
  handled_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT contact_messages_name_len CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT contact_messages_email_len CHECK (char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT contact_messages_email_shape CHECK (position('@' in email) > 1),
  CONSTRAINT contact_messages_phone_len CHECK (phone IS NULL OR char_length(phone) BETWEEN 7 AND 40),
  CONSTRAINT contact_messages_topic_check CHECK (
    topic IN ('marketplace', 'account', 'billing', 'report', 'other')
  ),
  CONSTRAINT contact_messages_message_len CHECK (char_length(message) BETWEEN 10 AND 2000),
  CONSTRAINT contact_messages_email_status_check CHECK (
    email_status IN ('pending', 'sent', 'failed', 'unavailable')
  ),
  CONSTRAINT contact_messages_ip_hash_len CHECK (
    ip_hash IS NULL OR char_length(ip_hash) BETWEEN 32 AND 128
  )
);

CREATE INDEX contact_messages_created_idx
  ON public.contact_messages (created_at DESC);

CREATE INDEX contact_messages_unhandled_idx
  ON public.contact_messages (created_at DESC)
  WHERE handled_at IS NULL;

COMMENT ON TABLE public.contact_messages IS
  'Public contact form submissions. Service role writes. No anon or authenticated reads. Admins SELECT via is_admin(). Mark handled only through admin_mark_contact_message_handled, which writes audit_logs. Retain for support follow-up, then delete rows older than 24 months. Not a mailing list.';

COMMENT ON COLUMN public.contact_messages.ip_hash IS
  'Salted hash of the caller IP. Not the raw address.';

COMMENT ON COLUMN public.contact_messages.handled_at IS
  'Null until an admin marks the message handled. Clients cannot set this column.';

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.contact_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.contact_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.contact_messages TO service_role;

CREATE POLICY contact_messages_admin_select
  ON public.contact_messages
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE TABLE public.contact_rate_buckets (
  ip_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, window_start),
  CONSTRAINT contact_rate_buckets_hash_len CHECK (char_length(ip_hash) BETWEEN 32 AND 128),
  CONSTRAINT contact_rate_buckets_hits_range CHECK (hits >= 0 AND hits <= 10000)
);

COMMENT ON TABLE public.contact_rate_buckets IS
  'Per-IP contact form rate limit. ip_hash is a salted hash, not a raw IP address. Delete windows older than 7 days. No anon or authenticated access.';

ALTER TABLE public.contact_rate_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.contact_rate_buckets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.contact_rate_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.consume_contact_rate_bucket(
  p_ip_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_window timestamptz;
  v_hits integer;
BEGIN
  IF p_ip_hash IS NULL OR char_length(p_ip_hash) < 32 OR char_length(p_ip_hash) > 128 THEN
    RETURN false;
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RETURN false;
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 60 OR p_window_seconds > 86400 THEN
    RETURN false;
  END IF;

  v_window := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.contact_rate_buckets (ip_hash, window_start, hits)
  VALUES (p_ip_hash, v_window, 1)
  ON CONFLICT (ip_hash, window_start)
  DO UPDATE SET hits = public.contact_rate_buckets.hits + 1
  RETURNING hits INTO v_hits;

  RETURN v_hits <= p_limit;
END;
$fn$;

COMMENT ON FUNCTION public.consume_contact_rate_bucket(text, integer, integer) IS
  'Service-role rate limit for the contact form. Stores a hash bucket only. Not granted to anon or authenticated.';

REVOKE ALL ON FUNCTION public.consume_contact_rate_bucket(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_contact_rate_bucket(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_unhandled_contact_message_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.contact_messages
  WHERE handled_at IS NULL;

  RETURN coalesce(v_count, 0);
END;
$fn$;

COMMENT ON FUNCTION public.admin_unhandled_contact_message_count() IS
  'Admin-only count of contact messages with handled_at null. Separate from admin_needs_attention. Gated by is_admin().';

REVOKE ALL ON FUNCTION public.admin_unhandled_contact_message_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unhandled_contact_message_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_mark_contact_message_handled(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.contact_messages;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'contact message not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_row
  FROM public.contact_messages
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact message not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.handled_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_row.id, 'handled_at', v_row.handled_at, 'already', true);
  END IF;

  UPDATE public.contact_messages
  SET handled_at = now(),
      handled_by = auth.uid()
  WHERE id = p_id
  RETURNING * INTO v_row;

  PERFORM public.write_audit_log(
    auth.uid(),
    'contact_message.handled',
    'contact_message',
    p_id,
    jsonb_build_object('handled', true)
  );

  RETURN jsonb_build_object('id', v_row.id, 'handled_at', v_row.handled_at, 'already', false);
END;
$fn$;

COMMENT ON FUNCTION public.admin_mark_contact_message_handled(uuid) IS
  'Admin-only. Sets handled_at and handled_by, then writes contact_message.handled to audit_logs. Metadata is handled=true only. Does not grant a direct UPDATE on contact_messages.';

REVOKE ALL ON FUNCTION public.admin_mark_contact_message_handled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_contact_message_handled(uuid) TO authenticated;
