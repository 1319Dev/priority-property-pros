# Security — Phase 2

Priority Property Pros treats the **database** as the authority for roles. The website is a convenience. Row Level Security (RLS) is the real lock.

## What is public vs secret

| Item | Public? | Where it lives |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | `.env.example`, GitHub **Actions variables**, the built JS |
| `VITE_SUPABASE_ANON_KEY` | Yes (by design) | Same. Protected by RLS, not by hiding the key |
| GitHub Pages site | Yes | Static files |
| `SUPABASE_SERVICE_ROLE_KEY` | **No** | Supabase dashboard only. Never Vite, never git, never Actions |
| Database password | **No** | Password manager only |
| Stripe keys | **No** | Not used in Phase 2 |

Anyone can read the anon key from the browser. That is expected. Policies must still deny other people’s rows.

## Roles

Account types: `CUSTOMER`, `CONTRACTOR`, `VERIFIER`, `ADMIN`.

- Public signup offers only the first three.
- `raw_user_meta_data.account_type` of `ADMIN` (or anything else) is stored as `CUSTOMER`.
- No button, RPC, or profile update on the website can set `ADMIN`.
- First admin: `supabase/sql/promote_first_admin.sql` in the SQL editor.

Account statuses: `ACTIVE`, `PENDING`, `SUSPENDED`, `DISABLED`, `DELETED`.

- Owners cannot change their own `account_type` or `account_status`.
- Suspended / disabled / deleted users who still have a session are sent to `/account/status`.

## RLS (deny by default)

Every Phase 2 table has `ENABLE ROW LEVEL SECURITY`. There is **no** policy that allows:

- `anon` to read `profiles`
- `authenticated` to `INSERT` or `DELETE` `profiles` (the signup trigger creates the row)
- anyone to `UPDATE`/`DELETE` `audit_logs`
- a user to `SELECT` another user’s profile unless `is_admin()`
- a contractor/verifier to change `approval_status`

`public.is_admin()` is `SECURITY DEFINER` and reads `profiles` internally so admin policies do not recurse (`is_admin` → profiles RLS → `is_admin` …).

Protected-column triggers still fire even if someone tampers with a REST call:

- `profiles_protect_columns` — no client `ADMIN` assignment; no owner status/role edits
- `protect_contractor_approval` / `protect_verifier_approval` — no self-approve; contractor approval/reject/info-request only via admin RPCs
- `forbid_audit_mutation` — audit rows cannot be updated or deleted

## Attack tests (expected failures)

These are encoded as unit tests in `src/lib/auth/rlsPolicy.test.ts` and `src/lib/auth/rlsSql.test.ts`. After a live project exists, try the same with the JS client:

1. Sign in as customer A. `update profiles set account_type = 'ADMIN' where id = auth.uid()` → error.
2. Customer A `select * from profiles where id = '<customer B>'` → zero rows.
3. Contractor `update contractor_profiles set approval_status = 'APPROVED'` on their row → error.
4. Admin `update contractor_profiles set approval_status = 'APPROVED'` via the Data API (not the RPC) → error (`approval changes must go through admin RPCs`).
5. Non-admin `admin_approve_contractor` / `admin_reject_contractor` → error.
6. Any user `insert/update/delete audit_logs` via the Data API → denied.
7. Sign up with metadata `{ "account_type": "ADMIN" }` → profile is `CUSTOMER`.

Website route guards (`RequireAuth`, `RequireRole`, `RequireAdmin`) hide screens only. They are **not** security.

## Phase 3 marketplace RLS

New tables are deny-by-default with RLS. Extra rules:

- Exact street lives in `project_private_locations`. Opportunity contractors see city / ZIP only.
- Customers cannot `SELECT` `AVAILABLE` opportunities (matching pool is hidden).
- Contractors cannot set credential `status` to `VERIFIED`.
- Estimate `ACCEPTED` / project `CONTRACTOR_SELECTED` happen only through `select_estimate`. Contractors cannot PATCH an estimate to `ACCEPTED` or rewrite money columns; `protect_estimate_row` allows those changes only from submit/withdraw/select/recompute.
- Slot table PK + `SELECT … FOR UPDATE` on the project row cap participating contractors at 3. Live **offers** are a separate cap of 3 minus participating; `match_project` / `fill_project_opportunity_offers` / `rank_project_matches` stay internal (no `authenticated` grant). `pass_opportunity` is granted to signed-in contractors and backfills one unused eligible contractor.
- Storage buckets `project-photos` and `contractor-docs` are private. Credential files are owner/admin; portfolio images of **approved** contractors may be read by signed-in users.

`public.is_admin()` remains `SECURITY DEFINER`. New helpers (`current_contractor_profile_id`, `is_project_owner`, `contractor_has_open_opportunity`, `contractor_is_selected_on_project`) are also definer functions with `search_path = public`.

Marketplace RPCs (`post_project`, `accept_opportunity`, `pass_opportunity`, `submit_estimate`, `withdraw_estimate`, `select_estimate`, `fee_preview`) are `SECURITY DEFINER` on purpose. Postgres grants `EXECUTE` to `PUBLIC` by default; migrations `20260917000009` and `20260917000010` **revoke** that from `anon` (and from `PUBLIC`). Signed-in users may call the intended RPCs. Internal helpers (`match_project`, trigger functions, `write_audit_log`) are not granted to `anon` or `authenticated`.

