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

-- 11) Delete draft (owner contractor or admin). Does not replace withdraw.
--    select delete_estimate('<draft-id>');  -- row gone; audit_logs action estimate.deleted
--    select delete_estimate('<sent-id>');   -- only draft estimates can be deleted
--    select delete_estimate('<accepted-id>'); -- accepted estimates cannot be deleted
--    contractor B delete_estimate(A's draft) → not your estimate
--    customer delete_estimate → not your estimate
--    anon delete_estimate → auth required
--    Data API DELETE from estimates → denied (no GRANT DELETE)
--    withdraw_estimate still marks WITHDRAWN and keeps history.
