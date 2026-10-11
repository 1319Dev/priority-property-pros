-- Display-only labels for a contractor's own opportunities.
-- Passed and closed jobs hide the project row under contractor_can_read_project,
-- so History and a withdrawn estimate could not show PPP-n. This returns the
-- scrubbed title and reference number only.
--
-- No street, phone, email, zip, or customer name. No payment, fee, matching,
-- hiring, or contact-entitlement change. No INSERT, UPDATE, or DELETE.

CREATE OR REPLACE FUNCTION public.list_my_opportunity_labels()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'opportunity_id', o.id,
          'project_id', o.project_id,
          'project_title',
            CASE
              WHEN public.text_contains_contact_info(p.title)
                OR public.text_contains_pre_hire_contact(p.title)
                THEN 'Project'
              ELSE coalesce(nullif(btrim(p.title), ''), 'Project')
            END,
          'project_reference_number', p.reference_number
        )
        ORDER BY o.created_at DESC
      )
      FROM public.opportunities o
      JOIN public.projects p ON p.id = o.project_id
      WHERE o.contractor_profile_id = public.current_contractor_profile_id()
    ),
    '[]'::jsonb
  );
$$;

COMMENT ON FUNCTION public.list_my_opportunity_labels() IS
  'Scrubbed title and PPP number for the signed-in contractor''s own opportunities. No street, phone, email, or customer name. Display only.';

REVOKE ALL ON FUNCTION public.list_my_opportunity_labels() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_opportunity_labels() TO authenticated;
