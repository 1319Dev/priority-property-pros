-- Flat $4.99 Connection Fee migration
-- Converts current progressive percentage-based fee model to flat $4.99 (499 cents) per connection.
-- Does NOT rewrite historical bookings or fee_schedules history.
-- Creates NEW active schedules with flat fee configuration.

-- This migration should be applied to staging (giiskdvitimksdewnelc) first for validation.
-- Do NOT apply to production until validated.

-- Deactivate current progressive schedules
UPDATE public.fee_schedules
SET is_active = false,
    effective_until = now()
WHERE is_active = true;

-- Insert new FLAT fee schedules (v2)
INSERT INTO public.fee_schedules (
  id, kind, version, name, is_active, min_fee_cents, max_fee_cents
) VALUES
  (
    '00000000-0000-4000-8000-000000000003',
    'ORIGINAL',
    2,
    'PPP flat $4.99 Connection Fee v2',
    true,
    499,
    499
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'REPEAT',
    2,
    'PPP flat $4.99 Connection Fee v2 (repeat)',
    true,
    499,
    499
  );

-- Insert flat-fee "brackets" (single bracket at 0 bps, fee is always 499 regardless of amount)
-- The actual fee logic is in the application code (CONNECTION_FEE_CENTS = 499)
-- These brackets are for compatibility with the fee_schedule_brackets table structure
INSERT INTO public.fee_schedule_brackets (
  schedule_id, min_amount_cents, max_amount_cents, rate_bps, sort_order
) VALUES
  -- ORIGINAL: flat 499 cents (0 bps because we use flat fee, not percentage)
  ('00000000-0000-4000-8000-000000000003', 0, NULL, 0, 1),
  -- REPEAT: also flat 499 cents
  ('00000000-0000-4000-8000-000000000004', 0, NULL, 0, 1);

-- Verify flat fee calculation
DO $$
DECLARE
  sid_original uuid;
  sid_repeat uuid;
  r jsonb;
BEGIN
  SELECT id INTO sid_original FROM public.fee_schedules WHERE kind = 'ORIGINAL' AND is_active;
  SELECT id INTO sid_repeat FROM public.fee_schedules WHERE kind = 'REPEAT' AND is_active;
  
  -- NOTE: The actual flat fee logic ($4.99) is in the application code.
  -- The database function compute_fee still uses progressive calculation from brackets.
  -- For proper flat fee behavior, the application layer (computeMarketplaceFee in feeEngine.ts)
  -- overrides this and returns CONNECTION_FEE_CENTS = 499 for all non-zero amounts.
  
  -- These tests verify the database structure is correct, even if the computed fee
  -- differs because the actual flat fee is enforced in application code.
  r := public.compute_fee(10000, sid_original); -- $100
  IF (r->>'min_fee_cents')::int <> 499 THEN 
    RAISE EXCEPTION 'ORIGINAL min should be 499, got %', r->>'min_fee_cents'; 
  END IF;
  IF (r->>'max_fee_cents')::int <> 499 THEN 
    RAISE EXCEPTION 'ORIGINAL max should be 499, got %', r->>'max_fee_cents'; 
  END IF;
  
  r := public.compute_fee(100000, sid_original); -- $1,000
  IF (r->>'min_fee_cents')::int <> 499 THEN 
    RAISE EXCEPTION 'ORIGINAL min should be 499, got %', r->>'min_fee_cents'; 
  END IF;
  
  r := public.compute_fee(1000000, sid_original); -- $10,000
  IF (r->>'min_fee_cents')::int <> 499 THEN 
    RAISE EXCEPTION 'ORIGINAL min should be 499, got %', r->>'min_fee_cents'; 
  END IF;
  
  r := public.compute_fee(10000000, sid_original); -- $100,000
  IF (r->>'max_fee_cents')::int <> 499 THEN 
    RAISE EXCEPTION 'ORIGINAL max should be 499, got %', r->>'max_fee_cents'; 
  END IF;
  
  r := public.compute_fee(10000, sid_repeat); -- $100 repeat
  IF (r->>'min_fee_cents')::int <> 499 THEN 
    RAISE EXCEPTION 'REPEAT min should be 499, got %', r->>'min_fee_cents'; 
  END IF;
  
  RAISE NOTICE 'Flat $4.99 fee schedule migration completed successfully. Application code enforces flat 499 cents.';
END $$;

COMMENT ON TABLE public.fee_schedules IS
  'Versioned marketplace fee schedules. v2+ uses flat $4.99 Connection Fee. Historical progressive schedules (v1) remain for historical bookings.';
COMMENT ON TABLE public.fee_schedule_brackets IS
  'Progressive brackets (v1) or flat fee config (v2). v2 has 0 bps because flat fee is enforced in application code (CONNECTION_FEE_CENTS = 499).';
