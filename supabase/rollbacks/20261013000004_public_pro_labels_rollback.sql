-- Rollback for 20261013000004_public_pro_labels.sql
-- Restores the definitions these objects had immediately before that migration.
-- Drops helper functions that migration introduced.
-- Does not change Stripe, fees, message_pair_has_connection_entitlement, or signup_fee_is_satisfied.

-- Previous contractor_public_service_label (20261012000002).
CREATE OR REPLACE FUNCTION public.contractor_public_service_label(p_contractor_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.format_serves_within(
    a.radius_miles,
    coalesce(place.city, c.city),
    coalesce(place.state_code, c.state_code),
    a.center_zip
  )
  FROM public.contractor_service_areas a
  JOIN public.contractor_profiles cp ON cp.id = a.contractor_profile_id
  LEFT JOIN public.zip_centroids c ON c.zip = public.normalize_zip(a.center_zip)
  LEFT JOIN LATERAL public.contractor_profile_place(cp.service_area) AS place ON true
  WHERE a.contractor_profile_id = p_contractor_profile_id
    AND a.radius_miles IS NOT NULL
    AND public.contractor_is_directory_listed(p_contractor_profile_id)
  ORDER BY a.created_at, a.id
  LIMIT 1;
$$;

-- Previous public directory views (20261012000003).
CREATE OR REPLACE VIEW public.contractor_public_profiles
WITH (security_invoker = false)
AS
SELECT
  cp.id,
  public.anonymized_pro_label(cp.primary_trade, NULL) AS display_label,
  cp.primary_trade,
  cp.years_experience,
  public.public_safe_blurb(cp.headline, cp.bio) AS short_description,
  public.public_safe_about(cp.bio, cp.headline) AS about,
  cp.accepting_work,
  cp.created_at,
  coalesce(
    public.contractor_public_service_label(cp.id),
    public.general_service_area(cp.service_area)
  ) AS service_area
FROM public.contractor_profiles cp
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

CREATE OR REPLACE VIEW public.contractor_public_services
WITH (security_invoker = false)
AS
SELECT
  cs.id,
  cs.contractor_profile_id,
  cs.category_id,
  sc.slug AS category_slug,
  sc.name AS category_name
FROM public.contractor_services cs
JOIN public.contractor_profiles cp ON cp.id = cs.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
JOIN public.service_categories sc ON sc.id = cs.category_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

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

-- Previous list_public_directory_contractors (20261012000003).
CREATE OR REPLACE FUNCTION public.list_public_directory_contractors()
RETURNS TABLE (
  id uuid,
  display_label text,
  primary_trade text,
  categories text[],
  service_area text,
  years_experience integer,
  rating_average numeric,
  rating_count integer,
  badges jsonb,
  short_description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.id,
    public.anonymized_pro_label(
      cp.primary_trade,
      coalesce((
        SELECT array_agg(sc.name ORDER BY sc.name)
        FROM public.contractor_services cs
        JOIN public.service_categories sc ON sc.id = cs.category_id
        WHERE cs.contractor_profile_id = cp.id
      ), '{}'::text[])
    ),
    cp.primary_trade,
    coalesce((
      SELECT array_agg(sc.name ORDER BY sc.name)
      FROM public.contractor_services cs
      JOIN public.service_categories sc ON sc.id = cs.category_id
      WHERE cs.contractor_profile_id = cp.id
    ), '{}'::text[]),
    coalesce(
      public.contractor_public_service_label(cp.id),
      public.general_service_area(cp.service_area)
    ),
    cp.years_experience,
    r.rating_average,
    coalesce(r.rating_count, 0),
    (
      jsonb_build_array(jsonb_build_object('kind', 'APPROVED', 'label', 'Approved Pro'))
      || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'kind', cr.kind,
          'label', public.generic_credential_badge_label(cr.kind)
        ) ORDER BY cr.kind)
        FROM public.contractor_credentials cr
        WHERE cr.contractor_profile_id = cp.id
          AND cr.status = 'VERIFIED'
      ), '[]'::jsonb)
    ),
    public.public_safe_blurb(cp.headline, cp.bio)
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  LEFT JOIN public.contractor_public_ratings r ON r.contractor_profile_id = cp.id
  WHERE cp.approval_status = 'APPROVED'
    AND p.account_status = 'ACTIVE'
    AND public.signup_fee_is_satisfied(cp.profile_id)
  ORDER BY 2, cp.id;
