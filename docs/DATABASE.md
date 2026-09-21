# Database — Phase 2 and Phase 3

Schema lives in `supabase/migrations/`. Apply files in filename order (see [SUPABASE_SETUP.md](SUPABASE_SETUP.md)).

The database is the authority for `account_type` and `account_status`. JWT metadata is a hint at signup only.

## Tables

### `profiles`

| Column | Notes |
| --- | --- |
| `id` | Same UUID as `auth.users.id` |
| `email` | Copied at signup |
| `first_name`, `last_name`, `phone`, `avatar_url` | Owner may update |
| `account_type` | `CUSTOMER` \| `CONTRACTOR` \| `VERIFIER` \| `ADMIN` |
| `account_status` | `ACTIVE` \| `PENDING` \| `SUSPENDED` \| `DISABLED` \| `DELETED` |
| `created_at`, `updated_at` | Triggers maintain `updated_at` |

Customers become `ACTIVE` when email is confirmed. Contractors and verifiers stay `PENDING` until an admin (or SQL) approves them later.

### `contractor_profiles`

One optional row per contractor. Foundation fields: business name, trade, service area, years, license, insurance, website, bio.

`onboarding_status`: `NOT_STARTED` \| `IN_PROGRESS` \| `SUBMITTED` \| `COMPLETE`  
`approval_status`: `PENDING` \| `APPROVED` \| `REJECTED` \| `SUSPENDED`

Owners may edit foundation / onboarding fields. They **cannot** set `approval_status`, `approved_at`, or `approved_by`.

### `verifier_profiles`

Same approval pattern. Foundation: coverage area, bio, onboarding + approval.

### `agreements`

Versioned legal copy (`slug` + `version`). `is_current` is unique per slug. Seeded: `terms-of-use`, `privacy-policy`.

### `agreement_acceptances`

Insert-only for `profile_id = auth.uid()`. Written at signup by the trigger when `accepted_terms` metadata is true.

### `audit_logs`

Append-only. `write_audit_log(...)` is for server/SQL. Clients may **select** only if `is_admin()`; they cannot insert, update, or delete.

## Signup trigger

`auth.users` **INSERT** → `handle_new_user()`:

1. Map requested `account_type` through `permitted_signup_account_type` (`ADMIN` → `CUSTOMER`).
2. Insert `profiles`.
3. Insert `contractor_profiles` or `verifier_profiles` when needed.
4. Record current agreement acceptances.
5. Write `profile.created` to `audit_logs`.

`auth.users` email confirm → customers `PENDING` → `ACTIVE`.

## Admin helper

`is_admin()`: `account_type = ADMIN` and `account_status = ACTIVE` for `auth.uid()`. `SECURITY DEFINER`, `search_path = public`.

## Admin contractor approvals

Apply `20260921000001_admin_contractor_approvals.sql` after Phase 5A. Additive. Website: **Admin → Approvals**.

| RPC | Who | What |
| --- | --- | --- |
| `list_contractor_approvals(tab)` | Admin | Queue JSON for Pending / Approved / Rejected / All |
| `get_contractor_approval(id)` | Admin | One contractor application, including credentials and info-request |
| `count_pending_contractor_approvals()` | Admin | Pending badge count |
| `admin_approve_contractor(id)` | Admin | `approval_status = APPROVED`, `profiles.account_status = ACTIVE`, preserve `approved_at`, set `approved_by`, audit `contractor.approved` |
| `admin_reject_contractor(id, reason)` | Admin | `REJECTED` without deleting. Records timestamp/admin/reason. Audit `contractor.rejected`. Matching will not include them |
| `admin_request_contractor_info(id, message)` | Admin | Stays `PENDING`. Stores message/admin/timestamp. Audit `contractor.info_requested` |

Matching still requires `ACTIVE` + `APPROVED` + `accepting_work` + category/area. Paying a signup fee never calls these RPCs and never auto-approves. JWT clients cannot PATCH approval fields; even admins must use the RPCs. `protect_contractor_approval` remains. Internal `contractor_approval_item` is not granted to `authenticated`.

## What is not in Phase 2

Phase 2 had no projects or estimates. Phase 3 adds them (below). Phase 4A adds bookings, a versioned fee engine, relationships, change orders, and a verified-review guard. Still no live Stripe charges, payouts, or Priority Verified.

## Phase 3 marketplace tables

Apply `supabase/migrations/20260917000001_*.sql` through `20260917000011_*.sql` after the Phase 2 files. All new tables have UUID keys, timestamps, and RLS. Files `09`–`11` only tighten grants, add estimate builder columns, and lock estimate status/money to RPCs; they do not drop data.

