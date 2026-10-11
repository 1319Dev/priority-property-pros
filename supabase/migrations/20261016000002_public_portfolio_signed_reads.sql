-- Display-only read for approved portfolio photos.
-- Find a Pro and the public profile were rendering captions because the
-- public directory never received an object name, and anon could not SELECT
-- a PUBLIC_SAFE file in contractor-docs. Signed URLs are minted in the
-- browser, so storage SELECT is the gate (same rule as PR #67).
--
-- This does not change payments, fees, matching, hiring, or contact
-- entitlement. It does not INSERT, UPDATE, or DELETE portfolio rows or
-- storage objects. The bucket stays private: there is no public object URL.
--
-- Pending (REVIEW_REQUIRED) and hidden (PRIVATE) photos stay out. The new
-- function reads contractor_public_portfolio, which is already PUBLIC_SAFE
-- plus APPROVED, ACTIVE, and the signup-fee directory gate. The storage
-- policy still requires portfolio_storage_is_publicly_readable, which is
-- false unless privacy_state is PUBLIC_SAFE.

GRANT EXECUTE ON FUNCTION public.portfolio_storage_is_publicly_readable(text) TO anon;

DROP POLICY IF EXISTS contractor_docs_storage_select ON storage.objects;
CREATE POLICY contractor_docs_storage_select
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'contractor-docs'
    AND (
      (
        auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      OR (auth.uid() IS NOT NULL AND public.is_admin())
      OR (
        (storage.foldername(name))[2] = 'portfolio'
        AND public.portfolio_storage_is_publicly_readable(name)
      )
    )
  );

CREATE OR REPLACE FUNCTION public.list_public_portfolio_objects(p_id uuid)
RETURNS TABLE (
  id uuid,
  caption text,
  sort_order integer,
  storage_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pf.id, pub.caption, pub.sort_order, pf.storage_path
  FROM public.contractor_public_portfolio pub
  JOIN public.contractor_portfolio pf ON pf.id = pub.id
  WHERE pub.contractor_profile_id = p_id
    AND pf.privacy_state = 'PUBLIC_SAFE'
    AND public.contractor_is_directory_listed(p_id)
  ORDER BY pub.sort_order, pub.id;
$$;

COMMENT ON FUNCTION public.list_public_portfolio_objects(uuid) IS
  'PUBLIC_SAFE portfolio object names for a directory-listed contractor. Callers mint a short-lived signed URL. REVIEW_REQUIRED and PRIVATE rows are not returned. This is not a public bucket URL.';

REVOKE ALL ON FUNCTION public.list_public_portfolio_objects(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_portfolio_objects(uuid) TO anon, authenticated;
