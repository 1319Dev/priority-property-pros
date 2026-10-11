-- Rolls back the read-only homeowners directory. Does not touch payment rows.

DROP FUNCTION IF EXISTS public.admin_get_homeowner(uuid, boolean);
DROP FUNCTION IF EXISTS public.admin_list_homeowners(text, text, boolean, integer, integer);
