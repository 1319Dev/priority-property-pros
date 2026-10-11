-- Notification history context, stale actions, and duplicate alerts.
-- Does not change fees, Stripe, payment rows, RLS policies, or contact entitlement.
-- Clients still cannot insert notifications. Payload stays free of phone, email,
-- street, coordinates, photos, and contractor business names.

CREATE OR REPLACE FUNCTION public.notification_payload_uuid(p_payload jsonb, p_key text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN coalesce(p_payload ->> p_key, '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (p_payload ->> p_key)::uuid
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.notification_payload_uuid(jsonb, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notification_payload_uuid(jsonb, text) IS
  'Reads one UUID key from a notification payload. Invalid values become null. Not granted to clients.';

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

  IF p_entity_id IS NOT NULL AND (
    p_kind = ANY (ARRAY[
      'estimate.viewed',
      'estimate.accepted',
      'estimate.declined',
      'estimate.not_selected',
      'estimate.withdrawn',
      'estimate.received',
      'connect.paid',
      'contact.shared',
      'question.asked',
      'question.answered',
      'booking.hired',
      'booking.confirmed',
      'booking.in_progress',
      'booking.completed',
      'booking.cancelled',
      'change_order.proposed',
      'change_order.approved',
      'change_order.declined',
      'review.received',
      'message.received',
      'estimate.updated',
      'opportunity.offered'
    ]::text[])
  ) THEN
    PERFORM pg_advisory_xact_lock(hashtext(
      p_recipient_profile_id::text || ':' || p_kind || ':' || p_entity_id::text
    ));
  END IF;

  IF p_entity_id IS NOT NULL AND p_kind = ANY (ARRAY[
    'estimate.viewed',
    'estimate.accepted',
    'estimate.declined',
    'estimate.not_selected',
    'estimate.withdrawn',
    'estimate.received',
    'connect.paid',
    'contact.shared',
    'question.asked',
    'question.answered',
    'booking.hired',
    'booking.confirmed',
    'booking.in_progress',
    'booking.completed',
    'booking.cancelled',
    'change_order.proposed',
    'change_order.approved',
    'change_order.declined',
    'review.received'
  ]::text[]) THEN
    SELECT id INTO nid
    FROM public.notifications
    WHERE recipient_profile_id = p_recipient_profile_id
      AND kind = p_kind
      AND entity_id = p_entity_id
    LIMIT 1;
    IF nid IS NOT NULL THEN
      RETURN nid;
    END IF;
  ELSIF p_entity_id IS NOT NULL AND p_kind = ANY (ARRAY[
    'message.received',
    'estimate.updated',
    'opportunity.offered'
  ]::text[]) THEN
    SELECT id INTO nid
    FROM public.notifications
    WHERE recipient_profile_id = p_recipient_profile_id
      AND kind = p_kind
      AND entity_id = p_entity_id
      AND read_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
    IF nid IS NOT NULL THEN
      RETURN nid;
    END IF;
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

COMMENT ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, uuid, jsonb) IS
  'Server-only insert. Once-per-entity kinds return the existing row. Repeatable kinds keep a single unread row per entity. Does not write payments or contact fields.';

-- New job offers are contractor alerts. Customers, admins, and verifiers do not
-- gain a new_job preference. Existing rows are left in place.
CREATE OR REPLACE FUNCTION public.ensure_notification_preferences(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer := 0;
  v_type text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT account_type::text INTO v_type
  FROM public.profiles
  WHERE id = p_user_id;

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
  WHERE v.category <> 'new_job' OR v_type = 'CONTRACTOR'
  ON CONFLICT (user_id, category) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_notification_preferences(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_my_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  UPDATE public.notifications
  SET read_at = now()
  WHERE recipient_profile_id = auth.uid()
    AND read_at IS NULL;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_my_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_my_notifications_read() TO authenticated;

COMMENT ON FUNCTION public.mark_all_my_notifications_read() IS
  'Marks the caller''s unread notifications read. Does not change any other column.';

CREATE OR REPLACE FUNCTION public.list_my_notifications()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY (item ->> 'created_at') DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'id', a.id,
      'kind', a.kind,
      'title', a.title,
      'body',
        CASE
          WHEN a.kind = 'message.received'
            AND NOT public.is_admin()
            AND a.contractor_profile_id IS NOT NULL
            AND a.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
            AND a.project_id IS NOT NULL
            AND NOT public.message_pair_has_connection_entitlement(a.project_id, a.contractor_profile_id)
            THEN 'New message about your project.'
          ELSE a.body
        END,
      'entity_type', a.entity_type,
      'entity_id', a.entity_id,
      'payload',
        (
          public.strip_private_contact_keys(coalesce(a.payload, '{}'::jsonb))
          - 'business_name' - 'contractor_name' - 'contractor_business_name'
          - 'display_name' - 'first_name' - 'last_name' - 'full_name'
          - 'avatar_url' - 'photo_url' - 'image_url' - 'portfolio'
          - 'address' - 'city' - 'state' - 'zip' - 'zip_code'
          - 'phone' - 'email' - 'street' - 'street_line1' - 'street_line2'
          - 'lat' - 'lng' - 'latitude' - 'longitude' - 'coords' - 'exact_address'
          - 'project_title' - 'path'
        ) || jsonb_strip_nulls(jsonb_build_object(
          'project_id', a.project_id,
          'project_title',
            CASE
              WHEN a.raw_title IS NULL OR a.project_id IS NULL THEN NULL
              WHEN public.text_contains_contact_info(a.raw_title)
                OR public.text_contains_pre_hire_contact(a.raw_title) THEN NULL
              WHEN a.project_customer_id = auth.uid()
                OR public.contractor_can_read_project(a.project_id) THEN a.raw_title
              ELSE NULL
            END,
          'project_reference_number', a.reference_number,
          'booking_id', coalesce(a.booking_id, a.hired_booking_id),
          'contractor_profile_id', a.contractor_profile_id,
          'estimate_id', a.estimate_id,
          'opportunity_id', a.opportunity_id,
          'thread_id', CASE WHEN a.kind = 'message.received' THEN a.entity_id ELSE NULL END,
          'path',
            CASE
              WHEN a.kind = 'message.received' AND a.project_id IS NOT NULL AND a.contractor_profile_id IS NOT NULL THEN
                CASE WHEN a.viewer_type = 'CONTRACTOR'
                  THEN '/app/pro/messages/' || a.project_id::text || '/' || a.contractor_profile_id::text
                  ELSE '/app/customer/messages/' || a.project_id::text || '/' || a.contractor_profile_id::text
                END
              WHEN a.kind = 'contact.shared' AND a.viewer_type = 'CONTRACTOR' AND coalesce(a.booking_id, a.hired_booking_id) IS NOT NULL THEN
                '/app/pro/jobs/' || coalesce(a.booking_id, a.hired_booking_id)::text
              WHEN a.kind = 'contact.shared' AND a.project_id IS NOT NULL AND a.contractor_profile_id IS NOT NULL THEN
                CASE WHEN a.viewer_type = 'CONTRACTOR'
                  THEN '/app/pro/messages/' || a.project_id::text || '/' || a.contractor_profile_id::text
                  ELSE '/app/customer/messages/' || a.project_id::text || '/' || a.contractor_profile_id::text
                END
              WHEN a.kind = 'question.asked' AND a.project_id IS NOT NULL THEN
                '/app/customer/projects/' || a.project_id::text
              WHEN a.kind = 'question.answered' AND a.opportunity_id IS NOT NULL THEN
                '/app/pro/opportunities/' || a.opportunity_id::text
              WHEN a.kind IN ('opportunity.offered', 'job.offered') AND a.opportunity_id IS NOT NULL THEN
                '/app/pro/opportunities/' || a.opportunity_id::text
              WHEN a.kind LIKE 'connect.%' THEN
                CASE WHEN a.project_id IS NOT NULL
                  THEN '/app/customer/projects/' || a.project_id::text
                  ELSE '/app/customer/projects'
                END
              WHEN a.kind = 'estimate.accepted' AND a.viewer_type = 'CONTRACTOR' THEN
                CASE
                  WHEN coalesce(a.booking_id, a.hired_booking_id) IS NOT NULL
                    THEN '/app/pro/jobs/' || coalesce(a.booking_id, a.hired_booking_id)::text
                  WHEN a.project_id IS NOT NULL THEN '/app/pro/jobs/project/' || a.project_id::text
                  ELSE '/app/pro/estimates'
                END
              WHEN a.kind LIKE 'estimate.%' AND a.viewer_type = 'CONTRACTOR' THEN
                '/app/pro/estimates'
              WHEN a.kind LIKE 'estimate.%' AND a.project_id IS NOT NULL AND a.estimate_id IS NOT NULL THEN
                '/app/customer/projects/' || a.project_id::text || '/estimates/' || a.estimate_id::text
              WHEN a.kind LIKE 'estimate.%' AND a.project_id IS NOT NULL THEN
                '/app/customer/projects/' || a.project_id::text
              WHEN a.kind LIKE 'estimate.%' THEN
                '/app/customer/projects'
              WHEN (a.kind LIKE 'booking.%' OR a.kind LIKE 'change_order.%' OR a.kind LIKE 'review.%')
                AND a.viewer_type = 'CONTRACTOR'
                AND coalesce(a.booking_id, a.hired_booking_id) IS NOT NULL THEN
                '/app/pro/jobs/' || coalesce(a.booking_id, a.hired_booking_id)::text
              WHEN (a.kind LIKE 'booking.%' OR a.kind LIKE 'change_order.%' OR a.kind LIKE 'review.%')
                AND coalesce(a.booking_id, a.hired_booking_id) IS NOT NULL THEN
                '/app/customer/bookings/' || coalesce(a.booking_id, a.hired_booking_id)::text
              WHEN a.viewer_type = 'CONTRACTOR' THEN '/app/pro'
              WHEN a.viewer_type = 'ADMIN' THEN '/app/admin'
              ELSE '/app/customer'
            END
        )),
      'channel', a.channel,
      'read_at', a.read_at,
      'created_at', a.created_at,
      'action_state',
        CASE
          WHEN a.kind IN ('estimate.received', 'estimate.updated') AND (
            (a.estimate_status IS NOT NULL AND a.estimate_status NOT IN ('SUBMITTED', 'SENT', 'REVISED', 'VIEWED'))
            OR (a.entity_id IS NOT NULL AND a.estimate_status IS NULL AND a.entity_type = 'estimates')
            OR a.project_status IN ('CONTRACTOR_SELECTED', 'CANCELLED')
            OR a.selected_estimate_id IS NOT NULL
            OR EXISTS (
              SELECT 1
              FROM public.bookings hb
              WHERE a.project_id IS NOT NULL
                AND hb.project_id = a.project_id
                AND hb.status::text <> 'CANCELLED'
                AND (
                  (hb.customer_hired_at IS NOT NULL AND hb.contractor_hired_at IS NOT NULL)
                  OR hb.status::text IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
                )
            )
          ) THEN 'historical'
          WHEN a.kind = 'change_order.proposed'
            AND a.change_status IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN 'historical'
          WHEN a.kind = 'opportunity.offered'
            AND a.opp_status IS NOT NULL
            AND a.opp_status <> 'AVAILABLE' THEN 'historical'
          WHEN a.kind = 'question.asked' AND (
            coalesce(btrim(a.answer_text), '') <> ''
            OR a.project_status IN ('CANCELLED', 'CONTRACTOR_SELECTED')
          ) THEN 'historical'
          ELSE 'open'
        END
    ) AS item
    FROM (
      SELECT
        l.*,
        hb.id AS hired_booking_id,
        viewer.account_type::text AS viewer_type
      FROM (
        SELECT
          n.id,
          n.kind,
          n.title,
          n.body,
          n.entity_type,
          n.entity_id,
          n.payload,
          n.channel,
          n.read_at,
          n.created_at,
          COALESCE(
            public.notification_payload_uuid(n.payload, 'contractor_profile_id'),
            est.contractor_profile_id,
            opp.contractor_profile_id,
            bk.contractor_profile_id,
            co.contractor_profile_id,
            rv.contractor_profile_id,
            th.contractor_profile_id,
            conn.contractor_profile_id,
            ques.contractor_profile_id,
            share.contractor_profile_id
          ) AS contractor_profile_id,
          COALESCE(
            public.notification_payload_uuid(n.payload, 'booking_id'),
            bk.booking_id,
            co.booking_id,
            rv.booking_id
          ) AS booking_id,
          COALESCE(
            est.estimate_id,
            bk.estimate_id,
            public.notification_payload_uuid(n.payload, 'estimate_id'),
            CASE WHEN n.kind LIKE 'estimate.%' THEN n.entity_id END
          ) AS estimate_id,
          COALESCE(
            opp.opportunity_id,
            ques.opportunity_id,
            public.notification_payload_uuid(n.payload, 'opportunity_id'),
            CASE WHEN n.kind IN ('opportunity.offered', 'job.offered') THEN n.entity_id END
          ) AS opportunity_id,
          est.estimate_status,
          opp.opp_status,
          co.change_status,
          ques.answer_text,
          p.id AS project_id,
          p.title AS raw_title,
          p.reference_number,
          p.customer_id AS project_customer_id,
          p.status::text AS project_status,
          p.selected_estimate_id
        FROM (
          SELECT n.*
          FROM public.notifications n
          WHERE n.recipient_profile_id = auth.uid()
            AND NOT (
              n.entity_id IS NOT NULL
              AND n.read_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM public.notifications newer
                WHERE newer.recipient_profile_id = n.recipient_profile_id
                  AND newer.kind = n.kind
                  AND newer.entity_id = n.entity_id
                  AND newer.read_at IS NULL
                  AND (newer.created_at, newer.id) > (n.created_at, n.id)
              )
            )
            AND NOT (
              n.entity_id IS NOT NULL
              AND n.kind = ANY (ARRAY[
                'estimate.viewed',
                'estimate.accepted',
                'estimate.declined',
                'estimate.not_selected',
                'estimate.withdrawn',
                'estimate.received',
                'connect.paid',
                'contact.shared',
                'question.asked',
                'question.answered',
                'booking.hired',
                'booking.confirmed',
                'booking.in_progress',
                'booking.completed',
                'booking.cancelled',
                'change_order.proposed',
                'change_order.approved',
                'change_order.declined',
                'review.received'
              ]::text[])
              AND EXISTS (
                SELECT 1
                FROM public.notifications newer
                WHERE newer.recipient_profile_id = n.recipient_profile_id
                  AND newer.kind = n.kind
                  AND newer.entity_id = n.entity_id
                  AND (newer.created_at, newer.id) > (n.created_at, n.id)
              )
            )
          ORDER BY n.created_at DESC
          LIMIT 50
        ) n
        LEFT JOIN LATERAL (
          SELECT e.id AS estimate_id, e.project_id, e.contractor_profile_id, e.status::text AS estimate_status
          FROM public.estimates e
          WHERE e.id = n.entity_id
            AND (n.entity_type = 'estimates' OR n.kind LIKE 'estimate.%')
          LIMIT 1
        ) est ON true
        LEFT JOIN LATERAL (
          SELECT o.id AS opportunity_id, o.project_id, o.contractor_profile_id, o.status::text AS opp_status
          FROM public.opportunities o
          WHERE o.id = COALESCE(
            public.notification_payload_uuid(n.payload, 'opportunity_id'),
            CASE
              WHEN n.entity_type = 'opportunities' OR n.kind IN ('opportunity.offered', 'job.offered') THEN n.entity_id
            END
          )
          LIMIT 1
        ) opp ON true
        LEFT JOIN LATERAL (
          SELECT b.id AS booking_id, b.project_id, b.contractor_profile_id, b.estimate_id
          FROM public.bookings b
          WHERE b.id = COALESCE(
            public.notification_payload_uuid(n.payload, 'booking_id'),
            CASE WHEN n.entity_type = 'bookings' OR n.kind LIKE 'booking.%' THEN n.entity_id END
          )
          LIMIT 1
        ) bk ON true
        LEFT JOIN LATERAL (
          SELECT co.booking_id, co.status::text AS change_status, b.project_id, b.contractor_profile_id
          FROM public.change_orders co
          JOIN public.bookings b ON b.id = co.booking_id
          WHERE co.id = n.entity_id
            AND (n.entity_type = 'change_orders' OR n.kind LIKE 'change_order.%')
          LIMIT 1
        ) co ON true
        LEFT JOIN LATERAL (
          SELECT r.booking_id, b.project_id, b.contractor_profile_id
          FROM public.booking_reviews r
          JOIN public.bookings b ON b.id = r.booking_id
          WHERE r.id = n.entity_id
            AND (n.entity_type = 'booking_reviews' OR n.kind LIKE 'review.%')
          LIMIT 1
        ) rv ON true
        LEFT JOIN LATERAL (
          SELECT t.project_id, t.contractor_profile_id
          FROM public.project_message_threads t
          WHERE t.id = COALESCE(
            public.notification_payload_uuid(n.payload, 'thread_id'),
            CASE
              WHEN n.entity_type = 'project_message_threads' OR n.kind = 'message.received' THEN n.entity_id
            END
          )
          LIMIT 1
        ) th ON true
        LEFT JOIN LATERAL (
          SELECT c.project_id, c.contractor_profile_id
          FROM public.project_connections c
          WHERE c.id = n.entity_id
            AND (n.entity_type = 'project_connections' OR n.kind LIKE 'connect.%')
          LIMIT 1
        ) conn ON true
        LEFT JOIN LATERAL (
          SELECT q.project_id, q.opportunity_id, q.asked_by_contractor_profile_id AS contractor_profile_id, q.answer_text
          FROM public.estimate_questions q
          WHERE q.id = n.entity_id
            AND (n.entity_type = 'estimate_questions' OR n.kind LIKE 'question.%')
          LIMIT 1
        ) ques ON true
        LEFT JOIN LATERAL (
          SELECT s.project_id, s.contractor_profile_id
          FROM public.project_contact_shares s
          WHERE s.id = n.entity_id
            AND (n.entity_type = 'project_contact_shares' OR n.kind = 'contact.shared')
          LIMIT 1
        ) share ON true
        LEFT JOIN public.projects p ON p.id = COALESCE(
          est.project_id,
          opp.project_id,
          bk.project_id,
          co.project_id,
          rv.project_id,
          th.project_id,
          conn.project_id,
          ques.project_id,
          share.project_id,
          public.notification_payload_uuid(n.payload, 'project_id')
        )
      ) l
      LEFT JOIN public.profiles viewer ON viewer.id = auth.uid()
      LEFT JOIN LATERAL (
        SELECT b.id
        FROM public.bookings b
        WHERE l.booking_id IS NULL
          AND l.project_id IS NOT NULL
          AND l.contractor_profile_id IS NOT NULL
          AND b.project_id = l.project_id
          AND b.contractor_profile_id = l.contractor_profile_id
          AND b.status::text <> 'CANCELLED'
        ORDER BY
          CASE
            WHEN b.customer_hired_at IS NOT NULL AND b.contractor_hired_at IS NOT NULL THEN 0
            ELSE 1
          END,
          b.created_at DESC
        LIMIT 1
      ) hb ON true
    ) a
  ) q;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_notifications() TO authenticated;

COMMENT ON FUNCTION public.list_my_notifications() IS
  'Caller notifications with the PPP job number, a project title only when that caller may read the project, and a deep link. Message text keeps a contractor business name only while message_pair_has_connection_entitlement is true. No phone, email, street, coordinates, photos, or business name is added to the payload. action_state is historical once the underlying row is no longer waiting on that person.';
