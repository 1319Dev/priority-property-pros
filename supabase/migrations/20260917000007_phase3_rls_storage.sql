-- Deny-by-default RLS, customer-safe views, and private storage buckets.

-- ---------------------------------------------------------------------------
-- Public (safe-column) views. security_invoker = false so they can expose
-- approved contractor cards without leaking license numbers or document paths.
-- ---------------------------------------------------------------------------

CREATE VIEW public.contractor_public_profiles
WITH (security_invoker = false)
AS
SELECT
  cp.id,
  cp.business_name,
  cp.headline,
  cp.primary_trade,
  cp.years_experience,
  cp.bio,
  cp.website_url,
  cp.accepting_work,
  cp.created_at
FROM public.contractor_profiles cp
WHERE cp.approval_status = 'APPROVED';

CREATE VIEW public.contractor_verified_credential_badges
WITH (security_invoker = false)
AS
SELECT
  cr.id,
  cr.contractor_profile_id,
  cr.kind,
  cr.label,
  cr.status,
  cr.expires_at
FROM public.contractor_credentials cr
JOIN public.contractor_profiles cp ON cp.id = cr.contractor_profile_id
WHERE cr.status = 'VERIFIED'
  AND cp.approval_status = 'APPROVED';

CREATE VIEW public.contractor_public_services
WITH (security_invoker = false)
AS
SELECT
  cs.id,
  cs.contractor_profile_id,
  cs.category_id,
  sc.slug AS category_slug,
  sc.name AS category_name
FROM public.contractor_services cs
JOIN public.contractor_profiles cp ON cp.id = cs.contractor_profile_id
JOIN public.service_categories sc ON sc.id = cs.category_id
WHERE cp.approval_status = 'APPROVED';

CREATE VIEW public.contractor_public_areas
WITH (security_invoker = false)
AS
SELECT
  a.id,
  a.contractor_profile_id,
  a.mode,
  a.center_zip,
  a.radius_miles,
  a.zip_codes,
  a.label
FROM public.contractor_service_areas a
JOIN public.contractor_profiles cp ON cp.id = a.contractor_profile_id
WHERE cp.approval_status = 'APPROVED';

CREATE VIEW public.contractor_public_portfolio
WITH (security_invoker = false)
AS
SELECT
  pf.id,
  pf.contractor_profile_id,
  pf.title,
  pf.description,
  pf.storage_path,
  pf.sort_order
FROM public.contractor_portfolio pf
JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
WHERE cp.approval_status = 'APPROVED';

COMMENT ON VIEW public.contractor_verified_credential_badges IS
  'Admin-reviewed credentials only. Not a Priority Verified badge. Contractors cannot self-verify.';

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_private_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Catalog / settings
-- ---------------------------------------------------------------------------

CREATE POLICY platform_settings_select
  ON public.platform_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY service_categories_select
  ON public.service_categories FOR SELECT
  TO anon, authenticated
  USING (is_active OR public.is_admin());

CREATE POLICY service_questions_select
  ON public.service_questions FOR SELECT
  TO anon, authenticated
  USING (is_active OR public.is_admin());

-- ---------------------------------------------------------------------------
-- Contractor-owned marketplace rows
-- ---------------------------------------------------------------------------

CREATE POLICY contractor_services_select_own_or_admin
  ON public.contractor_services FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY contractor_services_write_own
  ON public.contractor_services FOR INSERT TO authenticated
  WITH CHECK (contractor_profile_id = public.current_contractor_profile_id());

CREATE POLICY contractor_services_update_own
  ON public.contractor_services FOR UPDATE TO authenticated
  USING (contractor_profile_id = public.current_contractor_profile_id())
  WITH CHECK (contractor_profile_id = public.current_contractor_profile_id());

CREATE POLICY contractor_services_delete_own
  ON public.contractor_services FOR DELETE TO authenticated
  USING (contractor_profile_id = public.current_contractor_profile_id() OR public.is_admin());

CREATE POLICY contractor_service_areas_select_own_or_admin
  ON public.contractor_service_areas FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY contractor_service_areas_insert_own
  ON public.contractor_service_areas FOR INSERT TO authenticated
  WITH CHECK (contractor_profile_id = public.current_contractor_profile_id());

CREATE POLICY contractor_service_areas_update_own
  ON public.contractor_service_areas FOR UPDATE TO authenticated
  USING (contractor_profile_id = public.current_contractor_profile_id())
  WITH CHECK (contractor_profile_id = public.current_contractor_profile_id());

