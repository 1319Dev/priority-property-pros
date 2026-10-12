-- Rollback for 20261019500001_stripe_price_ids_by_mode.sql.
-- Restores the previous IMMUTABLE helpers that always return the TEST catalog IDs.

CREATE OR REPLACE FUNCTION public.stripe_activation_price_id()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- Config compatibility only. Activation checkout is owned by parked PR #12.
  SELECT 'price_1UH1SePYJQAIQDv7nrMo32Xp';
$$;

CREATE OR REPLACE FUNCTION public.stripe_connection_price_id()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'price_1UH1RsPYJQAIQDv721IhjKS0';
$$;

COMMENT ON FUNCTION public.stripe_activation_price_id() IS NULL;
COMMENT ON FUNCTION public.stripe_connection_price_id() IS NULL;
