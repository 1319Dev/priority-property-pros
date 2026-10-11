-- Rolls back the read-only contractors directory. Does not touch payment rows or approval status.

DROP FUNCTION IF EXISTS public.admin_get_contractor(uuid, boolean);
DROP FUNCTION IF EXISTS public.admin_list_contractors(text, text, boolean, integer, integer);
