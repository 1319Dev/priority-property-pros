-- Rolls back the display-only public portfolio signed-read.
-- Drops the anon-only portfolio storage SELECT policy and
-- list_public_portfolio_objects. Does not change portfolio rows or objects.

DROP FUNCTION IF EXISTS public.list_public_portfolio_objects(uuid);

REVOKE ALL ON FUNCTION public.portfolio_storage_is_publicly_readable(text) FROM anon;

DROP POLICY IF EXISTS contractor_docs_storage_select_public_portfolio ON storage.objects;
-- The authenticated contractor_docs_storage_select policy was not changed by the
-- forward migration, so there is nothing to restore for it.
