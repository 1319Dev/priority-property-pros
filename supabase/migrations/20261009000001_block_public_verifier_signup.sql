-- Block public signup from creating VERIFIER accounts.
--
-- NOT APPLIED. This file is the migration only. It has not been run against the
-- hosted database. Apply it separately when you are ready. It does not drop
-- account_type, verifier_profiles, or any existing rows, and it does not change
-- Stripe, checkout, webhooks, prices, or fee functions.
--
-- Existing VERIFIER profiles can still sign in. New auth signups that request
-- VERIFIER are rejected by permitted_signup_account_type, which handle_new_user
-- already calls. ADMIN is still coerced to CUSTOMER.

CREATE OR REPLACE FUNCTION public.permitted_signup_account_type(requested text)
RETURNS public.account_type
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  normalized text := upper(btrim(coalesce(requested, 'CUSTOMER')));
BEGIN
  IF normalized = 'VERIFIER' THEN
    RAISE EXCEPTION 'Verifier accounts cannot be created from public signup'
      USING ERRCODE = '22023';
  END IF;

  RETURN CASE normalized
    WHEN 'CUSTOMER' THEN 'CUSTOMER'::public.account_type
    WHEN 'CONTRACTOR' THEN 'CONTRACTOR'::public.account_type
    WHEN 'ADMIN' THEN 'CUSTOMER'::public.account_type
    ELSE 'CUSTOMER'::public.account_type
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.permitted_signup_account_type(text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.permitted_signup_account_type(text) IS
  'Public signup may become CUSTOMER or CONTRACTOR. VERIFIER is rejected. ADMIN is coerced to CUSTOMER. Does not delete existing verifier rows.';
