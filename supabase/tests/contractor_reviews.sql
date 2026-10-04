-- Owner-run checks after 20261007000001_contractor_review_reputation.sql.
-- CI does not connect to a live database.
-- Do not apply this migration to production from this PR.
-- Does not change payments_live, charges_live, signup_fee_enabled, or connection_fee_checkout_enabled.

-- Eligible create
--   Homeowner owns the project, booking contractor is the selected contractor,
--   both Hired timestamps are set, status is not CANCELLED or DISPUTED
--   → submit_booking_review inserts reviewer_role CUSTOMER,
--     review_class VERIFIED_PPP_PROJECT, moderation_status PUBLISHED, is_verified true.
--   Caller cannot pass a review class. The column is not a function argument.

-- Ineligible
--   Another homeowner's booking → 'only booking participants can review after mutual hire'
--   Project owner does not match the booking customer → 'only the project homeowner can review the hired contractor'
--   selected_contractor_profile_id differs from the booking contractor
--     → 'reviews require the hired contractor on this project'
--   Only one party confirmed Hired → 'reviews require mutual hired confirmation'

-- Duplicate
--   Second customer review for the same booking → 'you already reviewed this booking'
--   Second customer review for the same homeowner, project, and contractor
--     → unique booking_reviews_one_homeowner_project_contractor
--     or 'you already reviewed this contractor on this project'

-- Rating math
--   contractor_public_ratings averages only PUBLISHED + VERIFIED_PPP_PROJECT + CUSTOMER rows.
--   HIDDEN and REMOVED rows drop out of rating_average and rating_count.

-- Contractor response
--   respond_to_booking_review inserts one row, then updates body and updated_at.
--   created_at stays. Length 1–800.

-- Contractor cannot edit or delete the review
--   No GRANT UPDATE or DELETE on booking_reviews for authenticated.
--   protect_review_row raises 'reviews cannot be edited' and 'reviews cannot be deleted from the client'.
--   respond_to_booking_review does not change rating, body, or is_verified.

-- Verified badge
--   Insert with review_class CUSTOMER_REVIEW → 'outside customer reviews are not enabled'
--   Insert with is_verified true and a null class → 'verified status is assigned by the platform'
--   Admin moderate_booking_review cannot change review_class or is_verified.
--   There is no admin insert RPC.

-- Public read
--   anon SELECT booking_reviews → denied
--   anon SELECT contractor_public_reviews for a HIDDEN row → 0 rows
--   Smoke tester profile af55cdfe-b3aa-421d-84b3-0411d9d7e3b6 and 'smoke tester' text stay out.

-- Report
--   report_booking_review leaves moderation_status unchanged and returns auto_hidden false.
