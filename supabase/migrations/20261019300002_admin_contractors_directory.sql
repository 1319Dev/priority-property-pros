-- Read-only admin contractors directory.
-- Does not change fees, payment rows, approval, account status, matching, or hiring.
-- Version 20261019300002. Open PRs do not use the 202610193000xx range.

CREATE OR REPLACE FUNCTION public.admin_list_contractors(
  p_query text DEFAULT NULL,
  p_status text DEFAULT NULL,
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
  v_uuid uuid := NULL;
  v_status text := nullif(upper(btrim(coalesce(p_status, ''))), '');
  v_rows jsonb;
  v_total bigint;
BEGIN
  PERFORM public.admin_require();

  IF v_raw IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_raw, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    BEGIN
      v_uuid := v_raw::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_uuid := NULL;
    END;
  END IF;

  WITH filtered AS (
    SELECT
      cp.id AS contractor_profile_id,
      cp.profile_id,
      coalesce(nullif(btrim(cp.business_name), ''), 'Contractor') AS business_name,
      coalesce((
        SELECT jsonb_agg(trade ORDER BY trade)
        FROM (
          SELECT DISTINCT sc.name AS trade
          FROM public.contractor_services cs
          JOIN public.service_categories sc ON sc.id = cs.category_id
          WHERE cs.contractor_profile_id = cp.id
          UNION
          SELECT btrim(cp.primary_trade) AS trade
          WHERE nullif(btrim(coalesce(cp.primary_trade, '')), '') IS NOT NULL
        ) names
      ), '[]'::jsonb) AS trades,
      nullif(btrim(concat_ws(', ',
        nullif(btrim(coalesce(cp.service_area, '')), ''),
        (
          SELECT string_agg(piece, ', ' ORDER BY piece)
          FROM (
            SELECT DISTINCT nullif(btrim(concat_ws(' ', nullif(btrim(a.label), ''), nullif(btrim(a.center_zip), ''))), '') AS piece
            FROM public.contractor_service_areas a
            WHERE a.contractor_profile_id = cp.id
          ) pieces
          WHERE piece IS NOT NULL
        )
      )), '') AS area,
      cp.approval_status::text AS approval_status,
      p.account_status::text AS account_status,
      p.signup_fee_status::text AS signup_fee_status,
      (
        SELECT round(avg(br.rating)::numeric, 1)
        FROM public.booking_reviews br
        WHERE br.contractor_profile_id = cp.id
      ) AS rating,
      (
        SELECT count(*) FROM public.booking_reviews br WHERE br.contractor_profile_id = cp.id
      ) AS review_count,
      (
        SELECT count(*) FROM public.bookings b WHERE b.contractor_profile_id = cp.id
      ) AS job_count,
      (
        SELECT count(*) FROM public.estimates e WHERE e.contractor_profile_id = cp.id
      ) AS estimate_count,
      f.flag,
      cp.created_at
    FROM public.contractor_profiles cp
    JOIN public.profiles p ON p.id = cp.profile_id
    LEFT JOIN public.admin_account_flags f ON f.profile_id = p.id
    WHERE p.account_type::text = 'CONTRACTOR'
      AND NOT public.admin_account_is_excluded(p.id, v_include)
      AND (
        v_status IS NULL
        OR cp.approval_status::text = v_status
        OR p.account_status::text = v_status
        OR p.signup_fee_status::text = v_status
      )
      AND (
        v_raw IS NULL
        OR cp.id = v_uuid
        OR p.id = v_uuid
        OR cp.business_name ILIKE v_like ESCAPE '\'
        OR p.email ILIKE v_like ESCAPE '\'
      )
  )
  SELECT
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'contractor_profile_id', page.contractor_profile_id,
          'profile_id', page.profile_id,
          'business_name', page.business_name,
          'trades', page.trades,
          'area', page.area,
          'approval_status', page.approval_status,
          'account_status', page.account_status,
          'signup_fee_status', page.signup_fee_status,
          'rating', page.rating,
          'review_count', page.review_count,
          'job_count', page.job_count,
          'estimate_count', page.estimate_count,
          'flag', page.flag
        )
        ORDER BY page.created_at DESC, page.contractor_profile_id
      )
      FROM (
        SELECT * FROM filtered
        ORDER BY created_at DESC, contractor_profile_id
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

COMMENT ON FUNCTION public.admin_list_contractors(text, text, boolean, integer, integer) IS
  'Admin-only contractor list. Business name is visible to admins. Trades, area, approval, activation, rating, and counts. Test flags stay hidden unless p_include_test. Read-only.';

REVOKE ALL ON FUNCTION public.admin_list_contractors(text, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_contractors(text, text, boolean, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_contractor(
  p_contractor_profile_id uuid,
  p_include_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_include boolean := coalesce(p_include_test, false);
  v_row jsonb;
BEGIN
  PERFORM public.admin_require();

  IF p_contractor_profile_id IS NULL THEN
    RAISE EXCEPTION 'contractor not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'contractor_profile_id', cp.id,
    'profile_id', cp.profile_id,
    'business_name', coalesce(nullif(btrim(cp.business_name), ''), 'Contractor'),
    'email', p.email,
    'trades', coalesce((
      SELECT jsonb_agg(trade ORDER BY trade)
      FROM (
        SELECT DISTINCT sc.name AS trade
        FROM public.contractor_services cs
        JOIN public.service_categories sc ON sc.id = cs.category_id
        WHERE cs.contractor_profile_id = cp.id
        UNION
        SELECT btrim(cp.primary_trade) AS trade
        WHERE nullif(btrim(coalesce(cp.primary_trade, '')), '') IS NOT NULL
      ) names
    ), '[]'::jsonb),
    'area', nullif(btrim(concat_ws(', ',
      nullif(btrim(coalesce(cp.service_area, '')), ''),
      (
        SELECT string_agg(piece, ', ' ORDER BY piece)
        FROM (
          SELECT DISTINCT nullif(btrim(concat_ws(' ', nullif(btrim(a.label), ''), nullif(btrim(a.center_zip), ''))), '') AS piece
          FROM public.contractor_service_areas a
          WHERE a.contractor_profile_id = cp.id
        ) pieces
        WHERE piece IS NOT NULL
      )
    )), ''),
    'approval_status', cp.approval_status::text,
    'account_status', p.account_status::text,
    'signup_fee_status', p.signup_fee_status::text,
    'rating', (
      SELECT round(avg(br.rating)::numeric, 1)
      FROM public.booking_reviews br
      WHERE br.contractor_profile_id = cp.id
    ),
    'review_count', (SELECT count(*) FROM public.booking_reviews br WHERE br.contractor_profile_id = cp.id),
    'flag', f.flag,
    'flag_note', f.note,
    'jobs', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'booking_id', b.id,
          'project_id', b.project_id,
          'reference_number', b.reference_number,
          'title', b.title,
          'status', b.status::text,
          'created_at', b.created_at
        )
        ORDER BY b.created_at DESC
      )
      FROM (
        SELECT b.*, pr.reference_number, pr.title
        FROM public.bookings b
        JOIN public.projects pr ON pr.id = b.project_id
        WHERE b.contractor_profile_id = cp.id
        ORDER BY b.created_at DESC
        LIMIT 100
      ) b
    ), '[]'::jsonb),
    'estimates', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'estimate_id', e.id,
          'project_id', e.project_id,
          'reference_number', e.reference_number,
          'title', e.title,
          'status', e.status::text,
          'total_cents', e.total_cents,
          'submitted_at', e.submitted_at
        )
        ORDER BY e.created_at DESC
      )
      FROM (
        SELECT e.*, pr.reference_number, pr.title
        FROM public.estimates e
        JOIN public.projects pr ON pr.id = e.project_id
        WHERE e.contractor_profile_id = cp.id
        ORDER BY e.created_at DESC
        LIMIT 100
      ) e
    ), '[]'::jsonb),
    'payments', coalesce((
      SELECT jsonb_agg(item ORDER BY created_at DESC)
      FROM (
        SELECT
          jsonb_build_object(
            'payment_id', c.id,
            'kind', 'activation',
            'amount_cents', c.amount_cents,
            'status', c.status,
            'livemode', c.livemode,
            'created_at', c.created_at,
            'fulfilled_at', c.fulfilled_at,
            'needs_refund', c.needs_refund,
            'refund_reason', c.refund_reason,
            'reference_number', NULL
          ) AS item,
          c.created_at
        FROM public.signup_fee_charges c
        WHERE c.profile_id = cp.profile_id
        UNION ALL
        SELECT
          jsonb_build_object(
            'payment_id', s.id,
            'kind', 'connect',
            'amount_cents', s.amount_cents,
            'status', s.status,
            'livemode', s.livemode,
            'created_at', s.created_at,
            'fulfilled_at', s.fulfilled_at,
            'needs_refund', s.needs_refund,
            'refund_reason', s.refund_reason,
            'reference_number', pr.reference_number
          ),
          s.created_at
        FROM public.connection_checkout_sessions s
        JOIN public.projects pr ON pr.id = s.project_id
        WHERE s.contractor_profile_id = cp.id
      ) payments
    ), '[]'::jsonb)
  )
  INTO v_row
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  LEFT JOIN public.admin_account_flags f ON f.profile_id = p.id
  WHERE cp.id = p_contractor_profile_id
    AND p.account_type::text = 'CONTRACTOR'
    AND NOT public.admin_account_is_excluded(p.id, v_include);

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'contractor not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$fn$;

COMMENT ON FUNCTION public.admin_get_contractor(uuid, boolean) IS
  'Admin-only contractor detail. Business name, trades, area, approval, activation, rating, jobs, estimates, and fee payments. Read-only.';

REVOKE ALL ON FUNCTION public.admin_get_contractor(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_contractor(uuid, boolean) TO authenticated;
