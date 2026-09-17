# Priority Property Pros

**PRIORITY PROPERTY PROS LLC** — a local home-services marketplace.

**Your project. Local pros. One simple place.**

PPP connects homeowners and property owners with **independent local contractors**. PPP is **not** the contractor. This is not Angi and not Thumbtack.

This repository is **Phase 5A**: the Phase 1 homepage, Phase 2 accounts, Phase 3 posting/matching/estimates, Phase 4A booking/fee engine, plus **mobile polish, owner edit/cancel, and customer project isolation**. There are still **no Stripe charges, no payouts, and no Priority Verified workflow**. Production UI does not fake paid bookings.

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

1. **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** — create project, run SQL (including Phase 3 and Phase 4A files), set redirect URLs.
2. Add GitHub Actions **variables** (not secrets): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Never add the **service role** key.
4. Approve real contractors with **[supabase/sql/approve_contractor.sql](supabase/sql/approve_contractor.sql)** (no self-approve).

Security, tables, and marketplace flow: **[docs/SECURITY.md](docs/SECURITY.md)**, **[docs/DATABASE.md](docs/DATABASE.md)**, **[docs/MARKETPLACE_CORE.md](docs/MARKETPLACE_CORE.md)**, **[docs/PHASE4A.md](docs/PHASE4A.md)**, **[docs/PHASE5A.md](docs/PHASE5A.md)**.

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

## What Phase 4A does **not** include

No Stripe charges, payouts, Priority Verified, full messaging scanners, inspection marketplace, or INSPECTOR role. No client path to become Admin. Production UI must not fake paid/confirmed bookings (`payments_live` / `charges_live` stay false).

Copy `.env.example` to `.env.local` for local public values. Never commit a `.env` with private keys.

Architecture notes: **[docs/PHASE1.md](docs/PHASE1.md)**.

---

## License

See [LICENSE](LICENSE) — placeholder, © PRIORITY PROPERTY PROS LLC.
