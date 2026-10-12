-- Read-only admin homeowners directory.
-- Does not change fees, payment rows, Stripe, matching, or account status.
-- Version 20261019300001. Checked against open PRs: highest elsewhere is 20261018000001.

CREATE OR REPLACE FUNCTION public.admin_list_homeowners(
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
      p.id,
      coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Homeowner') AS display_name,
      p.email,
      p.account_status::text AS account_status,
      p.signup_fee_status::text AS signup_fee_status,
      (
        SELECT count(*)
        FROM public.projects pr
        WHERE pr.customer_id = p.id
      ) AS project_count,
      f.flag,
      f.note AS flag_note,
      p.created_at
    FROM public.profiles p
    LEFT JOIN public.admin_account_flags f ON f.profile_id = p.id
    WHERE p.account_type::text = 'CUSTOMER'
      AND NOT public.admin_account_is_excluded(p.id, v_include)
      AND (
        (v_status IS NULL AND p.account_status::text <> 'DELETED')
        OR v_status = 'ALL'
        OR (v_status IS NOT NULL AND v_status <> 'ALL' AND p.account_status::text = v_status)
      )
      AND (
        v_raw IS NULL
        OR p.id = v_uuid
        OR p.email ILIKE v_like ESCAPE '\'
        OR p.first_name ILIKE v_like ESCAPE '\'
        OR p.last_name ILIKE v_like ESCAPE '\'
        OR concat_ws(' ', p.first_name, p.last_name) ILIKE v_like ESCAPE '\'
      )
  )
  SELECT
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'profile_id', page.id,
          'display_name', page.display_name,
          'email', page.email,
          'account_status', page.account_status,
          'signup_fee_status', page.signup_fee_status,
          'project_count', page.project_count,
          'flag', page.flag,
          'flag_note', page.flag_note,
          'created_at', page.created_at
        )
        ORDER BY page.created_at DESC, page.id
      )
      FROM (
        SELECT *
        FROM filtered
        ORDER BY created_at DESC, id
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

COMMENT ON FUNCTION public.admin_list_homeowners(text, text, boolean, integer, integer) IS
  'Admin-only homeowner list. SECURITY DEFINER, search_path public, gated by is_admin() through admin_require(). Columns are an allowlist: name, email, id, account status, signup-fee status, project count, flag. Contact numbers and house addresses are not selected. Test flags stay hidden unless p_include_test. Read-only.';

REVOKE ALL ON FUNCTION public.admin_list_homeowners(text, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_homeowners(text, text, boolean, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_homeowner(
  p_profile_id uuid,
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

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'homeowner not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'profile_id', p.id,
    'display_name', coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Homeowner'),
    'email', p.email,
    'account_status', p.account_status::text,
    'signup_fee_status', p.signup_fee_status::text,
    'flag', f.flag,
    'flag_note', f.note,
    'created_at', p.created_at,
    'projects', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'project_id', pr.id,
          'reference_number', pr.reference_number,
          'title', pr.title,
          'status', pr.status::text,
          'city', pr.city,
          'posted_at', pr.posted_at
        )
        ORDER BY pr.created_at DESC
      )
      FROM (
        SELECT *
        FROM public.projects pr
        WHERE pr.customer_id = p.id
        ORDER BY pr.created_at DESC
        LIMIT 100
      ) pr
    ), '[]'::jsonb),
    'payments', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'charge_id', c.id,
          'kind', 'activation',
          'amount_cents', c.amount_cents,
          'status', c.status,
          'livemode', c.livemode,
          'created_at', c.created_at,
          'fulfilled_at', c.fulfilled_at,
          'needs_refund', c.needs_refund,
          'refund_reason', c.refund_reason
        )
        ORDER BY c.created_at DESC
      )
      FROM (
        SELECT *
        FROM public.signup_fee_charges c
        WHERE c.profile_id = p.id
        ORDER BY c.created_at DESC
        LIMIT 100
      ) c
    ), '[]'::jsonb)
  )
  INTO v_row
  FROM public.profiles p
  LEFT JOIN public.admin_account_flags f ON f.profile_id = p.id
  WHERE p.id = p_profile_id
    AND p.account_type::text = 'CUSTOMER'
    AND NOT public.admin_account_is_excluded(p.id, v_include);

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'homeowner not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$fn$;

COMMENT ON FUNCTION public.admin_get_homeowner(uuid, boolean) IS
  'Admin-only homeowner detail. Projects return city and PPP number. Payments are activation rows: amount, status, dates, and the stored refund flag. Processor ids are not selected. Read-only.';

REVOKE ALL ON FUNCTION public.admin_get_homeowner(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_homeowner(uuid, boolean) TO authenticated;
