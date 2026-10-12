-- Rollback for 20261020300001_abuse_rate_limits_signup_guard.sql
--
-- 1. If the Before User Created hook was turned on, turn it OFF first:
--    Supabase Dashboard -> Authentication -> Hooks -> Before User Created -> disable.
--    Dropping the function while the hook points at it would break every signup.
-- 2. Redeploy the previous edge functions (they call check_rate_limit).
-- 3. Run this file. Optional backup first:
--    CREATE TABLE private.signup_guard_log_backup AS TABLE public.signup_guard_log;

BEGIN;
DROP FUNCTION IF EXISTS public.admin_signup_guard_summary(integer);
DROP FUNCTION IF EXISTS public.hook_before_user_created(jsonb);
DROP FUNCTION IF EXISTS public.email_domain_is_blocked(text);
DROP TABLE IF EXISTS public.signup_guard_log;
DROP TABLE IF EXISTS public.blocked_email_domains;
DROP FUNCTION IF EXISTS public.check_rate_limit(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.rate_limit_subject_hash(text);
DROP TABLE IF EXISTS public.rate_limit_hits;
COMMIT;
