# Phase 5A — Mobile marketplace polish, owner edit/cancel, customer privacy

Additive on Phase 4A. **Stripe stays paused.** `payments_live` and `charges_live` remain false. Do not merge Phase 4B (PR #6) with this work.

Apply after Phase 4A, in filename order:

25. `20260920000001_phase5a_lifecycle.sql`
26. `20260920000002_phase5a_rpcs.sql`
27. `20260920000003_phase5a_privacy_rls.sql`

Timestamps start at `20260920` on purpose so they do **not** collide with Phase 4B’s `20260919` files.

These files do **not** drop users, projects, estimates, bookings, or fee schedules.

## Customer privacy (hard gate)

A customer may see **only their own projects**. This is enforced in Postgres, not by hiding cards in the UI.

- `projects_select_owner`: `customer_id = auth.uid()`
- `list_my_customer_projects()` / `get_my_customer_project(id)` return rows only for `auth.uid()`
- Edit, cancel, photos, answers, notices, private location, estimates, and bookings keep owner (or separately authorized contractor/admin) checks
- Changing a project ID in the URL yields **not found**, not another customer’s job
- Find-a-pro / public browse does not list private project records
- Contractors still see only authorized opportunity fields (city/ZIP, not street/phone/email until a booking is **confirmed**)
- Admins keep intended cross-project access

## Human project states

Customer UI maps database status + booking status to:

Draft · Posted · Finding Pros · Estimates Received · Contractor Selected · Booking · Active · Completed · Cancelled

Raw enums are not shown on customer screens.

## Edit (owner-only, server RPC `update_customer_project`)

Eligible fields: title, category (when safe), description, answers, photos, city/state/ZIP, street (still private), schedule, budget.

| Situation | Minor (title, timing, budget) | Material (description, answers, photos, location, category) |
| --- | --- | --- |
| Draft | Direct save | Direct save |
| Posted, no participation | Saved | Saved |
| Posted, contractors accepted or estimates submitted | Saved; estimates stay valid | **Not silent.** Owner must confirm. Submitted/revised/draft estimates become `SUPERSEDED`. Pros get a banner: previous estimates are out of date and must be resubmitted. Project returns to Finding Pros. |
| Contractor selected, pending booking | Blocked | Blocked until the pending booking is cancelled |
| Confirmed / in progress / completed / disputed | Blocked | Blocked. Use a change order. |
| Category after participation | — | **Blocked.** Service type cannot change after contractors priced the job. |

Posted edits cannot be done with a raw client `UPDATE`. The trigger requires the RPC.

## Delete vs cancel (`cancel_customer_project`)

| Situation | Action |
| --- | --- |
| Draft / posted with no opportunities, estimates, or bookings | Permanent **delete** after confirmation |
| Posted with matching or participation, or any booking row | **Cancel**: leave marketplace, close open opportunities, keep estimate/audit history, status `CANCELLED` |
| Selected, booking still pending | Cancel pending booking + cancel project. **No relationship** is created from selection alone. Exact address was never shared. |
| Confirmed / in progress / completed / disputed | **Blocked.** No destructive delete. |

Cancelled jobs drop out of contractor **active** opportunities. Contractors who already participated can still see a **history** row.

## iPhone homepage

The house graphic tagline is HTML (`A marketplace, not a crew`), not SVG text. It wraps on 320–430px widths, does not clip against the illustration, and the public shell leaves space above the bottom nav (`pb-32`).

## Testing this branch without merging to production

GitHub Pages still deploys **only from `main`**. This PR uploads a CI artifact named `ppp-iphone-preview` (the `dist` folder). Download it from the Actions run for the PR, or check out this branch and run:

```bash
npm ci
npm run dev
```

On a phone, use the local URL if the computer is on the same network, or open the built files after `npm run build && npm run preview`.