$$;

-- Previous list_my_project_connection_cards (20261011000005).
CREATE OR REPLACE FUNCTION public.list_my_project_connection_cards(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_agg(item.card ORDER BY item.created_at)
      FROM (
        SELECT
          c.created_at,
          jsonb_build_object(
            'connection_id', c.id,
            'contractor_profile_id', c.contractor_profile_id,
            'display_name',
              CASE
                WHEN public.message_pair_has_connection_entitlement(c.project_id, c.contractor_profile_id) THEN
                  CASE
                    WHEN cp.business_name IS NULL
                      OR btrim(cp.business_name) = ''
                      OR public.text_contains_contact_info(cp.business_name)
                      OR public.text_contains_pre_hire_contact(cp.business_name)
                      THEN public.anonymized_pro_label(cp.primary_trade, NULL)
                    ELSE btrim(cp.business_name)
                  END
                ELSE public.anonymized_pro_label(cp.primary_trade, NULL)
              END,
            'connection_status', c.status,
            'booking_status', (
              SELECT b.status
              FROM public.bookings b
              WHERE b.project_id = c.project_id
                AND b.contractor_profile_id = c.contractor_profile_id
                AND b.status IS DISTINCT FROM 'CANCELLED'
              ORDER BY b.created_at DESC
              LIMIT 1
            ),
            'can_message', public.message_pair_has_connection_entitlement(c.project_id, c.contractor_profile_id)
          ) AS card
        FROM public.project_connections c
        JOIN public.projects p ON p.id = c.project_id
        JOIN public.contractor_profiles cp ON cp.id = c.contractor_profile_id
        WHERE c.project_id = p_project_id
          AND (
            p.customer_id = (SELECT auth.uid())
            OR public.is_admin()
          )
          AND c.status IN ('INITIATED', 'RESERVED', 'PAYMENT_DISABLED', 'PAID', 'COMPLETED')
      ) item
    ),
    '[]'::jsonb
  );
$$;

