-- Contact-access entitlement checks for the SQL editor after
-- 20260922000001_contact_access_entitlement.sql and
-- 20260924000001_contact_access_lifecycle_compat.sql. CI does not connect to a
-- live database; vitest mirrors these cases in contactAccess*.test.ts.

-- Catalog / definition assertions (run as the dashboard role):
DO $$
DECLARE
  job_contact text;
  helper text;
  project_helper text;
  grant_fn text;
  job_fee text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO job_contact
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'booking_job_contact';

  SELECT pg_get_functiondef(p.oid) INTO helper
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'booking_has_contact_access';

  SELECT pg_get_functiondef(p.oid) INTO project_helper
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'contractor_has_contact_access_on_project';

  SELECT pg_get_functiondef(p.oid) INTO grant_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_grant_booking_contact_access';

  SELECT pg_get_functiondef(p.oid) INTO job_fee
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'grant_booking_contact_access_from_job_fee';

  IF job_contact IS NULL OR helper IS NULL THEN
    RAISE EXCEPTION 'contact-access functions missing';
  END IF;
  IF job_contact LIKE '%unlocked := b.status IN%' THEN
    RAISE EXCEPTION 'booking_job_contact still unlocks on CONFIRMED';
  END IF;
  IF job_contact NOT LIKE '%booking_has_contact_access%' THEN
    RAISE EXCEPTION 'booking_job_contact must require entitlement';
  END IF;
  IF helper LIKE '%status IN (''CONFIRMED''%' THEN
    RAISE EXCEPTION 'booking_has_contact_access must not key off CONFIRMED';
  END IF;
  IF project_helper NOT LIKE '%current_contractor_profile_id%' THEN
    RAISE EXCEPTION 'project helper must bind the hired contractor';
  END IF;
  IF grant_fn NOT LIKE '%only an admin can grant booking contact access%' THEN
    RAISE EXCEPTION 'admin grant must be admin-only';
  END IF;
  IF grant_fn NOT LIKE '%booking.contact_access.granted%' THEN
    RAISE EXCEPTION 'admin grant must write audit_logs';
  END IF;
  IF job_fee NOT LIKE '%payments are off%' THEN
    RAISE EXCEPTION 'job-fee stub must refuse while payments are off';
  END IF;
END $$;

-- Scenario expectations (JWT client, not this file):
--   1. Unhired contractor booking_job_contact → locked
--   2. Estimate-only contractor booking_job_contact → locked
--   3. SENT / VIEWED / ACCEPTED / CONFIRMED without entitlement → locked
--   4. Missing booking_contact_access row → no access (never implicit unlock)
--   5. Hired contractor with UNLOCKED or ADMIN_OVERRIDE → street/phone/email/lat/lng
--   6. Different contractor or customer UUID on the same project → locked
--   7. Opportunity / list_my_estimates / list_my_notifications / estimate_events / submit_estimate
--      do not return street/phone/email/coords
--   8. Direct select project_private_locations as unauthorized contractor → 0 rows
--   9. Direct RPC bypass / client insert booking_contact_access → error
--  10. admin_grant_booking_contact_access as non-admin → error; as admin writes audit_logs
--  11. admin_revoke immediately locks; booking_job_contact then errors with no private fields
--  12. Matching, estimates, Manage Profile, and max-3 slots still work; payments stay off

-- Default backfill:
--   SELECT status, count(*) FROM booking_contact_access GROUP BY status;
--   Expected: LOCKED for existing bookings, including CONFIRMED+.
