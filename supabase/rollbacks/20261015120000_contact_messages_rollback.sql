-- Removes the public contact form tables and admin RPCs.
-- Does not change admin_dashboard_* functions.

DROP FUNCTION IF EXISTS public.admin_mark_contact_message_handled(uuid);
DROP FUNCTION IF EXISTS public.admin_unhandled_contact_message_count();
DROP FUNCTION IF EXISTS public.consume_contact_rate_bucket(text, integer, integer);
DROP TABLE IF EXISTS public.contact_rate_buckets;
DROP TABLE IF EXISTS public.contact_messages;
