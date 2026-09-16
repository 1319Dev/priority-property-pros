# Supabase setup (click by click)

This guide is for someone who is not a programmer. It connects **accounts and the database** to the Priority Property Pros website.

Phase 1 (homepage, PWA, GitHub Pages) already works without this. Phase 2 **adds** login. It does **not** replace the homepage.

You will create a free Supabase project, paste two **public** values into GitHub, and run SQL files.

**Never** paste a **service role** key into the website, `.env`, or GitHub Actions.

---

## A. Create the Supabase project

1. Open [https://supabase.com](https://supabase.com) and sign in (GitHub login is fine).
2. Click **New project**.
3. Organization: your personal org is fine.
4. **Name:** `priority-property-pros` (or similar).
5. **Database password:** click Generate. **Copy it into a password manager.** You will not put this password in GitHub.
6. **Region:** pick the closest US region.
7. Click **Create new project**. Wait until the dashboard says the project is ready (about a minute).

---

## B. Copy the two PUBLIC keys

1. In the left sidebar click **Project Settings** (gear).
2. Click **API**.
3. Copy **Project URL**. It looks like `https://abcdefghijk.supabase.co`.
4. Copy **anon public** key (labeled `anon` `public`). It is a long string starting with `eyJ`.
5. Leave **service_role** alone. Do not copy it into the app.

On your computer (optional, for `npm run dev`):

```bash
cp .env.example .env.local
```

Open `.env.local` and replace:

- `VITE_SUPABASE_URL=` with your Project URL
- `VITE_SUPABASE_ANON_KEY=` with the anon public key

Do not commit `.env.local`.

---

## C. Run the database migrations

1. In Supabase, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. On your computer, open the folder `supabase/migrations/` in this repo.
4. Open each file **in this order**, copy the entire contents, paste into the SQL editor, click **Run**:

   1. `20260916000001_enums.sql`
   2. `20260916000002_profiles.sql`
   3. `20260916000003_contractor_verifier_profiles.sql`
   4. `20260916000004_agreements.sql`
   5. `20260916000005_audit_logs.sql`
   6. `20260916000006_signup_trigger.sql`
   7. `20260916000007_rls.sql`
   8. `20260916000008_seed_agreements.sql`
   9. `20260917000001_phase3_enums_settings.sql`
   10. `20260917000002_phase3_service_catalog.sql`
   11. `20260917000003_phase3_contractor_expansion.sql`
   12. `20260917000004_phase3_projects.sql`
   13. `20260917000005_phase3_matching_estimates.sql`
   14. `20260917000006_phase3_functions.sql`
   15. `20260917000007_phase3_rls_storage.sql`
   16. `20260917000008_phase3_seed_catalog.sql`
   17. `20260917000009_phase3_function_grants.sql`
   18. `20260917000010_phase3_phase2_function_grants.sql`
   19. `20260917000011_phase3_estimate_builder_guards.sql`

5. If a file says it already exists, stop and ask a developer — do not skip ahead.
6. Phase 2 Table Editor should list `profiles`, `contractor_profiles`, `verifier_profiles`, `agreements`, `agreement_acceptances`, `audit_logs`.
7. After Phase 3, you should also see `service_categories`, `projects`, `opportunities`, `estimates`, and related tables. **Do not delete users or profiles.** Optional: `supabase/sql/approve_contractor.sql` to approve a real contractor so matching can include them. There is no website self-approve.

---

## D. Turn on email auth (and nothing else required)

1. Left sidebar → **Authentication** → **Providers**.
2. **Email** should already be enabled. Leave it on.
3. Open **Authentication** → **URL Configuration**.
4. **Site URL** (pick the one you actually use first):

   - Local testing: `http://localhost:5173`
   - Live GitHub Pages: `https://1319dev.github.io/priority-property-pros`

5. Under **Redirect URLs**, add **all** of these (Add URL → Save each):

   - `http://localhost:5173/auth/callback`
   - `http://localhost:5173/auth/reset-password`
   - `http://localhost:5173/auth/verify`
   - `https://1319dev.github.io/priority-property-pros/auth/callback`
   - `https://1319dev.github.io/priority-property-pros/auth/reset-password`
   - `https://1319dev.github.io/priority-property-pros/auth/verify`

6. **Authentication** → **Providers** → Email → enable **Confirm email** (recommended).

Confirm emails from the default Supabase mailbox are enough to start. Custom SMTP can wait.

---

## E. GitHub Actions / GitHub Pages (PUBLIC variables only)

The live site is built by GitHub Actions. Vite bakes `VITE_*` values in at **build** time.

1. Open [https://github.com/1319Dev/priority-property-pros](https://github.com/1319Dev/priority-property-pros).
2. **Settings** → **Secrets and variables** → **Actions**.
3. Click the **Variables** tab (not Secrets).
4. **New repository variable** → name `VITE_SUPABASE_URL` → paste the Project URL → Add.
5. **New repository variable** → name `VITE_SUPABASE_ANON_KEY` → paste the anon public key → Add.
6. Do **not** create a variable or secret named `SUPABASE_SERVICE_ROLE_KEY`.
7. Open **Actions** → **CI and GitHub Pages** → **Run workflow** on `main` after this Phase 2 branch is merged (or the next push to `main`).

Until those variables exist, CI still **builds** (the homepage stays up). Login on the live site will show “not configured”.

---

## F. First admin (SQL only — no website button)

Public signup never creates an Admin.

1. On the website, create a normal **Customer** account with **your** email.
2. Confirm the email from the inbox.
3. In Supabase **SQL Editor**, open the repo file `supabase/sql/promote_first_admin.sql`.
4. Replace `YOUR-ADMIN-EMAIL@example.com` with the email you just confirmed.
5. Run the script.
6. Sign out and sign in again. You should land on `/app/admin`.

If it fails with “No auth user”, you signed up with a different email. Check **Authentication → Users**.

---

## G. What success looks like

- Homepage still matches Phase 1 (tagline, services, PWA).
- **Sign in** is a real form.
- **Create account** asks “How will you use Priority Property Pros?” with Customer / Contractor / Verifier only.
- After confirm, a customer opens `/app/customer` and can start **POST A PROJECT**.
- A contractor opens `/app/pro` for onboarding and opportunities (approval is SQL-only).
- A contractor cannot open `/app/admin`.
- Forgot password sends mail (once URLs in section D are saved).
- There is **no** Stripe checkout. Estimate screens show a fee **preview** only.

---

## H. If something fails

| Symptom | Likely cause |
| --- | --- |
| Banner “Live login is not connected yet” | Missing or placeholder `VITE_SUPABASE_*` in `.env.local` or GitHub variables |
| Redirect lands on GitHub 404 | Redirect URL missing the `/priority-property-pros/` prefix |
| Sign up works, no row in `profiles` | Migration `20260916000006_signup_trigger.sql` not run |
| “Invalid API key” | Anon key truncated, or you pasted the service role key |

Full security notes: [SECURITY.md](SECURITY.md). Table list: [DATABASE.md](DATABASE.md).
