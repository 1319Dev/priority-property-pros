-- Partial rollback for 20261010001728_portfolio_photo_privacy.sql.
-- Restores only the production contractor-docs SELECT, INSERT, and UPDATE
-- policies, then drops the two storage helper functions and the partial index.
-- Keeps trg_enforce_contractor_portfolio_privacy and the admin RPCs, so a
-- storage-policy problem can be undone without reopening self-approval.
-- Does not change table grants. Apply only on a database where the forward
-- migration was applied, and only with the owner's approval.

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
        AND EXISTS (
          SELECT 1
          FROM public.contractor_profiles cp
          WHERE cp.profile_id::text = (storage.foldername(objects.name))[1]
            AND cp.approval_status = 'APPROVED'
        )
      )
    )
  );

DROP POLICY IF EXISTS contractor_docs_storage_insert ON storage.objects;
CREATE POLICY contractor_docs_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contractor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] = ANY (ARRAY['portfolio', 'credentials'])
  );

DROP POLICY IF EXISTS contractor_docs_storage_update ON storage.objects;
CREATE POLICY contractor_docs_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contractor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'contractor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- The restored policies do not call these helpers, so they are unused.
DROP FUNCTION IF EXISTS public.portfolio_storage_is_publicly_readable(text);
DROP FUNCTION IF EXISTS public.portfolio_storage_is_public_safe(text);

DROP INDEX IF EXISTS public.contractor_portfolio_public_safe_path_idx;
