-- Phase 3 marketplace enums, fee settings, and pure helpers.
-- Non-destructive. Does not touch auth.users or existing profiles.

CREATE TYPE public.project_status AS ENUM (
  'DRAFT',
  'POSTED',
  'MATCHING',
  'CONTRACTORS_RESPONDING',
  'ESTIMATES_AVAILABLE',
  'CONTRACTOR_SELECTED'
);

CREATE TYPE public.project_completeness AS ENUM (
  'HIGH',
  'MEDIUM',
  'MORE_INFO_NEEDED'
);

CREATE TYPE public.timing_preference AS ENUM (
  'ASAP',
  'WITHIN_A_WEEK',
  'WITHIN_A_MONTH',
  'SPECIFIC_DATE',
  'FLEXIBLE'
);

CREATE TYPE public.opportunity_status AS ENUM (
  'AVAILABLE',
  'ACCEPTED',
  'PASSED',
  'EXPIRED',
  'CLOSED'
);

CREATE TYPE public.estimate_status AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'REVISED',
  'WITHDRAWN',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED'
);

CREATE TYPE public.credential_status AS ENUM (
  'NOT_SUBMITTED',
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'EXPIRED'
);

CREATE TYPE public.service_area_mode AS ENUM (
  'ZIPS',
  'RADIUS',
  'ZIPS_AND_RADIUS'
);

CREATE TYPE public.question_kind AS ENUM (
  'TEXT',
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'BOOLEAN',
  'NUMBER'
);

CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value_int integer,
  value_text text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER platform_settings_set_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.platform_settings IS
  'Configurable marketplace settings. contractor_fee_bps (~700 = 7%) is preview-only in Phase 3 — no live charges.';

INSERT INTO public.platform_settings (key, value_int, description)
VALUES
  (
    'contractor_fee_bps',
    700,
    'Contractor platform fee in basis points. 700 = 7.00%. Preview only; Phase 3 does not charge.'
  ),
  (
    'max_participating_contractors',
    3,
    'Hard cap of contractors who may ACCEPT an opportunity on one project. Enforced atomically.'
  ),
  (
    'opportunity_ttl_hours',
    168,
    'Hours an AVAILABLE opportunity remains open before it may expire.'
  );

CREATE OR REPLACE FUNCTION public.normalize_zip(z text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(substr(regexp_replace(coalesce(z, ''), '[^0-9]', '', 'g'), 1, 5), '');
$$;

CREATE OR REPLACE FUNCTION public.haversine_miles(
  lat1 numeric,
  lng1 numeric,
  lat2 numeric,
  lng2 numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE round(
      (
        3958.8 * 2 * asin(sqrt(
          power(sin(radians(lat2 - lat1) / 2), 2) +
          cos(radians(lat1)) * cos(radians(lat2)) *
          power(sin(radians(lng2 - lng1) / 2), 2)
        ))
      )::numeric,
      2
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.fee_cents_from_total(p_total_cents integer, p_fee_bps integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_total_cents IS NULL OR p_total_cents < 0 THEN 0
    ELSE round((p_total_cents::numeric * coalesce(p_fee_bps, 700)) / 10000.0)::integer
  END;
$$;

CREATE OR REPLACE FUNCTION public.current_fee_bps()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'contractor_fee_bps'),
    700
  );
$$;

REVOKE ALL ON FUNCTION public.current_fee_bps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_fee_bps() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.fee_preview(p_total_cents integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_cents', coalesce(p_total_cents, 0),
    'fee_bps', public.current_fee_bps(),
    'fee_cents', public.fee_cents_from_total(coalesce(p_total_cents, 0), public.current_fee_bps()),
    'contractor_earnings_cents',
      coalesce(p_total_cents, 0)
      - public.fee_cents_from_total(coalesce(p_total_cents, 0), public.current_fee_bps()),
    'charges_live', false
  );
$$;

REVOKE ALL ON FUNCTION public.fee_preview(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fee_preview(integer) TO authenticated, anon;
