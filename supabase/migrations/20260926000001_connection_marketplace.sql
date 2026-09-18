-- Flat $4.99 Connection Marketplace (payments OFF).
-- Additive. Does not drop historical fee tables, estimates, or #14 booking_contact_access.
-- Does not enable Stripe. Does not change payments_live / charges_live from 0.
-- signup_fee_enabled stays 0. stripe_test_mode is recorded as 1 without implementing Stripe.

INSERT INTO public.platform_settings (key, value_int, description)
VALUES
  (
    'connection_fee_cents',
    499,
    'Authoritative contractor Connection Fee in cents. Server-only. Clients cannot set this.'
  ),
  (
    'max_completed_connections_per_project',
    3,
    'Maximum PAID/COMPLETED (and occupying reserved) contractor connections per project.'
  ),
  (
    'signup_fee_enabled',
    0,
    '0 = $9.99 account activation checkout is not live. PR #12 owns Stripe signup-fee work and is parked.'
  ),
  (
    'stripe_test_mode',
    1,
    'If Stripe is ever enabled it must stay in test mode. This flag does not enable Stripe, Connect, checkout, or payouts.'
  ),
  (
    'legacy_progressive_fee_engine',
    1,
    'DEPRECATED. Historical ORIGINAL/REPEAT % job-fee engine. Unused by the active $4.99 connection lifecycle. Tables retained for history.'
  )
ON CONFLICT (key) DO NOTHING;

-- Never flip live payment flags in this migration.
UPDATE public.platform_settings
SET description = coalesce(description, '') || ' Connection marketplace: remains off.'
WHERE key IN ('payments_live', 'charges_live')
  AND value_int = 0
  AND description NOT LIKE '%Connection marketplace%';

COMMENT ON TABLE public.fee_schedules IS
  'LEGACY / DEPRECATED progressive marketplace job-fee schedules. Retained for historical bookings. Active product uses connection_fee_cents = 499. Do not delete.';
COMMENT ON TABLE public.fee_schedule_brackets IS
  'LEGACY / DEPRECATED brackets for the progressive job-fee engine. Unused by the $4.99 connection lifecycle.';

