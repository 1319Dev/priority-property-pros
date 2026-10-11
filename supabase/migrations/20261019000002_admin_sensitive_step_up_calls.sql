-- Wraps sensitive admin functions with assert_admin_sensitive_step_up().
-- Depends on 20261019000001. Does not change admin_mfa_required (stays 0).
-- Does not change payments, fees, Stripe, matching, hiring, or entitlement rules.
--
-- Source of each body: pg_get_functiondef on the live database, 2026-10-11.
-- The only added statement in each RPC is PERFORM public.assert_admin_sensitive_step_up()
-- immediately after the existing is_admin() or admin_require() check.
-- protect_platform_review adds that call on admin UPDATE and DELETE only.
-- The insert path, including auto-approve, is unchanged.
-- enforce_contractor_portfolio_privacy adds it when an admin changes privacy_state.
-- auth.uid() null (service role) still returns before that check on portfolio photos.
-- Approval column changes already require the admin RPCs, so that trigger is unchanged.
-- Contact writes already require their admin RPCs, so those triggers are unchanged.

CREATE OR REPLACE FUNCTION public.admin_approve_contractor(p_contractor_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cp public.contractor_profiles;
  p public.profiles;
BEGIN
  PERFORM public.ppp_set_rpc('admin_approve_contractor');
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can approve a contractor';
  END IF;
  PERFORM public.assert_admin_sensitive_step_up();

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
$function$


CREATE OR REPLACE FUNCTION public.admin_reject_contractor(p_contractor_profile_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cp public.contractor_profiles;
  p public.profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM public.ppp_set_rpc('admin_reject_contractor');
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can reject a contractor';
  END IF;
  PERFORM public.assert_admin_sensitive_step_up();

  SELECT * INTO cp FROM public.contractor_profiles WHERE id = p_contractor_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contractor profile not found'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = cp.profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF p.account_type <> 'CONTRACTOR' THEN
    RAISE EXCEPTION 'not a contractor profile';
  END IF;

  UPDATE public.contractor_profiles
  SET
    approval_status = 'REJECTED',
    rejected_at = now(),
    rejected_by = auth.uid(),
    rejection_reason = v_reason
  WHERE id = cp.id;

  PERFORM public.close_open_contractor_work(cp.id);

  PERFORM public.write_audit_log(
    auth.uid(),
    'contractor.rejected',
    'contractor_profiles',
    cp.id,
    jsonb_build_object(
      'profile_id', p.id,
      'previous_approval_status', cp.approval_status,
      'reason', v_reason,
      'deleted', false,
      'open_work_closed', true
    )
  );

  RETURN public.contractor_approval_item(cp.id);
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_request_contractor_info(p_contractor_profile_id uuid, p_message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cp public.contractor_profiles;
  p public.profiles;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
BEGIN
  PERFORM public.ppp_set_rpc('admin_request_contractor_info');
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can request more information';
  END IF;
  PERFORM public.assert_admin_sensitive_step_up();
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
$function$


CREATE OR REPLACE FUNCTION public.admin_set_account_flag(p_profile_id uuid, p_flag text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flag text := upper(btrim(coalesce(p_flag, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM public.admin_require();
  PERFORM public.assert_admin_sensitive_step_up();

  IF p_profile_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_flag NOT IN ('TEST', 'OWNER', 'INTERNAL') THEN
    RAISE EXCEPTION 'flag must be TEST, OWNER, or INTERNAL' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'note is too long' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_account_flags (profile_id, flag, note, set_by, set_at)
  VALUES (p_profile_id, v_flag, v_note, auth.uid(), now())
  ON CONFLICT (profile_id) DO UPDATE
    SET flag = EXCLUDED.flag,
        note = EXCLUDED.note,
        set_by = EXCLUDED.set_by,
        set_at = now();

  PERFORM public.write_audit_log(
    auth.uid(),
    'admin.account_flag_set',
    'profile',
    p_profile_id,
    jsonb_build_object('flag', v_flag, 'note', v_note)
  );

  RETURN jsonb_build_object('profile_id', p_profile_id, 'flag', v_flag);
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_grant_booking_contact_access(p_booking_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
  v_reason text;
  access public.booking_contact_access;
BEGIN
  PERFORM public.ppp_set_rpc('admin_grant_booking_contact_access');

  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can grant booking contact access';
  END IF;
  PERFORM public.assert_admin_sensitive_step_up();

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'a reason is required to grant contact access';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  INSERT INTO public.booking_contact_access (
    booking_id, connection_id, project_id, contractor_profile_id,
    status, granted_at, granted_by, grant_reason, grant_source, revoked_at
  ) VALUES (
    b.id, NULL, b.project_id, b.contractor_profile_id,
    'ADMIN_OVERRIDE', now(), auth.uid(), v_reason, 'ADMIN_OVERRIDE', NULL
  )
  ON CONFLICT (booking_id) DO UPDATE
    SET
      status = 'ADMIN_OVERRIDE',
      granted_at = now(),
      granted_by = auth.uid(),
      grant_reason = v_reason,
      grant_source = 'ADMIN_OVERRIDE',
      revoked_at = NULL
  RETURNING * INTO access;

  PERFORM public.write_booking_event(
    b.id,
    'contact_access.granted',
    jsonb_build_object(
      'status', access.status,
      'grant_source', access.grant_source,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id
    )
  );

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking.contact_access.granted',
    'booking',
    b.id,
    jsonb_build_object(
      'status', access.status,
      'grant_source', access.grant_source,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id,
      'granted_at', access.granted_at,
      'granted_by', access.granted_by
    )
  );

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', access.status,
    'grant_source', access.grant_source,
    'grant_reason', access.grant_reason,
    'granted_at', access.granted_at,
    'granted_by', access.granted_by,
    'revoked_at', access.revoked_at,
    'customer_id', b.customer_id,
    'contractor_profile_id', b.contractor_profile_id,
    'charges_live', false,
    'payments_live', false
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_revoke_booking_contact_access(p_booking_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
  v_reason text;
  access public.booking_contact_access;
BEGIN
  PERFORM public.ppp_set_rpc('admin_revoke_booking_contact_access');

  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can revoke booking contact access';
  END IF;
  PERFORM public.assert_admin_sensitive_step_up();

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'a reason is required to revoke contact access';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  INSERT INTO public.booking_contact_access (
    booking_id, connection_id, project_id, contractor_profile_id, status, grant_source
  ) VALUES (
    b.id, NULL, b.project_id, b.contractor_profile_id, 'LOCKED', 'SYSTEM'
  )
  ON CONFLICT (booking_id) DO UPDATE
    SET
      status = 'LOCKED',
      revoked_at = now()
  RETURNING * INTO access;

  PERFORM public.write_booking_event(
    b.id,
    'contact_access.revoked',
    public.strip_private_contact_keys(jsonb_build_object(
      'status', access.status,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id
    ))
  );

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking.contact_access.revoked',
    'booking',
    b.id,
    public.strip_private_contact_keys(jsonb_build_object(
      'status', access.status,
      'reason', v_reason,
      'customer_id', b.customer_id,
      'contractor_profile_id', b.contractor_profile_id,
      'revoked_at', access.revoked_at,
      'revoked_by', auth.uid()
    ))
  );

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', access.status,
    'grant_source', access.grant_source,
    'grant_reason', access.grant_reason,
    'granted_at', access.granted_at,
    'granted_by', access.granted_by,
    'revoked_at', access.revoked_at,
    'customer_id', b.customer_id,
    'contractor_profile_id', b.contractor_profile_id,
    'charges_live', false,
    'payments_live', false
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_grant_connection_contact_access(p_connection_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  conn public.project_connections;
  v_reason text := btrim(coalesce(p_reason, ''));
  access public.booking_contact_access;
BEGIN
  PERFORM public.ppp_set_rpc('admin_grant_connection_contact_access');
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can grant connection contact access';
  END IF;
  PERFORM public.assert_admin_sensitive_step_up();
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'a reason is required to grant contact access';
  END IF;
  SELECT * INTO conn FROM public.project_connections WHERE id = p_connection_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection not found';
  END IF;

  INSERT INTO public.booking_contact_access (
    booking_id, connection_id, project_id, contractor_profile_id,
    status, granted_at, granted_by, grant_reason, grant_source, revoked_at
  ) VALUES (
    NULL, conn.id, conn.project_id, conn.contractor_profile_id,
    'ADMIN_OVERRIDE', now(), auth.uid(), v_reason, 'ADMIN_OVERRIDE', NULL
  )
  ON CONFLICT (connection_id) DO UPDATE
    SET
      status = 'ADMIN_OVERRIDE',
      granted_at = now(),
      granted_by = auth.uid(),
      grant_reason = v_reason,
      grant_source = 'ADMIN_OVERRIDE',
      revoked_at = NULL
  RETURNING * INTO access;

  PERFORM public.write_connection_event(
    p_connection_id,
    'connection.contact_access.granted',
    jsonb_build_object('reason', v_reason, 'customer_id', conn.customer_id, 'contractor_profile_id', conn.contractor_profile_id)
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'connection.contact_access.granted',
    'booking_contact_access',
    access.id,
    jsonb_build_object(
      'reason', v_reason,
      'connection_id', p_connection_id,
      'customer_id', conn.customer_id,
      'contractor_profile_id', conn.contractor_profile_id
    )
  );

  RETURN jsonb_build_object(
    'connection_id', p_connection_id,
    'entitlement_id', access.id,
    'status', access.status,
    'grant_source', access.grant_source
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_revoke_connection_contact_access(p_connection_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  access public.booking_contact_access;
BEGIN
  PERFORM public.ppp_set_rpc('admin_revoke_connection_contact_access');
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can revoke connection contact access';
  END IF;
  PERFORM public.assert_admin_sensitive_step_up();

  UPDATE public.booking_contact_access
  SET
    status = 'LOCKED',
    revoked_at = now(),
    grant_reason = coalesce(nullif(btrim(p_reason), ''), grant_reason),
    updated_at = now()
  WHERE connection_id = p_connection_id
  RETURNING * INTO access;

  PERFORM public.write_connection_event(
    p_connection_id,
    'connection.contact_access.revoked',
    jsonb_build_object('reason', p_reason)
  );
  PERFORM public.write_audit_log(
    auth.uid(),
    'connection.contact_access.revoked',
    'booking_contact_access',
    coalesce(access.id, p_connection_id),
    jsonb_build_object('reason', p_reason, 'connection_id', p_connection_id)
  );
  RETURN jsonb_build_object(
    'connection_id', p_connection_id,
    'status', 'LOCKED',
    'missing_row', access.id IS NULL
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_set_portfolio_privacy(p_item_id uuid, p_state portfolio_privacy_state, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.contractor_portfolio;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can set portfolio photo privacy';
  END IF;
  PERFORM public.assert_admin_sensitive_step_up();

  SELECT * INTO v_row
  FROM public.contractor_portfolio
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portfolio photo not found';
  END IF;

  UPDATE public.contractor_portfolio
  SET privacy_state = p_state
  WHERE id = v_row.id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'portfolio.privacy_set',
    'contractor_portfolio',
    v_row.id,
    jsonb_build_object(
      'contractor_profile_id', v_row.contractor_profile_id,
      'previous_privacy_state', v_row.privacy_state,
      'privacy_state', p_state,
      'note', v_note,
      'storage_path', v_row.storage_path
    )
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'contractor_profile_id', v_row.contractor_profile_id,
    'privacy_state', p_state,
    'title', v_row.title,
    'storage_path', v_row.storage_path
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_set_platform_review_status(p_review_id uuid, p_status text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_row public.platform_reviews;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_admin_sensitive_step_up();

  IF v_status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'status must be APPROVED or REJECTED' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'a reason between 3 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.platform_reviews
  SET status = v_status::public.platform_review_status
  WHERE id = p_review_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform review not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.write_audit_log(
    auth.uid(),
    CASE WHEN v_status = 'APPROVED' THEN 'platform_review.approved' ELSE 'platform_review.rejected' END,
    'platform_review',
    p_review_id,
    jsonb_build_object('status', v_status, 'reason', v_reason)
  );

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status);
END;
$function$


CREATE OR REPLACE FUNCTION public.protect_platform_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'sign in to leave a review';
    END IF;

    NEW.user_id := auth.uid();
    NEW.display_name := btrim(NEW.display_name);
    NEW.body := btrim(NEW.body);
    NEW.city := NULLIF(btrim(COALESCE(NEW.city, '')), '');

    IF public.text_contains_contact_info(NEW.display_name)
       OR public.text_contains_contact_info(NEW.body)
       OR public.text_contains_contact_info(COALESCE(NEW.city, '')) THEN
      RAISE EXCEPTION '%', public.contact_info_blocked_message();
    END IF;

    -- Auto-approve valid signed-in reviews. Admins can still reject later.
    IF NOT public.is_admin() OR NEW.status IS DISTINCT FROM 'PENDING' THEN
      NEW.status := 'APPROVED';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can change a platform review';
    END IF;
    PERFORM public.assert_admin_sensitive_step_up();
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can delete a platform review';
    END IF;
    PERFORM public.assert_admin_sensitive_step_up();
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.enforce_contractor_portfolio_privacy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_prefix text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    IF TG_OP = 'UPDATE' AND NEW.privacy_state IS DISTINCT FROM OLD.privacy_state THEN
      PERFORM public.assert_admin_sensitive_step_up();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.contractor_profile_id IS DISTINCT FROM OLD.contractor_profile_id THEN
    RAISE EXCEPTION 'You cannot move a portfolio photo to another contractor.';
  END IF;

  v_owner := public.contractor_portfolio_owner_profile_id(NEW.contractor_profile_id);
  v_prefix := coalesce(v_owner::text, '') || '/portfolio/';
  IF v_owner IS NULL OR coalesce(NEW.storage_path, '') = '' OR position(v_prefix in NEW.storage_path) <> 1 THEN
    RAISE EXCEPTION 'Portfolio photos must stay in your own portfolio folder.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.privacy_state := 'REVIEW_REQUIRED';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description THEN
      NEW.privacy_state := 'REVIEW_REQUIRED';
    ELSIF NEW.privacy_state IS DISTINCT FROM OLD.privacy_state THEN
      RAISE EXCEPTION 'Photo visibility is reviewed by Priority Property Pros. You cannot change it yourself.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$

