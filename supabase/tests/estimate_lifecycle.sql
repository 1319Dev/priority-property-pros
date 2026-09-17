-- Manual SQL editor checks for contractor profile + estimate lifecycle.
-- Not executed by Vitest. Apply migrations 20260923000001–04 first.

-- 1) Submit is SENT, not VIEWED:
--    select submit_estimate('<draft-id>');  -- status SENT, first_viewed_at null

-- 2) List does not mark viewed:
--    select list_my_estimates();            -- first_viewed_at still null

-- 3) Detail open marks VIEWED once:
--    select mark_estimate_viewed('<id>');   -- first_viewed_at set, view_count 1
--    select mark_estimate_viewed('<id>');   -- first_viewed_at unchanged, view_count 2, still VIEWED

-- 4) Contractor cannot self-accept:
--    update estimates set status = 'ACCEPTED' where id = '<id>';  -- error

-- 5) Hire cascades other active estimates to DECLINED without revealing rivals.

-- 6) Contact leak:
--    update estimates set notes = 'call 404-555-0100';  -- blocked
--    update contractor_profiles set bio = 'email me at a@b.com';  -- blocked

-- 7) Isolation: contractor B select * from estimates where id = A's estimate → 0 rows

-- 8) payments_live / charges_live remain 0. signup_fee_enabled is not flipped here.