-- Live list_my_message_threads. Production applied project_reference_numbers
-- after message_inbox_reads, so this restores that later definition.
CREATE OR REPLACE FUNCTION public.list_my_message_threads()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pairs AS (
    SELECT DISTINCT ON (a.project_id, a.contractor_profile_id)
      a.project_id,
      a.contractor_profile_id
    FROM public.booking_contact_access a
    WHERE public.message_pair_has_connection_entitlement(a.project_id, a.contractor_profile_id)
    ORDER BY a.project_id, a.contractor_profile_id
  ),
  rows AS (
    SELECT
      t.id AS thread_id,
      pairs.project_id,
      pairs.contractor_profile_id,
      CASE
        WHEN public.text_contains_contact_info(p.title) OR public.text_contains_pre_hire_contact(p.title)
          THEN 'Project'
        ELSE coalesce(nullif(btrim(p.title), ''), 'Project')
      END AS project_title,
      p.reference_number AS project_reference_number,
      CASE
        WHEN public.text_contains_contact_info(p.city) OR public.text_contains_pre_hire_contact(p.city)
          THEN NULL
        ELSE nullif(btrim(p.city), '')
      END AS city,
      CASE
        WHEN public.text_contains_contact_info(p.state) OR public.text_contains_pre_hire_contact(p.state)
          THEN NULL
        ELSE nullif(btrim(p.state), '')
      END AS state,
      public.anonymized_pro_label(cp.primary_trade, NULL) AS contractor_label,
      CASE
        WHEN p.customer_id = (SELECT auth.uid()) THEN
          CASE
            WHEN cp.business_name IS NULL
              OR btrim(cp.business_name) = ''
              OR public.text_contains_contact_info(cp.business_name)
              OR public.text_contains_pre_hire_contact(cp.business_name)
              THEN public.anonymized_pro_label(cp.primary_trade, NULL)
            ELSE btrim(cp.business_name)
          END
        ELSE
          CASE
            WHEN cust.first_name IS NULL
              OR btrim(cust.first_name) = ''
              OR public.text_contains_contact_info(cust.first_name)
              OR public.text_contains_pre_hire_contact(cust.first_name)
              THEN 'Customer'
            ELSE btrim(cust.first_name)
          END
      END AS other_party_label,
      (
        SELECT m.created_at
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message_at,
      (
        SELECT left(m.body, 140)
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_preview,
      coalesce((
        SELECT m.sender_profile_id = (SELECT auth.uid())
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ), false) AS last_sender_is_viewer,
      coalesce((
        SELECT count(*)::int
        FROM public.project_messages m
        WHERE m.thread_id = t.id
          AND m.sender_profile_id IS DISTINCT FROM (SELECT auth.uid())
          AND m.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz)
      ), 0) AS unread_count,
      rd.last_read_at,
      (
        SELECT b.id
        FROM public.bookings b
        WHERE b.project_id = pairs.project_id
          AND b.contractor_profile_id = pairs.contractor_profile_id
          AND b.status IS DISTINCT FROM 'CANCELLED'
        ORDER BY b.created_at DESC
        LIMIT 1
      ) AS booking_id,
      (
        SELECT o.id
        FROM public.opportunities o
        WHERE o.project_id = pairs.project_id
          AND o.contractor_profile_id = pairs.contractor_profile_id
        ORDER BY o.created_at DESC
        LIMIT 1
      ) AS opportunity_id
    FROM pairs
    JOIN public.projects p ON p.id = pairs.project_id
    JOIN public.profiles cust ON cust.id = p.customer_id
    JOIN public.contractor_profiles cp ON cp.id = pairs.contractor_profile_id
    LEFT JOIN public.project_message_threads t
      ON t.project_id = pairs.project_id
     AND t.contractor_profile_id = pairs.contractor_profile_id
    LEFT JOIN public.project_message_reads rd
      ON rd.thread_id = t.id
     AND rd.profile_id = (SELECT auth.uid())
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'thread_id', rows.thread_id,
        'project_id', rows.project_id,
        'contractor_profile_id', rows.contractor_profile_id,
        'project_title', rows.project_title,
        'project_reference_number', rows.project_reference_number,
        'city', rows.city,
        'state', rows.state,
        'contractor_label', rows.contractor_label,
        'other_party_label', rows.other_party_label,
        'last_message_at', rows.last_message_at,
        'last_preview', rows.last_preview,
        'last_sender_is_viewer', rows.last_sender_is_viewer,
        'unread_count', rows.unread_count,
        'last_read_at', rows.last_read_at,
        'booking_id', rows.booking_id,
        'opportunity_id', rows.opportunity_id
      )
      ORDER BY rows.last_message_at DESC NULLS LAST, rows.project_title
    ),
    '[]'::jsonb
  )
  FROM rows;
$$;

-- Previous list_my_notifications (20260924000001).
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
      'body', n.body,
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

-- Previous notify_project_message (20261011000004).
CREATE OR REPLACE FUNCTION public.notify_project_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.project_message_threads;
  v_owner uuid;
  v_contractor_user uuid;
  v_recipient uuid;
  v_from text;
