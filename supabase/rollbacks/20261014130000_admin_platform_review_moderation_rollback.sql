-- Removes the reason-required platform review RPC. Leaves the table, trigger, and UPDATE grant in place.

DROP FUNCTION IF EXISTS public.admin_set_platform_review_status(uuid, text, text);
