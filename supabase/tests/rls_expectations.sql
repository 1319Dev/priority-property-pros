-- pgTAP-style checks for the owner to run in the SQL editor after migrations.
-- CI does not connect to a live database. Application unit tests mock these rules.

-- Expected: signup helper never returns ADMIN
-- SELECT public.permitted_signup_account_type('ADMIN');  -- CUSTOMER
-- SELECT public.permitted_signup_account_type('contractor'); -- CONTRACTOR
-- SELECT public.permitted_signup_account_type('hacker'); -- CUSTOMER

-- Expected: RLS enabled
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname IN ('profiles','contractor_profiles','verifier_profiles','agreements','agreement_acceptances','audit_logs');

-- Privilege-escalation (as a signed-in customer, via the JS client — not this file):
--   update profiles set account_type = 'ADMIN' where id = auth.uid()  → error
--   update contractor_profiles set approval_status = 'APPROVED' where profile_id = auth.uid() → error
--   select * from profiles where id <> auth.uid() → 0 rows
--   select * from audit_logs → 0 rows unless ADMIN

-- Phase 4A (after 20260918000001–05):
--   customer cannot select * from bookings where customer_id <> auth.uid()
--   contractor cannot select unrelated bookings
--   contractor cannot select project_private_locations until booking CONFIRMED
--   customer/contractor confirm_booking_for_testing → error (admin only)
--   client update bookings.fee_cents / status → error
--   client insert customer_contractor_relationships → error
--   client insert fee_schedules → error
--   contractor cannot mark a change order APPROVED alone
--   submit_booking_review on a PENDING booking → error

-- Phase 5A (after 20260920000001–03):
--   customer A cannot select * from projects where customer_id <> auth.uid()
--   customer A get_my_customer_project(B) → 0 rows
--   customer A update_customer_project(B) → not the project owner
--   customer A cancel_customer_project(B) → not the project owner
--   customer A cannot select project_photos / project_answers / project_private_locations for B
--   contractor still sees authorized opportunity rows only
--   admin still sees all projects
--   confirmed booking still required for exact street