CREATE TYPE public.project_connection_status AS ENUM (
  'INITIATED',
  'RESERVED',
  'PAYMENT_DISABLED',
  'PAID',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE public.connection_contact_grant_source AS ENUM (
  'CONNECTION_FEE_PAYMENT',
  'ADMIN_OVERRIDE',
  'SYSTEM'
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS accepting_connections boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS connections_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS connections_closed_by uuid REFERENCES public.profiles (id);

CREATE TABLE public.project_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  status public.project_connection_status NOT NULL DEFAULT 'INITIATED',
  fee_cents integer NOT NULL DEFAULT 499,
  currency text NOT NULL DEFAULT 'usd',
  idempotency_key text,
  reservation_slot integer,
  payments_live boolean NOT NULL DEFAULT false,
  charges_live boolean NOT NULL DEFAULT false,
  reserved_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_connections_fee_cents_check CHECK (fee_cents = 499),
  CONSTRAINT project_connections_payments_not_live CHECK (payments_live = false),
  CONSTRAINT project_connections_charges_not_live CHECK (charges_live = false),
  CONSTRAINT project_connections_slot_range CHECK (
    reservation_slot IS NULL OR reservation_slot BETWEEN 1 AND 3
  ),
  CONSTRAINT project_connections_pair UNIQUE (project_id, contractor_profile_id)
);

CREATE UNIQUE INDEX project_connections_idempotency_idx
  ON public.project_connections (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX project_connections_project_status_idx
  ON public.project_connections (project_id, status);

CREATE TRIGGER project_connections_set_updated_at
  BEFORE UPDATE ON public.project_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.connection_slots (
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  slot_number integer NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.project_connections (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, slot_number),
  CONSTRAINT connection_slots_range CHECK (slot_number BETWEEN 1 AND 3),
  CONSTRAINT connection_slots_connection UNIQUE (connection_id)
);

CREATE TABLE public.connection_contact_access (
  connection_id uuid PRIMARY KEY REFERENCES public.project_connections (id) ON DELETE CASCADE,
  status public.contact_access_status NOT NULL DEFAULT 'LOCKED',
  granted_at timestamptz,
  granted_by uuid REFERENCES public.profiles (id),
  grant_reason text,
  grant_source public.connection_contact_grant_source NOT NULL DEFAULT 'SYSTEM',
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_contact_access_active_not_revoked CHECK (
    (status IN ('UNLOCKED', 'ADMIN_OVERRIDE') AND revoked_at IS NULL)
    OR status = 'LOCKED'
  )
);

CREATE TRIGGER connection_contact_access_set_updated_at
  BEFORE UPDATE ON public.connection_contact_access
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.project_connections (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles (id),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles (id),
  target_type text NOT NULL,
  target_id uuid,
  reason text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_reason_len CHECK (char_length(btrim(reason)) BETWEEN 3 AND 200)
);

CREATE OR REPLACE FUNCTION public.connection_fee_cents()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT 499;
$$;

CREATE OR REPLACE FUNCTION public.write_connection_event(
  p_connection_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.connection_events (connection_id, actor_id, event_type, payload)
  VALUES (
    p_connection_id,
    auth.uid(),
    p_event_type,
    coalesce(p_payload, '{}'::jsonb)
      - 'phone' - 'email' - 'street' - 'street_line1' - 'street_line2'
      - 'lat' - 'lng' - 'coords' - 'exact_address'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_project_connection_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('request_project_connection')
     OR public.ppp_rpc_is('stop_new_project_connections')
     OR public.ppp_rpc_is('admin_grant_connection_contact_access')
     OR public.ppp_rpc_is('admin_revoke_connection_contact_access')
     OR public.ppp_rpc_is('finalize_project_connection_payment')
     OR public.ppp_rpc_is('grant_connection_contact_access_from_fee') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'project connections cannot be written from the client';
END;
$$;

CREATE TRIGGER project_connections_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.project_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_project_connection_row();

CREATE OR REPLACE FUNCTION public.protect_connection_contact_access_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('request_project_connection')
     OR public.ppp_rpc_is('admin_grant_connection_contact_access')
     OR public.ppp_rpc_is('admin_revoke_connection_contact_access')
     OR public.ppp_rpc_is('grant_connection_contact_access_from_fee')
     OR public.ppp_rpc_is('finalize_project_connection_payment') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'connection contact access cannot be written from the client';
END;
$$;

CREATE TRIGGER connection_contact_access_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.connection_contact_access
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_connection_contact_access_row();

CREATE OR REPLACE FUNCTION public.protect_connection_slot_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ppp_rpc_is('request_project_connection') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'connection slots cannot be written from the client';
END;
$$;

CREATE TRIGGER connection_slots_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.connection_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_connection_slot_row();

CREATE OR REPLACE FUNCTION public.guard_project_connection_money()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fee_cents IS DISTINCT FROM 499 THEN
    RAISE EXCEPTION 'connection fee is server-authoritative and must be 499 cents';
  END IF;
  IF NEW.status IN ('PAID', 'COMPLETED')
     AND NOT (
       public.ppp_rpc_is('finalize_project_connection_payment')
       OR public.ppp_rpc_is('grant_connection_contact_access_from_fee')
     ) THEN
    RAISE EXCEPTION 'connection cannot be marked paid from the client';
  END IF;
  IF NEW.payments_live IS DISTINCT FROM false OR NEW.charges_live IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'connection payments_live and charges_live must stay false';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_connections_guard_money
  BEFORE INSERT OR UPDATE ON public.project_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_connection_money();

CREATE OR REPLACE FUNCTION public.connection_has_contact_access(p_connection_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.connection_contact_access a
    JOIN public.project_connections c ON c.id = a.connection_id
    WHERE a.connection_id = p_connection_id
      AND a.revoked_at IS NULL
      AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
      AND c.status IS DISTINCT FROM 'CANCELLED'
      AND (
        c.customer_id = auth.uid()
        OR c.contractor_profile_id = public.current_contractor_profile_id()
      )
  );
$$;

-- #14 remains the booking entitlement. Connections add a second entitled path.
-- Missing entitlement on both paths = NO ACCESS. Statuses never unlock by themselves.
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
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_connections c
    JOIN public.connection_contact_access a ON a.connection_id = c.id
    WHERE c.project_id = p_project_id
      AND c.contractor_profile_id = public.current_contractor_profile_id()
      AND c.status IS DISTINCT FROM 'CANCELLED'
      AND a.revoked_at IS NULL
      AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE')
  );
$$;

CREATE OR REPLACE FUNCTION public.project_connection_occupancy(p_project_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.connection_slots
  WHERE project_id = p_project_id;
$$;

CREATE OR REPLACE FUNCTION public.project_connection_completed_count(p_project_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.project_connections
  WHERE project_id = p_project_id
    AND status IN ('PAID', 'COMPLETED');
$$;

CREATE OR REPLACE FUNCTION public.project_connection_availability(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  occupied integer;
  completed integer;
  remaining integer;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  occupied := public.project_connection_occupancy(p_project_id);
  completed := public.project_connection_completed_count(p_project_id);
  remaining := GREATEST(0, 3 - occupied);
  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'max', 3,
    'occupied', occupied,
    'remaining', remaining,
    'completed', completed,
    'accepting_connections', proj.accepting_connections,
    'full', occupied >= 3 OR proj.accepting_connections = false,
    'fee_cents', public.connection_fee_cents(),
    'payments_live', false,
    'charges_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_project_connection(
  p_project_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  contractor_id uuid;
  existing public.project_connections;
  occupied integer;
  slot integer;
  conn public.project_connections;
  key text;
BEGIN
  PERFORM public.ppp_set_rpc('request_project_connection');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  contractor_id := public.current_contractor_profile_id();
  IF contractor_id IS NULL THEN
    RAISE EXCEPTION 'only a contractor can request a connection';
  END IF;

  -- Serialize slot claims for this project. Unique (project_id, slot_number) is the race-safe cap.
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id = auth.uid() THEN
    RAISE EXCEPTION 'customers do not pay a Connection Fee';
  END IF;
  IF proj.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'project is cancelled';
  END IF;
  IF proj.accepting_connections IS NOT TRUE THEN
    RAISE EXCEPTION 'customer stopped new connections';
  END IF;

  key := nullif(btrim(coalesce(p_idempotency_key, '')), '');

  IF key IS NOT NULL THEN
    SELECT * INTO existing
    FROM public.project_connections
    WHERE idempotency_key = key;
    IF FOUND THEN
      IF existing.contractor_profile_id IS DISTINCT FROM contractor_id
         OR existing.project_id IS DISTINCT FROM p_project_id THEN
        RAISE EXCEPTION 'idempotency key already used';
      END IF;
      RETURN jsonb_build_object(
        'connection_id', existing.id,
        'status', existing.status,
        'fee_cents', existing.fee_cents,
        'contact_unlocked', false,
        'paid', false,
        'idempotent', true,
        'payments_live', false,
        'charges_live', false,
        'message', 'Connection requested. Online payment setup is coming soon. Clicking Connect does not unlock contact.'
      );
    END IF;
  END IF;

  SELECT * INTO existing
  FROM public.project_connections
  WHERE project_id = p_project_id
    AND contractor_profile_id = contractor_id;
  IF FOUND THEN
    RAISE EXCEPTION 'duplicate connection';
  END IF;

  occupied := public.project_connection_occupancy(p_project_id);
  IF occupied >= 3 THEN
    RAISE EXCEPTION 'connections full';
  END IF;

  SELECT s INTO slot
  FROM generate_series(1, 3) AS s
  WHERE s NOT IN (
    SELECT slot_number FROM public.connection_slots WHERE project_id = p_project_id
  )
  ORDER BY s
  LIMIT 1;

  IF slot IS NULL THEN
    RAISE EXCEPTION 'connections full';
  END IF;

  BEGIN
    INSERT INTO public.project_connections (
      project_id,
      contractor_profile_id,
      customer_id,
      status,
      fee_cents,
      idempotency_key,
      reservation_slot,
      payments_live,
      charges_live,
      reserved_at
    ) VALUES (
      p_project_id,
      contractor_id,
      proj.customer_id,
      'PAYMENT_DISABLED',
      499,
      key,
      slot,
      false,
      false,
      now()
    )
    RETURNING * INTO conn;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate connection';
  END;

  BEGIN
    INSERT INTO public.connection_slots (
      project_id, slot_number, connection_id, contractor_profile_id
    ) VALUES (
      p_project_id, slot, conn.id, contractor_id
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'connections full';
  END;

  INSERT INTO public.connection_contact_access (
    connection_id, status, grant_source
  ) VALUES (
    conn.id, 'LOCKED', 'SYSTEM'
  );

  PERFORM public.write_connection_event(
    conn.id,
    'connection.requested',
    jsonb_build_object(
      'project_id', p_project_id,
      'slot', slot,
      'fee_cents', 499,
      'status', 'PAYMENT_DISABLED',
      'contact_unlocked', false
    )
  );

  PERFORM public.write_audit_log(
    auth.uid(),
    'connection.requested',
    'project_connections',
    conn.id,
    jsonb_build_object('project_id', p_project_id, 'slot', slot, 'fee_cents', 499, 'paid', false)
  );

  RETURN jsonb_build_object(
    'connection_id', conn.id,
    'status', conn.status,
    'fee_cents', 499,
    'reservation_slot', slot,
    'contact_unlocked', false,
    'paid', false,
    'idempotent', false,
    'payments_live', false,
    'charges_live', false,
    'message', 'Connection requested. Online payment setup is coming soon. Clicking Connect does not unlock contact.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_new_project_connections(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  unlocked_kept integer;
BEGIN
  PERFORM public.ppp_set_rpc('stop_new_project_connections');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO proj FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found';
  END IF;
  IF proj.customer_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'only the project owner can stop new connections';
  END IF;

  UPDATE public.projects
  SET
    accepting_connections = false,
    connections_closed_at = coalesce(connections_closed_at, now()),
    connections_closed_by = coalesce(connections_closed_by, auth.uid())
  WHERE id = p_project_id
  RETURNING * INTO proj;

  SELECT count(*) INTO unlocked_kept
  FROM public.connection_contact_access a
  JOIN public.project_connections c ON c.id = a.connection_id
  WHERE c.project_id = p_project_id
    AND a.revoked_at IS NULL
    AND a.status IN ('UNLOCKED', 'ADMIN_OVERRIDE');

  PERFORM public.write_audit_log(
    auth.uid(),
    'project.connections.stopped',
    'projects',
    p_project_id,
    jsonb_build_object('unlocked_kept', unlocked_kept)
  );

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'accepting_connections', false,
    'existing_unlocked_kept', unlocked_kept,
    'deleted', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_project_connection_payment(
  p_connection_id uuid,
  p_reason text DEFAULT 'connection_fee_payment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ppp_set_rpc('finalize_project_connection_payment');
  IF NOT public.payments_live() OR NOT public.charges_live() THEN
    RAISE EXCEPTION 'connection-fee contact unlock is disabled while payments are off';
  END IF;
  RAISE EXCEPTION 'connection-fee payment finalization is not wired; do not call this function';
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_connection_contact_access_from_fee(
  p_connection_id uuid,
  p_reason text DEFAULT 'connection_fee_payment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ppp_set_rpc('grant_connection_contact_access_from_fee');
  IF NOT public.payments_live() OR NOT public.charges_live() THEN
    RAISE EXCEPTION 'connection-fee contact unlock is disabled while payments are off';
  END IF;
  RAISE EXCEPTION 'connection-fee contact unlock is not wired; do not call this function';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_connection_contact_access(
  p_connection_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn public.project_connections;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM public.ppp_set_rpc('admin_grant_connection_contact_access');
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can grant connection contact access';
  END IF;
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'a reason is required to grant contact access';
  END IF;
  SELECT * INTO conn FROM public.project_connections WHERE id = p_connection_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection not found';
  END IF;

  UPDATE public.connection_contact_access
  SET
    status = 'ADMIN_OVERRIDE',
    granted_at = now(),
    granted_by = auth.uid(),
    grant_reason = v_reason,
    grant_source = 'ADMIN_OVERRIDE',
    revoked_at = NULL,
    updated_at = now()
  WHERE connection_id = p_connection_id;

  PERFORM public.write_connection_event(
    p_connection_id,
    'connection.contact_access.granted',
    jsonb_build_object('reason', v_reason, 'customer_id', conn.customer_id, 'contractor_profile_id', conn.contractor_profile_id)
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'connection.contact_access.granted',
    'connection_contact_access',
    p_connection_id,
    jsonb_build_object('reason', v_reason, 'customer_id', conn.customer_id, 'contractor_profile_id', conn.contractor_profile_id)
  );

  RETURN jsonb_build_object('connection_id', p_connection_id, 'status', 'ADMIN_OVERRIDE');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_connection_contact_access(
  p_connection_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ppp_set_rpc('admin_revoke_connection_contact_access');
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can revoke connection contact access';
  END IF;
  UPDATE public.connection_contact_access
  SET
    status = 'LOCKED',
    revoked_at = now(),
    grant_reason = coalesce(nullif(btrim(p_reason), ''), grant_reason),
    updated_at = now()
  WHERE connection_id = p_connection_id;
  PERFORM public.write_connection_event(
    p_connection_id,
    'connection.contact_access.revoked',
    jsonb_build_object('reason', p_reason)
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'connection.contact_access.revoked',
    'connection_contact_access',
    p_connection_id,
    jsonb_build_object('reason', p_reason)
  );
  RETURN jsonb_build_object('connection_id', p_connection_id, 'status', 'LOCKED');
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_content_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'a report reason is required';
  END IF;
  INSERT INTO public.content_reports (reporter_id, target_type, target_id, reason, notes)
  VALUES (auth.uid(), p_target_type, p_target_id, v_reason, nullif(btrim(coalesce(p_notes, '')), ''))
  RETURNING id INTO rid;
  PERFORM public.write_audit_log(
    auth.uid(),
    'content.report',
    'content_reports',
    rid,
    jsonb_build_object('target_type', p_target_type, 'target_id', p_target_id)
  );
  RETURN jsonb_build_object('report_id', rid);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_project_connections(p_project_id uuid DEFAULT NULL)
RETURNS SETOF public.project_connections
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.*
  FROM public.project_connections c
  WHERE (p_project_id IS NULL OR c.project_id = p_project_id)
    AND (
      c.customer_id = auth.uid()
      OR c.contractor_profile_id = public.current_contractor_profile_id()
      OR public.is_admin()
    );
$$;

-- Expand obvious pre-connection contact detection: street + QR. Not surveillance.
CREATE OR REPLACE FUNCTION public.text_contains_contact_info(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN false
    WHEN p_text ~* '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}' THEN true
    WHEN p_text ~* '(https?://|www\.)' THEN true
    WHEN p_text ~* '(instagram|facebook|tiktok|twitter|linkedin|snapchat|whatsapp|telegram|threads\.net|x\.com)' THEN true
    WHEN p_text ~* '(^|[^[:alnum:]])@[A-Za-z][A-Za-z0-9._]{2,}' THEN true
    WHEN p_text ~* '(\+?1[\s.\-]?)?\(?[0-9]{3}\)?[\s.\-][0-9]{3}[\s.\-][0-9]{4}' THEN true
    WHEN p_text ~* 'tel:\+?[0-9]{7,}' THEN true
    WHEN p_text ~* '\yqr[[:space:]]*codes?\y' THEN true
    WHEN p_text ~* '[0-9]{1,5}[[:space:]]+[A-Za-z][A-Za-z[:space:].''-]{0,40}[[:space:]]+(street|st\.|avenue|ave\.|road|rd\.|drive|dr\.|lane|ln\.|boulevard|blvd\.|way|court|ct\.|circle|cir\.|place|pl\.)\y' THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.contact_info_blocked_message()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Please keep communication on Priority Property Pros until you connect. Remove phone numbers, emails, links, social handles, QR codes, and exact street addresses.';
$$;

ALTER TABLE public.project_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_contact_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_connections_select_participants
  ON public.project_connections FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY connection_slots_select_participants
  ON public.connection_slots FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.customer_id = auth.uid()
    )
  );

CREATE POLICY connection_contact_access_select_participants
  ON public.connection_contact_access FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_connections c
      WHERE c.id = connection_id
        AND (
          c.customer_id = auth.uid()
          OR c.contractor_profile_id = public.current_contractor_profile_id()
          OR public.is_admin()
        )
    )
  );

CREATE POLICY connection_events_select_participants
  ON public.connection_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_connections c
      WHERE c.id = connection_id
        AND (
          c.customer_id = auth.uid()
          OR c.contractor_profile_id = public.current_contractor_profile_id()
          OR public.is_admin()
        )
    )
  );

CREATE POLICY content_reports_select_own_or_admin
  ON public.content_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());

REVOKE ALL ON TABLE public.project_connections FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.connection_slots FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.connection_contact_access FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.connection_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.content_reports FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.project_connections TO authenticated;
GRANT SELECT ON TABLE public.connection_slots TO authenticated;
GRANT SELECT ON TABLE public.connection_contact_access TO authenticated;
GRANT SELECT ON TABLE public.connection_events TO authenticated;
GRANT SELECT ON TABLE public.content_reports TO authenticated;

REVOKE ALL ON FUNCTION public.write_connection_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_project_connection_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_connection_contact_access_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_connection_slot_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_project_connection_money() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_project_connection_payment(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_connection_contact_access_from_fee(uuid, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.connection_fee_cents() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.connection_has_contact_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_connection_occupancy(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_connection_completed_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_connection_availability(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_project_connection(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stop_new_project_connections(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_grant_connection_contact_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_connection_contact_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_content_report(text, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_project_connections(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.connection_fee_cents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.connection_has_contact_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_connection_availability(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_project_connection(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_new_project_connections(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_connection_contact_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_connection_contact_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_content_report(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_project_connections(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contractor_has_contact_access_on_project(uuid) TO authenticated;

COMMENT ON FUNCTION public.connection_fee_cents() IS
  'Authoritative Connection Fee = 499 cents. Not client-settable.';
COMMENT ON FUNCTION public.request_project_connection(uuid, text) IS
  'Contractor requests a $4.99 connection. Payments OFF: status PAYMENT_DISABLED, contact stays LOCKED. Duplicate pair prevented. Max 3 occupying slots, race-safe. Clients cannot pass a price or mark PAID.';
COMMENT ON FUNCTION public.finalize_project_connection_payment(uuid, text) IS
  'Internal stub. NEVER called while payments_live/charges_live are off. Not granted to clients. Not wired to Stripe.';
COMMENT ON FUNCTION public.grant_connection_contact_access_from_fee(uuid, text) IS
  'Internal stub. Future trusted $4.99 verification may grant UNLOCKED. Disabled while payments are off. Not granted to clients.';
COMMENT ON FUNCTION public.contractor_has_contact_access_on_project(uuid) IS
  'Exact street / coordinates unlock after #14 booking entitlement OR a paid/admin connection entitlement. Selection, estimates, CONFIRMED, and Connect click alone are not enough. Other contractors never inherit access.';
COMMENT ON TABLE public.project_connections IS
  'Contractor Connection Fee lifecycle. Clicking Connect does not unlock contact. PAID/COMPLETED are unreachable while payments are off.';
COMMENT ON COLUMN public.projects.accepting_connections IS
  'Customer Stop New Connections. Existing unlocked connections are not deleted.';
