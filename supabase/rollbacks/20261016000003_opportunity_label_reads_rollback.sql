-- Rolls back the display-only opportunity label read.
-- Does not change opportunities, projects, payments, or contact access.

DROP FUNCTION IF EXISTS public.list_my_opportunity_labels();
