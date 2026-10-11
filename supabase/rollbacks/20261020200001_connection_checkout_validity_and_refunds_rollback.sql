-- Rollback for 20261020200001_connection_checkout_validity_and_refunds.sql
--
-- Order: redeploy the previous edge functions FIRST (create-connection-checkout, connection-fee-webhook,
-- reconcile-connection-checkout from the commit before this PR), then run this file.
-- The new functions call these RPCs; removing the RPCs first would make the new functions error.
--
-- Data: connection_fee_refunds holds the Stripe refund ids. Back it up before dropping:
--   CREATE TABLE IF NOT EXISTS private.connection_fee_refunds_backup AS TABLE public.connection_fee_refunds;
-- (or export it as CSV from the Table Editor). Refunds already issued in Stripe are NOT undone by this file.
-- connection_checkout_sessions / project_connections needs_refund flags written by these functions are kept.

BEGIN;

DROP FUNCTION IF EXISTS public.connection_fee_refund_reconcile_report();
DROP FUNCTION IF EXISTS public.connection_fee_refund_reconcile_rows();
DROP FUNCTION IF EXISTS public.record_connection_fee_refund_verification(text, text, integer, text, text);
DROP FUNCTION IF EXISTS public.record_connection_fee_refund_result(uuid, text, text, integer, text);
DROP FUNCTION IF EXISTS public.connection_fee_refund_status_from_stripe(text);
DROP FUNCTION IF EXISTS public.prepare_connection_fee_refund(text, text, integer, text, boolean, text, boolean);
DROP FUNCTION IF EXISTS public.alert_admins_connection_fee_refund(uuid, text, text);
DROP FUNCTION IF EXISTS public.connection_checkout_session_validity(text);
DROP FUNCTION IF EXISTS public.assert_connection_checkout_allowed(uuid, uuid);
DROP FUNCTION IF EXISTS public.connection_checkout_blocker(uuid, uuid);

DROP TRIGGER IF EXISTS connection_fee_refunds_protect_row ON public.connection_fee_refunds;
DROP FUNCTION IF EXISTS public.protect_connection_fee_refund_row();
DROP TABLE IF EXISTS public.connection_fee_refunds;

COMMIT;
