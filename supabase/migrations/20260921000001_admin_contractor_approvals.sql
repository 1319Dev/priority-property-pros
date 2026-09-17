-- Admin contractor approvals queue.
-- Additive. Does not enable Stripe. Does not couple approval to signup-fee payment.
-- Paying never auto-approves. Clients cannot self-approve.

ALTER TABLE public.contractor_profiles
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS info_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS info_requested_by uuid REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS info_request_message text;

CREATE INDEX IF NOT EXISTS contractor_profiles_approval_status_idx
  ON public.contractor_profiles (approval_status);

COMMENT ON COLUMN public.contractor_profiles.rejected_at IS
  'Set by admin_reject_contractor. Rows are never deleted on reject.';
COMMENT ON COLUMN public.contractor_profiles.info_request_message IS
  'Admin request-more-info stays PENDING. Paying a signup fee never writes this or approves.';

-- JWT sessions (including admins using the Data API) cannot patch approval fields.
-- SQL editor / service_role have auth.uid() IS NULL and may still repair rows.
-- Website approve/reject/info must go through the admin RPCs below.
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
    OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
    OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
    OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
    OR NEW.info_requested_at IS DISTINCT FROM OLD.info_requested_at
    OR NEW.info_requested_by IS DISTINCT FROM OLD.info_requested_by
    OR NEW.info_request_message IS DISTINCT FROM OLD.info_request_message
  ) AND auth.uid() IS NOT NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'contractors cannot self-approve or change approval fields';
    END IF;
    IF NOT (
      public.ppp_rpc_is('admin_approve_contractor')
      OR public.ppp_rpc_is('admin_reject_contractor')
      OR public.ppp_rpc_is('admin_request_contractor_info')
    ) THEN
      RAISE EXCEPTION 'approval changes must go through admin RPCs';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Internal JSON builder. Not granted to authenticated/anon.
CREATE OR REPLACE FUNCTION public.contractor_approval_item(p_contractor_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'contractor_profile_id', cp.id,
    'profile_id', p.id,
    'business_name', cp.business_name,
    'contact_name', nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'first_name', p.first_name,
    'last_name', p.last_name,
    'email', p.email,
    'phone', p.phone,
    'categories', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('id', sc.id, 'name', sc.name, 'slug', sc.slug)
          ORDER BY sc.sort_order, sc.name
        ),
        '[]'::jsonb
      )
      FROM public.contractor_services cs
      JOIN public.service_categories sc ON sc.id = cs.category_id
      WHERE cs.contractor_profile_id = cp.id
    ),
    'service_area', cp.service_area,
    'service_areas', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'mode', a.mode,
            'center_zip', a.center_zip,
            'radius_miles', a.radius_miles,
            'zip_codes', to_jsonb(a.zip_codes),
            'label', a.label
          )
          ORDER BY a.created_at
        ),
        '[]'::jsonb
      )
      FROM public.contractor_service_areas a
      WHERE a.contractor_profile_id = cp.id
    ),
    'applied_at', cp.created_at,
    'account_status', p.account_status,
    'approval_status', cp.approval_status,
    'onboarding_status', cp.onboarding_status,
    'headline', cp.headline,
    'bio', cp.bio,
    'primary_trade', cp.primary_trade,
    'years_experience', cp.years_experience,
    'license_number', cp.license_number,
    'insurance_carrier', cp.insurance_carrier,
    'website_url', cp.website_url,
    'accepting_work', cp.accepting_work,
    'min_job_cents', cp.min_job_cents,
    'max_job_cents', cp.max_job_cents,
    'approved_at', cp.approved_at,
    'approved_by', cp.approved_by,
    'rejected_at', cp.rejected_at,
    'rejected_by', cp.rejected_by,
    'rejection_reason', cp.rejection_reason,
    'info_requested_at', cp.info_requested_at,
    'info_requested_by', cp.info_requested_by,
    'info_request_message', cp.info_request_message,
    'credentials', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'kind', c.kind,
            'label', c.label,
            'status', c.status,
            'expires_at', c.expires_at
          )
          ORDER BY c.created_at DESC
        ),
        '[]'::jsonb
      )
      FROM public.contractor_credentials c
      WHERE c.contractor_profile_id = cp.id
    )
  )
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE cp.id = p_contractor_profile_id;
$$;

