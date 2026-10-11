-- Sensitive-admin step-up. Does not turn enforcement on.
-- platform_settings.admin_mfa_required stays 0. This file does not UPDATE that row.
-- Does not change payments, fees, Stripe, matching, hiring, contact entitlement, or money columns.
--
-- While the flag is 0, assert_admin_sensitive_step_up() returns and existing admin work is unchanged.
-- After an owner sets the flag to 1, sensitive admin functions also require a TOTP amr
-- timestamp within 15 minutes. A token refresh does not move that timestamp.
-- Those functions are replaced in 20261019000002, from pg_get_functiondef on 2026-10-11,
-- with this assert as the only added call.
-- Future suspension and refund functions must call is_admin() and then this assert.
-- They are not created here.

CREATE OR REPLACE FUNCTION public.admin_sensitive_step_up_max_age()
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT interval '15 minutes';
$$;

COMMENT ON FUNCTION public.admin_sensitive_step_up_max_age() IS
  'Fresh TOTP window for sensitive admin actions. Not a fee, payment, or MFA on/off switch.';

REVOKE ALL ON FUNCTION public.admin_sensitive_step_up_max_age() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_sensitive_step_up_ok()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims jsonb := auth.jwt();
  v_latest bigint;
BEGIN
  -- Off means password-only admin sessions keep working. Prevents lockout
  -- before an owner has enrolled a backup authenticator and flipped the flag.
  IF NOT public.admin_mfa_required() THEN
    RETURN true;
  END IF;

  IF v_claims IS NULL OR coalesce(v_claims ->> 'aal', '') IS DISTINCT FROM 'aal2' THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(v_claims -> 'amr') IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;

  -- amr[0] is the newest method and is often token_refresh. Use the newest totp
  -- timestamp anywhere in the array. Phone and email otp are not this product's factor.
  SELECT max((entry ->> 'timestamp')::bigint)
  INTO v_latest
  FROM jsonb_array_elements(v_claims -> 'amr') AS entry
  WHERE entry ->> 'method' = 'totp'
    AND coalesce(entry ->> 'timestamp', '') ~ '^[0-9]+$';

  IF v_latest IS NULL THEN
    RETURN false;
  END IF;

  RETURN to_timestamp(v_latest) >= (now() - public.admin_sensitive_step_up_max_age());
END;
$$;

COMMENT ON FUNCTION public.admin_sensitive_step_up_ok() IS
  'True when admin MFA is off, or the signed JWT has aal2 and a totp amr timestamp inside admin_sensitive_step_up_max_age(). Does not grant admin. Does not read factor secrets.';

REVOKE ALL ON FUNCTION public.admin_sensitive_step_up_ok() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_admin_sensitive_step_up()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_sensitive_step_up_ok() THEN
    RAISE EXCEPTION 'admin step-up required'
      USING ERRCODE = 'P0001',
            HINT = 'Enter a current authenticator code. Sensitive admin actions need a code from the last 15 minutes once admin MFA is required.';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_admin_sensitive_step_up() IS
  'Call after is_admin() on approvals, rejections, contact grant and revoke, photo and review moderation, account flags, and any future suspension or refund. No-op while admin_mfa_required is 0. Not granted to clients.';

REVOKE ALL ON FUNCTION public.assert_admin_sensitive_step_up() FROM PUBLIC, anon, authenticated;
