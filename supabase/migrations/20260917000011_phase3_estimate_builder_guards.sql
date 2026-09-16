-- Additive Phase 3 polish: estimate line kinds, duration/availability,
-- and client cannot set ACCEPTED / money columns except through RPCs.
-- Non-destructive. Does not touch auth.users or profiles.

CREATE TYPE public.estimate_item_kind AS ENUM (
  'LABOR',
  'MATERIALS',
  'EQUIPMENT',
  'CUSTOM'
);

ALTER TABLE public.estimate_items
  ADD COLUMN IF NOT EXISTS kind public.estimate_item_kind NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN IF NOT EXISTS unit_label text NOT NULL DEFAULT 'each';

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS duration_hours numeric(8, 2),
  ADD COLUMN IF NOT EXISTS available_from date;

COMMENT ON COLUMN public.estimates.duration_hours IS
  'Contractor-stated job duration in hours. Informational; not a booking.';
COMMENT ON COLUMN public.estimates.available_from IS
  'Earliest date the contractor says they can start. Not a calendar booking.';
COMMENT ON COLUMN public.estimates.valid_until IS
  'Estimate expiration date. Preview only; no auto-charge.';

CREATE OR REPLACE FUNCTION public.recompute_estimate_totals(p_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal integer;
  v_bps integer;
  v_fee integer;
BEGIN
  IF coalesce(current_setting('ppp.rpc', true), '') = '' THEN
    PERFORM public.ppp_set_rpc('recompute_estimate_totals');
  END IF;

  SELECT coalesce(sum(line_total_cents), 0)
  INTO v_subtotal
  FROM public.estimate_items
  WHERE estimate_id = p_estimate_id;

  v_bps := public.current_fee_bps();
  v_fee := public.fee_cents_from_total(v_subtotal, v_bps);

  UPDATE public.estimates
  SET
    subtotal_cents = v_subtotal,
    total_cents = v_subtotal,
    fee_bps = v_bps,
    fee_cents = v_fee,
    contractor_earnings_cents = v_subtotal - v_fee
  WHERE id = p_estimate_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_estimate_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
     OR NEW.contractor_profile_id IS DISTINCT FROM OLD.contractor_profile_id THEN
    RAISE EXCEPTION 'estimate ownership cannot change';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      public.ppp_rpc_is('submit_estimate')
      OR public.ppp_rpc_is('withdraw_estimate')
      OR public.ppp_rpc_is('select_estimate')
    ) THEN
      RAISE EXCEPTION 'estimate status can only change through submit, withdraw, or select';
    END IF;
  END IF;

  IF (
    NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
    OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
    OR NEW.fee_cents IS DISTINCT FROM OLD.fee_cents
    OR NEW.fee_bps IS DISTINCT FROM OLD.fee_bps
    OR NEW.contractor_earnings_cents IS DISTINCT FROM OLD.contractor_earnings_cents
  ) AND NOT (
    public.ppp_rpc_is('recompute_estimate_totals')
    OR public.ppp_rpc_is('submit_estimate')
  ) THEN
    RAISE EXCEPTION 'estimate money columns are computed in the database';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_protect_row ON public.estimates;
CREATE TRIGGER estimates_protect_row
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_estimate_row();

REVOKE ALL ON FUNCTION public.protect_estimate_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_estimate_totals(uuid) FROM PUBLIC, anon, authenticated;
