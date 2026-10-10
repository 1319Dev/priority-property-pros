-- Rollback for supabase/migrations/20261013000002_anon_service_catalog_select.sql.
-- Restores the phase 3 SELECT policies from
-- supabase/migrations/20260917000007_phase3_rls_storage.sql exactly:
--   service_categories_select / service_questions_select
--   FOR SELECT TO anon, authenticated
--   USING (is_active OR public.is_admin())
-- This file is not a migration. Do not copy it under supabase/migrations.
-- Apply only on a database where the forward migration was applied.
-- It does not INSERT, UPDATE, or DELETE application rows, and it does not
-- change grants, write policies, or any other table.

DROP POLICY service_categories_select_anon ON public.service_categories;
DROP POLICY service_categories_select ON public.service_categories;

CREATE POLICY service_categories_select
  ON public.service_categories FOR SELECT
  TO anon, authenticated
  USING (is_active OR public.is_admin());

DROP POLICY service_questions_select_anon ON public.service_questions;
DROP POLICY service_questions_select ON public.service_questions;

CREATE POLICY service_questions_select
  ON public.service_questions FOR SELECT
  TO anon, authenticated
  USING (is_active OR public.is_admin());
