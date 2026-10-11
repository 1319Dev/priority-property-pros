-- Rolls back the read-only payments dashboard. Does not touch payment rows.

DROP FUNCTION IF EXISTS public.admin_payments_summary(boolean);
DROP FUNCTION IF EXISTS public.admin_list_payments(text, text, text, boolean, boolean, integer, integer);
