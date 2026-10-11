-- Admin corrections for customer and contractor profiles.
-- Stacked on the homeowner (#106) and contractor (#109) directories.
--
-- Step-up: email, phone, account status, approval status, directory
-- visibility, photo approval state, and credential status changes call
-- public.admin_profile_edit_step_up(). That helper calls
-- public.assert_admin_sensitive_step_up() from PR #110 (migration 20261019000001)
-- when it exists. Before #110 is deployed the helper is a no-op, so this
-- migration can ship first; once #110 is applied the same calls enforce AAL2
-- plus a fresh code whenever admin_mfa_required is on. No redeploy needed.
--
-- Does not write payment tables, fee status, amounts, or processor ids. Those
-- stay on the audited payment actions. Any patch key that names one is refused.
--
-- Customer house addresses live in profile_private_locations, not on profiles,
-- so a public profile read cannot return them. Contractor contact fields are
-- returned only by the admin editor functions below.

CREATE OR REPLACE FUNCTION public.admin_profile_edit_step_up()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- Guarded so this works whether or not PR #110 is deployed.
  IF to_regprocedure('public.assert_admin_sensitive_step_up()') IS NOT NULL THEN
    EXECUTE 'SELECT public.assert_admin_sensitive_step_up()';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_profile_edit_reason(p_reason text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF v_reason IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Enter a reason for this change (3 to 500 characters).';
  END IF;
  RETURN v_reason;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF nullif(btrim(coalesce(p_phone, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;
  IF char_length(v_digits) = 11 AND left(v_digits, 1) = '1' THEN
    v_digits := substr(v_digits, 2);
  END IF;
  IF v_digits !~ '^[2-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'Enter a 10-digit phone number.';
  END IF;
  RETURN v_digits;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_normalize_email(p_email text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v_email = '' OR char_length(v_email) > 320 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.';
  END IF;
  RETURN v_email;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_normalize_avatar(p_value text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
BEGIN
  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;
  IF char_length(v_value) > 500 OR v_value ~* 'javascript:' OR v_value ~* '^data:' THEN
    RAISE EXCEPTION 'Enter an https avatar address.';
  END IF;
  IF position('://' IN v_value) > 0 AND v_value !~* '^https://' THEN
    RAISE EXCEPTION 'Enter an https avatar address.';
  END IF;
  RETURN v_value;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_require_public_plain_text(
  p_label text,
  p_value text,
  p_max integer
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
BEGIN
  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;
  IF char_length(v_value) > p_max THEN
    RAISE EXCEPTION '% must be % characters or fewer', p_label, p_max;
  END IF;
  IF public.text_contains_pre_hire_contact(v_value) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;
  RETURN v_value;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_require_zip(p_zip text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_zip text;
BEGIN
  IF nullif(btrim(coalesce(p_zip, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;
  v_zip := public.normalize_zip(p_zip);
  IF v_zip IS NULL OR v_zip !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'Enter a 5-digit ZIP code.';
  END IF;
  RETURN v_zip;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_reject_money_patch(p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_key text;
  v_item jsonb;
  v_banned text[] := ARRAY[
    'signup_fee_status',
    'signup_fee_paid_at',
    'signup_fee_charge_id',
    'amount_cents',
    'fee_cents',
    'contractor_fee_bps',
    'stripe_checkout_session_id',
    'stripe_payment_intent_id',
    'stripe_customer_id',
    'stripe_account_id',
    'needs_refund',
    'refund_reason',
    'refunded_cents'
  ];
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS NULL OR jsonb_typeof(p_patch) = 'null' THEN
    RETURN;
  END IF;
  IF jsonb_typeof(p_patch) = 'object' THEN
    FOR v_key IN SELECT k FROM jsonb_object_keys(p_patch) AS k LOOP
      IF v_key = ANY (v_banned) OR v_key LIKE 'stripe\_%' ESCAPE '\' THEN
        RAISE EXCEPTION 'payment records and fee status are not editable here';
      END IF;
      PERFORM public.admin_reject_money_patch(p_patch -> v_key);
    END LOOP;
  ELSIF jsonb_typeof(p_patch) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_patch) LOOP
      PERFORM public.admin_reject_money_patch(v_item);
    END LOOP;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_audit_text(p_key text, p_value text)
RETURNS text
LANGUAGE sql
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN coalesce(p_key, '') ~* 'stripe|token|password|secret|document_path' THEN '[redacted]'
    WHEN p_value ~* 'javascript:' THEN '[redacted]'
    WHEN position('://' IN p_value) > 0 AND position('?' IN p_value) > 0 THEN split_part(p_value, '?', 1)
    ELSE p_value
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_audit_json(p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_type text;
  v_key text;
  v_item jsonb;
  v_out jsonb;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) IS NULL OR jsonb_typeof(p_value) = 'null' THEN
    RETURN 'null'::jsonb;
  END IF;
  IF coalesce(p_key, '') ~* 'stripe|token|password|secret|document_path' THEN
    RETURN to_jsonb('[redacted]'::text);
  END IF;
  v_type := jsonb_typeof(p_value);
  IF v_type = 'string' THEN
    RETURN to_jsonb(public.admin_audit_text(p_key, p_value #>> '{}'));
  END IF;
  IF v_type = 'array' THEN
    v_out := '[]'::jsonb;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      v_out := v_out || jsonb_build_array(public.admin_audit_json(p_key, v_item));
    END LOOP;
    RETURN v_out;
  END IF;
  IF v_type = 'object' THEN
    v_out := '{}'::jsonb;
    FOR v_key IN SELECT k FROM jsonb_object_keys(p_value) AS k LOOP
      v_out := v_out || jsonb_build_object(v_key, public.admin_audit_json(v_key, p_value -> v_key));
    END LOOP;
    RETURN v_out;
  END IF;
  RETURN p_value;
END;
$fn$;

CREATE TABLE IF NOT EXISTS public.profile_private_locations (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  street_line1 text,
  street_line2 text,
  city text,
  state text,
  zip_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_private_locations_street_len CHECK (
    (street_line1 IS NULL OR char_length(street_line1) <= 120)
    AND (street_line2 IS NULL OR char_length(street_line2) <= 120)
    AND (city IS NULL OR char_length(city) <= 80)
    AND (state IS NULL OR char_length(state) <= 40)
    AND (zip_code IS NULL OR zip_code ~ '^[0-9]{5}$')
  )
);

DROP TRIGGER IF EXISTS profile_private_locations_set_updated_at ON public.profile_private_locations;
CREATE TRIGGER profile_private_locations_set_updated_at
  BEFORE UPDATE ON public.profile_private_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profile_private_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_private_locations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profile_private_locations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profile_private_locations TO authenticated;

DROP POLICY IF EXISTS profile_private_locations_select_own_or_admin ON public.profile_private_locations;
CREATE POLICY profile_private_locations_select_own_or_admin
  ON public.profile_private_locations
  FOR SELECT
  TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS profile_private_locations_write_own_or_admin ON public.profile_private_locations;
CREATE POLICY profile_private_locations_write_own_or_admin
  ON public.profile_private_locations
  FOR ALL
  TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (profile_id = (SELECT auth.uid()) OR public.is_admin());

COMMENT ON TABLE public.profile_private_locations IS
  'Customer house address. Readable by that customer and admins. Not joined into public or non-admin payloads.';

ALTER TABLE public.contractor_profiles
  ADD COLUMN IF NOT EXISTS directory_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contractor_profiles.directory_hidden IS
  'Admin visibility flag. Hides the contractor from the public directory without changing fee status. Default false keeps current listings.';

CREATE OR REPLACE FUNCTION public.contractor_is_directory_listed(p_contractor_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_profiles cp
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE cp.id = p_contractor_profile_id
      AND cp.approval_status = 'APPROVED'
      AND p.account_status = 'ACTIVE'
      AND public.signup_fee_is_satisfied(cp.profile_id)
      AND NOT cp.directory_hidden
  );
$$;

REVOKE ALL ON FUNCTION public.contractor_is_directory_listed(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.contractor_is_directory_listed(uuid) IS
  'True only for APPROVED contractors whose account is ACTIVE, whose signup fee is satisfied, and who are not directory_hidden. The flag does not change fee status.';

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
      OR public.ppp_rpc_is('admin_update_contractor_profile')
    ) THEN
      RAISE EXCEPTION 'approval changes must go through admin RPCs';
    END IF;
  END IF;
  -- Directory visibility is an admin decision. Contractors cannot hide or
  -- unhide themselves, and admins change it only through the audited editor.
  IF NEW.directory_hidden IS DISTINCT FROM OLD.directory_hidden AND auth.uid() IS NOT NULL THEN
    IF NOT public.is_admin() OR NOT public.ppp_rpc_is('admin_update_contractor_profile') THEN
      RAISE EXCEPTION 'directory visibility is set by Priority Property Pros';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_customer_editor(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row record;
BEGIN
  PERFORM public.admin_require();
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    p.avatar_url,
    p.account_status::text AS account_status,
    p.account_type::text AS account_type
  INTO v_row
  FROM public.profiles p
  WHERE p.id = p_profile_id;
  IF NOT FOUND OR v_row.account_type IS DISTINCT FROM 'CUSTOMER' THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'profile_id', v_row.id,
    'first_name', v_row.first_name,
    'last_name', v_row.last_name,
    'email', v_row.email,
    'phone', v_row.phone,
    'avatar_url', v_row.avatar_url,
    'account_status', v_row.account_status,
    'location', (
      SELECT jsonb_build_object(
        'street_line1', loc.street_line1,
        'street_line2', loc.street_line2,
        'city', loc.city,
        'state', loc.state,
        'zip_code', loc.zip_code
      )
      FROM public.profile_private_locations loc
      WHERE loc.profile_id = v_row.id
    ),
    'notifications', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'category', c.category,
          'in_app', coalesce(np.in_app, true),
          'push', coalesce(np.push, false),
          'email', coalesce(np.email, c.email_on)
        )
        ORDER BY c.ord
      ), '[]'::jsonb)
      FROM (
        VALUES
          (1, 'new_job', true),
          (2, 'messages', true),
          (3, 'connect', true),
          (4, 'estimates', true),
          (5, 'booking', true),
          (6, 'change_orders', true),
          (7, 'reviews', false),
          (8, 'account', false)
      ) AS c(ord, category, email_on)
      LEFT JOIN public.notification_preferences np
        ON np.user_id = v_row.id AND np.category = c.category
    ),
    'projects', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'project_id', pr.id,
          'reference_number', pr.reference_number,
          'title', pr.title,
          'description', pr.description,
          'category_id', pr.category_id,
          'city', pr.city,
          'state', pr.state,
          'zip_code', pr.zip_code,
          'street_line1', loc.street_line1,
          'street_line2', loc.street_line2,
          'timing', pr.timing::text,
          'preferred_date', pr.preferred_date,
          'status', pr.status::text
        )
        ORDER BY pr.created_at DESC, pr.id
      ), '[]'::jsonb)
      FROM public.projects pr
      LEFT JOIN public.project_private_locations loc ON loc.project_id = pr.id
      WHERE pr.customer_id = v_row.id
    ),
    'categories', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', sc.id, 'name', sc.name) ORDER BY sc.name), '[]'::jsonb)
      FROM public.service_categories sc
    )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_update_customer_profile(
  p_profile_id uuid,
  p_patch jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reason text;
  v_old_email text;
  v_old_first text;
  v_old_last text;
  v_old_phone text;
  v_old_avatar text;
  v_old_status text;
  v_account_type text;
  v_email text;
  v_first text;
  v_last text;
  v_phone text;
  v_avatar text;
  v_status text;
  v_sensitive boolean := false;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_item jsonb;
  v_loc_old jsonb;
  v_loc_new jsonb;
  v_street1 text;
  v_street2 text;
  v_city text;
  v_state text;
  v_zip text;
  v_project_id uuid;
  v_title text;
  v_description text;
  v_category uuid;
  v_timing text;
  v_preferred date;
  v_project_before jsonb;
  v_project_after jsonb;
  v_projects_before jsonb := '[]'::jsonb;
  v_projects_after jsonb := '[]'::jsonb;
  v_notes_before jsonb := '[]'::jsonb;
  v_notes_after jsonb := '[]'::jsonb;
  v_category_name text;
  v_in_app boolean;
  v_push boolean;
  v_email_on boolean;
  v_old_note record;
BEGIN
  PERFORM public.admin_require();
  v_reason := public.admin_profile_edit_reason(p_reason);
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Profile changes must be an object.';
  END IF;
  IF p_patch ? 'account_type' THEN
    RAISE EXCEPTION 'Account type is not editable here.';
  END IF;
  PERFORM public.admin_reject_money_patch(p_patch);

  SELECT
    p.email,
    p.first_name,
    p.last_name,
    p.phone,
    p.avatar_url,
    p.account_status::text,
    p.account_type::text
  INTO v_old_email, v_old_first, v_old_last, v_old_phone, v_old_avatar, v_old_status, v_account_type
  FROM public.profiles p
  WHERE p.id = p_profile_id
  FOR UPDATE;
  IF NOT FOUND OR v_account_type IS DISTINCT FROM 'CUSTOMER' THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;

  v_email := lower(btrim(v_old_email));
  v_first := v_old_first;
  v_last := v_old_last;
  v_phone := v_old_phone;
  v_avatar := v_old_avatar;
  v_status := v_old_status;

  IF p_patch ? 'email' THEN
    v_email := public.admin_normalize_email(p_patch->>'email');
    IF v_email IS DISTINCT FROM lower(btrim(v_old_email)) THEN
      v_sensitive := true;
    END IF;
  END IF;
  IF p_patch ? 'phone' THEN
    v_phone := public.admin_normalize_phone(p_patch->>'phone');
    IF v_phone IS DISTINCT FROM v_old_phone THEN
      v_sensitive := true;
    END IF;
  END IF;
  IF p_patch ? 'first_name' THEN
    v_first := public.admin_require_public_plain_text('first name', p_patch->>'first_name', 80);
    IF v_first IS NULL THEN
      RAISE EXCEPTION 'Enter a first name.';
    END IF;
  END IF;
  IF p_patch ? 'last_name' THEN
    v_last := public.admin_require_public_plain_text('last name', p_patch->>'last_name', 80);
    IF v_last IS NULL THEN
      RAISE EXCEPTION 'Enter a last name.';
    END IF;
  END IF;
  IF p_patch ? 'avatar_url' THEN
    v_avatar := public.admin_normalize_avatar(p_patch->>'avatar_url');
  END IF;
  IF p_patch ? 'account_status' THEN
    v_status := upper(btrim(coalesce(p_patch->>'account_status', '')));
    IF v_status NOT IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED') THEN
      RAISE EXCEPTION 'That account status is not valid.';
    END IF;
    IF v_status IS DISTINCT FROM v_old_status THEN
      v_sensitive := true;
    END IF;
  END IF;
  IF v_sensitive THEN
    PERFORM public.admin_profile_edit_step_up();
  END IF;

  IF v_email IS DISTINCT FROM lower(btrim(v_old_email)) THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles other
      WHERE other.id <> p_profile_id AND lower(other.email) = v_email
    ) OR EXISTS (
      SELECT 1 FROM auth.users other
      WHERE other.id <> p_profile_id AND lower(other.email) = v_email
    ) THEN
      RAISE EXCEPTION 'That email is already in use.';
    END IF;
    BEGIN
      -- Server-side sign-in email change. Clears any pending self-service change
      -- so an old confirmation link cannot undo the correction.
      UPDATE auth.users
      SET email = v_email,
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          email_change = '',
          email_change_token_new = '',
          email_change_token_current = '',
          email_change_confirm_status = 0,
          updated_at = now()
      WHERE id = p_profile_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'That account has no sign-in record.';
      END IF;
      UPDATE auth.identities
      SET identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_email),
          updated_at = now()
      WHERE user_id = p_profile_id AND provider = 'email';
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'That email is already in use.';
    END;
    v_before := v_before || jsonb_build_object('email', v_old_email);
    v_after := v_after || jsonb_build_object('email', v_email);
  END IF;

  IF v_first IS DISTINCT FROM v_old_first
     OR v_last IS DISTINCT FROM v_old_last
     OR v_phone IS DISTINCT FROM v_old_phone
     OR v_avatar IS DISTINCT FROM v_old_avatar
     OR v_status IS DISTINCT FROM v_old_status
     OR v_email IS DISTINCT FROM lower(btrim(v_old_email)) THEN
    UPDATE public.profiles
    SET first_name = v_first,
        last_name = v_last,
        phone = v_phone,
        avatar_url = v_avatar,
        email = v_email,
        account_status = v_status::public.account_status
    WHERE id = p_profile_id;
  END IF;
  IF v_first IS DISTINCT FROM v_old_first THEN
    v_before := v_before || jsonb_build_object('first_name', v_old_first);
    v_after := v_after || jsonb_build_object('first_name', v_first);
  END IF;
  IF v_last IS DISTINCT FROM v_old_last THEN
    v_before := v_before || jsonb_build_object('last_name', v_old_last);
    v_after := v_after || jsonb_build_object('last_name', v_last);
  END IF;
  IF v_phone IS DISTINCT FROM v_old_phone THEN
    v_before := v_before || jsonb_build_object('phone', v_old_phone);
    v_after := v_after || jsonb_build_object('phone', v_phone);
  END IF;
  IF v_avatar IS DISTINCT FROM v_old_avatar THEN
    v_before := v_before || jsonb_build_object('avatar_url', v_old_avatar);
    v_after := v_after || jsonb_build_object('avatar_url', v_avatar);
  END IF;
  IF v_status IS DISTINCT FROM v_old_status THEN
    v_before := v_before || jsonb_build_object('account_status', v_old_status);
    v_after := v_after || jsonb_build_object('account_status', v_status);
  END IF;

  IF p_patch ? 'location' THEN
    IF jsonb_typeof(p_patch->'location') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Location must be an object.';
    END IF;
    v_item := p_patch->'location';
    SELECT jsonb_build_object(
      'street_line1', loc.street_line1,
      'street_line2', loc.street_line2,
      'city', loc.city,
      'state', loc.state,
      'zip_code', loc.zip_code
    )
    INTO v_loc_old
    FROM public.profile_private_locations loc
    WHERE loc.profile_id = p_profile_id;
    v_loc_old := coalesce(v_loc_old, jsonb_build_object(
      'street_line1', NULL, 'street_line2', NULL, 'city', NULL, 'state', NULL, 'zip_code', NULL
    ));
    v_street1 := nullif(btrim(coalesce(v_item->>'street_line1', v_loc_old->>'street_line1', '')), '');
    v_street2 := nullif(btrim(coalesce(v_item->>'street_line2', v_loc_old->>'street_line2', '')), '');
    IF v_item ? 'street_line1' THEN
      v_street1 := nullif(left(btrim(coalesce(v_item->>'street_line1', '')), 121), '');
      IF v_street1 IS NOT NULL AND char_length(v_street1) > 120 THEN
        RAISE EXCEPTION 'address line 1 must be 120 characters or fewer';
      END IF;
    ELSE
      v_street1 := v_loc_old->>'street_line1';
    END IF;
    IF v_item ? 'street_line2' THEN
      v_street2 := nullif(btrim(coalesce(v_item->>'street_line2', '')), '');
      IF v_street2 IS NOT NULL AND char_length(v_street2) > 120 THEN
        RAISE EXCEPTION 'address line 2 must be 120 characters or fewer';
      END IF;
    ELSE
      v_street2 := v_loc_old->>'street_line2';
    END IF;
    IF v_item ? 'city' THEN
      v_city := public.normalize_city(v_item->>'city');
      IF v_city IS NOT NULL AND char_length(v_city) > 80 THEN
        RAISE EXCEPTION 'city must be 80 characters or fewer';
      END IF;
    ELSE
      v_city := v_loc_old->>'city';
    END IF;
    IF v_item ? 'state' THEN
      v_state := public.normalize_us_state(v_item->>'state');
    ELSE
      v_state := v_loc_old->>'state';
    END IF;
    IF v_item ? 'zip_code' THEN
      v_zip := public.admin_require_zip(v_item->>'zip_code');
    ELSE
      v_zip := v_loc_old->>'zip_code';
    END IF;
    v_loc_new := jsonb_build_object(
      'street_line1', v_street1,
      'street_line2', v_street2,
      'city', v_city,
      'state', v_state,
      'zip_code', v_zip
    );
    IF v_loc_new IS DISTINCT FROM v_loc_old THEN
      INSERT INTO public.profile_private_locations (profile_id, street_line1, street_line2, city, state, zip_code)
      VALUES (p_profile_id, v_street1, v_street2, v_city, v_state, v_zip)
      ON CONFLICT (profile_id) DO UPDATE
      SET street_line1 = EXCLUDED.street_line1,
          street_line2 = EXCLUDED.street_line2,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip_code = EXCLUDED.zip_code;
      v_before := v_before || jsonb_build_object('location', v_loc_old);
      v_after := v_after || jsonb_build_object('location', v_loc_new);
    END IF;
  END IF;

  IF p_patch ? 'notifications' THEN
    IF jsonb_typeof(p_patch->'notifications') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Notifications must be a list.';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_patch->'notifications') LOOP
      v_category_name := btrim(coalesce(v_item->>'category', ''));
      IF v_category_name NOT IN (
        'new_job', 'messages', 'connect', 'estimates', 'booking', 'change_orders', 'reviews', 'account'
      ) THEN
        RAISE EXCEPTION 'That notification category is not valid.';
      END IF;
      IF jsonb_typeof(v_item->'in_app') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(v_item->'push') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(v_item->'email') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Notification choices must be true or false.';
      END IF;
      v_in_app := (v_item->>'in_app')::boolean;
      v_push := (v_item->>'push')::boolean;
      v_email_on := (v_item->>'email')::boolean;
      SELECT np.in_app, np.push, np.email
      INTO v_old_note
      FROM public.notification_preferences np
      WHERE np.user_id = p_profile_id AND np.category = v_category_name;
      IF NOT FOUND
         OR v_old_note.in_app IS DISTINCT FROM v_in_app
         OR v_old_note.push IS DISTINCT FROM v_push
         OR v_old_note.email IS DISTINCT FROM v_email_on THEN
        v_notes_before := v_notes_before || jsonb_build_array(jsonb_build_object(
          'category', v_category_name,
          'in_app', v_old_note.in_app,
          'push', v_old_note.push,
          'email', v_old_note.email
        ));
        v_notes_after := v_notes_after || jsonb_build_array(jsonb_build_object(
          'category', v_category_name,
          'in_app', v_in_app,
          'push', v_push,
          'email', v_email_on
        ));
        INSERT INTO public.notification_preferences (user_id, category, in_app, push, email, updated_at)
        VALUES (p_profile_id, v_category_name, v_in_app, v_push, v_email_on, now())
        ON CONFLICT (user_id, category) DO UPDATE
        SET in_app = EXCLUDED.in_app,
            push = EXCLUDED.push,
            email = EXCLUDED.email,
            updated_at = now();
      END IF;
    END LOOP;
    IF v_notes_before <> '[]'::jsonb THEN
      v_before := v_before || jsonb_build_object('notifications', v_notes_before);
      v_after := v_after || jsonb_build_object('notifications', v_notes_after);
    END IF;
  END IF;

  IF p_patch ? 'projects' THEN
    IF jsonb_typeof(p_patch->'projects') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Projects must be a list.';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_patch->'projects') LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR nullif(v_item->>'project_id', '') IS NULL THEN
        RAISE EXCEPTION 'Each project needs a project id.';
      END IF;
      v_project_id := (v_item->>'project_id')::uuid;
      SELECT
        pr.title,
        pr.description,
        pr.category_id,
        pr.city,
        pr.state,
        pr.zip_code,
        pr.timing::text,
        pr.preferred_date,
        loc.street_line1,
        loc.street_line2
      INTO v_title, v_description, v_category, v_city, v_state, v_zip, v_timing, v_preferred, v_street1, v_street2
      FROM public.projects pr
      LEFT JOIN public.project_private_locations loc ON loc.project_id = pr.id
      WHERE pr.id = v_project_id AND pr.customer_id = p_profile_id
      FOR UPDATE OF pr;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'That project is not on this account.';
      END IF;
      v_project_before := jsonb_build_object(
        'project_id', v_project_id,
        'title', v_title,
        'description', v_description,
        'category_id', v_category,
        'city', v_city,
        'state', v_state,
        'zip_code', v_zip,
        'timing', v_timing,
        'preferred_date', v_preferred,
        'street_line1', v_street1,
        'street_line2', v_street2
      );

      IF v_item ? 'title' THEN
        v_title := public.admin_require_public_plain_text('project title', v_item->>'title', 120);
        IF v_title IS NULL THEN
          RAISE EXCEPTION 'Enter a project title.';
        END IF;
      END IF;
      IF v_item ? 'description' THEN
        v_description := coalesce(public.admin_require_public_plain_text('project description', v_item->>'description', 4000), '');
      END IF;
      IF v_item ? 'category_id' THEN
        IF nullif(v_item->>'category_id', '') IS NULL THEN
          v_category := NULL;
        ELSE
          v_category := (v_item->>'category_id')::uuid;
          IF NOT EXISTS (SELECT 1 FROM public.service_categories sc WHERE sc.id = v_category) THEN
            RAISE EXCEPTION 'Choose a service category.';
          END IF;
        END IF;
      END IF;
      IF v_item ? 'city' THEN
        v_city := public.normalize_city(v_item->>'city');
      END IF;
      IF v_item ? 'state' THEN
        v_state := public.normalize_us_state(v_item->>'state');
      END IF;
      IF v_item ? 'zip_code' THEN
        v_zip := public.admin_require_zip(v_item->>'zip_code');
      END IF;
      IF v_item ? 'timing' THEN
        v_timing := nullif(upper(btrim(coalesce(v_item->>'timing', ''))), '');
        IF v_timing IS NOT NULL AND v_timing NOT IN ('ASAP', 'WITHIN_A_WEEK', 'WITHIN_A_MONTH', 'SPECIFIC_DATE', 'FLEXIBLE') THEN
          RAISE EXCEPTION 'That timeline is not valid.';
        END IF;
      END IF;
      IF v_item ? 'preferred_date' THEN
        IF nullif(v_item->>'preferred_date', '') IS NULL THEN
          v_preferred := NULL;
        ELSIF v_item->>'preferred_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
          v_preferred := (v_item->>'preferred_date')::date;
        ELSE
          RAISE EXCEPTION 'Enter a preferred date as YYYY-MM-DD.';
        END IF;
      END IF;
      IF v_timing = 'SPECIFIC_DATE' AND v_preferred IS NULL THEN
        RAISE EXCEPTION 'Enter a preferred date for a specific-date timeline.';
      END IF;
      IF v_item ? 'street_line1' THEN
        v_street1 := nullif(btrim(coalesce(v_item->>'street_line1', '')), '');
        IF v_street1 IS NOT NULL AND char_length(v_street1) > 120 THEN
          RAISE EXCEPTION 'address line 1 must be 120 characters or fewer';
        END IF;
      END IF;
      IF v_item ? 'street_line2' THEN
        v_street2 := nullif(btrim(coalesce(v_item->>'street_line2', '')), '');
        IF v_street2 IS NOT NULL AND char_length(v_street2) > 120 THEN
          RAISE EXCEPTION 'address line 2 must be 120 characters or fewer';
        END IF;
      END IF;

      UPDATE public.projects
      SET title = v_title,
          description = v_description,
          category_id = v_category,
          city = v_city,
          state = v_state,
          zip_code = v_zip,
          timing = v_timing::public.timing_preference,
          preferred_date = v_preferred
      WHERE id = v_project_id
        AND (
          title IS DISTINCT FROM v_title
          OR description IS DISTINCT FROM v_description
          OR category_id IS DISTINCT FROM v_category
          OR city IS DISTINCT FROM v_city
          OR state IS DISTINCT FROM v_state
          OR zip_code IS DISTINCT FROM v_zip
          OR timing::text IS DISTINCT FROM v_timing
          OR preferred_date IS DISTINCT FROM v_preferred
        );
      v_project_after := jsonb_build_object(
        'project_id', v_project_id,
        'title', v_title,
        'description', v_description,
        'category_id', v_category,
        'city', v_city,
        'state', v_state,
        'zip_code', v_zip,
        'timing', v_timing,
        'preferred_date', v_preferred,
        'street_line1', v_street1,
        'street_line2', v_street2
      );
      IF v_project_after IS DISTINCT FROM v_project_before THEN
        IF v_item ? 'street_line1' OR v_item ? 'street_line2' THEN
          INSERT INTO public.project_private_locations (project_id, street_line1, street_line2)
          VALUES (v_project_id, v_street1, v_street2)
          ON CONFLICT (project_id) DO UPDATE
          SET street_line1 = EXCLUDED.street_line1,
              street_line2 = EXCLUDED.street_line2;
        END IF;
        v_projects_before := v_projects_before || jsonb_build_array(v_project_before);
        v_projects_after := v_projects_after || jsonb_build_array(v_project_after);
      END IF;
    END LOOP;
    IF v_projects_before <> '[]'::jsonb THEN
      v_before := v_before || jsonb_build_object('projects', v_projects_before);
      v_after := v_after || jsonb_build_object('projects', v_projects_after);
    END IF;
  END IF;

  IF v_before = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nothing to change.';
  END IF;
  PERFORM public.write_audit_log(
    auth.uid(),
    'admin.customer_profile_updated',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'reason', v_reason,
      'before', public.admin_audit_json(NULL, v_before),
      'after', public.admin_audit_json(NULL, v_after)
    )
  );
  RETURN public.admin_get_customer_editor(p_profile_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_get_contractor_editor(p_contractor_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_cp uuid;
  v_profile uuid;
BEGIN
  PERFORM public.admin_require();
  SELECT cp.id, cp.profile_id
  INTO v_cp, v_profile
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE cp.id = p_contractor_profile_id
    AND p.account_type::text = 'CONTRACTOR';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contractor not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'contractor_profile_id', cp.id,
      'profile_id', p.id,
      'business_name', cp.business_name,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'email', p.email,
      'phone', p.phone,
      'avatar_url', p.avatar_url,
      'bio', cp.bio,
      'headline', cp.headline,
      'primary_trade', cp.primary_trade,
      'license_number', cp.license_number,
      'insurance_carrier', cp.insurance_carrier,
      'approval_status', cp.approval_status::text,
      'account_status', p.account_status::text,
      'directory_hidden', cp.directory_hidden,
      'directory_listed', public.contractor_is_directory_listed(cp.id),
      'services', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('category_id', sc.id, 'name', sc.name) ORDER BY sc.name), '[]'::jsonb)
        FROM public.contractor_services cs
        JOIN public.service_categories sc ON sc.id = cs.category_id
        WHERE cs.contractor_profile_id = cp.id
      ),
      'service_areas', (
        SELECT coalesce(jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'mode', a.mode::text,
            'label', a.label,
            'center_zip', a.center_zip,
            'radius_miles', a.radius_miles,
            'zip_codes', to_jsonb(a.zip_codes)
          )
          ORDER BY a.created_at, a.id
        ), '[]'::jsonb)
        FROM public.contractor_service_areas a
        WHERE a.contractor_profile_id = cp.id
      ),
      'credentials', (
        SELECT coalesce(jsonb_agg(
          jsonb_build_object(
            'id', cr.id,
            'kind', cr.kind,
            'label', cr.label,
            'status', cr.status::text,
            'expires_at', cr.expires_at
          )
          ORDER BY cr.created_at, cr.id
        ), '[]'::jsonb)
        FROM public.contractor_credentials cr
        WHERE cr.contractor_profile_id = cp.id
      ),
      'portfolio', (
        SELECT coalesce(jsonb_agg(
          jsonb_build_object(
            'id', pf.id,
            'title', pf.title,
            'description', pf.description,
            'privacy_state', pf.privacy_state::text
          )
          ORDER BY pf.sort_order, pf.id
        ), '[]'::jsonb)
        FROM public.contractor_portfolio pf
        WHERE pf.contractor_profile_id = cp.id
      ),
      'categories', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('id', sc.id, 'name', sc.name) ORDER BY sc.name), '[]'::jsonb)
        FROM public.service_categories sc
      )
    )
    FROM public.contractor_profiles cp
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE cp.id = v_cp
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_update_contractor_profile(
  p_contractor_profile_id uuid,
  p_patch jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reason text;
  v_profile_id uuid;
  v_old_email text;
  v_old_first text;
  v_old_last text;
  v_old_phone text;
  v_old_avatar text;
  v_old_status text;
  v_account_type text;
  v_email text;
  v_first text;
  v_last text;
  v_phone text;
  v_avatar text;
  v_status text;
  v_business text;
  v_old_business text;
  v_headline text;
  v_old_headline text;
  v_bio text;
  v_old_bio text;
  v_trade text;
  v_old_trade text;
  v_license text;
  v_old_license text;
  v_insurance text;
  v_old_insurance text;
  v_approval text;
  v_old_approval text;
  v_hidden boolean;
  v_old_hidden boolean;
  v_sensitive boolean := false;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_item jsonb;
  v_ids uuid[] := '{}'::uuid[];
  v_old_ids uuid[] := '{}'::uuid[];
  v_category uuid;
  v_keep uuid[] := '{}'::uuid[];
  v_area_id uuid;
  v_mode text;
  v_label text;
  v_center text;
  v_radius numeric;
  v_zips text[] := '{}'::text[];
  v_zip_text text;
  v_zip text;
  v_old_json jsonb;
  v_new_json jsonb;
  v_row_before jsonb;
  v_kind text;
  v_cred_label text;
  v_cred_status text;
  v_expires date;
  v_privacy text;
  v_title text;
  v_description text;
BEGIN
  PERFORM public.admin_require();
  PERFORM public.ppp_set_rpc('admin_update_contractor_profile');
  v_reason := public.admin_profile_edit_reason(p_reason);
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Profile changes must be an object.';
  END IF;
  IF p_patch ? 'account_type' THEN
    RAISE EXCEPTION 'Account type is not editable here.';
  END IF;
  PERFORM public.admin_reject_money_patch(p_patch);

  SELECT
    cp.profile_id,
    cp.business_name,
    cp.headline,
    cp.bio,
    cp.primary_trade,
    cp.license_number,
    cp.insurance_carrier,
    cp.approval_status::text,
    cp.directory_hidden,
    p.email,
    p.first_name,
    p.last_name,
    p.phone,
    p.avatar_url,
    p.account_status::text,
    p.account_type::text
  INTO
    v_profile_id, v_old_business, v_old_headline, v_old_bio, v_old_trade, v_old_license, v_old_insurance,
    v_old_approval, v_old_hidden, v_old_email, v_old_first, v_old_last, v_old_phone, v_old_avatar, v_old_status, v_account_type
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE cp.id = p_contractor_profile_id
  FOR UPDATE OF cp, p;
  IF NOT FOUND OR v_account_type IS DISTINCT FROM 'CONTRACTOR' THEN
    RAISE EXCEPTION 'contractor not found' USING ERRCODE = 'P0002';
  END IF;

  v_business := v_old_business;
  v_headline := v_old_headline;
  v_bio := v_old_bio;
  v_trade := v_old_trade;
  v_license := v_old_license;
  v_insurance := v_old_insurance;
  v_approval := v_old_approval;
  v_hidden := v_old_hidden;
  v_email := lower(btrim(v_old_email));
  v_first := v_old_first;
  v_last := v_old_last;
  v_phone := v_old_phone;
  v_avatar := v_old_avatar;
  v_status := v_old_status;

  IF p_patch ? 'business_name' THEN
    v_business := coalesce(public.admin_require_public_plain_text('business name', p_patch->>'business_name', 80), '');
  END IF;
  IF p_patch ? 'headline' THEN
    v_headline := public.admin_require_public_plain_text('headline', p_patch->>'headline', 120);
  END IF;
  IF p_patch ? 'bio' THEN
    v_bio := public.admin_require_public_plain_text('bio', p_patch->>'bio', 2000);
  END IF;
  IF p_patch ? 'primary_trade' THEN
    v_trade := public.admin_require_public_plain_text('primary trade', p_patch->>'primary_trade', 80);
  END IF;
  IF p_patch ? 'license_number' THEN
    v_license := nullif(btrim(coalesce(p_patch->>'license_number', '')), '');
    IF v_license IS NOT NULL AND char_length(v_license) > 80 THEN
      RAISE EXCEPTION 'license number must be 80 characters or fewer';
    END IF;
  END IF;
  IF p_patch ? 'insurance_carrier' THEN
    v_insurance := public.admin_require_public_plain_text('insurance carrier', p_patch->>'insurance_carrier', 120);
  END IF;
  IF p_patch ? 'first_name' THEN
    v_first := public.admin_require_public_plain_text('first name', p_patch->>'first_name', 80);
    IF v_first IS NULL THEN
      RAISE EXCEPTION 'Enter a first name.';
    END IF;
  END IF;
  IF p_patch ? 'last_name' THEN
    v_last := public.admin_require_public_plain_text('last name', p_patch->>'last_name', 80);
    IF v_last IS NULL THEN
      RAISE EXCEPTION 'Enter a last name.';
    END IF;
  END IF;
  IF p_patch ? 'avatar_url' THEN
    v_avatar := public.admin_normalize_avatar(p_patch->>'avatar_url');
  END IF;
  IF p_patch ? 'email' THEN
    v_email := public.admin_normalize_email(p_patch->>'email');
    IF v_email IS DISTINCT FROM lower(btrim(v_old_email)) THEN
      v_sensitive := true;
    END IF;
  END IF;
  IF p_patch ? 'phone' THEN
    v_phone := public.admin_normalize_phone(p_patch->>'phone');
    IF v_phone IS DISTINCT FROM v_old_phone THEN
      v_sensitive := true;
    END IF;
  END IF;
  IF p_patch ? 'account_status' THEN
    v_status := upper(btrim(coalesce(p_patch->>'account_status', '')));
    IF v_status NOT IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED') THEN
      RAISE EXCEPTION 'That account status is not valid.';
    END IF;
    IF v_status IS DISTINCT FROM v_old_status THEN
      v_sensitive := true;
    END IF;
  END IF;
  IF p_patch ? 'approval_status' THEN
    v_approval := upper(btrim(coalesce(p_patch->>'approval_status', '')));
    IF v_approval NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED') THEN
      RAISE EXCEPTION 'That approval status is not valid.';
    END IF;
    IF v_approval IS DISTINCT FROM v_old_approval THEN
      v_sensitive := true;
    END IF;
  END IF;
  IF p_patch ? 'directory_hidden' THEN
    IF jsonb_typeof(p_patch->'directory_hidden') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Directory visibility must be true or false.';
    END IF;
    v_hidden := (p_patch->>'directory_hidden')::boolean;
    IF v_hidden IS DISTINCT FROM v_old_hidden THEN
      v_sensitive := true;
    END IF;
  END IF;
  IF v_sensitive THEN
    PERFORM public.admin_profile_edit_step_up();
  END IF;

  IF v_email IS DISTINCT FROM lower(btrim(v_old_email)) THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles other
      WHERE other.id <> v_profile_id AND lower(other.email) = v_email
    ) OR EXISTS (
      SELECT 1 FROM auth.users other
      WHERE other.id <> v_profile_id AND lower(other.email) = v_email
    ) THEN
      RAISE EXCEPTION 'That email is already in use.';
    END IF;
    BEGIN
      -- Server-side sign-in email change. Clears any pending self-service change
      -- so an old confirmation link cannot undo the correction.
      UPDATE auth.users
      SET email = v_email,
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          email_change = '',
          email_change_token_new = '',
          email_change_token_current = '',
          email_change_confirm_status = 0,
          updated_at = now()
      WHERE id = v_profile_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'That account has no sign-in record.';
      END IF;
      UPDATE auth.identities
      SET identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_email),
          updated_at = now()
      WHERE user_id = v_profile_id AND provider = 'email';
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'That email is already in use.';
    END;
    v_before := v_before || jsonb_build_object('email', v_old_email);
    v_after := v_after || jsonb_build_object('email', v_email);
  END IF;

  IF v_first IS DISTINCT FROM v_old_first
     OR v_last IS DISTINCT FROM v_old_last
     OR v_phone IS DISTINCT FROM v_old_phone
     OR v_avatar IS DISTINCT FROM v_old_avatar
     OR v_status IS DISTINCT FROM v_old_status
     OR v_email IS DISTINCT FROM lower(btrim(v_old_email)) THEN
    UPDATE public.profiles
    SET first_name = v_first,
        last_name = v_last,
        phone = v_phone,
        avatar_url = v_avatar,
        email = v_email,
        account_status = v_status::public.account_status
    WHERE id = v_profile_id;
  END IF;
  IF v_first IS DISTINCT FROM v_old_first THEN
    v_before := v_before || jsonb_build_object('first_name', v_old_first);
    v_after := v_after || jsonb_build_object('first_name', v_first);
  END IF;
  IF v_last IS DISTINCT FROM v_old_last THEN
    v_before := v_before || jsonb_build_object('last_name', v_old_last);
    v_after := v_after || jsonb_build_object('last_name', v_last);
  END IF;
  IF v_phone IS DISTINCT FROM v_old_phone THEN
    v_before := v_before || jsonb_build_object('phone', v_old_phone);
    v_after := v_after || jsonb_build_object('phone', v_phone);
  END IF;
  IF v_avatar IS DISTINCT FROM v_old_avatar THEN
    v_before := v_before || jsonb_build_object('avatar_url', v_old_avatar);
    v_after := v_after || jsonb_build_object('avatar_url', v_avatar);
  END IF;
  IF v_status IS DISTINCT FROM v_old_status THEN
    v_before := v_before || jsonb_build_object('account_status', v_old_status);
    v_after := v_after || jsonb_build_object('account_status', v_status);
  END IF;

  IF v_business IS DISTINCT FROM v_old_business
     OR v_headline IS DISTINCT FROM v_old_headline
     OR v_bio IS DISTINCT FROM v_old_bio
     OR v_trade IS DISTINCT FROM v_old_trade
     OR v_license IS DISTINCT FROM v_old_license
     OR v_insurance IS DISTINCT FROM v_old_insurance
     OR v_approval IS DISTINCT FROM v_old_approval
     OR v_hidden IS DISTINCT FROM v_old_hidden THEN
    -- Re-mark the call: profile triggers above can run matching code that sets
    -- its own marker, and the approval/visibility guard reads this one.
    PERFORM public.ppp_set_rpc('admin_update_contractor_profile');
    UPDATE public.contractor_profiles
    SET business_name = v_business,
        headline = v_headline,
        bio = v_bio,
        primary_trade = v_trade,
        license_number = v_license,
        insurance_carrier = v_insurance,
        directory_hidden = v_hidden,
        approval_status = v_approval::public.approval_status,
        approved_at = CASE
          WHEN v_approval = 'APPROVED' AND approval_status::text IS DISTINCT FROM 'APPROVED' THEN now()
          ELSE approved_at
        END,
        approved_by = CASE
          WHEN v_approval = 'APPROVED' AND approval_status::text IS DISTINCT FROM 'APPROVED' THEN auth.uid()
          ELSE approved_by
        END,
        rejected_at = CASE
          WHEN v_approval = 'REJECTED' AND approval_status::text IS DISTINCT FROM 'REJECTED' THEN now()
          ELSE rejected_at
        END,
        rejected_by = CASE
          WHEN v_approval = 'REJECTED' AND approval_status::text IS DISTINCT FROM 'REJECTED' THEN auth.uid()
          ELSE rejected_by
        END
    WHERE id = p_contractor_profile_id;
  END IF;
  IF v_business IS DISTINCT FROM v_old_business THEN
    v_before := v_before || jsonb_build_object('business_name', v_old_business);
    v_after := v_after || jsonb_build_object('business_name', v_business);
  END IF;
  IF v_headline IS DISTINCT FROM v_old_headline THEN
    v_before := v_before || jsonb_build_object('headline', v_old_headline);
    v_after := v_after || jsonb_build_object('headline', v_headline);
  END IF;
  IF v_bio IS DISTINCT FROM v_old_bio THEN
    v_before := v_before || jsonb_build_object('bio', v_old_bio);
    v_after := v_after || jsonb_build_object('bio', v_bio);
  END IF;
  IF v_trade IS DISTINCT FROM v_old_trade THEN
    v_before := v_before || jsonb_build_object('primary_trade', v_old_trade);
    v_after := v_after || jsonb_build_object('primary_trade', v_trade);
  END IF;
  IF v_license IS DISTINCT FROM v_old_license THEN
    v_before := v_before || jsonb_build_object('license_number', v_old_license);
    v_after := v_after || jsonb_build_object('license_number', v_license);
  END IF;
  IF v_insurance IS DISTINCT FROM v_old_insurance THEN
    v_before := v_before || jsonb_build_object('insurance_carrier', v_old_insurance);
    v_after := v_after || jsonb_build_object('insurance_carrier', v_insurance);
  END IF;
  IF v_approval IS DISTINCT FROM v_old_approval THEN
    v_before := v_before || jsonb_build_object('approval_status', v_old_approval);
    v_after := v_after || jsonb_build_object('approval_status', v_approval);
  END IF;
  IF v_hidden IS DISTINCT FROM v_old_hidden THEN
    v_before := v_before || jsonb_build_object('directory_hidden', v_old_hidden);
    v_after := v_after || jsonb_build_object('directory_hidden', v_hidden);
  END IF;

  IF p_patch ? 'service_category_ids' THEN
    IF jsonb_typeof(p_patch->'service_category_ids') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Services must be a list.';
    END IF;
    SELECT coalesce(array_agg(cs.category_id ORDER BY cs.category_id), '{}'::uuid[])
    INTO v_old_ids
    FROM public.contractor_services cs
    WHERE cs.contractor_profile_id = p_contractor_profile_id;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_patch->'service_category_ids') LOOP
      v_category := (v_item #>> '{}')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.service_categories sc WHERE sc.id = v_category) THEN
        RAISE EXCEPTION 'Choose a service category.';
      END IF;
      IF NOT (v_category = ANY (v_ids)) THEN
        v_ids := v_ids || v_category;
      END IF;
    END LOOP;
    IF v_ids IS DISTINCT FROM v_old_ids THEN
      DELETE FROM public.contractor_services
      WHERE contractor_profile_id = p_contractor_profile_id
        AND NOT (category_id = ANY (v_ids));
      INSERT INTO public.contractor_services (contractor_profile_id, category_id)
      SELECT p_contractor_profile_id, cid
      FROM unnest(v_ids) AS cid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.contractor_services cs
        WHERE cs.contractor_profile_id = p_contractor_profile_id AND cs.category_id = cid
      );
      v_before := v_before || jsonb_build_object('service_category_ids', to_jsonb(v_old_ids));
      v_after := v_after || jsonb_build_object('service_category_ids', to_jsonb(v_ids));
    END IF;
  END IF;

  IF p_patch ? 'service_areas' THEN
    IF jsonb_typeof(p_patch->'service_areas') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Service areas must be a list.';
    END IF;
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'id', a.id, 'mode', a.mode::text, 'label', a.label, 'center_zip', a.center_zip,
        'radius_miles', a.radius_miles, 'zip_codes', to_jsonb(a.zip_codes)
      ) ORDER BY a.created_at, a.id
    ), '[]'::jsonb)
    INTO v_old_json
    FROM public.contractor_service_areas a
    WHERE a.contractor_profile_id = p_contractor_profile_id;
    v_keep := '{}'::uuid[];
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_patch->'service_areas') LOOP
      v_mode := upper(btrim(coalesce(v_item->>'mode', '')));
      IF v_mode NOT IN ('ZIPS', 'RADIUS', 'ZIPS_AND_RADIUS') THEN
        RAISE EXCEPTION 'That service area mode is not valid.';
      END IF;
      v_label := public.admin_require_public_plain_text('service area', v_item->>'label', 120);
      v_center := public.admin_require_zip(v_item->>'center_zip');
      IF nullif(v_item->>'radius_miles', '') IS NULL THEN
        v_radius := NULL;
      ELSIF btrim(v_item->>'radius_miles') ~ '^[0-9]+(\.[0-9]+)?$' THEN
        v_radius := btrim(v_item->>'radius_miles')::numeric;
      ELSE
        RAISE EXCEPTION 'Enter a radius between 1 and 200 miles.';
      END IF;
      IF v_mode IN ('RADIUS', 'ZIPS_AND_RADIUS') AND (v_radius IS NULL OR v_radius <= 0 OR v_radius > 200) THEN
        RAISE EXCEPTION 'Enter a radius between 1 and 200 miles.';
      END IF;
      IF v_mode = 'ZIPS' THEN
        v_radius := NULL;
      END IF;
      IF v_mode IN ('RADIUS', 'ZIPS_AND_RADIUS') AND v_center IS NULL THEN
        RAISE EXCEPTION 'Enter a 5-digit ZIP code.';
      END IF;
      v_zips := '{}'::text[];
      IF v_item ? 'zip_codes' AND jsonb_typeof(v_item->'zip_codes') IS DISTINCT FROM 'null' THEN
        IF jsonb_typeof(v_item->'zip_codes') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'ZIP codes must be a list.';
        END IF;
        FOR v_zip_text IN SELECT value FROM jsonb_array_elements_text(v_item->'zip_codes') LOOP
          v_zip := public.admin_require_zip(v_zip_text);
          IF v_zip IS NULL THEN
            RAISE EXCEPTION 'Enter a 5-digit ZIP code.';
          END IF;
          v_zips := v_zips || v_zip;
        END LOOP;
      END IF;
      IF cardinality(v_zips) > 40 THEN
        RAISE EXCEPTION 'Enter 40 ZIP codes or fewer.';
      END IF;
      IF v_mode IN ('ZIPS', 'ZIPS_AND_RADIUS') AND cardinality(v_zips) = 0 THEN
        RAISE EXCEPTION 'Enter a 5-digit ZIP code.';
      END IF;
      v_area_id := NULL;
      IF nullif(v_item->>'id', '') IS NOT NULL THEN
        v_area_id := (v_item->>'id')::uuid;
        UPDATE public.contractor_service_areas
        SET mode = v_mode::public.service_area_mode,
            label = v_label,
            center_zip = v_center,
            radius_miles = v_radius,
            zip_codes = v_zips
        WHERE id = v_area_id AND contractor_profile_id = p_contractor_profile_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'That service area is not on this account.';
        END IF;
      ELSE
        INSERT INTO public.contractor_service_areas (
          contractor_profile_id, mode, label, center_zip, radius_miles, zip_codes
        )
        VALUES (
          p_contractor_profile_id, v_mode::public.service_area_mode, v_label, v_center, v_radius, v_zips
        )
        RETURNING id INTO v_area_id;
      END IF;
      v_keep := v_keep || v_area_id;
    END LOOP;
    DELETE FROM public.contractor_service_areas
    WHERE contractor_profile_id = p_contractor_profile_id
      AND NOT (id = ANY (v_keep));
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'id', a.id, 'mode', a.mode::text, 'label', a.label, 'center_zip', a.center_zip,
        'radius_miles', a.radius_miles, 'zip_codes', to_jsonb(a.zip_codes)
      ) ORDER BY a.created_at, a.id
    ), '[]'::jsonb)
    INTO v_new_json
    FROM public.contractor_service_areas a
    WHERE a.contractor_profile_id = p_contractor_profile_id;
    IF v_new_json IS DISTINCT FROM v_old_json THEN
      v_before := v_before || jsonb_build_object('service_areas', v_old_json);
      v_after := v_after || jsonb_build_object('service_areas', v_new_json);
    END IF;
  END IF;

  IF p_patch ? 'credentials' THEN
    IF jsonb_typeof(p_patch->'credentials') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Credentials must be a list.';
    END IF;
    v_old_json := '[]'::jsonb;
    v_new_json := '[]'::jsonb;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_patch->'credentials') LOOP
      v_area_id := (v_item->>'id')::uuid;
      SELECT cr.kind, cr.label, cr.status::text, cr.expires_at
      INTO v_kind, v_cred_label, v_cred_status, v_expires
      FROM public.contractor_credentials cr
      WHERE cr.id = v_area_id AND cr.contractor_profile_id = p_contractor_profile_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'That credential is not on this account.';
      END IF;
      v_row_before := jsonb_build_object(
        'id', v_area_id, 'kind', v_kind, 'label', v_cred_label, 'status', v_cred_status, 'expires_at', v_expires
      );
      IF v_item ? 'kind' THEN
        v_kind := upper(btrim(coalesce(v_item->>'kind', '')));
        IF v_kind NOT IN ('LICENSE', 'INSURANCE', 'OTHER') THEN
          RAISE EXCEPTION 'That credential kind is not valid.';
        END IF;
      END IF;
      IF v_item ? 'label' THEN
        v_cred_label := public.admin_require_public_plain_text('credential label', v_item->>'label', 120);
        IF v_cred_label IS NULL THEN
          RAISE EXCEPTION 'Enter a credential label.';
        END IF;
      END IF;
      IF v_item ? 'status' THEN
        v_cred_status := upper(btrim(coalesce(v_item->>'status', '')));
        IF v_cred_status NOT IN ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED') THEN
          RAISE EXCEPTION 'That credential status is not valid.';
        END IF;
      END IF;
      -- Credential verification status drives public badges; treat it as a #110 sensitive change.
      IF v_cred_status IS DISTINCT FROM (v_row_before->>'status') THEN
        PERFORM public.admin_profile_edit_step_up();
      END IF;
      IF v_item ? 'expires_at' THEN
        IF nullif(v_item->>'expires_at', '') IS NULL THEN
          v_expires := NULL;
        ELSIF v_item->>'expires_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
          v_expires := (v_item->>'expires_at')::date;
        ELSE
          RAISE EXCEPTION 'Enter an expiration date as YYYY-MM-DD.';
        END IF;
      END IF;
      UPDATE public.contractor_credentials
      SET kind = v_kind,
          label = v_cred_label,
          status = v_cred_status::public.credential_status,
          expires_at = v_expires
      WHERE id = v_area_id
        AND (
          kind IS DISTINCT FROM v_kind
          OR label IS DISTINCT FROM v_cred_label
          OR status::text IS DISTINCT FROM v_cred_status
          OR expires_at IS DISTINCT FROM v_expires
        );
      IF v_row_before IS DISTINCT FROM jsonb_build_object(
        'id', v_area_id, 'kind', v_kind, 'label', v_cred_label, 'status', v_cred_status, 'expires_at', v_expires
      ) THEN
        v_old_json := v_old_json || jsonb_build_array(v_row_before);
        v_new_json := v_new_json || jsonb_build_array(jsonb_build_object(
          'id', v_area_id, 'kind', v_kind, 'label', v_cred_label, 'status', v_cred_status, 'expires_at', v_expires
        ));
      END IF;
    END LOOP;
    IF v_old_json <> '[]'::jsonb THEN
      v_before := v_before || jsonb_build_object('credentials', v_old_json);
      v_after := v_after || jsonb_build_object('credentials', v_new_json);
    END IF;
  END IF;

  IF p_patch ? 'portfolio' THEN
    IF jsonb_typeof(p_patch->'portfolio') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Portfolio photos must be a list.';
    END IF;
    v_old_json := '[]'::jsonb;
    v_new_json := '[]'::jsonb;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_patch->'portfolio') LOOP
      v_area_id := (v_item->>'id')::uuid;
      SELECT pf.title, pf.description, pf.privacy_state::text
      INTO v_title, v_description, v_privacy
      FROM public.contractor_portfolio pf
      WHERE pf.id = v_area_id AND pf.contractor_profile_id = p_contractor_profile_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'That portfolio photo is not on this account.';
      END IF;
      v_row_before := jsonb_build_object(
        'id', v_area_id, 'title', v_title, 'description', v_description, 'privacy_state', v_privacy
      );
      IF v_item ? 'title' THEN
        v_title := coalesce(public.admin_require_public_plain_text('portfolio caption', v_item->>'title', 120), '');
      END IF;
      IF v_item ? 'description' THEN
        v_description := public.admin_require_public_plain_text('portfolio description', v_item->>'description', 2000);
      END IF;
      IF v_item ? 'privacy_state' THEN
        v_privacy := upper(btrim(coalesce(v_item->>'privacy_state', '')));
        IF v_privacy NOT IN ('PUBLIC_SAFE', 'PRIVATE', 'REVIEW_REQUIRED') THEN
          RAISE EXCEPTION 'That photo approval state is not valid.';
        END IF;
      END IF;
      -- Photo approval state is a #110 sensitive action (same as the review screen).
      IF v_privacy IS DISTINCT FROM (v_row_before->>'privacy_state') THEN
        PERFORM public.admin_profile_edit_step_up();
      END IF;
      UPDATE public.contractor_portfolio
      SET title = v_title,
          description = v_description,
          privacy_state = v_privacy::public.portfolio_privacy_state
      WHERE id = v_area_id
        AND (
          title IS DISTINCT FROM v_title
          OR description IS DISTINCT FROM v_description
          OR privacy_state::text IS DISTINCT FROM v_privacy
        );
      IF v_row_before IS DISTINCT FROM jsonb_build_object(
        'id', v_area_id, 'title', v_title, 'description', v_description, 'privacy_state', v_privacy
      ) THEN
        v_old_json := v_old_json || jsonb_build_array(v_row_before);
        v_new_json := v_new_json || jsonb_build_array(jsonb_build_object(
          'id', v_area_id, 'title', v_title, 'description', v_description, 'privacy_state', v_privacy
        ));
      END IF;
    END LOOP;
    IF v_old_json <> '[]'::jsonb THEN
      v_before := v_before || jsonb_build_object('portfolio', v_old_json);
      v_after := v_after || jsonb_build_object('portfolio', v_new_json);
    END IF;
  END IF;

  IF v_before = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nothing to change.';
  END IF;
  PERFORM public.write_audit_log(
    auth.uid(),
    'admin.contractor_profile_updated',
    'contractor_profile',
    p_contractor_profile_id,
    jsonb_build_object(
      'reason', v_reason,
      'profile_id', v_profile_id,
      'before', public.admin_audit_json(NULL, v_before),
      'after', public.admin_audit_json(NULL, v_after)
    )
  );
  RETURN public.admin_get_contractor_editor(p_contractor_profile_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_profile_edit_step_up() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_profile_edit_reason(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_normalize_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_normalize_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_normalize_avatar(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_require_public_plain_text(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_require_zip(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reject_money_patch(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_audit_text(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_audit_json(text, jsonb) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_get_customer_editor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_customer_profile(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_contractor_editor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_contractor_profile(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_customer_editor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_customer_profile(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_contractor_editor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_contractor_profile(uuid, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.admin_update_customer_profile(uuid, jsonb, text) IS
  'Admin-only customer correction. Changes the sign-in email and the profile together, writes an audit row, and refuses fee or payment keys.';
COMMENT ON FUNCTION public.admin_update_contractor_profile(uuid, jsonb, text) IS
  'Admin-only contractor correction. Sensitive fields call admin_profile_edit_step_up (PR #110 step-up when deployed). Does not write fee status, amounts, or processor ids. Replacing services or service areas removes omitted rows.';

-- Public directory rows also honor directory_hidden. Fee checks stay as they were.
-- The list function below is the previous body plus the hidden flag. It still
-- returns no business name, email, contact number, house address, or license.

CREATE OR REPLACE VIEW public.contractor_public_profiles
WITH (security_invoker = false)
AS
SELECT
  cp.id,
  public.public_directory_label(cp.id) AS display_label,
  public.public_directory_primary_trade(cp.id) AS primary_trade,
  cp.years_experience,
  public.public_safe_blurb(cp.headline, cp.bio) AS short_description,
  public.public_safe_about(cp.bio, cp.headline) AS about,
  cp.accepting_work,
  cp.created_at,
  coalesce(
    public.contractor_public_service_label(cp.id),
    'Local service area'
  ) AS service_area
FROM public.contractor_profiles cp
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND NOT cp.directory_hidden
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

CREATE OR REPLACE VIEW public.contractor_public_services
WITH (security_invoker = false)
AS
SELECT
  cs.id,
  cs.contractor_profile_id,
  cs.category_id,
  sc.slug AS category_slug,
  sc.name AS category_name
FROM public.contractor_services cs
JOIN public.contractor_profiles cp ON cp.id = cs.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
JOIN public.service_categories sc ON sc.id = cs.category_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND NOT cp.directory_hidden
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'))
  AND NOT public.public_service_is_other(sc.name)
  AND (
    btrim(cp.business_name) = ''
    OR lower(btrim(sc.name)) IS DISTINCT FROM lower(btrim(cp.business_name))
  );

-- Rebuilt at deploy from the LIVE definition (includes #116 hidden_at filter + contractor_response); only change: NOT cp.directory_hidden.
CREATE OR REPLACE VIEW public.contractor_public_reviews
WITH (security_invoker = false)
AS
SELECT r.id,
    r.contractor_profile_id,
    r.rating,
    public_review_body(r.body, cp.business_name, p.first_name, p.last_name) AS body,
        CASE
            WHEN r.contractor_response_hidden_at IS NOT NULL THEN NULL::text
            WHEN r.contractor_response IS NULL OR btrim(r.contractor_response) = ''::text THEN NULL::text
            WHEN text_contains_contact_info(r.contractor_response) THEN NULL::text
            ELSE public_review_body(r.contractor_response, cp.business_name, p.first_name, p.last_name)
        END AS contractor_response
   FROM booking_reviews r
     JOIN contractor_profiles cp ON cp.id = r.contractor_profile_id
     JOIN profiles p ON p.id = cp.profile_id
  WHERE r.is_verified = true AND r.reviewer_role = 'CUSTOMER'::text AND r.hidden_at IS NULL AND cp.approval_status = 'APPROVED'::approval_status AND NOT cp.directory_hidden AND p.account_status = 'ACTIVE'::account_status AND (NOT signup_fee_enabled() OR (p.signup_fee_status = ANY (ARRAY['PAID'::signup_fee_status, 'NOT_REQUIRED'::signup_fee_status])) OR (p.account_type <> ALL (ARRAY['CUSTOMER'::account_type, 'CONTRACTOR'::account_type])));

CREATE OR REPLACE VIEW public.contractor_public_areas
WITH (security_invoker = false)
AS
SELECT
  a.id,
  a.contractor_profile_id,
  coalesce(
    public.contractor_public_service_label(a.contractor_profile_id),
    public.general_service_area(cp.service_area)
  ) AS label
FROM public.contractor_service_areas a
JOIN public.contractor_profiles cp ON cp.id = a.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND NOT cp.directory_hidden
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

CREATE OR REPLACE VIEW public.contractor_public_portfolio
WITH (security_invoker = false)
AS
SELECT
  pf.id,
  pf.contractor_profile_id,
  pf.sort_order,
  public.public_safe_portfolio_caption(pf.title, pf.description) AS caption
FROM public.contractor_portfolio pf
JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE pf.privacy_state = 'PUBLIC_SAFE'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND NOT cp.directory_hidden
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'))
  AND NOT public.text_contains_pre_hire_contact(pf.title)
  AND NOT public.text_contains_pre_hire_contact(coalesce(pf.description, ''));

-- Rebuilt at deploy from the LIVE definition (includes #116 hidden_at filter + contractor_response); only change: NOT cp.directory_hidden.
CREATE OR REPLACE VIEW public.contractor_public_ratings
WITH (security_invoker = false)
AS
SELECT r.contractor_profile_id,
    round(avg(r.rating), 1) AS rating_average,
    count(*)::integer AS rating_count
   FROM booking_reviews r
     JOIN contractor_profiles cp ON cp.id = r.contractor_profile_id
     JOIN profiles p ON p.id = cp.profile_id
  WHERE r.is_verified = true AND r.reviewer_role = 'CUSTOMER'::text AND r.hidden_at IS NULL AND cp.approval_status = 'APPROVED'::approval_status AND NOT cp.directory_hidden AND p.account_status = 'ACTIVE'::account_status AND (NOT signup_fee_enabled() OR (p.signup_fee_status = ANY (ARRAY['PAID'::signup_fee_status, 'NOT_REQUIRED'::signup_fee_status])) OR (p.account_type <> ALL (ARRAY['CUSTOMER'::account_type, 'CONTRACTOR'::account_type])))
  GROUP BY r.contractor_profile_id;

CREATE OR REPLACE FUNCTION public.list_public_directory_contractors()
RETURNS TABLE (
  id uuid,
  display_label text,
  primary_trade text,
  categories text[],
  service_area text,
  years_experience integer,
  rating_average numeric,
  rating_count integer,
  badges jsonb,
  short_description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.id,
    public.public_directory_label(cp.id),
    public.public_directory_primary_trade(cp.id),
    public.public_directory_categories(cp.id),
    coalesce(
      public.contractor_public_service_label(cp.id),
      'Local service area'
    ),
    cp.years_experience,
    r.rating_average,
    coalesce(r.rating_count, 0),
    (
      jsonb_build_array(jsonb_build_object('kind', 'APPROVED', 'label', 'Approved Pro'))
      || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'kind', cr.kind,
          'label', public.generic_credential_badge_label(cr.kind)
        ) ORDER BY cr.kind)
        FROM public.contractor_credentials cr
        WHERE cr.contractor_profile_id = cp.id
          AND cr.status = 'VERIFIED'
      ), '[]'::jsonb)
    ),
    public.public_safe_blurb(cp.headline, cp.bio)
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  LEFT JOIN public.contractor_public_ratings r ON r.contractor_profile_id = cp.id
  WHERE cp.approval_status = 'APPROVED'
    AND p.account_status = 'ACTIVE'
    AND NOT cp.directory_hidden
    AND public.signup_fee_is_satisfied(cp.profile_id)
  ORDER BY 2, cp.id;
$$;

REVOKE ALL ON FUNCTION public.list_public_directory_contractors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_directory_contractors() TO anon, authenticated;
GRANT SELECT ON public.contractor_public_profiles TO anon, authenticated;
GRANT SELECT ON public.contractor_public_services TO anon, authenticated;
GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;
GRANT SELECT ON public.contractor_public_areas TO anon, authenticated;
GRANT SELECT ON public.contractor_public_portfolio TO anon, authenticated;
GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;
