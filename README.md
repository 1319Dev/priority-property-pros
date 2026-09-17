# Priority Property Pros

**PRIORITY PROPERTY PROS LLC** — a local home-services marketplace.

**Your project. Local pros. One simple place.**

PPP connects homeowners and property owners with **independent local contractors**. PPP is **not** the contractor. This is not Angi and not Thumbtack.

This repository is **Phase 4B**: Phase 1–4A plus **Stripe Connect TEST-MODE** payments (Express onboarding, PaymentIntents/Checkout for card+ACH, verified webhooks, ledger, transfer eligibility). **Live charges stay off** (`payments_live=0`, `charges_live=0`). Production UI does not treat a Stripe redirect as confirmation.

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

### Connect accounts and the marketplace (Phase 2 + 3)

Accounts and posting need a Supabase project. The homepage works without it.

1. **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** — create project, run SQL (including Phase 3, 4A, and 4B files), set redirect URLs.
2. Add GitHub Actions **variables** (not secrets): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optionally `VITE_STRIPE_PUBLISHABLE_KEY` (`pk_test_` only).
3. Never add the **service role** key, `STRIPE_SECRET_KEY`, or `STRIPE_WEBHOOK_SECRET` to Vite or Actions secrets-as-build-env.
4. Approve real contractors with **[supabase/sql/approve_contractor.sql](supabase/sql/approve_contractor.sql)** (no self-approve).

Security, tables, and marketplace flow: **[docs/SECURITY.md](docs/SECURITY.md)**, **[docs/DATABASE.md](docs/DATABASE.md)**, **[docs/MARKETPLACE_CORE.md](docs/MARKETPLACE_CORE.md)**, **[docs/PHASE4A.md](docs/PHASE4A.md)**, **[docs/PHASE4B.md](docs/PHASE4B.md)**.

---

## What Phase 3 includes

- Everything from Phase 1 (homepage, brand, PWA, GitHub Pages)
- Everything from Phase 2 (accounts, profiles, RLS, role dashboards)
- Customer POST A PROJECT wizard (drafts, photos, DB questions, protected street address)
- Contractor onboarding (services, area, portfolio, credentials — no self-verify)
- Matching with an atomic max of 3 participating contractors
- Pre-estimate Q&A, estimates with validated totals and a **~7% fee preview** (`charges_live: false`)
- Customer compare + SELECT THIS PRO (creates a **PENDING booking**, does not confirm or charge)
- Versioned progressive marketplace fee engine (integer cents; ORIGINAL vs REPEAT)
- Hire Again foundation, change orders with dual approval, verified reviews on COMPLETED bookings only
- Stripe Connect **test-mode** checkout (card + ACH), connected-account onboarding, webhook ledger, transfer eligibility

## What Phase 4B does **not** include

No **live** Stripe charges or payouts, Priority Verified, full messaging scanners, inspection marketplace, or INSPECTOR role. No client path to become Admin. `payments_live` / `charges_live` stay false. Do not put Stripe secret/webhook secrets or `service_role` in Vite.

Copy `.env.example` to `.env.local` for local public values. Never commit a `.env` with private keys.

Architecture notes: **[docs/PHASE1.md](docs/PHASE1.md)**.

---

## License

See [LICENSE](LICENSE) — placeholder, © PRIORITY PROPERTY PROS LLC.
