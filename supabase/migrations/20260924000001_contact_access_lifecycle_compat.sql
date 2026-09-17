-- Contact-access hardening after estimate-lifecycle (#16).
-- Additive. Does not enable Stripe. Does not change payments_live, charges_live, or signup_fee_enabled.
-- Re-asserts booking-specific entitlement after #16 RPCs/notifications/events.
-- Missing booking_contact_access row = NO ACCESS. ACCEPTED and CONFIRMED never unlock.

CREATE OR REPLACE FUNCTION public.strip_private_contact_keys(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p IS NULL OR p = 'null'::jsonb THEN '{}'::jsonb
    WHEN jsonb_typeof(p) <> 'object' THEN p
    ELSE p
      - 'phone' - 'email' - 'street' - 'street_line1' - 'street_line2'
      - 'lat' - 'lng' - 'coords' - 'exact_address'
      - 'customer_phone' - 'customer_email' - 'latitude' - 'longitude'
  END;
$$;

COMMENT ON FUNCTION public.strip_private_contact_keys(jsonb) IS
  'Removes private street/phone/email/coords keys from JSON payloads. Used by notifications and estimate_events. Contact remains on booking_contact_access.';

CREATE OR REPLACE FUNCTION public.protect_booking_contact_access_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Default LOCKED rows are created by the bookings insert trigger (any RPC).
  -- Clients have no INSERT grant; this only allows SYSTEM/LOCKED defaults.
  IF TG_OP = 'INSERT'
     AND NEW.status = 'LOCKED'
     AND NEW.grant_source = 'SYSTEM'
     AND NEW.granted_by IS NULL
     AND NEW.revoked_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.ppp_rpc_is('admin_grant_booking_contact_access')
     OR public.ppp_rpc_is('admin_revoke_booking_contact_access') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'contact access cannot be written from the client';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Future internal job-fee path only. Not granted to clients. Refuses while payments are off.
  IF public.ppp_rpc_is('grant_booking_contact_access_from_job_fee') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'contact access cannot be written from the client';
END;
$$;

-- True only for the booking's customer or hired contractor, and only when
-- entitlement is UNLOCKED or ADMIN_OVERRIDE. Missing row = no access.
CREATE OR REPLACE FUNCTION public.booking_has_contact_access(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_contact_access a
    JOIN public.bookings b ON b.id = a.booking_id
    WHERE a.booking_id = p_booking_id
      AND a.revoked_at IS NULL
      AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
      AND b.status IS DISTINCT FROM 'CANCELLED'
      AND (
        b.customer_id = auth.uid()
        OR b.contractor_profile_id = public.current_contractor_profile_id()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.contractor_has_contact_access_on_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.booking_contact_access a ON a.booking_id = b.id
    WHERE b.project_id = p_project_id
      AND b.contractor_profile_id = public.current_contractor_profile_id()
      AND b.status IS DISTINCT FROM 'CANCELLED'
      AND a.revoked_at IS NULL
      AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
  );
$$;

CREATE OR REPLACE FUNCTION public.booking_is_confirmed_for_contractor(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.contractor_has_contact_access_on_project(p_project_id);
$$;

CREATE OR REPLACE FUNCTION public.booking_job_contact(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  loc public.project_private_locations;
  cust public.profiles;
  access public.booking_contact_access;
  entitled boolean;
  is_customer boolean;
  is_hired boolean;
BEGIN
  PERFORM public.expire_stale_pending_bookings();
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;

  IF NOT FOUND THEN
    IF public.is_admin() THEN
      RAISE EXCEPTION 'booking not found';
    END IF;
    RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override';
  END IF;

  SELECT * INTO access FROM public.booking_contact_access WHERE booking_id = b.id;
  -- Missing row is LOCKED / no contractor access. Never implicit unlock.
  entitled := public.booking_has_contact_access(b.id);
  is_customer := b.customer_id = auth.uid();
  is_hired := b.contractor_profile_id IS NOT DISTINCT FROM public.current_contractor_profile_id()
    AND public.current_contractor_profile_id() IS NOT NULL;

  IF NOT (
    public.is_admin()
    OR is_customer
    OR (is_hired AND entitled)
  ) THEN
    RAISE EXCEPTION 'contact is locked until hire and job-fee entitlement or admin override';
  END IF;

  -- Owner/admin may read their own or support record. Hired contractor needs entitlement.
  -- ACCEPTED estimate status and CONFIRMED booking status are not consulted here.

  SELECT * INTO loc FROM public.project_private_locations WHERE project_id = b.project_id;
  SELECT * INTO cust FROM public.profiles WHERE id = b.customer_id;

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'unlocked', entitled,
    'contact_access_status', coalesce(access.status, 'LOCKED'::public.contact_access_status),
    'street_line1', loc.street_line1,
    'street_line2', loc.street_line2,
    'lat', loc.lat,
    'lng', loc.lng,
    'city', (SELECT city FROM public.projects WHERE id = b.project_id),
    'state', (SELECT state FROM public.projects WHERE id = b.project_id),
    'zip_code', (SELECT zip_code FROM public.projects WHERE id = b.project_id),
    'phone', cust.phone,
    'email', cust.email,
    'first_name', cust.first_name,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_booking_contact_access(p_booking_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  v_reason text;
  access public.booking_contact_access;
BEGIN
  PERFORM public.ppp_set_rpc('admin_revoke_booking_contact_access');

  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can revoke booking contact access';
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'a reason is required to revoke contact access';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  INSERT INTO public.booking_contact_access (booking_id, status, grant_source)
  VALUES (b.id, 'LOCKED', 'SYSTEM')
  ON CONFLICT (booking_id) DO UPDATE
    SET
      status = 'LOCKED',
      revoked_at = now()
  RETURNING * INTO access;

  PERFORM public.write_booking_event(
    b.id,
    'contact_access.revoked',
    public.strip_private_contact_keys(jsonb_build_object(
      'status', access.status,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id
    ))
  );

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking.contact_access.revoked',
    'booking',
    b.id,
    public.strip_private_contact_keys(jsonb_build_object(
      'status', access.status,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id,
      'revoked_at', access.revoked_at,
      'revoked_by', auth.uid()
    ))
  );

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', access.status,
    'grant_source', access.grant_source,
    'grant_reason', access.grant_reason,
    'granted_at', access.granted_at,
    'granted_by', access.granted_by,
    'revoked_at', access.revoked_at,
    'customer_id', b.customer_id,
    'contractor_profile_id', b.contractor_profile_id,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_booking_contact_access_from_job_fee(
  p_booking_id uuid,
  p_reason text DEFAULT 'job_fee_payment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ppp_set_rpc('grant_booking_contact_access_from_job_fee');

  IF NOT public.payments_live() OR NOT public.charges_live() THEN
    RAISE EXCEPTION 'job-fee contact unlock is disabled while payments are off';
  END IF;

  RAISE EXCEPTION 'job-fee contact unlock is not wired; do not call this function';
END;
$$;

CREATE OR REPLACE FUNCTION public.write_estimate_event(
  p_estimate_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.estimate_events (estimate_id, actor_id, event_type, payload)
  VALUES (
    p_estimate_id,
    auth.uid(),
    p_event_type,
    public.strip_private_contact_keys(coalesce(p_payload, '{}'::jsonb))
  );
END;
$$;

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

DROP POLICY IF EXISTS project_private_locations_select_protected ON public.project_private_locations;
CREATE POLICY project_private_locations_select_protected
  ON public.project_private_locations FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_has_contact_access_on_project(project_id)
  );

REVOKE ALL ON FUNCTION public.strip_private_contact_keys(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_booking_contact_access_from_job_fee(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_booking_contact_access_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_estimate_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.booking_has_contact_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contractor_has_contact_access_on_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.booking_is_confirmed_for_contractor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.booking_job_contact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_grant_booking_contact_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_booking_contact_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_notifications() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.booking_has_contact_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contractor_has_contact_access_on_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_is_confirmed_for_contractor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_job_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_booking_contact_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_booking_contact_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_notifications() TO authenticated;

COMMENT ON FUNCTION public.booking_has_contact_access(uuid) IS
  'True only when contact entitlement is UNLOCKED or ADMIN_OVERRIDE and the caller is the booking customer or hired contractor. Missing row = no access. CONFIRMED and ACCEPTED are not enough.';
COMMENT ON FUNCTION public.contractor_has_contact_access_on_project(uuid) IS
  'Exact street / coordinates unlock for the hired contractor only after contact entitlement. Selection, estimates, and CONFIRMED alone are not enough. Other contractors never inherit access.';
COMMENT ON FUNCTION public.booking_is_confirmed_for_contractor(uuid) IS
  'Legacy name. Delegates to contractor_has_contact_access_on_project. CONFIRMED does not grant access.';
COMMENT ON FUNCTION public.booking_job_contact(uuid) IS
  'RPC-mediated phone/email/street after contact entitlement. Unauthorized callers get an error with no private fields. Does not open profiles SELECT. CONFIRMED/ACCEPTED alone stay locked.';
COMMENT ON FUNCTION public.admin_revoke_booking_contact_access(uuid, text) IS
  'ADMIN-only. Relocks one booking immediately, requires a reason, writes audit_logs. No alternate RPC returns private fields after revoke.';
COMMENT ON FUNCTION public.grant_booking_contact_access_from_job_fee(uuid, text) IS
  'Internal stub. NEVER called while payments_live/charges_live are off. Not granted to clients. Not wired to Stripe. Cannot manufacture UNLOCKED from the client.';
COMMENT ON POLICY project_private_locations_select_protected ON public.project_private_locations IS
  'Owners and admins may read. Hired contractors need contact entitlement, not mere CONFIRMED or ACCEPTED.';
COMMENT ON FUNCTION public.list_my_notifications() IS
  'In-app notifications for the caller. Payload never includes phone/email/street/coords.';
COMMENT ON FUNCTION public.write_estimate_event(uuid, text, jsonb) IS
  'Append-only estimate audit. Private contact keys are stripped from payload.';