Customer-safe views (`contractor_public_profiles`, `contractor_public_services`, `contractor_public_areas`, `contractor_public_portfolio`, `contractor_verified_credential_badges`) are `SECURITY DEFINER` on purpose: they expose **approved** contractors and only safe columns (no license numbers, no document paths). Underlying tables stay own-or-admin. This is **not** a Priority Verified badge.

There are **no Stripe charges** in Phase 3 or Phase 4A. `fee_preview` and `preview_marketplace_fee` always return `charges_live: false` and `payments_live: false`.

### Phase 4A

- Exact street unlocks only via `booking_contact_access` entitlement (`UNLOCKED` or `ADMIN_OVERRIDE`) for the hired contractor. `booking_is_confirmed_for_contractor` now delegates to that helper. Selection and CONFIRMED are not enough.
- Phone/email after entitlement go through `booking_job_contact`, not open `profiles` SELECT. CONFIRMED does not grant access. `admin_grant_booking_contact_access` is ADMIN-only, per booking, audited.
- Bookings, fee snapshots, relationships, change-order approvals, and reviews cannot be written from the client except through SECURITY DEFINER RPCs that check `auth.uid()` / `is_admin()`.
- `confirm_booking_for_testing` is ADMIN-only. Customers and contractors cannot spoof CONFIRMED.
- Repeat pricing and relationships are server-assigned.
- `ADMIN` is still not self-assignable. Contractor approval is admin-only via RPCs (not self-serve, not a signup fee). Max-3 matching is unchanged. VERIFIER remains; there is no INSPECTOR role.

### Phase 5A

- Customer project SELECT is split: owners see `customer_id = auth.uid()` only. Contractors use `contractor_can_read_project`. Admins keep `is_admin()`.
- `list_my_customer_projects` / `get_my_customer_project` cannot return another customer’s rows.
- Posted material edits and cancel/delete go through SECURITY DEFINER RPCs that check `auth.uid()`.
- Exact street still unlocks only after **contact entitlement** (hire + job fee, or a targeted admin override). CONFIRMED alone is not enough.

### Admin contractor approvals

- `admin_approve_contractor`, `admin_reject_contractor`, and `admin_request_contractor_info` are `SECURITY DEFINER`, check `is_admin()`, and `GRANT EXECUTE` to `authenticated` (revoked from `anon` / `PUBLIC`).
- JWT clients cannot self-approve. Admins cannot PATCH approval columns from the Data API; `protect_contractor_approval` requires the admin RPCs.
- Reject does not delete. Matching still requires `ACTIVE` + `APPROVED` (+ `accepting_work` and category/area).
- Paying a signup fee never auto-approves. This work does not change `payments_live` or `charges_live`.

### Contact-access entitlement

Private street, phone, email, and coordinates are gated by `booking_contact_access.status`:

- `LOCKED` (default, including existing CONFIRMED bookings)
- `UNLOCKED` (reserved for a future successful job-fee payment; stub is not wired while `payments_live`/`charges_live` are off)
- `ADMIN_OVERRIDE` (targeted admin RPC with reason + audit log)

`booking_job_contact` and `project_private_locations` RLS require that entitlement for the hired contractor. Unrelated contractors never inherit access. Missing entitlement rows are treated as no access. ACCEPTED and CONFIRMED never unlock. This work does not change `payments_live` or `charges_live`.

Estimate-lifecycle scanners block obvious phone / email / URL / handle patterns in notes, bios, and messages. Dedicated street / phone / email / coordinates stay on this entitlement path. Unauthorized RPC, notification, and estimate_event payloads must not include those private fields.

Supabase database advisors will still flag SECURITY DEFINER views and authenticated RPC grants. That is expected. Do not drop the views or revoke signed-in access to `post_project` / `accept_opportunity` / `select_estimate`.

## Self-service account delete

- The website only calls Edge Function `delete-account` for the **current** session. Clients cannot pass another user’s id.
- `purge_account_owned_rows` is `SECURITY DEFINER` and `require_service_role()` — revoked from `anon` and `authenticated`.
- The Edge Function then deletes `auth.users` with the service role. Profile / contractor rows cascade from that. Related bookings and connections are cleaned first so foreign keys do not block the close.
- The last **active** admin cannot delete themselves.
- Deleting a user does not revoke an already-issued JWT by itself. The website signs out immediately after a successful delete.

## Auth redirects

Local and the live custom domain both need allow-listed URLs (see [SUPABASE_SETUP.md](SUPABASE_SETUP.md)):

- `http://localhost:5173/auth/callback`
- `https://prioritypropertypros.com/auth/callback`
- matching `/auth/reset-password` and `/auth/verify`

The app builds redirects with `import.meta.env.BASE_URL` so a non-root base path is included when present. The production custom domain uses `/`.

## Frontend rules

- Only `@supabase/supabase-js` with the anon key.
- No service role in `src/`.
- Session: wait for `loading` before showing `/app/*` (no flash of protected content).
- Passwords: 8+ characters on the form; configure stronger rules in Supabase Auth if you want.

## Reporting

If you find a way for a logged-in user to read another user’s row or become Admin from the website, treat it as a production incident: rotate the anon key only after fixing RLS (rotating anon does not hide it for long).
