-- Manual SQL-editor checklist for top-3 offers, skip backfill, and fairness.
-- Do NOT run against production. Do NOT flip payments_live / charges_live.

-- 1. Post a project with 4+ in-area eligible contractors in the same category.
--    SELECT count(*) FROM opportunities WHERE project_id = '<id>' AND status = 'AVAILABLE';
--    Expect: <= 3.
--    SELECT score, rank_order, contractor_profile_id FROM matches WHERE project_id = '<id>' ORDER BY rank_order;
--    Expect: full ranked queue (can be > 3). Rank 1–3 should be the live AVAILABLE offers.

-- 2. As offered contractor A: SELECT public.pass_opportunity('<opp-id>');
--    Expect: A's row PASSED. Exactly one new AVAILABLE for the next rank_order unused contractor (if one exists).
--    Repeat pass: each skip creates at most one new offer. Never re-offers A.

-- 3. Out-of-area contractor: no match row, no opportunity.

-- 4. Accept three: fourth accept fails. No new AVAILABLE while 3 opportunity_slots are taken.

-- 5. Fairness: two similar in-area pros; give contractor X several recent opportunities in the same category.
--    Post again. Expect Y (fewer recent offers) to rank ahead of X unless X's fit score is much higher
--    (penalty caps at 24).

-- 6. Contact entitlement unchanged:
--    Matched AVAILABLE or ACCEPTED may still reserve/request a $4.99 connection.
--    PASSED cannot. No #14 row from pass or post.

-- 7. If the queue is exhausted, AVAILABLE count can be < 3. Re-run match_project later to refill
--    if new eligible contractors exist. Skip does not rematch the whole market.
