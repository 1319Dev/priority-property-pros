-- Rollback for 20261016000004_notification_context_dedupe.sql.
-- Restores list/enqueue/preference functions from the previous migrations.
-- Does not delete notification rows, preferences, or payment data.
-- Duplicate alerts that were skipped after this migration are not recreated.

DROP FUNCTION IF EXISTS public.mark_all_my_notifications_read();
DROP FUNCTION IF EXISTS public.notification_payload_uuid(jsonb, text);

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_recipient_profile_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nid uuid;
  v_payload jsonb := public.strip_private_contact_keys(coalesce(p_payload, '{}'::jsonb));
BEGIN
  IF p_recipient_profile_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF public.text_contains_contact_info(p_title) OR public.text_contains_contact_info(p_body) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;
  IF p_kind IN (
    'estimate.viewed',
    'estimate.accepted',
    'estimate.declined',
    'estimate.not_selected',
    'estimate.withdrawn'
  ) THEN
    INSERT INTO public.notifications (
      recipient_profile_id, kind, title, body, entity_type, entity_id, payload, channel
    )
    VALUES (
      p_recipient_profile_id, p_kind, p_title, p_body, p_entity_type, p_entity_id,
      v_payload, 'in_app'
    )
    ON CONFLICT (recipient_profile_id, kind, entity_id)
      WHERE kind IN (
        'estimate.viewed',
        'estimate.accepted',
        'estimate.declined',
        'estimate.not_selected',
        'estimate.withdrawn'
      )
        AND entity_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO nid;
  ELSE
    INSERT INTO public.notifications (
      recipient_profile_id, kind, title, body, entity_type, entity_id, payload, channel
    )
    VALUES (
      p_recipient_profile_id, p_kind, p_title, p_body, p_entity_type, p_entity_id,
      v_payload, 'in_app'
    )
    RETURNING id INTO nid;
  END IF;
  RETURN nid;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_notification_preferences(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notification_preferences (user_id, category, in_app, push, email)
  SELECT p_user_id, v.category, true, false, v.email_on
  FROM (
    VALUES
      ('new_job'::text, true),
      ('messages', true),
      ('connect', true),
      ('estimates', true),
      ('booking', true),
      ('change_orders', true),
      ('reviews', false),
      ('account', false)
  ) AS v(category, email_on)
  ON CONFLICT (user_id, category) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_notification_preferences(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_my_notifications()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(item ORDER BY (item->>'created_at') DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'id', n.id,
      'kind', n.kind,
      'title', n.title,
      'body',
        CASE
          WHEN n.kind = 'message.received'
            AND NOT public.is_admin()
            AND (n.payload ->> 'contractor_profile_id') IS DISTINCT FROM public.current_contractor_profile_id()::text
            AND coalesce(n.payload ->> 'project_id', '') ~ '^[0-9a-fA-F-]{36}$'
            AND coalesce(n.payload ->> 'contractor_profile_id', '') ~ '^[0-9a-fA-F-]{36}$'
            AND NOT public.message_pair_has_connection_entitlement(
              (n.payload ->> 'project_id')::uuid,
              (n.payload ->> 'contractor_profile_id')::uuid
            )
            THEN 'New message about your project.'
          ELSE n.body
        END,
      'entity_type', n.entity_type,
      'entity_id', n.entity_id,
      'payload', public.strip_private_contact_keys(n.payload),
      'channel', n.channel,
      'read_at', n.read_at,
      'created_at', n.created_at
    ) AS item
    FROM public.notifications n
    WHERE n.recipient_profile_id = auth.uid()
    ORDER BY n.created_at DESC
    LIMIT 50
  ) q;
$$;

REVOKE ALL ON FUNCTION public.list_my_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_notifications() TO authenticated;

COMMENT ON FUNCTION public.list_my_notifications() IS
  'Caller notifications. Message notices keep a contractor business name only while message_pair_has_connection_entitlement is true. Payload never includes phone, email, street, or coords.';
