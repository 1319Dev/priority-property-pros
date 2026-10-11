-- Rolls back the display-only public portfolio signed-read.
-- Restores the PR #67 storage SELECT policy (authenticated only) and drops
-- list_public_portfolio_objects. Does not change portfolio rows or objects.

DROP FUNCTION IF EXISTS public.list_public_portfolio_objects(uuid);

REVOKE ALL ON FUNCTION public.portfolio_storage_is_publicly_readable(text) FROM anon;

DROP POLICY IF EXISTS contractor_docs_storage_select ON storage.objects;
CREATE POLICY contractor_docs_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'contractor-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
      OR (
        (storage.foldername(name))[2] = 'portfolio'
        AND public.portfolio_storage_is_publicly_readable(name)
      )
    )
  );
