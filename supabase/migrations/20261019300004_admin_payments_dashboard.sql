-- Read-only admin payments list and net revenue.
-- Activation rows and Connect rows. No writes, no processor ids.
-- Version 20261019300004.

CREATE OR REPLACE FUNCTION public.admin_list_payments(
  p_query text DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_failed boolean DEFAULT NULL,
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
  v_id uuid := NULL;
  v_kind text := nullif(lower(btrim(coalesce(p_kind, ''))), '');
  v_status text := CASE
    WHEN coalesce(p_failed, false) THEN 'FAILED'
    ELSE nullif(upper(btrim(coalesce(p_status, ''))), '')
  END;
  v_rows jsonb;
  v_total bigint;
BEGIN
  PERFORM public.admin_require();

  IF v_kind IS NOT NULL AND v_kind NOT IN ('activation', 'connect') THEN
    v_kind := 'none';
  END IF;

  IF v_raw IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_raw, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    IF v_raw ~* '^ppp-?[0-9]+$' OR v_raw ~ '^[0-9]+$' THEN
      v_ref := regexp_replace(v_raw, '[^0-9]', '', 'g')::bigint;
    END IF;
    BEGIN
      v_id := v_raw::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_id := NULL;
    END;
  END IF;

  WITH payments AS (
    SELECT
      c.id AS payment_id,
      'activation'::text AS kind,
      c.amount_cents,
      c.status,
      c.livemode,
      c.created_at,
      c.fulfilled_at,
      c.needs_refund,
      c.refund_reason,
      0 AS refunded_cents,
      c.profile_id,
      coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Account') AS party_name,
      p.email,
      NULL::text AS business_name,
      NULL::bigint AS reference_number
    FROM public.signup_fee_charges c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE NOT public.admin_account_is_excluded(c.profile_id, v_include)
    UNION ALL
    SELECT
      s.id,
      'connect'::text,
      s.amount_cents,
      s.status,
      s.livemode,
      s.created_at,
      s.fulfilled_at,
      s.needs_refund,
      s.refund_reason,
      0,
      cust.id,
      coalesce(nullif(btrim(concat_ws(' ', cust.first_name, cust.last_name)), ''), 'Homeowner'),
      cust.email,
      cp.business_name,
      pr.reference_number
    FROM public.connection_checkout_sessions s
    JOIN public.projects pr ON pr.id = s.project_id
    JOIN public.profiles cust ON cust.id = pr.customer_id
    JOIN public.contractor_profiles cp ON cp.id = s.contractor_profile_id
    WHERE NOT public.admin_account_is_excluded(cust.id, v_include)
      AND NOT public.admin_account_is_excluded(cp.profile_id, v_include)
  ),
  filtered AS (
    SELECT *
    FROM payments
    WHERE (v_kind IS NULL OR kind = v_kind)
      AND (v_status IS NULL OR status = v_status)
      AND (
        v_raw IS NULL
        OR party_name ILIKE v_like ESCAPE '\'
        OR email ILIKE v_like ESCAPE '\'
        OR coalesce(business_name, '') ILIKE v_like ESCAPE '\'
        OR (v_id IS NOT NULL AND (payment_id = v_id OR profile_id = v_id))
        OR (v_ref IS NOT NULL AND reference_number = v_ref)
      )
  )
  SELECT
    (SELECT count(*) FROM filtered),
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'payment_id', page.payment_id,
          'kind', page.kind,
          'amount_cents', page.amount_cents,
          'status', page.status,
          'livemode', page.livemode,
          'created_at', page.created_at,
          'fulfilled_at', page.fulfilled_at,
          'needs_refund', page.needs_refund,
          'refund_reason', page.refund_reason,
          'refunded_cents', page.refunded_cents,
          'profile_id', page.profile_id,
          'party_name', page.party_name,
          'email', page.email,
          'business_name', page.business_name,
          'reference_number', page.reference_number
        )
        ORDER BY page.created_at DESC
      )
      FROM (
        SELECT *
        FROM filtered
        ORDER BY created_at DESC
        LIMIT v_limit OFFSET v_offset
      ) page
    ), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$fn$;

COMMENT ON FUNCTION public.admin_list_payments(text, text, text, boolean, boolean, integer, integer) IS
  'Admin-only payment list. Activation and Connect rows with an allowlist. Refunded cents stay 0 because completed refund amounts are not stored. Processor ids are not selected. Read-only.';

REVOKE ALL ON FUNCTION public.admin_list_payments(text, text, text, boolean, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payments(text, text, text, boolean, boolean, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_payments_summary(p_include_test boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_include boolean := coalesce(p_include_test, false);
  v_gross bigint := 0;
  v_failed bigint := 0;
  v_flagged bigint := 0;
BEGIN
  PERFORM public.admin_require();

  WITH fee_rows AS (
    SELECT c.amount_cents, c.status, c.livemode, c.needs_refund
    FROM public.signup_fee_charges c
    WHERE NOT public.admin_account_is_excluded(c.profile_id, v_include)
    UNION ALL
    SELECT s.amount_cents, s.status, s.livemode, s.needs_refund
    FROM public.connection_checkout_sessions s
    JOIN public.projects pr ON pr.id = s.project_id
    JOIN public.contractor_profiles cp ON cp.id = s.contractor_profile_id
    WHERE NOT public.admin_account_is_excluded(pr.customer_id, v_include)
      AND NOT public.admin_account_is_excluded(cp.profile_id, v_include)
  )
  SELECT
    coalesce(sum(amount_cents) FILTER (
      WHERE livemode IS TRUE AND status IN ('PAID', 'CONSUMED')
    ), 0),
    count(*) FILTER (WHERE livemode IS TRUE AND status = 'FAILED'),
    count(*) FILTER (WHERE livemode IS TRUE AND needs_refund IS TRUE)
  INTO v_gross, v_failed, v_flagged
  FROM fee_rows;

  RETURN jsonb_build_object(
    'gross_cents', v_gross,
    'refunded_cents', 0,
    'net_cents', v_gross,
    'failed_count', v_failed,
    'needs_refund_count', v_flagged,
    'definition', 'Net revenue is livemode activation and Connect payments in PAID or CONSUMED, minus completed refund amounts. Completed refund amounts are not stored, so refunded_cents is 0 and net equals that gross. A needs_refund flag is not a completed refund and is not subtracted. Processor fees are not stored. Test-mode rows stay out of this total.'
  );
END;
$fn$;

COMMENT ON FUNCTION public.admin_payments_summary(boolean) IS
  'Admin-only net revenue. Succeeded livemode activation and Connect cents, minus stored refund amounts (currently zero). Read-only.';

REVOKE ALL ON FUNCTION public.admin_payments_summary(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payments_summary(boolean) TO authenticated;