CREATE OR REPLACE FUNCTION public.list_contractor_approvals(p_tab text DEFAULT 'PENDING')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tab text := upper(coalesce(nullif(btrim(p_tab), ''), 'PENDING'));
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can list contractor approvals';
  END IF;
  IF v_tab NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'ALL') THEN
    RAISE EXCEPTION 'unknown approvals tab';
  END IF;

  IF v_tab IN ('APPROVED', 'REJECTED') THEN
    SELECT coalesce(jsonb_agg(q.item ORDER BY q.sort_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        public.contractor_approval_item(cp.id) AS item,
        CASE
          WHEN v_tab = 'APPROVED' THEN coalesce(cp.approved_at, cp.updated_at)
          ELSE coalesce(cp.rejected_at, cp.updated_at)
        END AS sort_at
      FROM public.contractor_profiles cp
      JOIN public.profiles p ON p.id = cp.profile_id
      WHERE p.account_type = 'CONTRACTOR'
        AND cp.approval_status::text = v_tab
    ) q;
  ELSE
    SELECT coalesce(jsonb_agg(q.item ORDER BY q.sort_key, q.sort_at ASC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        public.contractor_approval_item(cp.id) AS item,
        CASE cp.approval_status
          WHEN 'PENDING' THEN 0
          WHEN 'APPROVED' THEN 1
          WHEN 'REJECTED' THEN 2
          ELSE 3
        END AS sort_key,
        cp.created_at AS sort_at
      FROM public.contractor_profiles cp
      JOIN public.profiles p ON p.id = cp.profile_id
      WHERE p.account_type = 'CONTRACTOR'
        AND (v_tab = 'ALL' OR cp.approval_status::text = v_tab)
    ) q;
  END IF;

  RETURN coalesce(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_contractor_approval(p_contractor_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can view contractor approvals';
  END IF;
  v_item := public.contractor_approval_item(p_contractor_profile_id);
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'contractor profile not found';
  END IF;
  RETURN v_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_pending_contractor_approvals()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can count pending contractor approvals';
  END IF;
  SELECT count(*)::integer
  INTO v_count
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE p.account_type = 'CONTRACTOR'
    AND cp.approval_status = 'PENDING';
  RETURN coalesce(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_contractor(p_contractor_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cp public.contractor_profiles;
  p public.profiles;
BEGIN
  PERFORM public.ppp_set_rpc('admin_approve_contractor');
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can approve a contractor';
  END IF;

  SELECT * INTO cp FROM public.contractor_profiles WHERE id = p_contractor_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contractor profile not found'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = cp.profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF p.account_type <> 'CONTRACTOR' THEN
    RAISE EXCEPTION 'not a contractor profile';
  END IF;
  IF p.account_status = 'DELETED' THEN
    RAISE EXCEPTION 'deleted accounts cannot be approved';
  END IF;

  -- Intended production workflow: APPROVED + ACTIVE.
  -- Matching still requires accepting_work and category/area overlap.
  -- Signup-fee payment never calls this function.
  UPDATE public.contractor_profiles
  SET
    approval_status = 'APPROVED',
    approved_at = coalesce(cp.approved_at, now()),
    approved_by = auth.uid(),
    onboarding_status = 'COMPLETE'
  WHERE id = cp.id;

  UPDATE public.profiles
  SET account_status = 'ACTIVE'
  WHERE id = p.id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'contractor.approved',
    'contractor_profiles',
    cp.id,
    jsonb_build_object(
      'profile_id', p.id,
      'previous_approval_status', cp.approval_status,
      'previous_account_status', p.account_status,
      'approved_at_preserved', cp.approved_at IS NOT NULL,
      'matching_requires', 'ACTIVE + APPROVED + accepting_work + category/area',
      'signup_fee_does_not_approve', true
    )
  );

  RETURN public.contractor_approval_item(cp.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_contractor(p_contractor_profile_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cp public.contractor_profiles;
  p public.profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM public.ppp_set_rpc('admin_reject_contractor');
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can reject a contractor';
  END IF;

  SELECT * INTO cp FROM public.contractor_profiles WHERE id = p_contractor_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contractor profile not found'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = cp.profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF p.account_type <> 'CONTRACTOR' THEN
    RAISE EXCEPTION 'not a contractor profile';
  END IF;

  -- Reject does not delete the user, profile, or contractor row.
  -- match_project requires approval_status = APPROVED, so REJECTED cannot get opportunities.
  UPDATE public.contractor_profiles
  SET
    approval_status = 'REJECTED',
    rejected_at = now(),
    rejected_by = auth.uid(),
    rejection_reason = v_reason
  WHERE id = cp.id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'contractor.rejected',
    'contractor_profiles',
    cp.id,
    jsonb_build_object(
      'profile_id', p.id,
      'previous_approval_status', cp.approval_status,
      'reason', v_reason,
      'deleted', false
    )
  );

  RETURN public.contractor_approval_item(cp.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_request_contractor_info(p_contractor_profile_id uuid, p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cp public.contractor_profiles;
  p public.profiles;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
BEGIN
  PERFORM public.ppp_set_rpc('admin_request_contractor_info');
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can request more information';
  END IF;
  IF v_message IS NULL THEN
    RAISE EXCEPTION 'a message is required';
  END IF;

  SELECT * INTO cp FROM public.contractor_profiles WHERE id = p_contractor_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contractor profile not found'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = cp.profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF p.account_type <> 'CONTRACTOR' THEN
    RAISE EXCEPTION 'not a contractor profile';
  END IF;
  IF cp.approval_status <> 'PENDING' THEN
    RAISE EXCEPTION 'more information can only be requested while the application is pending';
  END IF;

  UPDATE public.contractor_profiles
  SET
    approval_status = 'PENDING',
    info_requested_at = now(),
    info_requested_by = auth.uid(),
    info_request_message = v_message
  WHERE id = cp.id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'contractor.info_requested',
    'contractor_profiles',
    cp.id,
    jsonb_build_object(
      'profile_id', p.id,
      'approval_status', 'PENDING',
      'message', v_message
    )
  );

  RETURN public.contractor_approval_item(cp.id);
END;
$$;

COMMENT ON FUNCTION public.admin_approve_contractor(uuid) IS
  'ADMIN-only. Sets contractor APPROVED, profile ACTIVE, preserves approved_at, stamps approved_by, writes audit_logs. Does not charge. Paying never auto-approves.';
COMMENT ON FUNCTION public.admin_reject_contractor(uuid, text) IS
  'ADMIN-only. Sets REJECTED without deleting. Records admin/timestamp/reason and audit_logs. Matching will not include the contractor.';
COMMENT ON FUNCTION public.admin_request_contractor_info(uuid, text) IS
  'ADMIN-only. Keeps PENDING, stores message/admin/timestamp, writes audit_logs.';

REVOKE ALL ON FUNCTION public.contractor_approval_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_contractor_approvals(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_contractor_approval(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.count_pending_contractor_approvals() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_approve_contractor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reject_contractor(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_request_contractor_info(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_contractor_approvals(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contractor_approval(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_pending_contractor_approvals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_contractor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_contractor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_request_contractor_info(uuid, text) TO authenticated;
