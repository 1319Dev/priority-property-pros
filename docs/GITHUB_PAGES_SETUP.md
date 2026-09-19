# GitHub Pages setup (click by click)

This guide is for someone who is not a programmer. It publishes the Priority Property Pros Phase 1 website using **GitHub Pages** and **GitHub Actions**.

The live site URL for this repository is the custom domain at the **root** path `/`:

**https://prioritypropertypros.com/**

`public/CNAME` publishes `prioritypropertypros.com`. The GitHub project-site path `/priority-property-pros/` is no longer used in production.

Phase 1 does **not** need Supabase, Stripe, or any secret keys.

---

## A. One-time: put the code on GitHub

Skip this section if the code is already in `https://github.com/1319Dev/priority-property-pros`.

1. Sign in at [https://github.com](https://github.com) as **1319Dev**.
2. Click the **+** in the top right → **New repository**.
3. Repository name: `priority-property-pros` (exact spelling).
4. Owner: `1319Dev`.
5. Leave it **Public** (GitHub Pages on a free account is simplest with a public repo).
6. Do **not** add a README, .gitignore, or license (this project already has them).
7. Click **Create repository**.
8. On your computer, open Terminal (Mac) or Command Prompt and run, from the project folder:

```bash
git init
git add .
git commit -m "Phase 1 homepage"
git branch -M main
git remote add origin https://github.com/1319Dev/priority-property-pros.git
git push -u origin main
```

If GitHub already has the repo and this computer is set up, `git push -u origin main` is enough after a commit.

---

## B. Enable GitHub Pages (Actions)

Do this once per repository.

1. Open **https://github.com/1319Dev/priority-property-pros**.
2. Click the **Settings** tab (top of the repository).
3. In the left sidebar, click **Pages**.
4. Under **Build and deployment**:
   - **Source**: choose **GitHub Actions** (not “Deploy from a branch”).
5. Under **Custom domain**, enter `prioritypropertypros.com` (apex). GitHub will also read `public/CNAME` after the next deploy. Follow GitHub’s DNS instructions for the apex record.
6. You do **not** need to pick a folder. The workflow file `.github/workflows/ci-pages.yml` builds the site and deploys it.

The first deploy happens automatically when `main` receives a push **after** Pages is set to GitHub Actions. If you enabled Pages after the last push:

7. Click the **Actions** tab.
8. In the left list, click **CI and GitHub Pages**.
9. Click **Run workflow** → **Run workflow** on branch **main**.

---

## C. Approve the first Pages deploy (if GitHub asks)

The first time, GitHub may wait for you:

1. Open the **Actions** tab.
2. Click the latest **CI and GitHub Pages** run.
3. If you see **Review deployments** or **Waiting for review**, click it.
4. Check **github-pages**.
5. Click **Approve and deploy**.

Wait until the **Deploy GitHub Pages** job shows a green check.

---

## D. Open the live site

1. Go to **Settings → Pages** again.
2. At the top, GitHub shows **Your site is live at** plus a URL.
3. For this repo, it should be:

   `https://prioritypropertypros.com/`

4. Open that URL on your phone and on a computer.

### What to verify after deploy

- The homepage headline includes **YOUR PROJECT. LOCAL PROS. ONE SIMPLE PLACE.** (or the same words in title case).
- **POST A PROJECT** asks customers to sign in. **BECOME A PRO** points contractors to signup/onboarding.
- Header links work: Find a Pro, How It Works, Become a Pro, Sign In.
- Popular services include Handyman, TV Mounting, Lawn Care, and Other.
- Refreshing a sub-page such as `/trust` still shows the app (not a GitHub 404 page). That proves the SPA `404.html` fallback.
- On a phone: Add to Home Screen works (Safari: Share → Add to Home Screen; Chrome: menu → Install app / Add to Home screen). The PPP house icon should appear.
- Turn on airplane mode after visiting once, then reopen the app: you should still see the site or the cream **You’re offline** screen.

---

## E. Root custom domain vs `/priority-property-pros/`

Production is the custom domain at the site root. The old project-site path remains documented only as a fallback.

| How you host | Site URL | `BASE_PATH` in the workflow |
| --- | --- | --- |
| Custom domain at the root (current) | `https://prioritypropertypros.com/` | `/` |
| GitHub project site (legacy) | `https://1319Dev.github.io/priority-property-pros/` | `/priority-property-pros/` |

The workflow file `.github/workflows/ci-pages.yml` currently sets:

```yaml
BASE_PATH: /
```

`public/CNAME` must contain exactly:

```
prioritypropertypros.com
```

To keep the site at the **custom domain root**:

1. Connect `prioritypropertypros.com` in **Settings → Pages → Custom domain**. Follow GitHub’s DNS instructions.
2. Keep `BASE_PATH: /` in `.github/workflows/ci-pages.yml`.
3. Keep `public/CNAME` as `prioritypropertypros.com`.
4. Commit and push to `main` if you changed either file.
5. Wait for Actions to finish.

Local preview always defaults to `/` (no env var needed):

```bash
npm install
npm run dev
```

Production-like preview of the **custom domain** path:

```bash
BASE_PATH=/ npm run build
npx vite preview --base /
```

---

## F. How to update later

1. Change files on your computer (or merge an approved pull request into `main`).
2. Commit and push to **main**.
3. Open the **Actions** tab and wait for a green check.
4. Hard-refresh the live site (on iPhone Safari: pull to refresh, or close the tab and reopen).

---

## G. How to roll back

1. Open **https://github.com/1319Dev/priority-property-pros**.
2. Click **Commits** (or the clock/history icon on the file list).
3. Find the last commit you trusted. Click it.
4. Click **Browse files** `<>` then the **Code** dropdown → **Download ZIP** if you only need a copy.
5. To put the site back: click the commit, then the three dots **…** → **Revert** if GitHub offers it, **or** ask a developer to reset `main` to that commit and force-push (only if you understand that this rewrites history).

Simplest non-programmer rollback:

1. Actions tab → a previous successful **CI and GitHub Pages** run on `main`.
2. You cannot re-deploy an old artifact from the UI alone without a new commit. Instead, restore the files with a revert commit (GitHub: commit page → **Revert**) and let Actions publish again.

---

## H. Secrets, variables, and later phases

**Public (GitHub Actions → Variables, not Secrets):**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Click-by-click: [SUPABASE_SETUP.md](SUPABASE_SETUP.md) section E.

Do **not** add Stripe keys, database passwords, or a Supabase **service role** key to this repository or to Actions.

`.env.example` lists public placeholders. Copy to `.env.local` on your computer only.

_Deploy note: repo is public; Pages source is GitHub Actions._