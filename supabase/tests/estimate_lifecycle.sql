-- Manual SQL editor checks for contractor profile + estimate lifecycle.
-- Not executed by Vitest. Apply migrations 20260923000001–04 first.
-- Do not apply these to production from the agent.

-- 1) Submit is SENT, not VIEWED:
--    select submit_estimate('<draft-id>');  -- status SENT, first_viewed_at null

-- 2) List does not mark viewed:
--    select list_my_estimates();            -- first_viewed_at still null

-- 3) Customer DETAIL open marks VIEWED once. Admin/contractor must fail:
--    select mark_estimate_viewed('<id>', '<project-id>');   -- first_viewed_at set, view_count 1, one notification
--    select mark_estimate_viewed('<id>', '<project-id>');   -- first_viewed_at unchanged, view_count 2, still VIEWED, no 2nd notify

-- 4) Contractor cannot self-accept:
--    update estimates set status = 'ACCEPTED' where id = '<id>';  -- error
--    select select_estimate as the contractor of that estimate -- error

-- 5) Hire: winner ACCEPTED; others DECLINED with ANOTHER_ESTIMATE_ACCEPTED.
--    Concurrent second winner fails (unique ACCEPTED index + project lock).
--    Retry of same winner is idempotent.

-- 6) Manual decline: CUSTOMER_DECLINED; other estimates stay active; project not cancelled.

-- 7) Contact leak:
--    update estimates set notes = 'call 404-555-0100';  -- blocked
--    update contractor_profiles set bio = 'email me at a@b.com';  -- blocked
--    update projects set title = 'text 404-555-0100'; -- blocked

-- 8) Isolation: contractor B select * from estimates where id = A's estimate → 0 rows

-- 9) License change: that LICENSE credential → PENDING, badge hidden, identity_review_required, APPROVED stays.

-- 10) payments_live / charges_live remain 0. signup_fee_enabled is not flipped here.
--     ACCEPTED/CONFIRMED do not return phone/email/street from these RPCs.
