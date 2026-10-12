-- Roll back 20261019000001 after 20261019000002 has been rolled back.
-- Drops the step-up helpers. Does not change admin_mfa_required.

DROP FUNCTION IF EXISTS public.assert_admin_sensitive_step_up();
DROP FUNCTION IF EXISTS public.admin_sensitive_step_up_ok();
DROP FUNCTION IF EXISTS public.admin_sensitive_step_up_max_age();
