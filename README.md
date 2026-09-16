# Priority Property Pros

**PRIORITY PROPERTY PROS LLC** — a local home-services marketplace.

**Your project. Local pros. One simple place.**

PPP connects homeowners and property owners with **independent local contractors**. PPP is **not** the contractor. This is not Angi and not Thumbtack.

This repository is **Phase 1 only**: a polished, installable website (homepage + design system + PWA) that you can publish with GitHub Pages. There is **no login, no payments, and no database** yet.

---

## Look at it on your computer

You need [Node.js 22](https://nodejs.org/) (LTS). Then, in this folder:

```bash
npm install
npm run dev
```

Your browser should open a local address such as `http://localhost:5173`. That is the homepage.

Other commands (for builders):

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run preview
```

`npm run preview` shows the production build at `http://localhost:4173`.

To build **exactly** as GitHub Pages will for this repo:

```bash
BASE_PATH=/priority-property-pros/ npm run build
npx vite preview --base /priority-property-pros/
```

Then open `http://localhost:4173/priority-property-pros/`.

---

## Put it on the internet (GitHub Pages)

The owner of this code is **1319Dev**. The repository name is **priority-property-pros**.

### 1. Create the GitHub repository and push (if needed)

1. Sign in at github.com as **1319Dev**.
2. Click **+** (top right) → **New repository**.
3. Name it `priority-property-pros`. Owner: `1319Dev`. Public is fine.
4. Do **not** initialize with a README (this project already has one).
5. Create the repository, then push `main` (or merge this Phase 1 branch into `main`).

### 2. Turn on GitHub Pages using Actions

1. Open **https://github.com/1319Dev/priority-property-pros**.
2. Click **Settings**.
3. Click **Pages** on the left.
4. Under **Build and deployment → Source**, choose **GitHub Actions**.
5. If the site does not build by itself, click **Actions** → **CI and GitHub Pages** → **Run workflow** on **main**.
6. If GitHub asks you to **Review deployments**, approve **github-pages**.

### 3. Open the live URL and check it

Project site (current CI setting):

**https://1319Dev.github.io/priority-property-pros/**

Check:

- Tagline and both buttons (**POST A PROJECT**, **BECOME A PRIORITY PRO**)
- All homepage sections (services, how it works, contractors, Priority Verified is clearly **not live**, trust & safety)
- Menu links do not break when you refresh
- Phone: **Add to Home Screen** shows the PPP house icon

### 4. Update later

Push to **main** → wait for the green check on the **Actions** tab → refresh the live site.

### 5. Roll back

On GitHub, open the last good commit → **Revert** → wait for Actions. Details: [docs/GITHUB_PAGES_SETUP.md](docs/GITHUB_PAGES_SETUP.md).

### Custom domain (root path) vs project path

| Hosting | Example URL | `BASE_PATH` in `.github/workflows/ci-pages.yml` |
| --- | --- | --- |
| GitHub project site | `https://1319Dev.github.io/priority-property-pros/` | `/priority-property-pros/` |
| Custom domain at root | `https://your-domain.com/` | `/` |

The app uses `import.meta.env.BASE_URL` so assets and routes follow whichever base you set. Local `npm run dev` uses `/`.

Full click-by-click guide: **[docs/GITHUB_PAGES_SETUP.md](docs/GITHUB_PAGES_SETUP.md)**.

---

## What Phase 1 includes

- Mobile-first homepage (iPhone first, then Android, tablet, laptop, desktop)
- Original logo, wordmark, favicon, and PWA icons
- Design system tokens (forest green, cream, charcoal, gold)
- PWA: installable, manifest, service worker, offline screen
- Placeholder pages: Find a Pro, How It Works, Become a Pro, Sign In, Post a Project, Trust
- GitHub Actions: install, typecheck, lint, test, build, Pages deploy

Architecture notes: **[docs/PHASE1.md](docs/PHASE1.md)**.

## What Phase 1 does **not** include

No Supabase. No real accounts. No Stripe. No database. You do **not** need any secret keys to run or publish Phase 1.

Copy `.env.example` only if you want local public labels. Never commit a `.env` with private keys.

---

## License

See [LICENSE](LICENSE) — placeholder, © PRIORITY PROPERTY PROS LLC.
