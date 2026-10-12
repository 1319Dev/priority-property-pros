-- Rollback for 20261020400001_refund_helper_hardening.sql.
-- Restores the grants and settings that 20261020200001 left in place.

ALTER FUNCTION public.connection_fee_refund_status_from_stripe(text) RESET search_path;

GRANT EXECUTE ON FUNCTION public.protect_connection_fee_refund_row() TO PUBLIC, anon, authenticated;
