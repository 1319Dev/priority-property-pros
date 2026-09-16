# Database — Phase 2

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

No projects, estimates, payments, Stripe, messages, change orders, or Priority Verified workflow tables.

## How to inspect

Supabase → **Table Editor**. As the dashboard role you see all rows; that is not what the website sees. Test as a signed-in user via the client or **Authentication → Users** impersonation if you enable it later.
