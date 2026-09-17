-- Signup-fee gates, new-user UNPAID assignment, and marketplace enforcement.
-- Does not enable job payments or Connect. payments_live / charges_live stay 0.

CREATE OR REPLACE FUNCTION public.signup_fee_is_satisfied(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') THEN
    RETURN true;
  END IF;
  IF p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR') THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.signup_fee_is_satisfied(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signup_fee_is_satisfied(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_signup_fee_paid(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.signup_fee_is_satisfied(p_profile_id) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'signup fee required';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_signup_fee_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_signup_fee_paid(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ppp_set_rpc(p_name text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('ppp.rpc', p_name, true);
  IF p_name IN (
    'post_project',
    'accept_opportunity',
    'submit_estimate',
    'withdraw_estimate',
    'select_estimate',
    'update_customer_project',
    'mark_booking_awaiting_payment',
    'start_booking',
    'complete_booking',
    'propose_change_order',
    'respond_change_order',
    'submit_booking_review'
  ) AND auth.uid() IS NOT NULL THEN
    PERFORM public.assert_signup_fee_paid(auth.uid());
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_projects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_signup_fee_paid(NEW.customer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_require_signup_fee ON public.projects;
CREATE TRIGGER projects_require_signup_fee
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_fee_on_projects();

CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_opportunity_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF NEW.status = 'ACCEPTED' AND OLD.status IS DISTINCT FROM 'ACCEPTED' THEN
    SELECT profile_id INTO v_profile_id
    FROM public.contractor_profiles
    WHERE id = NEW.contractor_profile_id;
    PERFORM public.assert_signup_fee_paid(v_profile_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_require_signup_fee ON public.opportunities;
CREATE TRIGGER opportunities_require_signup_fee
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_fee_on_opportunity_accept();

CREATE OR REPLACE FUNCTION public.enforce_signup_fee_on_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT profile_id INTO v_profile_id
  FROM public.contractor_profiles
  WHERE id = NEW.contractor_profile_id;
  PERFORM public.assert_signup_fee_paid(v_profile_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_require_signup_fee ON public.estimates;
CREATE TRIGGER estimates_require_signup_fee
  BEFORE INSERT OR UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_fee_on_estimates();

DROP POLICY IF EXISTS projects_insert_own_draft ON public.projects;
CREATE POLICY projects_insert_own_draft
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND status = 'DRAFT'
    AND public.signup_fee_is_satisfied(auth.uid())
  );

DROP POLICY IF EXISTS estimates_insert_own_draft ON public.estimates;
CREATE POLICY estimates_insert_own_draft
  ON public.estimates FOR INSERT TO authenticated
  WITH CHECK (
    contractor_profile_id = public.current_contractor_profile_id()
    AND status = 'DRAFT'
    AND public.signup_fee_is_satisfied(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_id
        AND o.contractor_profile_id = contractor_profile_id
        AND o.project_id = project_id
        AND o.status = 'ACCEPTED'
    )
  );

-- New CUSTOMER/CONTRACTOR accounts owe $9.99. VERIFIER/ADMIN do not.
-- This does not change account_status or contractor approval.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_type public.account_type;
  initial_status public.account_status;
  initial_fee public.signup_fee_status;
  meta jsonb;
BEGIN
  meta := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  safe_type := public.permitted_signup_account_type(meta->>'account_type');

  IF safe_type = 'CUSTOMER' AND NEW.email_confirmed_at IS NOT NULL THEN
    initial_status := 'ACTIVE';
  ELSE
    initial_status := 'PENDING';
  END IF;

  IF safe_type IN ('CUSTOMER', 'CONTRACTOR') THEN
    initial_fee := 'UNPAID';
  ELSE
    initial_fee := 'NOT_REQUIRED';
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    account_type,
    account_status,
    signup_fee_status
  ) VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(meta->>'first_name', ''),
    coalesce(meta->>'last_name', ''),
    nullif(meta->>'phone', ''),
    safe_type,
    initial_status,
    initial_fee
  );

  IF safe_type = 'CONTRACTOR' THEN
    INSERT INTO public.contractor_profiles (
      profile_id,
      business_name,
      primary_trade,
      service_area,
      bio,
      onboarding_status
    ) VALUES (
      NEW.id,
      coalesce(meta->>'business_name', ''),
      nullif(meta->>'primary_trade', ''),
      nullif(meta->>'service_area', ''),
      nullif(meta->>'bio', ''),
      'IN_PROGRESS'
    );
  ELSIF safe_type = 'VERIFIER' THEN
    INSERT INTO public.verifier_profiles (
      profile_id,
      coverage_area,
      bio,
      onboarding_status
    ) VALUES (
      NEW.id,
      coalesce(meta->>'coverage_area', ''),
      nullif(meta->>'bio', ''),
      'IN_PROGRESS'
    );
  END IF;

  IF coalesce(meta->>'accepted_terms', 'false') IN ('true', '1', 'yes') THEN
    INSERT INTO public.agreement_acceptances (agreement_id, profile_id, user_agent)
    SELECT a.id, NEW.id, nullif(meta->>'user_agent', '')
    FROM public.agreements a
    WHERE a.is_current
      AND a.slug IN ('terms-of-use', 'privacy-policy')
    ON CONFLICT (agreement_id, profile_id) DO NOTHING;
  END IF;

  PERFORM public.write_audit_log(
    NEW.id,
    'profile.created',
    'profiles',
    NEW.id,
    jsonb_build_object(
      'account_type', safe_type,
      'requested_account_type', meta->>'account_type',
      'signup_fee_status', initial_fee
    )
  );

  RETURN NEW;
END;
$$;
