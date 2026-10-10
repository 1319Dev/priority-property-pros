-- Rolls back 20261014120000_admin_dashboard_rpcs.sql only.
-- Does not drop contractor_profiles_approval_status_idx (that index predates this migration).
-- Does not touch fees, Stripe, profiles rows, or any other table.

DROP FUNCTION IF EXISTS public.admin_dashboard_trends(text, date, date, boolean);
DROP FUNCTION IF EXISTS public.admin_recent_activity(integer, text, boolean);
DROP FUNCTION IF EXISTS public.admin_needs_attention(boolean);
DROP FUNCTION IF EXISTS public.admin_dashboard_summary(boolean);
DROP FUNCTION IF EXISTS public.admin_set_account_flag(uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_require();
DROP FUNCTION IF EXISTS public.admin_account_is_excluded(uuid, boolean);

DROP TABLE IF EXISTS public.admin_account_flags;

DROP INDEX IF EXISTS public.profiles_account_type_created_idx;
DROP INDEX IF EXISTS public.bookings_status_completed_idx;
DROP INDEX IF EXISTS public.connection_checkout_sessions_status_fulfilled_idx;
DROP INDEX IF EXISTS public.signup_fee_charges_status_fulfilled_idx;
DROP INDEX IF EXISTS public.content_reports_created_idx;
