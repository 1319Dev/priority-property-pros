-- Product policy: $9.99 account activation and $4.99 Connection Fee are non-refundable.
-- Does not flip payments_live, charges_live, signup_fee_enabled, or connection_fee_checkout_enabled.
-- Does not call Stripe. Stripe Dashboard refunds remain possible outside this app.

UPDATE public.agreements
SET is_current = false
WHERE slug = 'terms-of-use'
  AND is_current = true;

INSERT INTO public.agreements (slug, title, version, body, is_current)
VALUES (
  'terms-of-use',
  'Terms of Use',
  2,
  'Priority Property Pros is a local marketplace. PRIORITY PROPERTY PROS LLC is not the contractor. Independent contractors perform the work. By creating an account you agree to use the service lawfully and to provide accurate information. The $9.99 account activation fee is a one-time fee to open an account and is non-refundable. The $4.99 Connection Fee purchases connection access only, does not guarantee a hire or the work, and is non-refundable. There is no refund if you are not hired, the customer chooses someone else, the customer cancels, or you change your mind. PPP does not take a percentage of project payment under this model.',
  true
);

-- Dead path: cannot issue a signup or connection-fee refund from SQL.
CREATE OR REPLACE FUNCTION public.reject_signup_or_connection_fee_refund()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'non_refundable_platform_fee'
    USING HINT = 'The $9.99 account activation fee and the $4.99 Connection Fee are non-refundable. This function cannot issue a refund.';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_signup_or_connection_fee_refund() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.reject_signup_or_connection_fee_refund() IS
  'Dead path. Always raises. Signup and Connection fees are non-refundable. Stripe Dashboard refunds are outside this app.';
