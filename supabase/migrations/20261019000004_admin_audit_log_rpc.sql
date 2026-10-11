-- Read-only admin audit feed.
-- Does not change payments, fees, Stripe, matching, hiring, contact entitlement, or money columns.
-- Does not change who may write audit_logs. Clients still cannot insert, update, or delete.
-- portfolio.privacy_set and review.edited are already written by their functions.
-- This file does not replace those functions. The viewer omits storage paths and review text.

CREATE OR REPLACE FUNCTION public.forbid_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable';
END;
$$;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_logs_forbid_update' AND tgrelid = 'public.audit_logs'::regclass
  ) THEN
    CREATE TRIGGER audit_logs_forbid_update
      BEFORE UPDATE ON public.audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION public.forbid_audit_mutation();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_logs_forbid_delete' AND tgrelid = 'public.audit_logs'::regclass
  ) THEN
    CREATE TRIGGER audit_logs_forbid_delete
      BEFORE DELETE ON public.audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION public.forbid_audit_mutation();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_select_admin'
  ) THEN
    CREATE POLICY audit_logs_select_admin
      ON public.audit_logs
      FOR SELECT
      TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;

REVOKE ALL ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_audit_log(
  p_actor text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  occurred_at timestamptz,
  actor_role text,
  action text,
  job_reference text,
  summary text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor text := upper(btrim(coalesce(p_actor, '')));
  v_action text := btrim(coalesce(p_action, ''));
  v_raw text := upper(btrim(coalesce(p_reference, '')));
  v_ref bigint;
  v_limit integer;
BEGIN
  PERFORM public.admin_require();

  IF v_actor <> '' AND v_actor NOT IN ('ADMIN', 'CUSTOMER', 'CONTRACTOR', 'VERIFIER', 'SYSTEM') THEN
    RAISE EXCEPTION 'actor filter must be a role' USING ERRCODE = '22023';
  END IF;

  v_action := left(replace(replace(replace(v_action, '\', '\\'), '%', '\%'), '_', '\_'), 80);

  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'date range is backwards' USING ERRCODE = '22023';
  END IF;

  v_raw := regexp_replace(v_raw, '^PPP-', '');
  IF v_raw <> '' THEN
    IF v_raw !~ '^[0-9]{1,12}$' THEN
      RAISE EXCEPTION 'PPP number is not valid' USING ERRCODE = '22023';
    END IF;
    v_ref := v_raw::bigint;
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  RETURN QUERY
  WITH feed AS (
    SELECT
      a.created_at AS occurred_at,
      CASE
        WHEN a.actor_id IS NULL THEN 'SYSTEM'
        ELSE coalesce(
          (SELECT pr.account_type::text FROM public.profiles pr WHERE pr.id = a.actor_id),
          'SYSTEM'
        )
      END AS actor_role,
      a.action,
      CASE
        WHEN a.entity_type IN ('project', 'projects') THEN (
          SELECT p.reference_number FROM public.projects p WHERE p.id = a.entity_id
        )
        WHEN a.entity_type IN ('booking', 'bookings') THEN (
          SELECT p.reference_number
          FROM public.bookings b
          JOIN public.projects p ON p.id = b.project_id
          WHERE b.id = a.entity_id
        )
        WHEN a.entity_type IN ('estimate', 'estimates') THEN (
          SELECT p.reference_number
          FROM public.estimates e
          JOIN public.projects p ON p.id = e.project_id
          WHERE e.id = a.entity_id
        )
        WHEN a.entity_type = 'change_order' THEN (
          SELECT p.reference_number
          FROM public.change_orders co
          JOIN public.bookings b ON b.id = co.booking_id
          JOIN public.projects p ON p.id = b.project_id
          WHERE co.id = a.entity_id
        )
        ELSE NULL
      END AS reference_number,
      nullif(concat_ws(' · ',
        CASE
          WHEN coalesce(a.metadata ->> 'status', '') ~ '^[A-Z0-9_]{1,40}$' THEN a.metadata ->> 'status'
        END,
        CASE
          WHEN coalesce(a.metadata ->> 'role', '') ~ '^[A-Z0-9_]{1,40}$' THEN a.metadata ->> 'role'
        END,
        CASE
          WHEN coalesce(a.metadata ->> 'reviewer_role', '') ~ '^[A-Z0-9_]{1,40}$' THEN a.metadata ->> 'reviewer_role'
        END,
        CASE
          WHEN coalesce(a.metadata ->> 'reason', '') ~ '^[A-Z0-9_]{1,40}$' THEN a.metadata ->> 'reason'
        END,
        CASE
          WHEN coalesce(a.metadata ->> 'privacy_state', '') ~ '^[A-Z0-9_]{1,40}$' THEN a.metadata ->> 'privacy_state'
        END,
        CASE
          WHEN coalesce(a.metadata ->> 'rating', '') ~ '^[1-5]$' THEN 'rating ' || (a.metadata ->> 'rating')
        END,
        CASE
          WHEN coalesce(a.metadata ->> 'amount_delta_cents', '') ~ '^-?[0-9]{1,9}$'
            THEN (a.metadata ->> 'amount_delta_cents') || ' cents'
        END
      ), '') AS summary
    FROM public.audit_logs a

    UNION ALL

    SELECT
      e.created_at,
      'SYSTEM'::text,
      CASE
        WHEN e.event_type ~ '^[A-Za-z0-9._:-]{1,80}$' THEN 'connection.checkout.' || e.event_type
        ELSE 'connection.checkout.recorded'
      END,
      (
        SELECT p.reference_number
        FROM public.connection_checkout_sessions s
        JOIN public.projects p ON p.id = s.project_id
        WHERE s.id = e.checkout_session_id
      ),
      NULL::text
    FROM public.connection_checkout_events e
  )
  SELECT
    f.occurred_at,
    f.actor_role,
    f.action,
    CASE WHEN f.reference_number IS NULL THEN NULL ELSE 'PPP-' || f.reference_number::text END,
    f.summary
  FROM feed f
  WHERE (v_actor = '' OR f.actor_role = v_actor)
    AND (v_action = '' OR f.action ILIKE v_action || '%' ESCAPE '\')
    AND (p_from IS NULL OR f.occurred_at >= p_from::timestamptz)
    AND (p_to IS NULL OR f.occurred_at < (p_to + 1)::timestamptz)
    AND (v_ref IS NULL OR f.reference_number = v_ref)
  ORDER BY f.occurred_at DESC, f.action
  LIMIT v_limit;
END;
$fn$;

COMMENT ON FUNCTION public.admin_list_audit_log(text, text, date, date, text, integer) IS
  'Admin-only audit feed. Returns role, action, time, PPP number, and an allowlisted summary. No names, contact, addresses, photo paths, checkout payloads, or contractor identities.';

REVOKE ALL ON FUNCTION public.admin_list_audit_log(text, text, date, date, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_log(text, text, date, date, text, integer) TO authenticated;
