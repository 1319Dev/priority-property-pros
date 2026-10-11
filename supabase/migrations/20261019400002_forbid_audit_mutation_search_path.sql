-- Restores SET search_path TO 'public' on forbid_audit_mutation().
-- PR #117 (20261019000004) replaced this function and dropped the setting.
-- The body is unchanged: it only raises, so audit_logs stay immutable.
CREATE OR REPLACE FUNCTION public.forbid_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable';
END;
$$;
