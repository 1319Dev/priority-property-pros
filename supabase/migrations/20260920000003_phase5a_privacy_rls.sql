-- Phase 5A privacy: split customer-owner project SELECT from contractor/admin.
-- Additive. Does not weaken exact-address / phone / email gates.

DROP POLICY IF EXISTS projects_select_owner_admin_or_participant ON public.projects;

CREATE POLICY projects_select_owner
  ON public.projects FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY projects_select_admin
  ON public.projects FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY projects_select_contractor_authorized
  ON public.projects FOR SELECT TO authenticated
  USING (public.contractor_can_read_project(id));

DROP POLICY IF EXISTS project_photos_select_participants ON public.project_photos;
CREATE POLICY project_photos_select_participants
  ON public.project_photos FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_can_read_project(project_id)
  );

DROP POLICY IF EXISTS project_answers_select_participants ON public.project_answers;
CREATE POLICY project_answers_select_participants
  ON public.project_answers FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_can_read_project(project_id)
  );

DROP POLICY IF EXISTS project_status_history_select ON public.project_status_history;
CREATE POLICY project_status_history_select
  ON public.project_status_history FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_can_read_project(project_id)
  );

DROP POLICY IF EXISTS estimates_select_visible ON public.estimates;
CREATE POLICY estimates_select_visible
  ON public.estimates FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
    OR (
      public.is_project_owner(project_id)
      AND status IN ('SUBMITTED', 'REVISED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED')
    )
  );

DROP POLICY IF EXISTS estimate_items_select_via_estimate ON public.estimate_items;
CREATE POLICY estimate_items_select_via_estimate
  ON public.estimate_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND (
          e.contractor_profile_id = public.current_contractor_profile_id()
          OR public.is_admin()
          OR (
            public.is_project_owner(e.project_id)
            AND e.status IN ('SUBMITTED', 'REVISED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED')
          )
        )
    )
  );

CREATE POLICY project_notices_select_audience
  ON public.project_notices FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_project_owner(project_id)
      AND audience IN ('CUSTOMER', 'BOTH')
    )
    OR (
      public.contractor_can_read_project(project_id)
      AND audience IN ('CONTRACTOR', 'BOTH')
    )
  );

DROP POLICY IF EXISTS project_photos_storage_select ON storage.objects;
CREATE POLICY project_photos_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
      OR (
        (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
        AND public.contractor_can_read_project(((storage.foldername(name))[2])::uuid)
      )
    )
  );

REVOKE ALL ON FUNCTION public.project_has_participation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_opportunity_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_protected_booking_exists(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contractor_can_read_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.insert_project_notice(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_material_scope_change(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_customer_projects() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_customer_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_customer_project(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_customer_project(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.project_has_participation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_opportunity_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_protected_booking_exists(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contractor_can_read_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_customer_projects() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_customer_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_project(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_project(uuid, boolean) TO authenticated;

REVOKE ALL ON TABLE public.project_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_notices TO authenticated;

COMMENT ON POLICY projects_select_owner ON public.projects IS
  'Customers see only their own projects (customer_id = auth.uid()). This is the privacy hard gate.';

COMMENT ON FUNCTION public.list_my_customer_projects() IS
  'SECURITY DEFINER list that can only return rows owned by auth.uid(). Never a cross-customer listing.';

COMMENT ON FUNCTION public.get_my_customer_project(uuid) IS
  'Returns the project only when customer_id = auth.uid(). Other customers get zero rows, not a leak.';
