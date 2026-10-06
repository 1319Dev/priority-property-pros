-- Delete never-posted customer DRAFT projects left by the old post-a-project wizard.
-- Do not apply this file from the app. The owner runs it once against production.
--
-- A project row is created only when the customer hits Post. Rows with
-- status DRAFT and posted_at IS NULL were autosaved before that and are not
-- real jobs.
--
-- Deletes, and only for those unposted drafts that have no marketplace activity:
--   * the projects row itself
--   * its private location (project_private_locations)
--   * its question answers (project_answers)
--   * its status history (project_status_history) via ON DELETE CASCADE
--   * its notices (project_notices) via ON DELETE CASCADE
--   * its photo rows (project_photos), deleted explicitly before the project
--     so the completeness trigger does not update a row mid-delete
--   * matching storage.objects in the project-photos bucket (the recorded
--     storage_path, and any object under {customer_id}/{project_id}/)
--
-- Does not delete a project when any of these are true:
--   * status is not DRAFT
--   * posted_at, selected_at, selected_estimate_id, selected_contractor_profile_id,
--     or selected_booking_id is set
--   * cancelled_at is set
--   * any row in opportunities, matches, opportunity_slots, estimates,
--     estimate_questions, bookings, project_connections, connection_slots,
--     connection_checkout_sessions, project_message_threads, project_messages,
--     project_contact_shares, booking_contact_access, or
--     customer_contractor_relationships.originating_project_id references it
--
-- Does not update posted projects. Does not change payments, Stripe, fees,
-- checkout, webhooks, or payment flags. Audit log rows are left in place
-- (they have no foreign key to projects).

CREATE TEMP TABLE unposted_draft_projects ON COMMIT DROP AS
SELECT p.id, p.customer_id
FROM public.projects p
WHERE p.status = 'DRAFT'
  AND p.posted_at IS NULL
  AND p.selected_at IS NULL
  AND p.selected_estimate_id IS NULL
  AND p.selected_contractor_profile_id IS NULL
  AND p.selected_booking_id IS NULL
  AND p.cancelled_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.opportunities o WHERE o.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.opportunity_slots s WHERE s.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.estimates e WHERE e.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.estimate_questions q WHERE q.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.project_connections c WHERE c.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.connection_slots cs WHERE cs.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.connection_checkout_sessions x WHERE x.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.project_message_threads t WHERE t.project_id = p.id)
  AND NOT EXISTS (
    SELECT 1
    FROM public.project_messages msg
    JOIN public.project_message_threads t ON t.id = msg.thread_id
    WHERE t.project_id = p.id
  )
  AND NOT EXISTS (SELECT 1 FROM public.project_contact_shares sh WHERE sh.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.booking_contact_access a WHERE a.project_id = p.id)
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_contractor_relationships r
    WHERE r.originating_project_id = p.id
  );

-- Private photo files for those drafts only.
DELETE FROM storage.objects o
USING public.project_photos ph
JOIN unposted_draft_projects d ON d.id = ph.project_id
WHERE o.bucket_id = 'project-photos'
  AND o.name = ph.storage_path;

DELETE FROM storage.objects o
USING unposted_draft_projects d
WHERE o.bucket_id = 'project-photos'
  AND split_part(o.name, '/', 1) = d.customer_id::text
  AND split_part(o.name, '/', 2) = d.id::text;

-- Children that update the project row from a delete trigger are removed first.
DELETE FROM public.project_photos ph
USING unposted_draft_projects d
WHERE ph.project_id = d.id;

DELETE FROM public.project_answers a
USING unposted_draft_projects d
WHERE a.project_id = d.id;

DELETE FROM public.project_private_locations loc
USING unposted_draft_projects d
WHERE loc.project_id = d.id;

-- Re-check the guards at delete time. Posted projects cannot match.
DELETE FROM public.projects p
USING unposted_draft_projects d
WHERE p.id = d.id
  AND p.status = 'DRAFT'
  AND p.posted_at IS NULL
  AND p.selected_at IS NULL
  AND p.selected_estimate_id IS NULL
  AND p.selected_contractor_profile_id IS NULL
  AND p.selected_booking_id IS NULL
  AND p.cancelled_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.opportunities o WHERE o.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.estimates e WHERE e.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.project_connections c WHERE c.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.connection_checkout_sessions x WHERE x.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.project_message_threads t WHERE t.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.booking_contact_access a WHERE a.project_id = p.id);
