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

## What is not in Phase 2

Phase 2 had no projects or estimates. Phase 3 adds them (below). Phase 4A adds bookings and the fee engine. Phase 4B adds Stripe Connect **test-mode** payments. Live charges stay off.

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
| `projects` | Customer jobs. Statuses: `DRAFT`, `POSTED`, `MATCHING`, `CONTRACTORS_RESPONDING`, `ESTIMATES_AVAILABLE`, `CONTRACTOR_SELECTED`. Completeness is informational (`HIGH\|MEDIUM\|MORE_INFO_NEEDED`). |
| `project_private_locations` | Exact street + coordinates. Not visible to opportunity contractors. |
| `project_photos` | Private storage paths. |
| `project_answers` | Answers to `service_questions`. |
| `project_status_history` | Logged on every status change. |
| `matches` | Eligible contractors after post. |
| `opportunities` | `AVAILABLE\|ACCEPTED\|PASSED\|EXPIRED\|CLOSED`. |
| `opportunity_slots` | Atomic max-3: PK `(project_id, slot_number)` with `slot_number BETWEEN 1 AND 3`. |
| `estimate_questions` | Pre-estimate Q&A for accepted participants only. |
| `estimates` / `estimate_items` | Totals recomputed in the database. Line kinds: LABOR / MATERIALS / EQUIPMENT / CUSTOM. Duration, available_from, valid_until are informational. Fee preview is not a charge. Status/money cannot be patched from the client. |

Supporting columns on `contractor_profiles`: `accepting_work`, `min_job_cents`, `max_job_cents`, `headline`. Additive; existing rows stay.

Customer-safe views (approved contractors only, no license numbers or document paths): `contractor_public_profiles`, `contractor_public_services`, `contractor_public_areas`, `contractor_public_portfolio`, `contractor_verified_credential_badges`.

## Phase 3 RPCs

| Function | Who | What |
| --- | --- | --- |
| `post_project(id)` | Customer owner | DRAFT → POSTED → matching. |
| `accept_opportunity(id)` | Contractor | Claims a slot under a project row lock. 4th accept fails. |
| `pass_opportunity(id)` | Contractor | AVAILABLE → PASSED. |
| `submit_estimate(id)` | Contractor | Validates line totals + ~7% fee preview. |
| `withdraw_estimate(id)` | Contractor | Withdraws an open estimate. |
| `select_estimate(project, estimate)` | Customer | One accepted estimate; others decline; remaining opps close. **No payment.** |
| `fee_preview(cents)` | Anyone signed in | `{ total, fee, earnings, charges_live: false }`. |

Matching uses category, ZIP/radius, services, `ACTIVE` + `APPROVED`, `accepting_work`, job-size prefs, and verified credentials when a category requires them.

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

New RPCs include `preview_marketplace_fee`, `select_estimate` (now creates a PENDING booking **and a payment schedule**), `cancel_pending_booking`, `confirm_booking_for_testing` (ADMIN, not the real payment path), `confirm_booking_from_payment` (server/webhook only), `start_booking`, `complete_booking`, `dispute_booking`, `propose_change_order`, `respond_change_order`, `submit_booking_review`, `booking_job_contact`, `hire_again_contractors`.

## Phase 4B

Apply `20260919000001` through `20260919000006` after Phase 4A. Additive. Full rules: [PHASE4B.md](PHASE4B.md). `payments_live` and `charges_live` stay 0.

| Table | Purpose |
| --- | --- |
| `contractor_stripe_accounts` | Connect Express mapping. Status synced server-side. |
| `payment_schedules` / `payment_schedule_items` | Deposit / milestone / final / approved CO. |
| `payments` | PaymentIntent / Checkout refs. Test mode only. |
| `stripe_events` | Webhook idempotency. Admin-only select. |
| `ledger_entries` | Append-only integer-cent ledger. |
| `contractor_transfers` | PENDING → ELIGIBLE → TRANSFERRED / HELD. |
| `refunds` / `stripe_disputes` / `booking_cancellations` | Refund, chargeback vs PPP dispute, cancellation audit. |

Webhook RPCs are `service_role` only. Clients cannot insert/update financial rows.

## How to inspect

Supabase → **Table Editor**. As the dashboard role you see all rows; that is not what the website sees. Test as a signed-in user via the client or **Authentication → Users** impersonation if you enable it later.
