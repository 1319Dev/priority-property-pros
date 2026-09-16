# Phase 4A — Booking core & progressive fee engine

Additive on Phase 3. **No live Stripe, charges, or payouts.** `payments_live` and `charges_live` stay false.

Apply after Phase 3, in filename order:

20. `20260918000001_phase4a_fee_engine.sql`
21. `20260918000002_phase4a_booking_tables.sql`
22. `20260918000003_phase4a_guards.sql`
23. `20260918000004_phase4a_rpcs.sql`
24. `20260918000005_phase4a_rls_grants.sql`

These files do **not** drop users, projects, estimates, or Phase 3 fee snapshots on estimate rows.

## Fee engine

Versioned `fee_schedules` + `fee_schedule_brackets`. Integer cents only. Progressive slices (not one rate on the whole job). Historical bookings snapshot schedule version + brackets at financial commit (`lock_booking_fee` on CONFIRMED) and never recalculate if the live schedule changes.

| Kind | Brackets | Min | Max |
| --- | --- | --- | --- |
| ORIGINAL v1 | $0–$500 @ 8%, next $2,000 @ 7%, next $7,500 @ 5%, next $15,000 @ 3.5%, remainder @ 2.5% | $15 | $1,500 including approved positive change orders |
| REPEAT v1 | 2% | $10 | $500 |

Repeat = same customer + same contractor after a prior **COMPLETED** PPP booking. Server history only. Repeat pricing does **not** expire when the protected window expires.

Phase 3 estimate rows still store `fee_bps` (~700). `fee_preview()` remains the flat estimate helper. New booking UI calls `preview_marketplace_fee`.

## Booking states

`PENDING` → `AWAITING_PAYMENT` → `CONFIRMED` → `IN_PROGRESS` → `COMPLETED`, plus `CANCELLED` / `DISPUTED`.

Selection (`select_estimate`) creates **PENDING**. It does **not** confirm, charge, unlock contact, or create a relationship.

Until `payments_live`, only `confirm_booking_for_testing` (ADMIN) can move to CONFIRMED. Production UI shows: *Payment coming soon — booking cannot be confirmed in production yet.*

Pending bookings expire via `expire_stale_pending_bookings` (TTL from `booking_pending_ttl_hours`, default 168). Abandoned selection: no contact, no relationship, no fee owed.

## Contact / address

Exact street + lat/lng stay in `project_private_locations`. RLS uses `booking_is_confirmed_for_contractor`, not selection. Phone/email are **not** opened on `profiles` SELECT. After CONFIRMED, the booked contractor calls `booking_job_contact`.

City/ZIP remain visible for estimating.

## Relationships / Hire Again

Created on first CONFIRMED booking. `protected_until` uses `relationship_protection_months` (default 12) — not hardcoded in the frontend. Each COMPLETED booking renews the window. Hire Again lists relationships with a completed booking; the next `select_estimate` auto-applies REPEAT.

## Change orders & reviews

Change orders belong to a booking. Contractor cannot unilaterally increase. Customer approval + contractor ack. Approved positive deltas add to the ORIGINAL (or REPEAT) snapshotted fee basis; the cap is per booking, not per CO.

Verified reviews: `submit_booking_review` only when status is COMPLETED and the reviewer is the customer.

## Email confirm before public launch

Do **not** flip Auth “Confirm email” in this phase in a way that locks out the current test workflow. Before public launch: keep **Confirm email** enabled, add custom SMTP, and confirm redirect URLs. Auto-confirm is a test convenience only.

## Free-text PII

Pre-estimate questions and notes can still contain phone numbers or addresses. Phase 4A does not add scanners. Treat that as a known residual risk.
