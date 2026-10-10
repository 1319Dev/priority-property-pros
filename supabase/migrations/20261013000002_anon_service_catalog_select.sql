-- Signed-out catalog reads.
-- The phase 3 SELECT policies on service_categories and service_questions
-- (20260917000007_phase3_rls_storage.sql) are:
--   FOR SELECT TO anon, authenticated
--   USING (is_active OR public.is_admin())
-- Postgres checks EXECUTE on every function named in a policy. is_admin() is
-- granted to authenticated and service_role only, so an anon read fails with
-- "permission denied for function is_admin" even for active rows.
-- Split the same predicate by role. Anon never references is_admin().
-- Authenticated keeps the previous expression, including admin visibility of
-- inactive rows. Question "active" stays the question's own is_active column.
-- The phase 3 policy does not look at the parent category, so this does not add
-- that check.
-- No GRANT on is_admin(). No data changes. No write policies. No other tables.

DROP POLICY service_categories_select ON public.service_categories;

CREATE POLICY service_categories_select_anon
  ON public.service_categories
  FOR SELECT
  TO anon
  USING (is_active);

CREATE POLICY service_categories_select
  ON public.service_categories
  FOR SELECT
  TO authenticated
  USING (is_active OR public.is_admin());

DROP POLICY service_questions_select ON public.service_questions;

CREATE POLICY service_questions_select_anon
  ON public.service_questions
  FOR SELECT
  TO anon
  USING (is_active);

CREATE POLICY service_questions_select
  ON public.service_questions
  FOR SELECT
  TO authenticated
  USING (is_active OR public.is_admin());
