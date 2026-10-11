-- Rolls back the read-only projects directory. Does not change project rows.

DROP FUNCTION IF EXISTS public.admin_get_project(uuid);
DROP FUNCTION IF EXISTS public.admin_list_projects(text, text, text, text, text, text, date, date, boolean, boolean, integer, integer);
