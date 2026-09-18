-- Phase 4A: versioned progressive fee engine.
-- Additive. Does not rewrite estimate.fee_bps / fee_cents history.

CREATE TYPE public.fee_schedule_kind AS ENUM ('ORIGINAL', 'REPEAT');

CREATE TABLE public.fee_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.fee_schedule_kind NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  min_fee_cents integer NOT NULL,
  max_fee_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fee_schedules_version_positive CHECK (version >= 1),
  CONSTRAINT fee_schedules_min_max CHECK (min_fee_cents >= 0 AND max_fee_cents >= min_fee_cents),
  UNIQUE (kind, version)
);

CREATE UNIQUE INDEX fee_schedules_one_active_per_kind
  ON public.fee_schedules (kind)
  WHERE is_active;

CREATE TABLE public.fee_schedule_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.fee_schedules (id) ON DELETE CASCADE,
  min_amount_cents integer NOT NULL,
  max_amount_cents integer,
  rate_bps integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT fee_schedule_brackets_min_nonneg CHECK (min_amount_cents >= 0),
  CONSTRAINT fee_schedule_brackets_max_gt_min CHECK (
    max_amount_cents IS NULL OR max_amount_cents > min_amount_cents
  ),
  CONSTRAINT fee_schedule_brackets_rate_nonneg CHECK (rate_bps >= 0)
);

CREATE INDEX fee_schedule_brackets_schedule_idx
  ON public.fee_schedule_brackets (schedule_id, sort_order);

COMMENT ON TABLE public.fee_schedules IS
  'Versioned marketplace fee schedules. Historical bookings snapshot a version and never recalculate.';
COMMENT ON TABLE public.fee_schedule_brackets IS
  'Progressive brackets. Amount in [min_amount_cents, max_amount_cents) is charged at rate_bps. max NULL = infinity.';

INSERT INTO public.platform_settings (key, value_int, description)
VALUES
  (
    'relationship_protection_months',
    12,
    'Months a customer↔contractor relationship stays protected after introduce/renew. Server-configurable; never hardcode in the frontend.'
  ),
  (
    'booking_pending_ttl_hours',
    168,
    'Hours a PENDING / AWAITING_PAYMENT booking may sit before it is treated as abandoned.'
  ),
  (
    'payments_live',
    0,
    '0 = payments are not live. Production UI must not fake paid/confirmed bookings.'
  ),
  (
    'charges_live',
    0,
    '0 = no live charges. Keep false through Phase 4A.'
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.fee_schedules (
  id, kind, version, name, is_active, min_fee_cents, max_fee_cents
) VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'ORIGINAL',
    1,
    'PPP original progressive v1',
    true,
    1500,
    99900
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'REPEAT',
    1,
    'PPP hire-again repeat v1',
    true,
    1000,
    50000
  );

INSERT INTO public.fee_schedule_brackets (
  schedule_id, min_amount_cents, max_amount_cents, rate_bps, sort_order
) VALUES
  ('00000000-0000-4000-8000-000000000001', 0, 50000, 800, 1),
  ('00000000-0000-4000-8000-000000000001', 50000, 250000, 700, 2),
  ('00000000-0000-4000-8000-000000000001', 250000, 1000000, 500, 3),
  ('00000000-0000-4000-8000-000000000001', 1000000, 2500000, 350, 4),
  ('00000000-0000-4000-8000-000000000001', 2500000, NULL, 250, 5),
  ('00000000-0000-4000-8000-000000000002', 0, NULL, 200, 1);

CREATE OR REPLACE FUNCTION public.payments_live()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'payments_live'), 0) <> 0;
$$;

CREATE OR REPLACE FUNCTION public.charges_live()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT value_int FROM public.platform_settings WHERE key = 'charges_live'), 0) <> 0;
$$;

CREATE OR REPLACE FUNCTION public.relationship_protection_months()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'relationship_protection_months'),
    12
  );
$$;