BEGIN
  SELECT * INTO v_thread FROM public.project_message_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.project_message_threads
  SET updated_at = now()
  WHERE id = v_thread.id;

  SELECT p.customer_id INTO v_owner
  FROM public.projects p
  WHERE p.id = v_thread.project_id;
  v_contractor_user := public.contractor_owner_profile_id(v_thread.contractor_profile_id);

  IF NEW.sender_profile_id = v_owner THEN
    v_recipient := v_contractor_user;
    SELECT coalesce(nullif(btrim(first_name), ''), 'a customer') INTO v_from
    FROM public.profiles
    WHERE id = v_owner;
  ELSIF NEW.sender_profile_id = v_contractor_user THEN
    v_recipient := v_owner;
    SELECT coalesce(nullif(btrim(business_name), ''), 'a pro') INTO v_from
    FROM public.contractor_profiles
    WHERE id = v_thread.contractor_profile_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_profile_id THEN
    RETURN NEW;
  END IF;

  IF v_from IS NULL
     OR public.text_contains_contact_info(v_from)
     OR public.text_contains_pre_hire_contact(v_from) THEN
    v_from := CASE WHEN NEW.sender_profile_id = v_owner THEN 'a customer' ELSE 'a pro' END;
  END IF;

  PERFORM public.ppp_set_rpc('notify_project_message');
  PERFORM public.enqueue_notification(
    v_recipient,
    'message.received',
    'New message',
    'New message from ' || v_from || '.',
    'project_message_threads',
    v_thread.id,
    jsonb_build_object(
      'thread_id', v_thread.id,
      'project_id', v_thread.project_id,
      'contractor_profile_id', v_thread.contractor_profile_id
    )
  );

  RETURN NEW;
END;
$$;

-- Previous hire_again_contractors (20261011000001).
CREATE OR REPLACE FUNCTION public.hire_again_contractors()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  months integer;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  months := public.relationship_protection_months();
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      r.id AS relationship_id,
      r.contractor_profile_id,
      cp.business_name,
      cp.primary_trade,
      r.introduced_at,
      r.last_completed_at,
      r.last_completed_booking_id,
      r.protected_until,
      r.protected_until > now() AS currently_protected,
      months AS protection_months,
      false AS charges_live,
      false AS payments_live
    FROM public.customer_contractor_relationships r
    JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
    WHERE r.customer_id = auth.uid()
      AND r.status = 'ACTIVE'
      AND r.last_completed_booking_id IS NOT NULL
    ORDER BY r.last_completed_at DESC NULLS LAST
  ) x;
  RETURN result;
END;
$$;


COMMENT ON FUNCTION public.contractor_public_service_label(uuid) IS
  'Public phrase Serves within N miles of City, ST. Prefers the contractor profile city and state when service_area has them, otherwise the ZIP centroid place. NULL for legacy ZIP-only rows and for contractors who are not directory-listed.';

REVOKE ALL ON FUNCTION public.contractor_public_service_label(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contractor_public_service_label(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.list_public_directory_contractors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_directory_contractors() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.list_my_project_connection_cards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_project_connection_cards(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_my_message_threads() IS
  'Inbox rows after a $4.99 connection entitlement. Customers see the contractor business name. Contractors see the customer first name. Includes project_reference_number. No phone, email, or street.';

REVOKE ALL ON FUNCTION public.list_my_message_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_message_threads() TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_notifications() TO authenticated;

REVOKE ALL ON FUNCTION public.notify_project_message() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notify_project_message() IS
  'In-app notice names the other party. Payload is thread ids only — never the message body, phone, email, or street.';

REVOKE ALL ON FUNCTION public.hire_again_contractors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hire_again_contractors() TO authenticated;

DROP FUNCTION IF EXISTS public.contractor_name_for_my_project(uuid, uuid);
DROP FUNCTION IF EXISTS public.public_directory_categories(uuid);
DROP FUNCTION IF EXISTS public.public_directory_primary_trade(uuid);
DROP FUNCTION IF EXISTS public.public_directory_label(uuid);
DROP FUNCTION IF EXISTS public.public_review_body(text, text, text, text);
DROP FUNCTION IF EXISTS public.public_pro_label(text, text[], text);
DROP FUNCTION IF EXISTS public.public_primary_trade(text, text[]);
DROP FUNCTION IF EXISTS public.public_trade_is_safe(text);
DROP FUNCTION IF EXISTS public.public_service_is_broad(text);
DROP FUNCTION IF EXISTS public.public_service_is_other(text);
