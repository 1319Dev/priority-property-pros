-- Deny-by-default RLS. Database is the authority for roles.
-- is_admin() is SECURITY DEFINER so policies do not recurse on profiles.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND account_type = 'ADMIN'
      AND account_status = 'ACTIVE'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'email cannot be changed from the client';
  END IF;

  -- JWT sessions cannot assign ADMIN. SQL editor / service_role have no auth.uid().
  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    IF NEW.account_type = 'ADMIN' AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'ADMIN cannot be assigned from the client';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'account_type cannot be changed by the account owner';
    END IF;
  END IF;

  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'account_status cannot be changed by the account owner';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_protect_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_columns();

CREATE OR REPLACE FUNCTION public.protect_contractor_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    NEW.approval_status IS DISTINCT FROM OLD.approval_status
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
  ) AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'contractors cannot self-approve or change approval fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contractor_profiles_protect_approval
  BEFORE UPDATE ON public.contractor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_contractor_approval();

CREATE OR REPLACE FUNCTION public.protect_verifier_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    NEW.approval_status IS DISTINCT FROM OLD.approval_status
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
  ) AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'verifiers cannot self-approve or change approval fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verifier_profiles_protect_approval
  BEFORE UPDATE ON public.verifier_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_verifier_approval();

CREATE OR REPLACE FUNCTION public.forbid_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable';
END;
$$;

CREATE TRIGGER audit_logs_forbid_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_audit_mutation();

CREATE TRIGGER audit_logs_forbid_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_audit_mutation();

-- ---------------------------------------------------------------------------
-- Enable RLS (no policies yet = deny all)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Do not FORCE RLS: the SQL editor and service_role must still administer
-- (first admin, seeds). anon/authenticated are still deny-by-default.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

CREATE POLICY profiles_select_own_or_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_own_or_admin
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- No INSERT/DELETE policies for authenticated — rows come from the signup trigger.

-- ---------------------------------------------------------------------------
-- contractor_profiles
-- ---------------------------------------------------------------------------

CREATE POLICY contractor_profiles_select_own_or_admin
  ON public.contractor_profiles
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY contractor_profiles_update_own_or_admin
  ON public.contractor_profiles
  FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- verifier_profiles
-- ---------------------------------------------------------------------------

CREATE POLICY verifier_profiles_select_own_or_admin
  ON public.verifier_profiles
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY verifier_profiles_update_own_or_admin
  ON public.verifier_profiles
  FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- agreements (read current copy; mutations are SQL-editor / service_role only)
-- ---------------------------------------------------------------------------

CREATE POLICY agreements_select_current
  ON public.agreements
  FOR SELECT
  TO anon, authenticated
  USING (is_current);

-- ---------------------------------------------------------------------------
-- agreement_acceptances
-- ---------------------------------------------------------------------------

CREATE POLICY agreement_acceptances_select_own_or_admin
  ON public.agreement_acceptances
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY agreement_acceptances_insert_own
  ON public.agreement_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_logs: admins may read; nobody may write via the Data API
-- ---------------------------------------------------------------------------

CREATE POLICY audit_logs_select_admin
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Grants: least privilege. anon cannot read profiles.

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.contractor_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.verifier_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agreements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agreement_acceptances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.contractor_profiles TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.verifier_profiles TO authenticated;
GRANT SELECT ON TABLE public.agreements TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.agreement_acceptances TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
