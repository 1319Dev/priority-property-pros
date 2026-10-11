-- Puts forbid_audit_mutation() back to the PR #117 definition (no search_path). Body unchanged.
CREATE OR REPLACE FUNCTION public.forbid_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable';
END;
$$;