| Table | Purpose |
| --- | --- |
| `platform_settings` | `contractor_fee_bps` (700 ≈ 7%) and `max_participating_contractors` (3). Preview only; no charges. |
| `service_categories` | DB-managed catalog (Handyman … Other). Electrical / plumbing / HVAC are **not** seeded as ordinary unverified services. |
| `service_questions` | Smart questions per category for the customer wizard. |
| `contractor_services` | Categories a contractor offers. |
| `contractor_service_areas` | ZIP list and/or radius (miles + optional lat/lng). |
| `contractor_portfolio` | Work photos (private storage paths). |
| `contractor_credentials` | LICENSE / INSURANCE / OTHER with `NOT_SUBMITTED\|PENDING\|VERIFIED\|REJECTED\|EXPIRED`. No self-verify. |
| `projects` | Customer jobs. Statuses: `DRAFT`, `POSTED`, `MATCHING`, `CONTRACTORS_RESPONDING`, `ESTIMATES_AVAILABLE`, `CONTRACTOR_SELECTED`, `CANCELLED`. Completeness is informational (`HIGH\|MEDIUM\|MORE_INFO_NEEDED`). Customers list only their own rows. |
| `project_private_locations` | Exact street + coordinates. Not visible to opportunity contractors. |
| `project_photos` | Private storage paths. |
| `project_answers` | Answers to `service_questions`. |
| `project_status_history` | Logged on every status change. |
| `matches` | Eligible contractors after post, with fit `score` and `rank_order` (fairness-adjusted queue). |
| `opportunities` | `AVAILABLE\|ACCEPTED\|PASSED\|EXPIRED\|CLOSED`. Live **offers** are at most 3 minus participating. |
| `opportunity_slots` | Atomic max-3 **participate/accept** cap: PK `(project_id, slot_number)` with `slot_number BETWEEN 1 AND 3`. Not “who was offered.” |
| `estimate_questions` | Pre-estimate Q&A for accepted participants only. |
| `estimates` / `estimate_items` | Totals recomputed in the database. Line kinds: LABOR / MATERIALS / EQUIPMENT / CUSTOM. Duration, available_from, valid_until are informational. Fee preview is not a charge. Status/money cannot be patched from the client. |

Supporting columns on `contractor_profiles`: `accepting_work`, `min_job_cents`, `max_job_cents`, `headline`. Additive; existing rows stay.

Customer-safe views (approved contractors only, no license numbers or document paths): `contractor_public_profiles`, `contractor_public_services`, `contractor_public_areas`, `contractor_public_portfolio`, `contractor_verified_credential_badges`.

## Phase 3 RPCs

| Function | Who | What |
| --- | --- | --- |
| `post_project(id)` | Customer owner | DRAFT → POSTED → matching. |
| `accept_opportunity(id)` | Contractor | Claims a slot under a project row lock. 4th accept fails. |
| `pass_opportunity(id)` | Contractor | AVAILABLE → PASSED, then immediately backfills the next ranked unused eligible contractor into the open offer slot. |
| `contractor_end_job(id)` | Contractor | Pass/leave: AVAILABLE/ACCEPTED → PASSED (or CLOSED after paid complete). Frees unpaid connection spots and backfills the offer queue. |
| `submit_estimate(id)` | Contractor | Validates line totals + ~7% fee preview. |
| `withdraw_estimate(id)` | Contractor | Withdraws an open estimate. |
| `select_estimate(project, estimate)` | Customer | One accepted estimate; others decline; remaining opps close. **No payment.** |
| `fee_preview(cents)` | Anyone signed in | `{ total, fee, earnings, charges_live: false }`. |

Matching uses category, ZIP/radius, services, `ACTIVE` + `APPROVED`, `accepting_work`, job-size prefs, and verified credentials when a category requires them. After post, only the top **3** ranked eligible contractors receive an `AVAILABLE` opportunity. Rank = fit score minus a capped fairness penalty (recent offers in the last 14 days), then never/oldest last offered, then contractor id — so similar-quality pros rotate and the same people are not always first. Passing immediately offers the next unused eligible contractor. Out-of-area contractors never receive an opportunity. Re-running `match_project` can refill an empty slot if new people became eligible; skip itself does not rematch the whole market.

## Phase 4A

Apply `20260918000001` through `20260918000005` after Phase 3. Additive. Full rules: [PHASE4A.md](PHASE4A.md).

