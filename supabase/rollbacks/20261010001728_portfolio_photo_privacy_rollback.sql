-- Rollback for 20261010001728_portfolio_photo_privacy.sql.
-- Restores the production contractor-docs SELECT and UPDATE policies from before
-- this change, and drops the portfolio privacy trigger, helper functions, admin
-- RPCs, and partial index. Does not touch other migrations, payments, or data.
-- Apply only on the database where the forward migration was applied, and only
-- with the owner's approval. This re-opens the previous storage and self-review holes.

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

DROP TRIGGER IF EXISTS trg_enforce_contractor_portfolio_privacy ON public.contractor_portfolio;

DROP FUNCTION IF EXISTS public.admin_set_portfolio_privacy(uuid, public.portfolio_privacy_state, text);
DROP FUNCTION IF EXISTS public.admin_list_portfolio_review_queue();
DROP FUNCTION IF EXISTS public.portfolio_storage_is_publicly_readable(text);
DROP FUNCTION IF EXISTS public.portfolio_storage_is_public_safe(text);
DROP FUNCTION IF EXISTS public.contractor_portfolio_owner_profile_id(uuid);
DROP FUNCTION IF EXISTS public.enforce_contractor_portfolio_privacy();

DROP INDEX IF EXISTS public.contractor_portfolio_public_safe_path_idx;

GRANT INSERT (privacy_state), UPDATE (privacy_state), UPDATE (contractor_profile_id)
  ON TABLE public.contractor_portfolio TO authenticated;