CREATE POLICY contractor_service_areas_delete_own
  ON public.contractor_service_areas FOR DELETE TO authenticated
  USING (contractor_profile_id = public.current_contractor_profile_id() OR public.is_admin());

CREATE POLICY contractor_portfolio_select_own_or_admin
  ON public.contractor_portfolio FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY contractor_portfolio_insert_own
  ON public.contractor_portfolio FOR INSERT TO authenticated
  WITH CHECK (contractor_profile_id = public.current_contractor_profile_id());

CREATE POLICY contractor_portfolio_update_own
  ON public.contractor_portfolio FOR UPDATE TO authenticated
  USING (contractor_profile_id = public.current_contractor_profile_id())
  WITH CHECK (contractor_profile_id = public.current_contractor_profile_id());

CREATE POLICY contractor_portfolio_delete_own
  ON public.contractor_portfolio FOR DELETE TO authenticated
  USING (contractor_profile_id = public.current_contractor_profile_id() OR public.is_admin());

CREATE POLICY contractor_credentials_select_own_or_admin
  ON public.contractor_credentials FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY contractor_credentials_insert_own
  ON public.contractor_credentials FOR INSERT TO authenticated
  WITH CHECK (contractor_profile_id = public.current_contractor_profile_id());

CREATE POLICY contractor_credentials_update_own
  ON public.contractor_credentials FOR UPDATE TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  )
  WITH CHECK (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY contractor_credentials_delete_own
  ON public.contractor_credentials FOR DELETE TO authenticated
  USING (
    (
      contractor_profile_id = public.current_contractor_profile_id()
      AND status IN ('NOT_SUBMITTED', 'REJECTED')
    )
    OR public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

CREATE POLICY projects_select_owner_admin_or_participant
  ON public.projects FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.is_admin()
    OR public.contractor_has_open_opportunity(id)
    OR public.contractor_is_selected_on_project(id)
  );

CREATE POLICY projects_insert_own_draft
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND status = 'DRAFT'
  );

CREATE POLICY projects_update_owner_or_admin
  ON public.projects FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() OR public.is_admin())
  WITH CHECK (customer_id = auth.uid() OR public.is_admin());

CREATE POLICY projects_delete_own_draft
  ON public.projects FOR DELETE TO authenticated
  USING (
    (customer_id = auth.uid() AND status = 'DRAFT')
    OR public.is_admin()
  );

CREATE POLICY project_private_locations_select_protected
  ON public.project_private_locations FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_is_selected_on_project(project_id)
  );

CREATE POLICY project_private_locations_insert_owner
  ON public.project_private_locations FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY project_private_locations_update_owner
  ON public.project_private_locations FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id) OR public.is_admin())
  WITH CHECK (public.is_project_owner(project_id) OR public.is_admin());

CREATE POLICY project_photos_select_participants
  ON public.project_photos FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_has_open_opportunity(project_id)
    OR public.contractor_is_selected_on_project(project_id)
  );

CREATE POLICY project_photos_insert_owner
  ON public.project_photos FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY project_photos_delete_owner
  ON public.project_photos FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id) OR public.is_admin());

CREATE POLICY project_answers_select_participants
  ON public.project_answers FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_has_open_opportunity(project_id)
    OR public.contractor_is_selected_on_project(project_id)
  );

CREATE POLICY project_answers_insert_owner
  ON public.project_answers FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY project_answers_update_owner
  ON public.project_answers FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id) OR public.is_admin())
  WITH CHECK (public.is_project_owner(project_id) OR public.is_admin());

CREATE POLICY project_status_history_select
  ON public.project_status_history FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_admin()
    OR public.contractor_is_selected_on_project(project_id)
  );

-- ---------------------------------------------------------------------------
-- Matching / opportunities
-- Customers do not see AVAILABLE matching-pool rows (who was offered the job).
-- ---------------------------------------------------------------------------

CREATE POLICY matches_select_contractor_or_admin
  ON public.matches FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY opportunities_select_own_or_accepted_customer
  ON public.opportunities FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
    OR (
      public.is_project_owner(project_id)
      AND status IN ('ACCEPTED')
    )
  );

CREATE POLICY opportunity_slots_select_own_or_admin
  ON public.opportunity_slots FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Q&A + estimates
-- ---------------------------------------------------------------------------

CREATE POLICY estimate_questions_select_participants
  ON public.estimate_questions FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR asked_by_contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY estimate_questions_insert_accepted_contractor
  ON public.estimate_questions FOR INSERT TO authenticated
  WITH CHECK (
    asked_by_contractor_profile_id = public.current_contractor_profile_id()
  );

