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
- `protect_contractor_approval` / `protect_verifier_approval` — no self-approve
- `forbid_audit_mutation` — audit rows cannot be updated or deleted

## Attack tests (expected failures)

These are encoded as unit tests in `src/lib/auth/rlsPolicy.test.ts` and `src/lib/auth/rlsSql.test.ts`. After a live project exists, try the same with the JS client:

1. Sign in as customer A. `update profiles set account_type = 'ADMIN' where id = auth.uid()` → error.
2. Customer A `select * from profiles where id = '<customer B>'` → zero rows.
3. Contractor `update contractor_profiles set approval_status = 'APPROVED'` on their row → error.
4. Any user `insert/update/delete audit_logs` via the Data API → denied.
5. Sign up with metadata `{ "account_type": "ADMIN" }` → profile is `CUSTOMER`.

Website route guards (`RequireAuth`, `RequireRole`, `RequireAdmin`) hide screens only. They are **not** security.

## Auth redirects

Local and GitHub Pages both need allow-listed URLs (see [SUPABASE_SETUP.md](SUPABASE_SETUP.md)):

- `http://localhost:5173/auth/callback`
- `https://1319dev.github.io/priority-property-pros/auth/callback`
- matching `/auth/reset-password` and `/auth/verify`

The app builds redirects with `import.meta.env.BASE_URL` so the project path is included.

## Frontend rules

- Only `@supabase/supabase-js` with the anon key.
- No service role in `src/`.
- Session: wait for `loading` before showing `/app/*` (no flash of protected content).
- Passwords: 8+ characters on the form; configure stronger rules in Supabase Auth if you want.

## Reporting

If you find a way for a logged-in user to read another user’s row or become Admin from the website, treat it as a production incident: rotate the anon key only after fixing RLS (rotating anon does not hide it for long).
