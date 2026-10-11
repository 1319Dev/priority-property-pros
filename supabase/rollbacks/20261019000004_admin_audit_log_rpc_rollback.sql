-- Drops the audit viewer RPC. Does not delete audit rows.
-- Does not drop forbid_audit_mutation or the immutability triggers.
-- Does not change payments, fees, Stripe, or platform_settings.

DROP FUNCTION IF EXISTS public.admin_list_audit_log(text, text, date, date, text, integer);
