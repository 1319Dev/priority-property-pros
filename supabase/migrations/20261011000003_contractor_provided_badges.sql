-- Public badge labels describe contractor-provided credentials.
-- PPP does not claim to have reviewed a license, insurance policy, or credential.

CREATE OR REPLACE FUNCTION public.generic_credential_badge_label(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(coalesce(p_kind, ''))
    WHEN 'LICENSE' THEN 'Contractor-provided license'
    WHEN 'INSURANCE' THEN 'Contractor-provided insurance'
    WHEN 'APPROVED' THEN 'Approved platform profile'
    ELSE 'Contractor-provided credential'
  END;
$$;

REVOKE ALL ON FUNCTION public.generic_credential_badge_label(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generic_credential_badge_label(text) TO anon, authenticated;

COMMENT ON FUNCTION public.generic_credential_badge_label(text) IS
  'Public badge wording. Contractor-provided credentials are not a PPP verification claim.';
