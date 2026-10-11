-- Read-only admin project list and lifecycle.
-- List and detail omit house addresses and contact numbers.
-- Does not change projects, bookings, fees, or payments.
-- Version 20261019300003.

CREATE OR REPLACE FUNCTION public.admin_list_projects(
  p_query text DEFAULT NULL,
  p_customer text DEFAULT NULL,
  p_contractor text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_trade text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_disputed boolean DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_include boolean := coalesce(p_include_test, false);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_raw text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text := NULL;
  v_ref bigint := NULL;
  v_customer text := nullif(btrim(coalesce(p_customer, '')), '');
  v_customer_like text := NULL;
  v_customer_id uuid := NULL;
  v_contractor text := nullif(btrim(coalesce(p_contractor, '')), '');
  v_contractor_like text := NULL;
  v_contractor_id uuid := NULL;
  v_status text := nullif(upper(btrim(coalesce(p_status, ''))), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_trade text := nullif(btrim(coalesce(p_trade, '')), '');
  v_rows jsonb;
  v_total bigint;
BEGIN
  PERFORM public.admin_require();

  IF v_raw IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_raw, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    IF v_raw ~* '^ppp-?[0-9]+$' OR v_raw ~ '^[0-9]+$' THEN
      v_ref := regexp_replace(v_raw, '[^0-9]', '', 'g')::bigint;
    END IF;
  END IF;
  IF v_customer IS NOT NULL THEN
    v_customer_like := '%' || replace(replace(replace(v_customer, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    BEGIN
      v_customer_id := v_customer::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_customer_id := NULL;
    END;
  END IF;
  IF v_contractor IS NOT NULL THEN
    v_contractor_like := '%' || replace(replace(replace(v_contractor, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    BEGIN
      v_contractor_id := v_contractor::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_contractor_id := NULL;
    END;
  END IF;

  WITH filtered AS (
    SELECT
      pr.id AS project_id,
      pr.reference_number,
      pr.title,
      pr.status::text AS status,
      pr.city,
      pr.state,
      (SELECT sc.name FROM public.service_categories sc WHERE sc.id = pr.category_id) AS trade,
      cu.id AS customer_id,
      coalesce(nullif(btrim(concat_ws(' ', cu.first_name, cu.last_name)), ''), 'Homeowner') AS customer_name,
      coalesce(pr.selected_contractor_profile_id, (
        SELECT b.contractor_profile_id
        FROM public.bookings b
        WHERE b.project_id = pr.id AND b.status::text <> 'CANCELLED'
        ORDER BY b.created_at DESC
        LIMIT 1
      )) AS contractor_profile_id,
      coalesce(
        (SELECT cp.business_name FROM public.contractor_profiles cp WHERE cp.id = pr.selected_contractor_profile_id),
        (
          SELECT cp.business_name
          FROM public.bookings b
          JOIN public.contractor_profiles cp ON cp.id = b.contractor_profile_id
          WHERE b.project_id = pr.id AND b.status::text <> 'CANCELLED'
          ORDER BY b.created_at DESC
          LIMIT 1
        )
      ) AS contractor_business_name,
      pr.posted_at,
      EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.project_id = pr.id AND b.status::text = 'DISPUTED'
      ) AS disputed,
      (
        SELECT b.id
        FROM public.bookings b
        WHERE b.project_id = pr.id AND b.status::text <> 'CANCELLED'
        ORDER BY b.created_at DESC
        LIMIT 1
      ) AS booking_id,
      coalesce(pr.posted_at, pr.created_at) AS sort_at
    FROM public.projects pr
    JOIN public.profiles cu ON cu.id = pr.customer_id
    WHERE NOT public.admin_account_is_excluded(cu.id, v_include)
      AND NOT EXISTS (
        SELECT 1
        FROM public.contractor_profiles cp
        WHERE cp.id = pr.selected_contractor_profile_id
          AND public.admin_account_is_excluded(cp.profile_id, v_include)
      )
      AND (v_status IS NULL OR pr.status::text = v_status)
      AND (v_city IS NULL OR pr.city ILIKE '%' || replace(replace(v_city, '%', '\%'), '_', '\_') || '%' ESCAPE '\')
      AND (
        v_raw IS NULL
        OR pr.reference_number = v_ref
        OR pr.title ILIKE v_like ESCAPE '\'
      )
      AND (
        v_customer IS NULL
        OR cu.id = v_customer_id
        OR cu.first_name ILIKE v_customer_like ESCAPE '\'
        OR cu.last_name ILIKE v_customer_like ESCAPE '\'
        OR concat_ws(' ', cu.first_name, cu.last_name) ILIKE v_customer_like ESCAPE '\'
      )
      AND (
        v_contractor IS NULL
        OR pr.selected_contractor_profile_id = v_contractor_id
        OR EXISTS (
          SELECT 1
          FROM public.contractor_profiles cp
          WHERE cp.id = pr.selected_contractor_profile_id
            AND (cp.id = v_contractor_id OR cp.business_name ILIKE v_contractor_like ESCAPE '\')
        )
        OR EXISTS (
          SELECT 1
          FROM public.bookings b
          JOIN public.contractor_profiles cp ON cp.id = b.contractor_profile_id
          WHERE b.project_id = pr.id
            AND (cp.id = v_contractor_id OR cp.business_name ILIKE v_contractor_like ESCAPE '\')
        )
        OR EXISTS (
          SELECT 1
          FROM public.estimates e
          JOIN public.contractor_profiles cp ON cp.id = e.contractor_profile_id
          WHERE e.project_id = pr.id
            AND (cp.id = v_contractor_id OR cp.business_name ILIKE v_contractor_like ESCAPE '\')
        )
      )
      AND (
        v_trade IS NULL
        OR EXISTS (
          SELECT 1 FROM public.service_categories sc
          WHERE sc.id = pr.category_id AND sc.name ILIKE '%' || replace(v_trade, '%', '\%') || '%' ESCAPE '\'
        )
        OR EXISTS (
          SELECT 1
          FROM public.estimates e
          JOIN public.contractor_profiles cp ON cp.id = e.contractor_profile_id
          WHERE e.project_id = pr.id
            AND cp.primary_trade ILIKE '%' || replace(v_trade, '%', '\%') || '%' ESCAPE '\'
        )
      )
      AND (p_from IS NULL OR (coalesce(pr.posted_at, pr.created_at) AT TIME ZONE 'America/Chicago')::date >= p_from)
      AND (p_to IS NULL OR (coalesce(pr.posted_at, pr.created_at) AT TIME ZONE 'America/Chicago')::date <= p_to)
      AND (
        p_disputed IS NULL
        OR p_disputed = EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.project_id = pr.id AND b.status::text = 'DISPUTED'
        )
      )
  )
  SELECT
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'project_id', page.project_id,
          'reference_number', page.reference_number,
          'title', page.title,
          'status', page.status,
          'city', page.city,
          'state', page.state,
          'trade', page.trade,
          'customer_id', page.customer_id,
          'customer_name', page.customer_name,
          'contractor_profile_id', page.contractor_profile_id,
          'contractor_business_name', page.contractor_business_name,
          'posted_at', page.posted_at,
          'disputed', page.disputed,
          'booking_id', page.booking_id
        )
        ORDER BY page.sort_at DESC, page.project_id
      )
      FROM (
        SELECT * FROM filtered
        ORDER BY sort_at DESC, project_id
        LIMIT v_limit OFFSET v_offset
      ) page
    ), '[]'::jsonb),
    (SELECT count(*) FROM filtered)
  INTO v_rows, v_total;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'include_test', v_include
  );
END;
$fn$;

COMMENT ON FUNCTION public.admin_list_projects(text, text, text, text, text, text, date, date, boolean, boolean, integer, integer) IS
  'Admin-only project list. City and PPP number only. House addresses and contact numbers are not selected. Read-only.';

REVOKE ALL ON FUNCTION public.admin_list_projects(text, text, text, text, text, text, date, date, boolean, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_projects(text, text, text, text, text, text, date, date, boolean, boolean, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_project(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row jsonb;
BEGIN
  PERFORM public.admin_require();
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'project_id', pr.id,
    'reference_number', pr.reference_number,
    'title', pr.title,
    'description', pr.description,
    'status', pr.status::text,
    'city', pr.city,
    'state', pr.state,
    'trade', (SELECT sc.name FROM public.service_categories sc WHERE sc.id = pr.category_id),
    'customer_id', cu.id,
    'customer_name', coalesce(nullif(btrim(concat_ws(' ', cu.first_name, cu.last_name)), ''), 'Homeowner'),
    'contractor_business_name', (
      SELECT cp.business_name FROM public.contractor_profiles cp WHERE cp.id = pr.selected_contractor_profile_id
    ),
    'posted_at', pr.posted_at,
    'disputed', EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.project_id = pr.id AND b.status::text = 'DISPUTED'
    ),
    'booking_id', (
      SELECT b.id FROM public.bookings b
      WHERE b.project_id = pr.id AND b.status::text <> 'CANCELLED'
      ORDER BY b.created_at DESC LIMIT 1
    ),
    'status_history', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'from_status', h.from_status::text,
          'to_status', h.to_status::text,
          'created_at', h.created_at
        )
        ORDER BY h.created_at
      )
      FROM public.project_status_history h
      WHERE h.project_id = pr.id
    ), '[]'::jsonb),
    'estimates', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'estimate_id', e.id,
          'status', e.status::text,
          'total_cents', e.total_cents,
          'submitted_at', e.submitted_at,
          'contractor_business_name', cp.business_name
        )
        ORDER BY e.created_at DESC
      )
      FROM public.estimates e
      JOIN public.contractor_profiles cp ON cp.id = e.contractor_profile_id
      WHERE e.project_id = pr.id
    ), '[]'::jsonb),
    'bookings', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'booking_id', b.id,
          'status', b.status::text,
          'customer_hired_at', b.customer_hired_at,
          'contractor_hired_at', b.contractor_hired_at,
          'started_at', b.started_at,
          'completed_at', b.completed_at,
          'disputed_at', b.disputed_at,
          'cancelled_at', b.cancelled_at
        )
        ORDER BY b.created_at
      )
      FROM public.bookings b
      WHERE b.project_id = pr.id
    ), '[]'::jsonb)
  )
  INTO v_row
  FROM public.projects pr
  JOIN public.profiles cu ON cu.id = pr.customer_id
  WHERE pr.id = p_project_id;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$fn$;

COMMENT ON FUNCTION public.admin_get_project(uuid) IS
  'Admin-only project lifecycle. Status history, estimates, and booking timestamps. House addresses and contact numbers are not selected. Read-only.';

REVOKE ALL ON FUNCTION public.admin_get_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_project(uuid) TO authenticated;
