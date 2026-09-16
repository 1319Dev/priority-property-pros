# Priority Property Pros

**PRIORITY PROPERTY PROS LLC** — a local home-services marketplace.

**Your project. Local pros. One simple place.**

PPP connects homeowners and property owners with **independent local contractors**. PPP is **not** the contractor. This is not Angi and not Thumbtack.

This repository is **Phase 2**: the Phase 1 homepage, design system, and PWA, plus **accounts, profiles, and Row Level Security**. There is still **no live job posting, no payments, and no Stripe**.

Live public site (Phase 1 behavior stays): **https://1319dev.github.io/priority-property-pros/**

---

## Look at it on your computer

You need [Node.js 22](https://nodejs.org/) (LTS). Then, in this folder:

```bash
npm install
npm run dev
```

Your browser should open a local address such as `http://localhost:5173`. That is the homepage.

Login will show **not configured** until you add a real Supabase URL and anon key. That is expected. Follow **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** (click by click).

Other commands (for builders):

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run preview
```

To build **exactly** as GitHub Pages will for this repo:

```bash
BASE_PATH=/priority-property-pros/ npm run build
npx vite preview --base /priority-property-pros/
```

Then open `http://localhost:4173/priority-property-pros/`.

---

## Put it on the internet (GitHub Pages)

The owner of this code is **1319Dev**. The repository name is **priority-property-pros**.

### Turn on GitHub Pages using Actions

1. Open **https://github.com/1319Dev/priority-property-pros**.
2. Click **Settings** → **Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to **main** (or wait for an approved merge). Approve the first Pages deploy if GitHub asks.

Project site:

**https://1319Dev.github.io/priority-property-pros/**

Full click-by-click: **[docs/GITHUB_PAGES_SETUP.md](docs/GITHUB_PAGES_SETUP.md)**.

### Connect accounts (Phase 2)

Accounts need a Supabase project. The homepage works without it.

1. **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** — create project, run SQL, set redirect URLs.
2. Add GitHub Actions **variables** (not secrets): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Never add the **service role** key.

Security and tables: **[docs/SECURITY.md](docs/SECURITY.md)**, **[docs/DATABASE.md](docs/DATABASE.md)**.

---

## What Phase 2 includes

- Everything from Phase 1 (homepage, brand, PWA, GitHub Pages)
- Supabase browser client (anon key only)
- Tables: profiles, contractor_profiles, verifier_profiles, agreements, agreement_acceptances, audit_logs
- Signup trigger that **cannot** create ADMIN from the website
- RLS deny-by-default
- Sign up / sign in / sign out / password reset / email verification UI
- Role dashboards with empty states (`/app/customer`, `/app/pro`, `/app/verifier`, `/app/admin`)
- Protected routes (UX only — RLS is the lock)

## What Phase 2 does **not** include

No live project posting, matching, estimates, payments, Stripe, messaging, change orders, or Priority Verified workflow. No client path to become Admin.

Copy `.env.example` to `.env.local` for local public values. Never commit a `.env` with private keys.

Architecture notes: **[docs/PHASE1.md](docs/PHASE1.md)**.

---

## License

See [LICENSE](LICENSE) — placeholder, © PRIORITY PROPERTY PROS LLC.