CREATE OR REPLACE FUNCTION public.current_fee_schedule_id(p_kind public.fee_schedule_kind)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.fee_schedules
  WHERE kind = p_kind
    AND is_active
  ORDER BY version DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.progressive_fee_cents_from_brackets(
  p_amount_cents integer,
  p_brackets jsonb
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  br jsonb;
  v_slice integer;
  v_raw integer := 0;
  v_min integer;
  v_max integer;
  v_rate integer;
  v_amount integer := greatest(coalesce(p_amount_cents, 0), 0);
BEGIN
  IF p_brackets IS NULL OR jsonb_typeof(p_brackets) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR br IN SELECT value FROM jsonb_array_elements(p_brackets)
  LOOP
    v_min := coalesce((br->>'min_amount_cents')::integer, 0);
    v_max := (br->>'max_amount_cents')::integer;
    v_rate := coalesce((br->>'rate_bps')::integer, 0);
    v_slice := greatest(0, least(v_amount, coalesce(v_max, v_amount)) - v_min);
    IF v_slice > 0 THEN
      v_raw := v_raw + round((v_slice::numeric * v_rate) / 10000.0)::integer;
    END IF;
  END LOOP;

  RETURN v_raw;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_fee_bounds(
  p_raw_fee_cents integer,
  p_min_fee_cents integer,
  p_max_fee_cents integer,
  p_amount_cents integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(p_amount_cents, 0) <= 0 THEN 0
    ELSE least(
      coalesce(p_max_fee_cents, coalesce(p_raw_fee_cents, 0)),
      greatest(coalesce(p_min_fee_cents, 0), coalesce(p_raw_fee_cents, 0))
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.compute_fee(p_amount_cents integer, p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sched public.fee_schedules;
  br record;
  v_amount integer := greatest(coalesce(p_amount_cents, 0), 0);
  v_slice integer;
  v_part integer;
  v_raw integer := 0;
  v_fee integer;
  v_used jsonb := '[]'::jsonb;
  v_brackets jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO sched FROM public.fee_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fee schedule not found';
  END IF;

  FOR br IN
    SELECT *
    FROM public.fee_schedule_brackets
    WHERE schedule_id = p_schedule_id
    ORDER BY sort_order, min_amount_cents
  LOOP
    v_brackets := v_brackets || jsonb_build_object(
      'min_amount_cents', br.min_amount_cents,
      'max_amount_cents', br.max_amount_cents,
      'rate_bps', br.rate_bps
    );
    v_slice := greatest(0, least(v_amount, coalesce(br.max_amount_cents, v_amount)) - br.min_amount_cents);
    IF v_slice > 0 THEN
      v_part := round((v_slice::numeric * br.rate_bps) / 10000.0)::integer;
      v_raw := v_raw + v_part;
      v_used := v_used || jsonb_build_object(
        'min_amount_cents', br.min_amount_cents,
        'max_amount_cents', br.max_amount_cents,
        'rate_bps', br.rate_bps,
        'slice_cents', v_slice,
        'fee_cents', v_part
      );
    END IF;
  END LOOP;

  v_fee := public.apply_fee_bounds(v_raw, sched.min_fee_cents, sched.max_fee_cents, v_amount);

  RETURN jsonb_build_object(
    'amount_cents', v_amount,
    'raw_fee_cents', v_raw,
    'fee_cents', v_fee,
    'min_fee_cents', sched.min_fee_cents,
    'max_fee_cents', sched.max_fee_cents,
    'min_applied', v_amount > 0 AND v_raw < sched.min_fee_cents,
    'max_applied', v_amount > 0 AND v_raw > sched.max_fee_cents,
    'contractor_earnings_cents', greatest(0, v_amount - v_fee),
    'customer_amount_cents', v_amount,
    'schedule_id', sched.id,
    'kind', sched.kind,
    'version', sched.version,
    'brackets', v_used,
    'brackets_snapshot', v_brackets,
    'charges_live', false,
    'payments_live', false,
    'label', 'preview / estimate — payments not live'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_fee_from_snapshot(
  p_amount_cents integer,
  p_brackets jsonb,
  p_min_fee_cents integer,
  p_max_fee_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_amount integer := greatest(coalesce(p_amount_cents, 0), 0);
  v_raw integer;
  v_fee integer;
BEGIN
  v_raw := public.progressive_fee_cents_from_brackets(v_amount, p_brackets);
  v_fee := public.apply_fee_bounds(v_raw, p_min_fee_cents, p_max_fee_cents, v_amount);
  RETURN jsonb_build_object(
    'amount_cents', v_amount,
    'raw_fee_cents', v_raw,
    'fee_cents', v_fee,
    'min_fee_cents', p_min_fee_cents,
    'max_fee_cents', p_max_fee_cents,
    'min_applied', v_amount > 0 AND v_raw < p_min_fee_cents,
    'max_applied', v_amount > 0 AND v_raw > p_max_fee_cents,
    'contractor_earnings_cents', greatest(0, v_amount - v_fee),
    'customer_amount_cents', v_amount,
    'charges_live', false,
    'payments_live', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_marketplace_fee(
  p_amount_cents integer,
  p_kind text DEFAULT 'ORIGINAL'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind public.fee_schedule_kind;
  v_id uuid;
BEGIN
  BEGIN
    v_kind := p_kind::public.fee_schedule_kind;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'fee kind must be ORIGINAL or REPEAT';
  END;
  v_id := public.current_fee_schedule_id(v_kind);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no active % fee schedule', v_kind;
  END IF;
  RETURN public.compute_fee(p_amount_cents, v_id);
END;
$$;

-- Keep Phase 3 fee_preview (flat ~7% estimate history). Always no live charges.
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
    'charges_live', false,
    'payments_live', false
  );
$$;

DO $$
DECLARE
  sid uuid;
  r jsonb;
BEGIN
  SELECT id INTO sid FROM public.fee_schedules WHERE kind = 'ORIGINAL' AND is_active;
  r := public.compute_fee(25000, sid);
  IF (r->>'fee_cents')::int <> 2000 THEN RAISE EXCEPTION 'fee $250 expected 2000 got %', r->>'fee_cents'; END IF;
  r := public.compute_fee(50000, sid);
  IF (r->>'fee_cents')::int <> 4000 THEN RAISE EXCEPTION 'fee $500 expected 4000 got %', r->>'fee_cents'; END IF;
  r := public.compute_fee(100000, sid);
  IF (r->>'fee_cents')::int <> 7500 THEN RAISE EXCEPTION 'fee $1000 expected 7500 got %', r->>'fee_cents'; END IF;
  r := public.compute_fee(250000, sid);
  IF (r->>'fee_cents')::int <> 18000 THEN RAISE EXCEPTION 'fee $2500 expected 18000 got %', r->>'fee_cents'; END IF;
  r := public.compute_fee(500000, sid);
  IF (r->>'fee_cents')::int <> 30500 THEN RAISE EXCEPTION 'fee $5000 expected 30500 got %', r->>'fee_cents'; END IF;
  r := public.compute_fee(1000000, sid);
  IF (r->>'fee_cents')::int <> 55500 THEN RAISE EXCEPTION 'fee $10000 expected 55500 got %', r->>'fee_cents'; END IF;
  r := public.compute_fee(2500000, sid);
  IF (r->>'fee_cents')::int <> 108000 THEN RAISE EXCEPTION 'fee $25000 expected 108000 got %', r->>'fee_cents'; END IF;
  r := public.compute_fee(5000000, sid);
  IF (r->>'fee_cents')::int <> 99900 THEN RAISE EXCEPTION 'fee $50000 expected cap 99900 got %', r->>'fee_cents'; END IF;
  r := public.compute_fee(10000000, sid);
  IF (r->>'fee_cents')::int <> 99900 THEN RAISE EXCEPTION 'fee $100000 expected cap 99900 got %', r->>'fee_cents'; END IF;
  r := public.compute_fee(10000, sid);
  IF (r->>'fee_cents')::int <> 1500 THEN RAISE EXCEPTION 'fee $100 expected min 1500 got %', r->>'fee_cents'; END IF;

  SELECT id INTO sid FROM public.fee_schedules WHERE kind = 'REPEAT' AND is_active;
  r := public.compute_fee(25000, sid);
  IF (r->>'fee_cents')::int <> 1000 THEN RAISE EXCEPTION 'repeat $250 expected min 1000'; END IF;
  r := public.compute_fee(100000, sid);
  IF (r->>'fee_cents')::int <> 2000 THEN RAISE EXCEPTION 'repeat $1000 expected 2000'; END IF;
  r := public.compute_fee(2500000, sid);
  IF (r->>'fee_cents')::int <> 50000 THEN RAISE EXCEPTION 'repeat $25000 expected max 50000'; END IF;
  r := public.compute_fee(10000000, sid);
  IF (r->>'fee_cents')::int <> 50000 THEN RAISE EXCEPTION 'repeat $100000 expected max 50000'; END IF;
END $$;