CREATE POLICY estimate_questions_update_participants
  ON public.estimate_questions FOR UPDATE TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR asked_by_contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_project_owner(project_id)
    OR asked_by_contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

CREATE POLICY estimates_select_visible
  ON public.estimates FOR SELECT TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
    OR (
      public.is_project_owner(project_id)
      AND status IN ('SUBMITTED', 'REVISED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED')
    )
  );

CREATE POLICY estimates_insert_own_draft
  ON public.estimates FOR INSERT TO authenticated
  WITH CHECK (
    contractor_profile_id = public.current_contractor_profile_id()
    AND status = 'DRAFT'
    AND EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_id
        AND o.contractor_profile_id = contractor_profile_id
        AND o.project_id = project_id
        AND o.status = 'ACCEPTED'
    )
  );

CREATE POLICY estimates_update_own
  ON public.estimates FOR UPDATE TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  )
  WITH CHECK (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
  );

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
            AND e.status IN ('SUBMITTED', 'REVISED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED')
          )
        )
    )
  );

CREATE POLICY estimate_items_write_own_open
  ON public.estimate_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND e.contractor_profile_id = public.current_contractor_profile_id()
        AND e.status IN ('DRAFT', 'SUBMITTED', 'REVISED')
    )
  );

CREATE POLICY estimate_items_update_own_open
  ON public.estimate_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND (
          (
            e.contractor_profile_id = public.current_contractor_profile_id()
            AND e.status IN ('DRAFT', 'SUBMITTED', 'REVISED')
          )
          OR public.is_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND (
          (
            e.contractor_profile_id = public.current_contractor_profile_id()
            AND e.status IN ('DRAFT', 'SUBMITTED', 'REVISED')
          )
          OR public.is_admin()
        )
    )
  );

CREATE POLICY estimate_items_delete_own_open
  ON public.estimate_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND (
          (
            e.contractor_profile_id = public.current_contractor_profile_id()
            AND e.status IN ('DRAFT', 'SUBMITTED', 'REVISED')
          )
          OR public.is_admin()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.platform_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.service_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.service_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.contractor_services FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.contractor_service_areas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.contractor_portfolio FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.contractor_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.projects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.project_private_locations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.project_photos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.project_answers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.project_status_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.matches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.opportunities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.opportunity_slots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.estimate_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.estimates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.estimate_items FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.platform_settings TO anon, authenticated;
GRANT SELECT ON TABLE public.service_categories TO anon, authenticated;
GRANT SELECT ON TABLE public.service_questions TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contractor_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contractor_service_areas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contractor_portfolio TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contractor_credentials TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.project_private_locations TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.project_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.project_answers TO authenticated;
GRANT SELECT ON TABLE public.project_status_history TO authenticated;

GRANT SELECT ON TABLE public.matches TO authenticated;
GRANT SELECT ON TABLE public.opportunities TO authenticated;
GRANT SELECT ON TABLE public.opportunity_slots TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.estimate_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.estimates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.estimate_items TO authenticated;

GRANT SELECT ON public.contractor_public_profiles TO anon, authenticated;
GRANT SELECT ON public.contractor_verified_credential_badges TO anon, authenticated;
GRANT SELECT ON public.contractor_public_services TO anon, authenticated;
GRANT SELECT ON public.contractor_public_areas TO anon, authenticated;
GRANT SELECT ON public.contractor_public_portfolio TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private buckets. Paths:
--   project-photos / {customer_id}/{project_id}/{file}
--   contractor-docs / {user_id}/portfolio/{file}
--   contractor-docs / {user_id}/credentials/{file}
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'project-photos',
    'project-photos',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'contractor-docs',
    'contractor-docs',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
  )
ON CONFLICT (id) DO NOTHING;

CREATE POLICY project_photos_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
      OR (
        (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
        AND (
          public.contractor_has_open_opportunity(((storage.foldername(name))[2])::uuid)
          OR public.contractor_is_selected_on_project(((storage.foldername(name))[2])::uuid)
        )
      )
    )
  );

CREATE POLICY project_photos_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    AND public.is_project_owner(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY project_photos_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'project-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY project_photos_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

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
          SELECT 1 FROM public.contractor_profiles cp
          WHERE cp.profile_id::text = (storage.foldername(name))[1]
            AND cp.approval_status = 'APPROVED'
        )
      )
    )
  );

CREATE POLICY contractor_docs_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contractor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('portfolio', 'credentials')
  );

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

CREATE POLICY contractor_docs_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'contractor-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );
