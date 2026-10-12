-- Fixes the two Supabase advisor warnings raised by 20261020200001 (#136).
-- 1. function_search_path_mutable: pin search_path on the IMMUTABLE status helper.
-- 2. anon_security_definer_function_executable: the refund-row trigger function is
--    SECURITY DEFINER and was executable by PUBLIC/anon/authenticated. Trigger
--    functions are fired by the table trigger regardless of EXECUTE grants, so the
--    connection_fee_refunds trigger keeps working. No behavior, fee, or Stripe change.

ALTER FUNCTION public.connection_fee_refund_status_from_stripe(text) SET search_path = public;

REVOKE ALL ON FUNCTION public.protect_connection_fee_refund_row() FROM PUBLIC, anon, authenticated;