| Table | Purpose |
| --- | --- |
| `fee_schedules` / `fee_schedule_brackets` | Versioned ORIGINAL vs REPEAT progressive fees. Clients cannot write them. |
| `bookings` | PENDING through COMPLETED/CANCELLED/DISPUTED. Financial snapshot at confirm. `payments_live` and `charges_live` stay false. |
| `customer_contractor_relationships` | Created on first CONFIRMED booking. Protected months from `platform_settings`. |
| `change_orders` | Dual approval. Positive approved deltas count toward the snapshotted fee cap. |
| `booking_reviews` | Only COMPLETED bookings via RPC. |
| `booking_events` | Append-only audit for booking/CO/review actions. |
| `booking_contact_access` | Per-booking private-contact entitlement. Default `LOCKED`. Missing row = no access. CONFIRMED/ACCEPTED do not grant. Apply `20260922000001` then `20260924000001` after estimate-lifecycle. |

New RPCs include `preview_marketplace_fee`, `select_estimate` (now creates a PENDING booking), `cancel_pending_booking`, `confirm_booking_for_testing` (ADMIN; does **not** grant contact access), `start_booking`, `complete_booking`, `dispute_booking`, `propose_change_order`, `respond_change_order`, `submit_booking_review`, `booking_job_contact` (requires contact entitlement), `admin_grant_booking_contact_access` / `admin_revoke_booking_contact_access` (ADMIN, audited), `hire_again_contractors`.

## Phase 5A

Apply `20260920000001` through `20260920000003` after Phase 4A. Additive. Full rules: [PHASE5A.md](PHASE5A.md).

| Object | Purpose |
| --- | --- |
| `project_notices` | Lightweight in-app banners (not chat). |
| `projects.scope_revision` / `cancelled_at` | Material-edit invalidation and cancel lifecycle. |
| `update_customer_project` | Owner-only posted edits. Material changes supersede estimates. |
| `cancel_customer_project` | Owner-only delete (safe) or cancel (preserve history). |
| `list_my_customer_projects` / `get_my_customer_project` | Customer isolation: `customer_id = auth.uid()` only. |
| `booking_contact_access` / `booking_has_contact_access` | Server-authoritative private-contact gate. Default LOCKED. |

## Mutual Hired confirmation

Apply `20261005000001_mutual_hired.sql` after the existing migrations. Additive. Does not change Stripe flags or fee amounts. **Do not apply to production from the feature PR until an owner runs it.**

The live “we’re working together” row is the **booking** created by `select_estimate` (PENDING until payments are live). Both parties must click **Hired**.

| Object | Purpose |
| --- | --- |
| `bookings.customer_hired_at` / `contractor_hired_at` | Timestamps. Set only by `confirm_booking_hired`. Cannot be cleared. No un-hire RPC; existing `cancel_pending_booking` remains the pending cancel path. |
| `confirm_booking_hired(booking_id)` | Authenticated homeowner or booked pro stamps **only their own** column. Idempotent. Returns `WAITING_FOR_PRO` / `WAITING_FOR_HOMEOWNER` / `HIRED`. |
| `booking_is_mutually_hired(booking_id)` | True when both timestamps are set and the booking is not cancelled. |
| `booking_reviews.reviewer_role` | `CUSTOMER` or `CONTRACTOR`. Unique `(booking_id, reviewer_role)`. |
| `submit_booking_review` | Either participant may review the other **only after mutual Hired**. Completed booking is not required. Cancelled/disputed blocked. `platform_reviews` stay separate. |

Pending bookings with either Hired timestamp set are **not** expired by `expire_stale_pending_bookings`. Public contractor directory ratings/reviews still use homeowner→pro rows only (`reviewer_role = 'CUSTOMER'`).

## Platform reviews

Apply `20261003000001_platform_reviews.sql` on production after the existing migrations. Additive. Does not change Stripe flags.

| Object | Purpose |
| --- | --- |
| `platform_reviews` | Public reviews of the PPP marketplace (not `booking_reviews`, not Google). Columns: `id`, `user_id`, `display_name`, `city` (nullable), `rating` 1–5, `body`, `status` (`PENDING` \| `APPROVED` \| `REJECTED`), `created_at`. |
| RLS | `anon`/`authenticated` SELECT approved rows. Authenticated INSERT own row only. Users cannot update others. Admins SELECT all and UPDATE `status`. |
| Auto-approve | Signed-in valid inserts are auto-approved after length, rating, unique-user, and contact-leak checks. Guests must sign in. Admins can reject spam. One review per account. |

## How to inspect

Supabase → **Table Editor**. As the dashboard role you see all rows; that is not what the website sees. Test as a signed-in user via the client or **Authentication → Users** impersonation if you enable it later.
