# Priority Property Pros — master implementation roadmap

Date: 2026-10-11. Planning only. This document does not change the app, the database, Stripe, or GitHub Pages.

Baseline verified against the repo at `origin/main` **`2d4933a`** (“Use support@prioritypropertypros.com as the public contact email”, PR #91), the live Supabase project `bersftkjpbzpgtahbqwd`, and the 2026-10-10 audits (`code-db-security`, `browser-findings`) plus the Request This Pro Again plan. The live site is https://prioritypropertypros.com.

Every later PR still needs Garrett’s explicit approval before merge, deploy, a production migration, a Stripe change, or a new paid service. Fees stay **$9.99** one-time activation for both roles and **$4.99** Connect per project connection, including rehires. Job payments stay off-platform. Plymate Property Maintenance stays fee-exempt through `signup_fee_status = NOT_REQUIRED` (a data flag, not a hardcoded business-name waiver).

---

## 1. How to read this

| Status | Meaning |
| --- | --- |
| **Done** | On `main` and matches the spec. Leave the behavior alone. |
| **Partial** | A real slice exists. The remaining gap is a later PR in this roadmap. |
| **In flight** | Already being built. Do not open a second PR for the same change. |
| **Missing** | Not on `main` and not covered by an open PR or an in-flight workstream. |

In-flight work to plan around, not restart:

| ID | What | Where it lives today |
| --- | --- | --- |
| **(a)** | Notification history and notification fixes | Separate build. No open PR yet. |
| **(b)** | Portfolio photo rendering, admin PPP-1004 contact label, message preview, stray name-only message, phone format, privacy notice after unlock | Separate build. No open PR yet. |
| **(c)** | Signup and auth: confirm password, server-side password rules, failed-login errors, squashed role cards | Separate build. No open PR yet. |
| **(d)** | Legal documents and server-side acceptance recording | Draft pages are PR **#87**. Acceptance recording is the rest of (d). |
| **(e)** | Safe account deletion | Draft PR **#90**. |

Priority Help is draft PRs **#82–#85**. The contact form is draft PR **#92**. Those six PRs are the implementation for those phases. Review and land them. Do not rewrite them.

---

## 2. What is already live

Confirmed on `main` and, per the 2026-10-10 audit, deployed:

| Shipped | Commit / PR | What it locked in |
| --- | --- | --- |
| Paid Connect survives hire | #86 | `booking_job_contact` and the entitlement functions. Contact stays unlocked for that project after hire. |
| Contractor end-job | #88 | A paid connection can be completed. The end-job RPC sets a marker so its own writes pass the money guards. |
| Change-order validation | #89 | Both parties. Invalid amounts rejected. Contractor acknowledgement is not customer approval. |
| Block exclusion | #74 | A blocked pro is left out of that customer’s future matching and Hire again. |
| Public support email | #91 | `support@prioritypropertypros.com`. The public bundle no longer shows the old Gmail address. |

Also holding, and treated as done unless a later PR is explicitly about a named gap:

- Role cannot be escalated to admin at signup (`handle_new_user`, `permitted_signup_account_type`). Customers become active after email confirmation. Contractors start pending.
- Profile email and role cannot be changed from the client. `signup_fee_status` and `account_status` are trigger-protected. A client cannot set PAID or ACTIVE.
- Signup checkout and connection checkout use the server-side Stripe price (**999** and **499** cents). Fulfillment checks amount and livemode. Webhooks are idempotent on `processor_event_id` and session id. Password reset uses the `token_hash` flow.
- Unpaid and pending contractors cannot accept real offers, insert estimates, or reserve a connection.
- Contact stays locked until the $4.99 for **that project** is paid and the hire is mutual. Street and phone appear after the customer shares. Other customers and unmatched pros get nothing.
- RLS is on every public table. Admin RPCs call `is_admin()`. Storage buckets `project-photos` and `contractor-docs` are private. Pending portfolio photos are owner-and-admin only.
- One review per role per booking, one booking per estimate, one live booking per project, one accepted estimate per project, one active connection per project and pro, max 3 opportunity slots and 3 connection slots.
- Customer flow that already works: post, match, estimate with computed money columns, view, select, mutual hire, change orders, start, complete, booking review, edit a review down to a low rating, block.
- Contractor profile already has accepting-work, credentials, insurance, and re-review only when credential fields change (`IDENTITY_REVIEW_FIELDS` in `src/lib/marketplace/profileManage.ts`).
- Admin already has overview metrics, contractor approve / reject / request-info, portfolio photo moderation, platform-review moderation with a required reason, booking lookup by PPP number, contact grant/revoke with a reason, and a two-factor enrollment page.
- Tests on this commit: typecheck pass, lint pass, Vitest **926/926 with `TZ=UTC`**, Playwright **71/71**, production build on Node 22.

---

## 3. Requirement matrix

### Phase 1 — security, legal, data integrity

| Requirement | Status | Evidence |
| --- | --- | --- |
| Terms of Use and Privacy Policy pages | **In flight (d) / #87** | No `/terms` or `/privacy` on `main`. Footer has no legal links. #87 adds draft pages behind `VITE_PUBLISH_LEGAL_PAGES`, so a merge with the flag unset still publishes nothing. |
| Refund & Cancellation, Community Guidelines, Contractor Participation Terms, Review & Content Guidelines | **Missing** | #87 drafts Terms and Privacy only. No other legal routes or docs. |
| Signup and footer link to the legal pages | **In flight (d)** | `SIGNUP_TERMS_ACCEPTANCE` in `src/data/pricing.ts` is plain text. Checkbox in `src/pages/SignUpPage.tsx` is not a link. |
| Server-side acceptance of document version and timestamp, enforced on the server | **Partial, rest is (d)** | `agreements` and `agreement_acceptances` exist. `handle_new_user` records the current `terms-of-use` and `privacy-policy` rows when signup metadata says terms were accepted. Seed body in `20260916000008_seed_agreements.sql` is a Phase 2 placeholder. `20261001000001_non_refundable_platform_fees.sql` updates the terms row for the non-refundable fees. #87 does not replace those rows. |
| Drafts to Garrett, then a lawyer, before publish | **In flight** | #87 is still draft and says so. |
| Account deletion: reauth, anonymize, keep financial and audit rows, keep the other party’s history, block active jobs, atomic | **In flight #90** | Live `delete-account` calls `purge_account_owned_rows` and then deletes the auth user. Payment and counterparty rows cascade. UI confirms by typing DELETE, with no password reauth (`src/components/account/DeleteAccountDialog.tsx`). |
| Admin MFA: enroll, recover, no bypass, step-up, no lockout, stay optional until Garrett says otherwise | **Partial** | Enrollment and step-up UI: `src/pages/app/admin/AdminTwoFactorPage.tsx`, `src/lib/auth/adminMfa.ts`, `RequireAdmin` in `src/lib/auth/guards.tsx`. `platform_settings.admin_mfa_required` defaults to 0 in `20261013000001_admin_mfa_required.sql`. No recovery codes. Support admin is not enrolled. |
| Server-side password rules, confirm password, clear failed-login errors, squashed role cards | **In flight (c)** | Client minimum is 8 characters in `SignUpPage.tsx`. No confirm field. Sign-in shows the raw Supabase error. Server minimum is the Supabase default. Role cards are `src/pages/SignUpRolePage.tsx`. |
| Leaked-password protection | **Missing** | Supabase advisor `auth_leaked_password_protection`. Dashboard setting. No repo switch. |
| Expired sessions, secure reset | **Done** | Reset flow is the token-hash path. Session handling is Supabase Auth. |
| Change email with verification | **Missing** | Profiles trigger rejects client email edits (`email cannot be changed from the client` in `20260916000007_rls.sql`). Account page shows email read-only. |
| Login and signup abuse protection | **Partial** | MFA UI handles HTTP 429. No app-level login throttle beyond Supabase Auth defaults. |
| No role escalation | **Done** | See section 2. |
| Email confirmation behavior | **Done** | Customers wait for confirmation. Contractors start pending. |
| Audit the six legacy test-mode edge functions and remove them only after proving they are unused | **Missing as an action** | Not in the repo. Documented as `LEGACY_JOB_PAYMENT_FUNCTIONS` in `src/lib/marketplace/connectionCheckout.ts`. Still deployed: `stripe-webhook`, `create-payment-intent`, `create-connect-account-link`, `create-transfer`, `create-refund`, `confirm-signup-fee-session`. They require test-mode keys or `cs_test_` sessions. |
| Webhook signatures accept every `v1` during key rotation | **Missing** | `supabase/functions/_shared/webhook.ts` builds a map with `Object.fromEntries`, so a repeated `v1` keeps only the last value. |
| Amount, currency, idempotency, duplicate prevention, server-side status | **Done** for the two live checkouts | Signup and connection webhooks. There is no in-app refund function. `reject_signup_or_connection_fee_refund()` always raises. |
| Checkout return URLs limited to this site | **Missing** | `allowedOrigin` in `supabase/functions/_shared/supabase.ts` allows `SITE_URL`, localhost, and any other `https` host. |

### Phase 2 — broken core behavior

| Requirement | Status | Evidence |
| --- | --- | --- |
| Notification history loads, with no raw technical error | **In flight (a)** | `/app/customer/notifications` and `/app/pro/notifications` render `NotificationHistoryPage`. The bell and that page both call `useNotifications()`, which does `channel(\`notifications:${user.id}\`).on(...).subscribe()`. A second subscriber on the same topic throws `cannot add postgres_changes callbacks after subscribe()`. That matches the blank history page. |
| Project number, project name, and a deep link on each notice | **Partial, rest is (a)** | `noticeProjectLine` and `noticeBody` in `src/lib/marketplace/contractorPolish.ts` already know how to format a title and PPP number when the payload has them. Home cards and the bell often show the generic title only. |
| Stale notices cleared or marked historical | **In flight (a)** | `CustomerEstimateHomeCards` lists every `estimate.*` row, including after hire (`src/components/marketplace/CustomerEstimateHomeCards.tsx`). |
| Customer settings omit contractor-only alerts | **In flight (a)** | `NOTIFICATION_CATEGORIES` includes `new_job` (“A job is offered in your service area.”) for every role. `src/components/notifications/NotificationSettings.tsx` renders the full list. |
| Read, unread, no duplicate rows | **Partial, rest is (a)** | History marks unread. The bell and the history page each subscribe, which is the duplicate-channel bug. |
| Approved portfolio photos render; pending and rejected stay private | **In flight (b)** | `toPublicSafePortfolioItem` in `src/lib/marketplace/publicDirectory.ts` drops anything that is not `PUBLIC_SAFE`, and it also drops `storage_path`. The public card is a caption. Find a Pro and the profile render a beige placeholder. Signed URLs already exist for owner flows in `src/lib/marketplace/api.ts`. |
| Admin PPP-1004 contact label follows the paid Connect | **In flight (b)** | `AdminBookingsPage` in `src/pages/app/AdminPages.tsx` always leads with “Grant contact access” and locked copy. Entitlement after #86 is the source of truth. |
| Inbox preview, stray name-only message, phone format, privacy notice after a real unlock | **In flight (b)** | `inboxPreview()` returns “No message text yet” when the preview equals the sender name (`src/lib/marketplace/messaging.ts`). `formatPhoneDisplay()` exists in `contractorPolish.ts` and is used on the contractor booking card, not everywhere a phone is shown. Locked-contact copy still renders beside an unlocked contact. |
| “Approximate location” after the address is actually unlocked | **Missing** | Heading is hardcoded in `src/pages/app/pro/ProMarketplacePages.tsx` and `ProBookingPages.tsx`. |
| “Contact is shared after you connect” on a project that is already paid and hired | **Missing** | Fallback string in `src/lib/marketplace/publicDirectory.ts`. |
| Change order shows its real amount | **Missing** | `changeOrderAmountLabel(0)` returns “No price change” (`contractorPolish.ts`). A “Materials increase” row displayed that way is a display bug. Validation rules from #89 stay as they are. |
| Passed jobs do not advertise open connection slots | **Missing** | `connectionLifecycle.ts` and a hardcoded “3 connection spots available” fallback in `ProMarketplacePages.tsx`. |
| History rows show project numbers | **Partial** | `JobReference` hides itself when `reference_number` is null. Passed-job history can omit both title and number. |
| Fee-exempt accounts do not see a $9.99 activation banner | **Partial** | Customers honor `hidePlatformPricing`. A contractor with `NOT_REQUIRED` still sees the $9.99 banner next to “Activation: Not required”. |
| Review stars are not preselected | **Missing** | `useState("5")` in `src/pages/app/customer/BookingPages.tsx` and `src/pages/app/pro/ProBookingPages.tsx`. Public `ReviewsPage` uses `useState(5)`. |
| Mobile: truncated header names, bottom nav covering buttons, keyboard overlap | **Missing** | `DashboardShell` pins a bottom nav. Header names use `truncate`. No keyboard-inset handling. |

### Phase 3 — customer

| Requirement | Status | Evidence |
| --- | --- | --- |
| Overview, my projects, messages | **Done** | `/app/customer`, `/app/customer/projects`, `/app/customer/messages`. Nav in `CustomerShell.tsx`. |
| Post a project, photos, edit eligible fields, Q&A, compare, select, mutual hire, booking, change orders, complete and cancel | **Done** | Wizard, `ProjectEditPage`, question APIs, `CompareEstimatesPage`, `selectEstimate`, `HiredConfirmationCard`, `ChangeOrderPanel`, booking actions. |
| Drafts | **Partial** | The wizard keeps a browser session (`wizardSession.ts`). A server `DRAFT` project is not a customer-facing draft. |
| Estimates, hired, change orders, reviews as their own sections | **Partial** | They live inside the project and the booking. Nav says Bookings, not Hired. |
| Notifications | **Partial / (a)** | Route exists. It is not in the customer nav. History is the blank-page bug. |
| Billing and payments | **Missing** | No page. Customers do not pay the $4.99. The page is a read-only activation record plus “you pay the pro directly”. |
| Settings | **Partial** | `/app/customer/account` and notification settings. No email change. Deletion is the unsafe live function until #90. |
| Help | **Missing** | Support email in the shell footer. No help page. Priority Help widget is #84, not deployed. |
| Review after a qualifying completed job | **Partial** | The review form appears at mutual hire (`canSeeReviewCta` in `src/lib/marketplace/hired.ts`), before the job is completed. |
| Verified reviews on the public profile, rating and count, one per job | **Done** | Public directory reviews and `booking_reviews_one_per_role`. |
| Report a review, contractor response | **Missing** | Content reports exist for portfolio photos, not for booking reviews. No response column. |
| Admin moderation of booking reviews | **Missing** | Booking reviews publish through `submit_booking_review`. Admins moderate **platform** testimonials only. |
| Block a pro | **Done** | #74. `customer_contractor_blocks`. UI on the account blocked list. |
| Request this pro again, 48-hour exclusive window, pro pays $4.99, then the customer chooses “Send to other pros” or “No thanks” | **Missing** | Hire again lists completed relationships and links to the wizard with `?pro=`. `ProjectWizardPage` only shows a note. `post_project` ignores the id. The earlier plan’s 24-hour auto-open is **not** what the master spec says. See PR-C4. |

### Phase 4 — contractor

| Requirement | Status | Evidence |
| --- | --- | --- |
| Overview, opportunities, estimates, messages, profile | **Done** | `/app/pro`, Jobs (`OpportunitiesPage`), `/app/pro/estimates`, messages, `/app/pro/profile`. |
| Hired jobs, next step, project numbers when the row has one | **Partial** | Hired tab and `hiredJobNextStep()`. Bookings repeats the same hired list (`ProBookingsPage`). |
| Schedule | **Missing** | Start time is a field on the hired card. No schedule view. |
| Reviews received | **Missing** | Public profile shows them. The pro has no “my reviews” page. |
| Portfolio | **Partial** | Managed on the profile page. Public rendering is (b). |
| Billing history from server rows | **Missing** | Activation status on the shared account page. No list of signup charges or connection checkouts. |
| Notifications, settings, help | **Partial** | Notification route exists and is blank until (a). Settings are the account page. No help page. |
| Estimate statuses and timestamps | **Partial** | UI maps Draft, Sent, Viewed, Accepted, Not Selected, Superseded, Withdrawn. There is no Cancelled label. Viewed and submitted timestamps show. A full event timeline does not. |
| No actions on a closed job | **Partial** | History tab is read-only. Connect and pass are gated. Passed jobs still show slot copy (Phase 2). |
| Credentials and insurance, re-review only for credential edits | **Done** | `ProProfilePages.tsx`, `profileManage.ts`. |

### Phase 5 — admin

| Requirement | Status | Evidence |
| --- | --- | --- |
| Overview with real counts | **Partial** | `AdminOverviewPage` and `admin_dashboard_summary`. Money cards that have no source say “Not set up yet”. Support-ticket definition in `20261014120000_admin_dashboard_rpcs.sql` still says email `prioritypropertypros@gmail.com`. |
| Homeowners, contractors, suspend and restore with reason and audit, deletion requests, hide-test | **Missing** | Approvals can approve, reject, and request info. A suspended account shows a banner. There is no suspend RPC and no people directory. Overview has an include-test toggle. Approvals does not. |
| Projects list with filters and the full lifecycle | **Missing** | Booking tools look up one PPP number. |
| Payments dashboard | **Missing** | Overview has revenue totals. No transaction list. |
| Refunds restricted, confirmed, reasoned, audited. Never mark an unpaid row paid. | **Missing, and it conflicts with current policy** | Platform fees are non-refundable in product copy and in `reject_signup_or_connection_fee_refund()`. Building a refund button is an owner decision. See PR-A6. |
| Platform testimonials moderated before they go public | **Partial** | Admin can approve or reject (`AdminReviewsPage`, `admin_set_platform_review_status`). Insert path forces `APPROVED` in `protect_platform_review()` unless an admin inserts `PENDING`. |
| Booking-review moderation, evidence-based | **Missing** | No queue. |
| Messages and support, disputes | **Partial** | #92 and #85 are the future inboxes. Disputes are a count on the overview. |
| Audit log viewer, tamper-protected, covering the spec’s action list | **Partial** | `audit_logs` is admin-select and service-role insert. Overview shows recent activity, including duplicate “Account flag updated” rows. Missing events include connection-fee paid (that one lives in `connection_checkout_events`), change orders, booking start and complete, reviews, blocks, account deletion outcome, and portfolio moderation. |
| Settings that cannot change fees by themselves | **Missing** | Fees live in SQL functions and `platform_settings`. No settings screen. |
| Security and 2FA, My admin account | **Partial** | Pages exist. Enforcement is off. See Phase 1. |
| Grouped, responsive nav | **Partial** | Groups exist in `adminNav.ts` for the six real pages. The spec’s other destinations are absent on purpose until a page is real. |

### Phase 6 — Priority Help

| Requirement | Status | Evidence |
| --- | --- | --- |
| Policies as source of truth, no invented answers, no private data, no admin data, no actions, labelled AI, human handoff, escalation, rate and cost limits, privacy notice | **In flight #82–#85** | Not deployed. No `priority-help` function on `main`. |
| Ask before a paid AI provider | **Open owner decision** | #83 can ship with the provider unset. |
| Widget stays off nav, forms, and checkout | **Verify inside #84** | #84 mounts the widget from `AppShell` and `DashboardShell`, which is also where the bottom nav lives. |

### Phase 7 — contact

| Requirement | Status | Evidence |
| --- | --- | --- |
| Form: name, email, account type, subject, message, optional project number, safe attachments, spam protection, rate limit, secure storage, admin inbox | **In flight #92** | Live `/contact` is a mailto form (`src/pages/ContactPage.tsx`). |
| Confirmation email | **Blocked on Resend** | #92 must not send mail through an unapproved provider. |

### Phase 8 — public site

| Requirement | Status | Evidence |
| --- | --- | --- |
| Homepage workflow in six steps | **Missing** | `src/features/home/HowItWorks.tsx` is four steps. |
| Remove the “not a directory” contradiction | **Missing** | Find a Pro is in the nav. “Not a directory” copy still lives in the browse and reviewed-pro modules. |
| Fee explanation with no guarantee of a job, an estimate, or a match | **Partial** | Pricing and trust pages say the fees and the non-guarantee. Nearby lines still say “not a separate PPP trade” and “not for the right to buy your phone number”, which the browser audit found confusing. |
| Find a Pro | **Partial** | Directory, neutral labels, and storefronts work. Filter layout is misaligned. Profile titles are not links. An extra card looks out of place. Photos are (b). |
| Trust content with no fabricated numbers | **Done** | Trust and reviews read real rows. Empty state is “No reviewed contractors yet”. Leave that honesty in place. |
| Brand polish without a redesign | **Done** as the current visual system | Later copy PRs stay inside the existing components. |

### Phase 9 — SEO, performance, accessibility

| Requirement | Status | Evidence |
| --- | --- | --- |
| Unique title and description per public page | **Missing** | `usePageTitle` is used by Find a Pro only (`src/lib/seo/usePageTitle.ts`). `index.html` supplies one title and one description. |
| Canonical URL per page | **Missing** | `index.html` canonical is `https://prioritypropertypros.com/`. |
| Open Graph image as an absolute PNG | **Missing** | `og:image` is `%BASE_URL%og-image.svg`. |
| Sitemap and robots | **Partial** | `public/sitemap.xml` lists nine public URLs. `public/robots.txt` points at it. Legal URLs are absent until they publish. |
| Structured data | **Missing** | No `application/ld+json`. |
| `noindex` on private pages | **Missing** | App routes are a client-side SPA. The HTML shell is indexable. |
| Bundle splitting and lazy routes | **Partial** | Admin routes are lazy in `src/App.tsx`. Public, customer, and pro pages are eager. `vite.config.ts` sets no manual chunks. Largest bundle is about 916 KB (about 255 KB gzipped). |
| Indexes after measuring | **Deferred** | About 66 unindexed foreign keys and about 38 RLS policies that re-check `auth.uid()` per row. Irrelevant at current size (10 profiles, 4 projects). |
| Contrast, keyboard, focus, labels, screen readers, touch targets, modals | **Partial** | `:focus-visible` exists. Gold eyebrow text fails contrast. A star-rating `<p>` uses a prohibited `aria-label`. Bottom nav touch targets need the mobile PR. |

### Phase 10 — testing

| Requirement | Status | Evidence |
| --- | --- | --- |
| Automated suite for current behavior | **Done** | 926 Vitest, 71 Playwright, SQL tests under `supabase/tests/`. |
| Timezone-stable unit test | **Missing** | `addProtectionMonths` uses `Date.setMonth` (local). `relationships.test.ts` expects a UTC ISO string from `2026-01-15T00:00:00Z`. It fails outside UTC. CI sets `TZ=UTC`. |
| End-to-end coverage of every role in a safe environment, plus security tests, plus a browser pass | **Partial** | Playwright covers responsive layout and blocks. It does not walk deletion, legal acceptance, request-again, admin people, or payments. Each PR below names the tests it adds. |

### Phase 11 — launch readiness

| Requirement | Status | Evidence |
| --- | --- | --- |
| Admin launch report for Conroe and Montgomery County, with funnel numbers and an explicit risk list | **Missing** | Overview trends exist (signups, projects, hires, checkouts). There is no launch-readiness view and no county filter. |
| Ready to market | **No** | Legal pages 404, live deletion can destroy payment rows, admin MFA is off. Those three are the gate. Review moderation and per-page SEO come immediately after. |

---

## 4. Reusable code

Build on these. Do not fork a second copy.

| Need | Use |
| --- | --- |
| Routes and role gates | `src/App.tsx`, `src/lib/auth/guards.tsx`, `dashboardPath` in `src/lib/auth/publicEntry.ts` |
| Customer, pro, admin chrome | `src/components/layout/DashboardShell.tsx`, `CustomerShell.tsx`, `ProShell.tsx`, `src/components/admin/adminNav.ts` |
| Marketplace writes | `src/lib/marketplace/api.ts` and the small modules next to it: `bookings.ts`, `hired.ts`, `changeOrders.ts`, `messaging.ts`, `connectionCheckout.ts`, `projectPost.ts`, `publicDirectory.ts`, `profileManage.ts`, `contractorBlocks.ts` |
| Fees and “am I exempt?” | `src/lib/signupFee/`, `src/lib/auth/platformPricing.ts`, `connection_fee_cents()`, `signup_fee_cents()`. Read them. Do not reimplement 499 or 999 in a component. |
| Public labels and contact privacy | `publicDirectory.ts`, `privacy.ts`, `message_pair_has_connection_entitlement`, `booking_job_contact`, `share_project_contact` |
| PPP numbers | `src/lib/marketplace/projectReference.ts`, `JobReference` |
| Phone, money labels, notice lines | `src/lib/marketplace/contractorPolish.ts` (`formatPhoneDisplay`, `changeOrderAmountLabel`, `noticeProjectLine`) |
| Notifications | `src/lib/notifications/useNotifications.ts`, `src/lib/notifications/api.ts`, `supabase/functions/_shared/notificationPolicy.ts` (re-exported by `src/lib/notifications/policy.ts`), `send-notification` |
| Portfolio bytes | `createSignedUrl` in `api.ts` for private buckets. Public rendering must keep using the `PUBLIC_SAFE` gate. |
| Admin metrics | `src/lib/admin/dashboardApi.ts` and the RPCs in `20261014120000_admin_dashboard_rpcs.sql` |
| Admin review decisions | `src/lib/admin/` review helpers and `admin_set_platform_review_status` |
| Audit rows | `write_audit_log()` — service role only |
| Agreements | `agreements` / `agreement_acceptances`. New versions are new rows with `is_current`. Old acceptances stay. |
| Legal page shell, once #87 lands | `src/pages/LegalDocumentPage.tsx`, `src/components/legal/LegalMarkdown.tsx`, `src/lib/legal/publish.ts` |
| Contact form, once #92 lands | `supabase/functions/contact-form/`, `src/lib/contact/`, `AdminContactMessagesPage` |
| Priority Help, once #82–#85 land | `priority_help` tables, `supabase/functions/priority-help/`, `src/components/support/PriorityHelp.tsx`, `SupportPages.tsx` |
| SQL tests and rollbacks | `supabase/tests/`, `supabase/rollbacks/`. Every migration ships both. |
| Copy that must stay honest | `src/data/pricing.ts`, `src/data/brand.ts`, `src/data/faq.ts` |

Hire again, for the request-again PR, must be rebuilt from the **current** `hire_again_contractors` on `main` (neutral label until that pair has a paid Connect, plus the #74 block filter). The October 10 plan’s warning that #74 was unmerged is stale. #74 is `d4e4fe3` on `main`.

---

## 5. Do-not-touch register

A PR that touches any row below needs Garrett’s explicit approval in the PR description before it is merged. “Explicit” means he named that area. A general “go build the roadmap” is not approval to edit these.

| Area | Where it lives | What a PR is allowed to do without a new approval |
| --- | --- | --- |
| Live Stripe configuration, products, prices, webhook endpoint | Stripe dashboard, not the repo | Nothing from this repo. |
| $9.99 activation and $4.99 Connect, including rehires | `signup_fee_cents`, `connection_fee_cents()`, checkout edge functions, `src/data/pricing.ts` copy | Read the values. Add a regression test that fails if either value changes. |
| Payment and refund records | `signup_fee_charges`, `connection_checkout_sessions`, ledger and refund tables, their FKs | Read them. Deletion must anonymize around them (#90). No new writer that marks an unpaid row paid. |
| Hidden 7% legacy field | `platform_settings.contractor_fee_bps` (700), set in `20260917000001_phase3_enums_settings.sql` | Leave the column and the value. |
| Legacy job-fee schedules | `fee_schedules` REPEAT row, `select_estimate` writing `fee_kind = REPEAT`, `feeEngine.ts` | Leave them. They do not charge today (`payments_live` and `charges_live` are off). Waking them up is a separate decision. |
| Migration history | `supabase/migrations/` already applied | Add a new timestamped file. Never edit a migration that has shipped. |
| Matching and hiring rules | `match_project`, `fill_project_opportunity_offers`, `accept_opportunity`, `select_estimate`, `contractor_eligible_for_project`, the 3-slot caps | PR-C4 is the one planned change, and it waits for approval. Other PRs do not edit these functions. |
| Entitlement | `booking_job_contact`, `message_pair_has_connection_entitlement`, `share_project_contact`, contact-access grants | Display code may **read** entitlement. It may not redefine it. |
| Plymate exemption | `signup_fee_status = NOT_REQUIRED` on that account | Any banner or gate keeps treating `NOT_REQUIRED` as exempt. |
| End-job money-guard bypass | `contractor_end_job` marker, `20261015000002_contractor_end_job_prod_guards.sql` | PR-S4 narrows it, and only with approval. |
| Turning admin MFA on | `admin_mfa_required` | The flag stays 0 until Garrett has enrolled a phone factor and a backup and says to flip it. |

Stale pull requests to leave closed-to-new-work: **#3, #6, #8, #9, #12, #17, #25**. #6 is the old Stripe Connect job-payment branch and stays unmerged. #17 is an older legal draft superseded by #87.

---

## 6. Order, dependencies, and what can run together

Land security and data-integrity work first. Broken screens next. Then customer, contractor, and admin surfaces. Priority Help and the contact form are already in review and can merge when their diffs are clean. Public copy, SEO, and the launch report come after the legal pages exist so the copy quotes the real documents.

### Serial because they edit the same files

1. **#90** before **(b)** if both still touch `src/lib/marketplace/messaging.ts`. #90’s diff includes `messaging.ts` and `messaging.test.ts`. Rebase (b) onto #90, or split the messaging hunk out of #90 if it is only incidental.
2. **(c)** and **(d)** both need `SignUpPage.tsx`. Finish password and role-card UX, then add the legal links and the acceptance call, or the reverse. One rebases.
3. **#87** (footer and shells), **#84** (widget in `AppShell` and `DashboardShell`), **#92** and **#85** (both edit `adminNav.ts`, `App.tsx`, and admin pages). Suggested rebase order: #87, then #92, then #84, then #85. #82 and #83 do not touch those files.
4. Admin page PRs (A2 through A11) each add one nav item. They share `adminNav.ts` and `App.tsx`, so they merge one at a time.
5. **PR-S2** and **PR-S3** both edit `supabase/functions/_shared/`. Land S2, then S3.

### Safe in parallel

| Lane | PRs | Why they do not collide |
| --- | --- | --- |
| Deletion | #90 | Its own migration, edge function, and dialog, once the messaging overlap with (b) is settled. |
| Notifications | (a) | `useNotifications.ts`, history page, settings, notification policy. |
| Photos and messages | (b) | `publicDirectory.ts`, storefront, `AdminPages.tsx` contact panel, `messaging.ts` (after #90). |
| Auth UX | (c) | `SignUpPage.tsx`, `SignInPage.tsx`, `SignUpRolePage.tsx`, auth config notes. |
| Priority Help database and function | #82, then #83 | New migration and a new function directory. |
| Checkout hardening | PR-S2 after the in-flight signup work | `allowedOrigin` and the two create-checkout functions. |
| Platform-review hold | PR-S6 | `protect_platform_review` and `ReviewsPage`. |
| Settings exposure | PR-S5 | A new public view over `platform_settings`. |
| Timezone test | PR-Q1 | One unit test and `addProtectionMonths`. |
| Job-label bugs | PR-B2, PR-B3, PR-B4 | Polish helpers and pro/customer job pages, after (b) so copy is not edited twice. |
| SEO titles | PR-E1 | `src/lib/seo/` and page headers. Keep it off `App.tsx` route tables that #84, #85, #87, and #92 are editing. |
| Request-again database | PR-C4a | New table plus a reviewed edit of `fill_project_opportunity_offers`. Nothing else in this roadmap edits that function. |

Do not start PR-C4, PR-S4, PR-A6, or a Resend / paid-AI / `pg_cron` change until the approval line in that PR is actually granted.

---

## 7. PR by PR

Every PR below is one logical change, reviewable on its own, with a rollback note. Each PR report still lists: files, tests (the full existing suite, with the timezone note until PR-Q1 lands), migrations, security effect, Stripe effect, rollback, open issues, and whether it is ready.

Risk words: **Low** means display or tests. **Medium** means RLS, a new table, or a user-facing flow. **High** means money rows, matching, entitlement, or auth deletion.

---

### In flight — do not open a duplicate

#### (a) Notification history and notification fixes

- **Priority:** P0. Both dashboards’ history pages are blank.
- **Problem:** Two `useNotifications()` callers share `notifications:${userId}`. The second `.on("postgres_changes")` runs after `subscribe()` and throws. Customers also see the contractor “New jobs” category. Estimate cards on the customer home keep “New estimate received” after hire. Some notices omit the PPP number and a link.
- **Files / DB:** `src/lib/notifications/useNotifications.ts`, `src/pages/app/NotificationHistoryPage.tsx`, `src/components/notifications/NotificationSettings.tsx`, `supabase/functions/_shared/notificationPolicy.ts`, `src/components/marketplace/CustomerEstimateHomeCards.tsx`. Payload shape for `noticeProjectLine` if titles are empty because the row never stored `project_title` / `reference_number`. No fee tables.
- **Proposed solution:** One shared channel for the signed-in user, or a channel name per subscriber, with `.on()` only before `subscribe()`. History shows the existing rows, a normal empty state, and a plain-language error. Deep link uses the project id already on the notification. Customer settings hide `new_job`. Home estimate cards drop rows whose project is already hired, cancelled, or whose estimate is no longer the live one. Read and unread stay. Do not insert a second row for the same event.
- **Depends on:** nothing.
- **Risk:** Medium. Realtime and preference rows. No Stripe.
- **Tests:** Unit test that a second subscriber does not call `.on()` on an already subscribed channel. Settings test that a customer payload omits `new_job` and a contractor payload keeps it. Home-card test that a hired project hides `estimate.received`. Playwright: open history as customer and as pro and see a real row.
- **User-visible result:** Notification history lists real notices with the job name, PPP number, and a link. Customers no longer see “New jobs”. The hired project no longer shows a fresh-estimate card.
- **Do-not-touch:** No. Reads notifications. Does not change matching, fees, or entitlement.

#### (b) Portfolio photos, admin contact label, message preview, phone, privacy notice

- **Priority:** P0 for the photo and the admin label. P1 for preview, phone, and the notice.
- **Problem:** Approved portfolio photos render as beige “Portfolio photo” bars on Find a Pro and the public profile. Admin booking PPP-1004 says contact is locked after a paid Connect. Inbox preview says “No message text yet” when the preview equals the sender name. A thread row shows only the business name. Phone formatting is inconsistent. A privacy notice still says contact is hidden on a thread that is already unlocked.
- **Files / DB:** `src/lib/marketplace/publicDirectory.ts`, `src/lib/marketplace/findAPro.ts`, `src/features/findAPro/ContractorStorefront.tsx`, storage read path in `src/lib/marketplace/api.ts`, `src/pages/app/AdminPages.tsx` contact panel, `src/lib/marketplace/messaging.ts`, `src/pages/app/messages/ProjectMessagesPage.tsx`, `formatPhoneDisplay` call sites. Reuse `PUBLIC_SAFE` and the entitlement RPCs. No new public bucket.
- **Proposed solution:** For `PUBLIC_SAFE` only, resolve a short-lived signed URL or an equivalent already-authorized read, with a loading state and a small image. `REVIEW_REQUIRED` and private states return no URL, including for a logged-out visitor. Admin contact panel reads `booking_contact_access` / the #86 entitlement and says unlocked when that row says so. The grant button stays available as an audited override and is labelled as an override when access already exists. `inboxPreview` shows the body. A name-only body is either hidden or labelled as a name, after looking at the stored row, so a real message is not swallowed. One phone formatter everywhere a phone is rendered. The locked-contact notice renders only when entitlement is absent.
- **Depends on:** #90 if both edit `messaging.ts`.
- **Risk:** Medium. A mistake here leaks a pending photo or a phone number. The privacy tests in `publicDirectory.test.ts` and `portfolioPrivacy.test.ts` are the gate.
- **Tests:** Public item with `PUBLIC_SAFE` includes a usable image URL and no raw storage path in the JSON. Pending and rejected return null. Logged-out client cannot sign a pending object. Admin panel fixture for a paid Connect shows unlocked. Preview fixture whose body is not the business name shows the body. Phone fixture `(404) 555-0199` on every contact surface this PR touches.
- **User-visible result:** Approved work photos show. Pending photos do not. PPP-1004’s admin panel matches the paid Connect. Threads show the message, a consistent phone number, and a privacy notice only while contact is actually locked.
- **Do-not-touch:** Reads entitlement. Does not change who is allowed to see contact. Needs a glance because it sits on the privacy boundary. It does not need a fee or Stripe change.

#### (c) Signup and auth UX

- **Priority:** P0. The live signup agrees to documents that 404, and the role cards are unreadable. The legal links themselves belong to (d). This PR is the password and layout work.
- **Problem:** Role cards squash to one word per line. There is no confirm-password field. The 8-character rule is only in the browser. Failed sign-in shows a raw provider string. A direct `/auth/v1/signup` can still accept a shorter password while leaked-password protection is off.
- **Files / DB:** `src/pages/SignUpRolePage.tsx`, `src/pages/SignUpPage.tsx`, `src/pages/SignInPage.tsx`, `src/lib/auth/AuthProvider.tsx`. Server rule: Supabase Auth password policy (dashboard) and, if a policy must be enforced in-repo, an Auth hook that rejects short or leaked passwords. Document the dashboard steps in the PR. Do not commit secrets.
- **Proposed solution:** Role cards use the full label width at desktop, tablet, and phone. Confirm-password must match before submit. Map known auth errors to short sentences (wrong email or password, unconfirmed email, too many attempts). Set the Auth minimum to 8 or more with the character rules Garrett wants, and turn on leaked-password protection in the dashboard as an owner action paired with this PR. This PR does not add the legal links.
- **Depends on:** none for the React work. Coordinate with (d) on `SignUpPage.tsx`.
- **Risk:** Medium for the Auth dashboard change. Low for the form layout.
- **Tests:** Vitest for the error map and the confirm-password mismatch. Playwright at 375, 768, and 1280 that the role label is one line. A rejected short password is asserted against the policy the PR actually turns on. If the dashboard toggle is still off when the PR opens, the PR says so and does not pretend the server rule is live.
- **User-visible result:** Role choice is readable. Signup asks for the password twice. A bad login says what to do next.
- **Do-not-touch:** No fee copy changes except where a wrapping fix reflows existing sentences.

#### (d) Legal documents and acceptance recording

- **Priority:** P0. This is the marketing gate.
- **Problem:** `/terms` and `/privacy` 404. The footer has no legal links. Signup records acceptance of placeholder agreement rows.
- **Files / DB:** PR #87 already adds `docs/legal/terms-of-service.md`, `docs/legal/privacy-policy.md`, `LegalDocumentPage`, footer links, and the publish flag. Remaining work, in this same effort: `agreements` version rows, `handle_new_user` acceptance of those version ids, a server check that blocks signup and checkout when acceptance of the current version is missing, links from both signup forms and from checkout. Sitemap entries only when the publish flag is on.
- **Proposed solution:** Keep #87 unpublished until Garrett and a Texas lawyer sign the text. Fill the owner blanks already listed on #87 (effective dates, refund wording, venue, arbitration, mailing address, minimum age). Insert new `agreements` versions. Leave old acceptance rows in place. The server stores agreement id, version, and timestamp. The checkbox links to the pages. Checkout uses the same current version.
- **Depends on:** lawyer text. Can proceed in draft beside (c).
- **Risk:** Medium. Wrong acceptance logic can lock every signup. Ship the pages dark, then the enforcement in a second commit on the same PR only after the version ids exist.
- **Tests:** SQL: signup without `accepted_terms` writes no acceptance; signup with it writes both current ids; an old version does not satisfy a new current row. Vitest: flag off means no `/terms` route in the bundle; flag on renders the draft and the footer links. No Stripe amount changes.
- **User-visible result:** After publish, footer and both signups open Terms and Privacy, and the account row records which version the person accepted.
- **Do-not-touch:** Does not change fee amounts. Refund sentences must match the existing non-refundable $9.99 and $4.99 copy unless Garrett writes a different policy.

#### (e) PR #90 — anonymize account deletion and block active jobs

- **Priority:** P0. The live function can delete payment rows and the other party’s bookings and reviews.
- **Problem:** `delete-account` v6 calls `purge_account_owned_rows` and then deletes the auth user. `project_connections` cascades into checkout sessions, slots, events, and `booking_contact_access`. `profiles` cascades into `signup_fee_charges`. Bookings cascade into reviews, change orders, and events. Payments, refunds, ledger entries, transfers, disputes, and cancellations are `ON DELETE RESTRICT`, so a deletion can also fail halfway.
- **Files / DB:** The #90 branch already has `supabase/migrations/20261015000004_account_deletion_anonymize.sql`, its rollback, `supabase/functions/delete-account/index.ts`, `src/lib/auth/deleteAccount.ts`, `DeleteAccountDialog.tsx`, and `supabase/tests/account_deletion_anonymize.sql`.
- **Proposed solution:** Review #90 against live foreign keys before merge. Required behavior: re-enter password (reauth) before the call; refuse while a job is pending, active, disputed, or has an open refund; anonymize PII; keep Stripe, payment, refund, and audit rows; keep the other person’s reviews, messages, and history; one transaction; no orphan files; a clear status the user can see. Run the SQL test inside a rollback on production data shape. Do not deploy until Garrett approves the migration.
- **Depends on:** none. Serialize with (b) on `messaging.ts`.
- **Risk:** High. Data loss if the migration is wrong. Stripe objects stay in Stripe either way. This PR must not delete them.
- **Tests:** The new SQL file, plus the existing delete-account unit tests, for customer, contractor, and admin, including the last-admin guard. Cases: paid connection, booking review, message thread, open dispute, fee-exempt contractor. Playwright only against a local project, never against live people.
- **User-visible result:** Delete account explains what is kept, asks for the password, and either finishes with a clear closed state or refuses with the reason (active job, dispute, refund).
- **Do-not-touch:** Yes. Payment records and audit rows. Garrett approves the migration before it runs in production.

---

### Security and data integrity — new PRs

#### PR-S1 — The other four legal documents

- **Priority:** P1. After Terms and Privacy are in review.
- **Problem:** The spec also requires Refund & Cancellation, Community Guidelines, Contractor Participation Terms, and Review & Content Guidelines. #87 does not draft them.
- **Files / DB:** Four markdown files under `docs/legal/`, four routes, footer links, four `agreements` slugs when Garrett says to record acceptance. Reuse `LegalDocumentPage` from #87.
- **Proposed solution:** Draft from how the product actually works: marketplace, not employer or general contractor or guarantor; no unverified license, insurance, or background claims; non-refundable $9.99 and $4.99 unless Garrett changes that; reviews tied to real jobs; portfolio photos screened. Publish flag stays off. Skip this PR if (d) already includes these four files.
- **Depends on:** #87’s page shell. Lawyer review before the flag flips.
- **Risk:** Low while unpublished. Medium once acceptance of these slugs becomes mandatory.
- **Tests:** Flag-off bundle excludes the drafts. Flag-on renders each title. SQL acceptance only if this PR adds slugs.
- **User-visible result:** None until publish. After publish, the footer lists the documents and signup records them.
- **Do-not-touch:** Refund wording is the fee policy. Match `PLATFORM_FEES_NON_REFUNDABLE` unless Garrett writes otherwise.

#### PR-S2 — Checkout return URLs limited to this site

- **Priority:** P1.
- **Problem:** `allowedOrigin` accepts any `https` host, so a caller can set their own success or cancel URL on their own checkout session (audit L1).
- **Files / DB:** `supabase/functions/_shared/supabase.ts`, `create-connection-checkout/index.ts`, `create-signup-fee-checkout/index.ts`, and the unit tests that describe allowed origins.
- **Proposed solution:** Allow `SITE_URL` and localhost only. Reject other hosts before Stripe is called.
- **Depends on:** none. Land before PR-S3.
- **Risk:** Medium. A too-tight allowlist breaks return from Stripe to the real site. A too-loose one leaves the bug.
- **Tests:** Unit cases for the production origin, `http://localhost`, `http://127.0.0.1`, a foreign `https` host, and a URL with a userinfo or query. Existing checkout tests still pass. No price or amount edits.
- **User-visible result:** None on the happy path. A forged return URL gets a clear error.
- **Do-not-touch:** It is on the payment path. It does not change amounts, price ids, or the Stripe dashboard. Call that out in the PR and get a glance before merge.

#### PR-S3 — Accept every webhook `v1` signature

- **Priority:** P1, before any Stripe webhook secret rotation.
- **Problem:** `verifyStripeSignature` keeps one `v1`. During rotation Stripe sends two. Verification can fail closed and stall fulfillment (audit L6).
- **Files / DB:** `supabase/functions/_shared/webhook.ts` and `src/lib/marketplace/connectionCheckout.test.ts` (the JS twin, if both parsers exist).
- **Proposed solution:** Parse every `v1` and accept the header when any one matches, with the same 300-second timestamp tolerance and timing-safe compare.
- **Depends on:** PR-S2 only to avoid an overlapping `_shared` diff. Logic is independent.
- **Risk:** Medium. A bad parser accepts forged events or rejects real ones.
- **Tests:** One `v1`, two `v1`s with the good one first, two `v1`s with the good one second, a wrong secret, a stale timestamp. Idempotency tests stay green.
- **User-visible result:** None until a secret rotation. Then paid checkouts still complete.
- **Do-not-touch:** Payment-path glance. No amount or currency rule changes.

#### PR-S4 — Narrow the end-job guard

- **Priority:** P2.
- **Problem:** While `contractor_end_job` runs, its marker lets that function’s writes through the connection checkout-session, slot, and connection guards (audit L2). Signed-in users cannot call the marker directly. The window is still wider than the columns end-job needs.
- **Files / DB:** New migration that replaces the guard functions from their **live** definitions, plus `supabase/tests/contractor_end_job_prod_guards.sql` and a rollback that restores the current bodies. Do not edit `20261015000002`.
- **Proposed solution:** Limit the bypass to the columns and the single opportunity row end-job updates.
- **Depends on:** #88 staying as it is. No other open PR edits these guards.
- **Risk:** High. A tight guard can make “end job” fail again for a paid connection. A loose one leaves the hole.
- **Tests:** The existing end-job SQL test, plus a case that a client session still cannot update checkout or slot rows, and a case that end-job still completes a paid connection.
- **User-visible result:** None when it works. Pros can still finish a hired job.
- **Do-not-touch:** Yes. Hiring-completion guards. Garrett approves before the migration runs.

#### PR-S5 — Public settings view

- **Priority:** P2.
- **Problem:** `platform_settings` is readable by `anon`. It exposes `admin_mfa_required`, `stripe_test_mode`, and the legacy fee fields. No secrets, but it is an internal table (audit L3).
- **Files / DB:** New migration: a `security_invoker` view with only the flags the website reads, grants on the view, revoke of table SELECT from `anon` and `authenticated`. Update `src/lib/supabase/database.types.ts` and the few client reads. Rollback restores the grants.
- **Proposed solution:** Ship the view first and point the client at it. Revoke table SELECT in the same migration only after the client no longer selects the table. Service role keeps table access.
- **Depends on:** a quick list of every `.from("platform_settings")` in `src/`.
- **Risk:** Medium. Revoking too early blanks pricing and feature flags for everyone.
- **Tests:** SQL: anon can read the view’s columns and cannot read `contractor_fee_bps` or `admin_mfa_required`. Vitest: the client module selects the view.
- **User-visible result:** None. The site still knows whether checkout is on.
- **Do-not-touch:** The migration must not UPDATE `contractor_fee_bps`, fee amounts, or `admin_mfa_required`.

#### PR-S6 — Hold platform testimonials for review

- **Priority:** P1 before a marketing push. It is a product decision, so the PR opens only after Garrett picks “pending until approved” or “paid and active accounts only”.
- **Problem:** `protect_platform_review()` sets `status = APPROVED` on insert for any signed-in user. A new or unpaid account can publish a 5-star marketplace review immediately (audit M3). This is the FTC fake-review exposure. It is separate from booking reviews, which are tied to a job.
- **Files / DB:** New migration replacing `protect_platform_review` from the live body, `src/pages/ReviewsPage.tsx` copy so the author sees “Thanks, a moderator will publish this”, admin queue already on `AdminReviewsPage`. Rollback restores auto-approve.
- **Proposed solution:** Default insert status `PENDING`. Admins approve in the existing screen, which already writes an audit row. Public reads stay `status = APPROVED`.
- **Depends on:** Garrett’s choice of rule.
- **Risk:** Medium. Getting the trigger wrong can block admin inserts or let the public read pending rows.
- **Tests:** SQL: a customer insert lands `PENDING` and is invisible to anon; an admin approval flips it and writes `platform_review.approved`; a contact-info body still raises.
- **User-visible result:** The public reviews page no longer shows a testimonial the moment someone submits it.
- **Do-not-touch:** No. Does not touch booking reviews, fees, or matching.

#### PR-S7 — Admin MFA recovery, without turning the requirement on

- **Priority:** P1 as an owner-operated checklist. Code only if recovery codes are still absent after a re-read of `adminMfa.ts`.
- **Problem:** Enforcement is off, the support admin has not enrolled, and there is no backup recovery-code path. Turning the flag on before a backup factor exists can lock every admin out.
- **Files / DB:** If code is required: `src/lib/auth/adminMfa.ts`, `AdminTwoFactorPage.tsx`, and a SQL test that `is_admin()` still returns true for an `aal1` admin while `admin_mfa_required` is 0. The flag update itself is a dashboard or SQL change Garrett runs later, not part of this PR’s migration.
- **Proposed solution:** Enrollment screen explains phone factor plus a backup factor, refuses to remove the last verified factor, and has a tested step-up on the admin routes that already use `RequireAdmin`. Add recovery codes if Supabase TOTP enrollment does not already provide a second factor. Leave `admin_mfa_required` at 0. Document the later flip: enroll, sign in at `aal2`, then set the flag.
- **Depends on:** Garrett being available to enroll. The PR can merge the UI without him. The flag cannot flip without him.
- **Risk:** High if the flag flips in the same change. Low if this PR only adds recovery UI and tests.
- **Tests:** Gate unit tests already in `adminMfa.ts`. Add: last factor cannot be removed; `aal1` still works while the flag is 0; a sensitive RPC still checks `is_admin()`.
- **User-visible result:** Admins can enroll and see how backup works. Password-only admin access keeps working.
- **Do-not-touch:** Yes for the flag. The PR must say the flag stays 0.

#### PR-S8 — Email change and login abuse leftovers

- **Priority:** P2. After (c).
- **Problem:** Spec wants email change with verification, and abuse protection on login and signup. Email is frozen by the profiles trigger. There is no in-app throttle beyond Supabase defaults.
- **Files / DB:** A new `request_email_change` security-definer function that writes a pending email and sends the Supabase verify link, plus a trigger change that still rejects a direct client `UPDATE` of `profiles.email`. Rate-limit notes: use Supabase Auth’s built-in rate limits first. A new captcha vendor is a paid service and waits for approval.
- **Proposed solution:** Account page gains “Change email”. The new address is unverified until the link is consumed. Role and fee status stay untouched. Document the Auth rate-limit settings in the PR.
- **Depends on:** (c), so the account form is not edited twice.
- **Risk:** Medium. A bad trigger can let a user write their own email or lock email forever.
- **Tests:** SQL: client update of email still fails; the function sets a pending address; the confirmed address is the only one on the profile. Vitest for the form states.
- **User-visible result:** A person can change their login email and must confirm it. Failed bursts get a “too many attempts” message from (c)’s error map.
- **Do-not-touch:** No fee or role writes.

#### PR-S9 — Retire the six legacy edge functions (owner action, small repo note)

- **Priority:** P2.
- **Problem:** Six test-mode functions are deployed and absent from the repo (audit M4). They are inert without test keys. They are still unreviewed surface.
- **Files / DB:** No function code to delete in git. The PR adds a short `docs/roadmap/legacy-edge-functions.md` checklist: function name, why it is unused (calls `cs_test_` or `sk_test_`, and `apply_signup_fee_paid` requires `stripe_test_mode`), and the Stripe dashboard check that no endpoint points at `/stripe-webhook`. Undeploy is a Supabase dashboard action after Garrett says yes.
- **Proposed solution:** Prove, then undeploy. Do not undeploy inside the PR.
- **Depends on:** someone with Stripe dashboard access confirming the live webhook endpoint is `connection-fee-webhook` and `signup-fee-webhook` only.
- **Risk:** High if the wrong function is removed. Low for the checklist doc.
- **Tests:** None in CI. The PR links the dashboard check.
- **User-visible result:** None.
- **Do-not-touch:** Yes. Deployed payment functions. Undeploy needs approval. Do not remove `connection-fee-webhook`, `signup-fee-webhook`, or their reconcile functions.

#### PR-S10 — Fix `search_path` on ordinary functions

- **Priority:** P3. Advisor noise. The 24 functions are not security definer, so they are not the exploitable case (audit L4).
- **Problem:** Advisor warns that some functions lack a fixed `search_path`.
- **Files / DB:** One new migration that `ALTER FUNCTION ... SET search_path = public` on the warned names, after listing them from `get_advisors`. Rollback clears the setting.
- **Proposed solution:** Set the path. Do not rewrite the function bodies.
- **Depends on:** none.
- **Risk:** Low.
- **Tests:** SQL advisor re-check, or a query that the altered functions have `proconfig` containing `search_path`.
- **User-visible result:** None.
- **Do-not-touch:** Skip any function in the matching, entitlement, or fee list. Those wait for their own approved PR.

---

### Broken core — new PRs, after (a) and (b)

#### PR-B1 — Stars start unselected

- **Priority:** P1.
- **Problem:** Booking review forms and the public testimonial form open with 5 stars already chosen.
- **Files / DB:** `src/pages/app/customer/BookingPages.tsx`, `src/pages/app/pro/ProBookingPages.tsx`, `src/pages/ReviewsPage.tsx`.
- **Proposed solution:** Initial state is empty. Submit stays disabled until the person picks 1 through 5. Server still rejects out-of-range ratings.
- **Depends on:** none. Avoid `ReviewsPage.tsx` if PR-S6 is mid-edit; rebase.
- **Risk:** Low.
- **Tests:** Existing review form tests update to expect no default. A submit with no selection does not call the RPC.
- **User-visible result:** The form opens with empty stars.
- **Do-not-touch:** No.

#### PR-B2 — Job labels that lie

- **Priority:** P1.
- **Problem:** After unlock, the job still says “Approximate location” above a full address. A passed job says “3 connection spots available”. History rows omit the PPP number. A fee-exempt contractor sees a $9.99 banner next to “Activation: Not required”. A hired customer still sees “Contact is shared after you connect” on that pro.
- **Files / DB:** `ProMarketplacePages.tsx`, `ProBookingPages.tsx`, `connectionLifecycle.ts`, history lists that drop `reference_number`, the account banner that ignores `NOT_REQUIRED` for contractors, `publicDirectory.ts` fallback (only if (b) did not already replace it).
- **Proposed solution:** If entitlement says the address is shared, the heading is the street. If the job is passed or closed, slot copy is omitted. History uses `formatProjectReference` whenever the row has a number. The activation banner uses the same exempt check customers already use. Connected customers see the neutral public label only where the business name is still private, and they do not see the pre-connect contact sentence.
- **Depends on:** (b), so photo and message copy land first.
- **Risk:** Low, rising to medium on the contact sentence. Read entitlement. Do not reimplement it.
- **Tests:** Fixture with a granted address expects the street heading. Passed opportunity expects no “spots available”. Exempt contractor fixture expects no $9.99 banner. `NOT_REQUIRED` stays the exemption signal.
- **User-visible result:** Labels match the job’s real state.
- **Do-not-touch:** Reads entitlement and fee status. Does not write them.

#### PR-B3 — Change-order amount label

- **Priority:** P1.
- **Problem:** A change order titled “Materials increase” displayed as “No price change · Approved”. `changeOrderAmountLabel` returns that string when cents are 0. Either the UI reads the wrong column, or a real delta is stored as 0 and the label hides it.
- **Files / DB:** `changeOrderAmountLabel` and the change-order rows in `BookingPages.tsx` / the pro booking page. Read `change_orders` columns from `database.types.ts`. Do not edit `propose_change_order`.
- **Proposed solution:** Display the stored delta in dollars, including a true zero only when the stored value is zero and the title is not claiming a change. If the row’s amount column is empty while another column holds the delta, bind the label to the column #89 actually validates.
- **Depends on:** none.
- **Risk:** Low. Display only.
- **Tests:** Update `contractorPolish.test.ts` so a non-zero delta formats as money and a stored zero stays “No price change”. Component fixture for the “Materials increase” shape.
- **User-visible result:** An approved materials increase shows its dollar amount.
- **Do-not-touch:** Does not change #89’s validation, the two-party approval rule, or fees.

#### PR-B4 — Mobile shell: names, bottom nav, keyboard

- **Priority:** P1.
- **Problem:** Header names truncate to nothing useful. The bottom nav covers “View booking” and other last actions. The keyboard covers inputs.
- **Files / DB:** `src/components/layout/DashboardShell.tsx`, `BottomNav.tsx`, shared page padding. No route changes.
- **Proposed solution:** Header shows a readable short name with a tooltip or a second line for the rest. Content padding clears the nav, including the iOS safe area. Focused inputs scroll above the keyboard using `visualViewport` or `interactive-widget` as appropriate. Check customer, pro, and admin at 390px width.
- **Depends on:** #84 if the widget also occupies the bottom corner. Rebase onto #84 or land this first and let #84 rebase.
- **Risk:** Low.
- **Tests:** Playwright at a phone viewport: the primary action on a booking page is clickable, and the header name is not a single clipped character. Existing `e2e/responsive.spec.ts` stays green.
- **User-visible result:** Phone users can read their name and reach the button under the nav.
- **Do-not-touch:** No.

---

### Customer

#### PR-C1 — Customer navigation for pages that already exist

- **Priority:** P2.
- **Problem:** The spec’s customer section list is larger than the nav. Several destinations already work and are only hard to find: notifications, notification settings, post a project.
- **Files / DB:** `src/pages/app/CustomerShell.tsx`. Links only. No new data.
- **Proposed solution:** Add Notifications to the nav (the route already exists). Keep Post a project as the primary action on Home and Projects. Leave Billing, Help, and a top-level Reviews item out until their PRs add real pages. Rename nothing that would break bookmarks.
- **Depends on:** (a), so the new nav item does not open a blank page.
- **Risk:** Low.
- **Tests:** Shell test lists the new item and still hides admin links.
- **User-visible result:** Customers can open notification history from the menu.
- **Do-not-touch:** No.

#### PR-C2 — Customer billing page, read-only

- **Priority:** P2.
- **Problem:** There is no billing section. Customers pay $9.99 once, or nothing if exempt, and they pay the pro off-platform.
- **Files / DB:** New page `src/pages/app/customer/CustomerBillingPage.tsx`, route under `/app/customer`, nav item, a select of the caller’s own `signup_fee_charges` (RLS already scopes by profile). Columns: date, amount, status, receipt link if Stripe already stored a URL.
- **Proposed solution:** Show activation history and the sentence that job payment is off-platform. Exempt accounts see “Activation: not required” and no pay button. No checkout creation in this PR.
- **Depends on:** PR-C1’s nav pattern, rebased.
- **Risk:** Low if the query is the caller’s rows only. Medium if a new RPC is introduced. Prefer RLS select.
- **Tests:** Component test for paid, unpaid, and `NOT_REQUIRED`. SQL or RLS test that another user’s charges are invisible.
- **User-visible result:** Account has a billing page with the activation record.
- **Do-not-touch:** Read-only. No Stripe calls. No fee edits.

#### PR-C3 — Reviews: completed jobs, report, and a response slot

- **Priority:** P2.
- **Problem:** The review form appears when the hire is mutual, before the work is done. There is no way to report a booking review. The contractor cannot respond.
- **Files / DB:** `src/lib/marketplace/hired.ts` (`canSeeReviewCta`), `submit_booking_review` eligibility in a new migration, a `booking_review_reports` table or reuse of the content-report table if its columns fit, a nullable `contractor_response` on `booking_reviews` written only by the hired pro through a security-definer function. Public directory already renders reviews.
- **Proposed solution:** The form shows after the booking is completed and the viewer is a party. One review per role stays. Report stores reason and reporter and does not hide the review by itself. Response is plain text, contact-info filter applied, shown under the review on the public profile. Admin hide/remove is PR-A7.
- **Depends on:** PR-B1 so the form is not also changing its default stars in the same diff.
- **Risk:** Medium. Eligibility and RLS.
- **Tests:** SQL: a mutual-but-not-completed booking rejects a review; a completed one accepts one; a second insert fails; a third party cannot respond; the response strips phones and emails. Vitest for the CTA.
- **User-visible result:** Reviews follow finished jobs. A customer can report one. A pro can post a short response.
- **Do-not-touch:** No fee or matching edits. The completion rule is review eligibility.

#### PR-C4 — Request this pro again

The master spec is the behavior to build: the requested pro gets an exclusive **48 hours**; the pro pays **$4.99** for this new project; if they decline or the window ends, the customer is told and chooses **Send to other pros** (normal matching, max 3) or **No thanks** (project stays on hold).

The October 10 technical plan is the shape to reuse, with three overrides already decided by the spec:

| Topic | October 10 plan’s recommendation | This roadmap |
| --- | --- | --- |
| Window | 24 hours | **48 hours**, stored in `platform_settings` so it can change later without a code edit |
| When the window ends or the pro passes | Open matching immediately, and keep the pro’s offer as a normal one | **Wait.** Notify the customer. Matching stays held until they choose Send to other pros. No thanks sets the request to a hold state and does not fill slots. |
| Reminder | 12 hours before a 24-hour deadline | One reminder **24 hours** before a 48-hour deadline. Same setting pattern. |

Everything else in that plan stands: one requested pro per project, the pro occupies one of the three slots, prior Connects do not carry over, the pro sees “a past customer” and no name or street, blocked pros cannot be requested, ineligible pros produce a generic “not taking requests” message, max 3 waiting requests per customer and 1 waiting request per pro, and `connection_fee_cents()` stays 499. `pg_cron` is not installed. The sweep needs Garrett’s approval to enable it, with a lazy refresh on the project page so a missed sweep only delays the notice.

**PR-C4a — database**

- **Priority:** P1 after #74, which is already merged.
- **Problem:** `?pro=` never reaches `post_project`.
- **Files / DB:** New migration: `project_requested_pros` and status enum as in the plan’s appendix, settings `requested_pro_window_hours = 48`, `requested_pro_reminder_hours = 24`, `requested_pro_max_pending_per_customer = 3`. New functions `post_project_requesting_pro`, `open_requested_project_to_others`, `hold_requested_project`, `sweep_requested_pro_windows`. Edit `fill_project_opportunity_offers` from the **live** definition so a pending window holds the other slots. Edit `hire_again_contractors` from the **current main** body to add `requestable` and keep the neutral-label and block filters. Trigger: project cancelled closes the request. Notification kinds via `notify_safely`. Rollback script restores the captured function bodies and drops the new objects.
- **Proposed solution:** As in the plan’s B3 and B4, with the 48-hour and customer-choice overrides. `post_project`, `reserve_connection_checkout`, `fulfill_connection_fee_checkout`, `connection_fee_cents`, and `select_estimate` stay byte-for-byte.
- **Depends on:** Garrett’s approval to edit `fill_project_opportunity_offers` and, separately, to enable `pg_cron`.
- **Risk:** High. A bad fill stops every offer, not just requested ones.
- **Tests:** The plan’s SQL list, updated for 48 hours and for “no fill until the customer chooses”. Fee regression: a requested pro with an old paid Connect still reserves at 499 cents and contact stays locked on the new project. `protected_until` does not change the fee. Cap of 3 never breaks. Pros cannot select from `project_requested_pros`.
- **User-visible result:** None until C4b and C4c. The API exists.
- **Do-not-touch:** Yes. Matching. Also assert the fee functions are unchanged in the diff.

**PR-C4b — customer screens**

- **Priority:** P1 after C4a.
- **Problem:** Hire again can only start a normal project.
- **Files / DB:** `HireAgainPage`, `ProjectWizardPage`, customer project page. `customerWizardPath` gains a request flag. Submit calls `post_project_requesting_pro`.
- **Proposed solution:** Button “Request this pro again”. Banner names the pro and the 48-hour window. Project page shows waiting, interested, passed, or no answer, plus “Send to other pros” and “No thanks”. When `requestable` is false, the button says “Not taking requests right now” and does not say why.
- **Depends on:** C4a.
- **Risk:** Medium.
- **Tests:** Vitest for each status card and for the wizard calling the requesting RPC only when the flag is set. Playwright on a phone: Hire again, request, see the waiting card.
- **User-visible result:** A customer can ask for a past pro first, then decide whether to open the job up.
- **Do-not-touch:** No, if C4a already holds the matching change. This PR is UI.

**PR-C4c — pro badge, countdown, and notice copy**

- **Priority:** P1 after C4a.
- **Problem:** The pro cannot see that a past customer asked, or how long they have.
- **Files / DB:** Opportunity list and detail, `src/lib/marketplace/notifications.ts`, `_shared/notificationPolicy.ts` for `requested_pro.*`.
- **Proposed solution:** Badge “Requested you”, countdown, pass reason “schedule full”, and copy that the $4.99 Connect applies as usual. Notices: requested, reminder, interested, passed, no answer.
- **Depends on:** C4a. Can be parallel with C4b if they avoid the same components. Both will touch notification policy if C4b also adds customer copy. Prefer C4c owns the new kinds and C4b only links.
- **Risk:** Medium for notification kinds. Low for the badge.
- **Tests:** Policy test maps the new kinds to the pro offer route and the customer project route. No message body or phone in the payload.
- **User-visible result:** The pro sees the request and the deadline. Both sides get the notices.
- **Do-not-touch:** No fee change. Copy states $4.99 explicitly by reading the existing constant.

**PR-C4d — scheduler**

- **Priority:** P1, owner-gated.
- **Problem:** Offer expiry today is lazy. A 48-hour window that nobody opens will not fire.
- **Files / DB:** `pg_cron` schedule calling `sweep_requested_pro_windows`, or a documented external timer if Garrett refuses the extension. The project page calls the cheap refresh either way.
- **Proposed solution:** Enable the extension and a 15-minute schedule only after approval. Rollback unschedules the job.
- **Depends on:** C4a and Garrett.
- **Risk:** Medium. `pg_cron` is a production extension change.
- **Tests:** Sweep is idempotent and the reminder sends once. Covered in C4a’s SQL. This PR adds the schedule and a test that a second sweep does not duplicate notices.
- **User-visible result:** The customer hears back when the 48 hours are up even if nobody has the project open.
- **Do-not-touch:** Yes for enabling the extension.

#### PR-C5 — Help entry that does not wait for the chatbot

- **Priority:** P3. Skip if #84 will land in the same week and includes a signed-in entry point.
- **Problem:** The spec lists Help. Today it is a footer email.
- **Files / DB:** A static `/app/customer/help` page: how hiring works, the fee sentences from `pricing.ts`, link to `/contact`, link to account deletion. No new backend.
- **Proposed solution:** One page, linked from the customer nav. When #84 lands, the widget is an addition, not a replacement.
- **Depends on:** #92 if the contact link should be the form. A mailto link is fine until then.
- **Risk:** Low.
- **Tests:** Render test for the fee sentences and the contact link.
- **User-visible result:** Customers have a help page.
- **Do-not-touch:** Copy uses the existing fee constants.

---

### Contractor

#### PR-K1 — One hired-jobs list

- **Priority:** P2.
- **Problem:** Nav has both Jobs and Bookings. Bookings renders the same `HiredJobsPanel` and tells the pro that hired jobs live under Jobs.
- **Files / DB:** `ProShell.tsx`, `App.tsx` redirects, `ProBookingPages.tsx`.
- **Proposed solution:** Remove Bookings from the nav. Redirect `/app/pro/bookings` and `/app/pro/bookings/:id` to the hired tab and the job detail. Keep the URLs working.
- **Depends on:** none.
- **Risk:** Low.
- **Tests:** Redirect tests. Nav test has a single hired destination.
- **User-visible result:** Pros see hired work in one place.
- **Do-not-touch:** No.

#### PR-K2 — Contractor billing history, read-only

- **Priority:** P2.
- **Problem:** The account page says “Activation: Not required” or shows a banner, and there is no list of activation or Connect charges, dates, status, failures, or project numbers.
- **Files / DB:** New `/app/pro/billing` page. Read `signup_fee_charges` and `connection_checkout_sessions` for the signed-in pro through existing RLS or a security-definer read that returns only their rows: date, kind (activation or connection), project PPP number, amount, status, failure reason, receipt URL if present. Refund column shows the stored status and stays empty while refunds are disabled.
- **Proposed solution:** Render server rows. No “mark paid” control. Exempt pros see activation not required and still see any Connect rows.
- **Depends on:** PR-B2 if both touch the account banner. Rebase.
- **Risk:** Medium. A loose select would show another pro’s charges.
- **Tests:** RLS: pro A cannot read pro B. Fixture rows render amount 999 and 499 from the stored cents, not from a hardcoded label. A failed session shows its status.
- **User-visible result:** Pros can see what they paid and which job it was for.
- **Do-not-touch:** Read-only. Amounts come from the rows. The page must not call checkout or refund functions.

#### PR-K3 — Schedule list

- **Priority:** P3.
- **Problem:** The spec lists Schedule. The product has start times and no calendar.
- **Files / DB:** `/app/pro/schedule` reading hired bookings the pro already can see, grouped by start date.
- **Proposed solution:** A list, not a new calendar system. Jobs with no start time sit under “Date not set”.
- **Depends on:** PR-K1 so the nav is stable.
- **Risk:** Low.
- **Tests:** Grouping test. Closed jobs appear under a past heading and offer no connect or pass actions.
- **User-visible result:** Pros see upcoming hired work by date.
- **Do-not-touch:** No.

#### PR-K4 — My reviews

- **Priority:** P2 after PR-C3.
- **Problem:** Pros cannot see the reviews they received or answer them inside the app.
- **Files / DB:** `/app/pro/reviews` listing `booking_reviews` for their bookings, using the response function from PR-C3.
- **Proposed solution:** Show rating, text, project number, and the response box. Public profile keeps using the directory projection.
- **Depends on:** PR-C3.
- **Risk:** Low.
- **Tests:** Pro sees only their reviews. Response submit uses the C3 function.
- **User-visible result:** A reviews page in the pro menu.
- **Do-not-touch:** No.

#### PR-K5 — Estimate status words

- **Priority:** P3.
- **Problem:** The spec names Cancelled. The UI uses Withdrawn and has no Cancelled label. Timestamps are partial.
- **Files / DB:** `src/lib/marketplace/estimateLifecycle.ts` and `ProEstimatesPages.tsx`. Display map only, unless a stored status is actually `CANCELLED` and currently falls through.
- **Proposed solution:** Show the spec’s words for the statuses that exist, with submitted and viewed timestamps already on the row. If the database has no Cancelled estimate status, label Withdrawn as “Withdrawn” and say so in the PR, rather than inventing a status.
- **Depends on:** none.
- **Risk:** Low.
- **Tests:** Table test for each status string.
- **User-visible result:** Estimate lists use consistent words and show when the estimate was sent and viewed.
- **Do-not-touch:** No writes to estimate money columns.

#### PR-K6 — Pro help page

- **Priority:** P3. Same idea as PR-C5.
- **Problem:** No help destination.
- **Files / DB:** `/app/pro/help` with activation, Connect, contact-unlock, and support email, all from existing copy constants.
- **Proposed solution:** Static page.
- **Depends on:** none.
- **Risk:** Low.
- **Tests:** Render test.
- **User-visible result:** Pros have a help page.
- **Do-not-touch:** No.

---

### Admin

These PRs share `adminNav.ts` and `App.tsx`. Merge them in the order below.

#### PR-A1 — Overview copy and duplicate activity

- **Priority:** P1. Tiny, and it removes the stale Gmail line.
- **Problem:** `admin_dashboard_summary` describes support tickets as email to `prioritypropertypros@gmail.com`. Card declines and net revenue say “Not set up yet” with no definition. Recent activity repeats “Account flag updated” and shows raw database sentences.
- **Files / DB:** New migration replacing `admin_dashboard_summary` from the live body, changing only the support-ticket definition string to `support@prioritypropertypros.com` and a plain sentence that the inbox arrives with #92. Overview card subtitles in `AdminOverviewPage.tsx` say what the number means. Activity feed collapses identical consecutive lines. Do not change the revenue formula in this PR.
- **Proposed solution:** Copy and de-duplication only.
- **Depends on:** none. Rebase if #85 or #92 has already changed the overview file.
- **Risk:** Low if the function body is diffed against live and only the string changes. Medium if the replace drifts.
- **Tests:** Existing `admin_dashboard_rpcs` SQL test updated for the email string. Overview test: two identical flag rows render once with a count.
- **User-visible result:** Overview no longer mentions the old Gmail address. Repeated flag lines collapse.
- **Do-not-touch:** Do not change fee math or `contractor_fee_bps`.

#### PR-A2 — Homeowners directory

- **Priority:** P2.
- **Problem:** There is no people management.
- **Files / DB:** `/app/admin/homeowners`, nav item, a security-definer list RPC: search, account status, project count, signup-fee status, flags, open deletion request. Hide-test filter defaults on, matching the overview’s `p_include_test`. Read only in this PR.
- **Proposed solution:** Search and open a person. Actions wait for A3 so suspend has one implementation.
- **Depends on:** A1 if both touch the overview. Otherwise independent except the nav file.
- **Risk:** Medium. The RPC must not return another role’s private notes, and it must check `is_admin()`.
- **Tests:** SQL: anon and a customer get nothing; an admin sees the fixture homeowner; test accounts hidden by default.
- **User-visible result:** Admins can find a homeowner and see status, projects, and payments at a summary level.
- **Do-not-touch:** Read-only. No payment writes.

#### PR-A3 — Contractors directory, suspend and restore

- **Priority:** P2.
- **Problem:** Approvals cannot suspend. There is no hide-test control on the approvals list. Smoke-test businesses sit in the approved list.
- **Files / DB:** `/app/admin/contractors`, suspend and restore RPCs that set `account_status`, require a reason, and call `write_audit_log`. Approvals page gets the same include-test toggle as the overview. Deletion requests from #90 show on both directories.
- **Proposed solution:** Suspend blocks new offers through the existing eligibility checks (an inactive account already fails them). Restore returns the previous status. Both require a reason of at least a few characters and write an audit row. Do not delete the person here.
- **Depends on:** #90’s deletion-request status if the directory shows it. Eligibility already treats suspended as ineligible; confirm that in the SQL test rather than editing `contractor_eligible_for_project`.
- **Risk:** High if suspend is implemented by editing matching. Medium if it only sets `account_status` and the existing gate already honors it.
- **Tests:** SQL: non-admin rejected; reason required; audit row written; a suspended pro fails `contractor_eligible_for_project` without that function’s body changing; restore brings them back; test rows hidden.
- **User-visible result:** Admins can suspend or restore a contractor with a reason, and can hide test businesses on Approvals.
- **Do-not-touch:** Yes if the diff touches `contractor_eligible_for_project` or `fill_project_opportunity_offers`. Prefer not to. Call out the status write.

#### PR-A4 — Projects list

- **Priority:** P2.
- **Problem:** Admins can open one booking by PPP number and cannot browse projects.
- **Files / DB:** `/app/admin/projects` with search, status, city, trade, and date filters, backed by an admin RPC. Row links to the existing booking tools when a booking exists.
- **Proposed solution:** Read-only lifecycle list: posted, matching, estimates, hired, in progress, complete, cancelled.
- **Depends on:** nav serialization.
- **Risk:** Medium for the RPC’s admin check and for leaking contact columns. The list returns city and PPP number, not street or phone.
- **Tests:** SQL column allowlist. A fixture project appears under its status filter.
- **User-visible result:** Admins can search projects and filter them.
- **Do-not-touch:** No contact fields in the list payload.

#### PR-A5 — Payments dashboard, read-only

- **Priority:** P2.
- **Problem:** Overview has totals and no ledger. Spec wants activation and Connect payments, dates, status, failures, refunds, and project numbers.
- **Files / DB:** `/app/admin/payments` over an admin RPC unioning `signup_fee_charges` and `connection_checkout_sessions`. Columns from those tables only. Net revenue gets a one-line definition in the UI: succeeded activation cents plus succeeded Connect cents, minus stored refunds (currently zero). Failed payments are a filter, not a new charge.
- **Proposed solution:** Read-only table and the overview cards that are “Not set up yet” start reading this RPC where the data exists. Card-decline detail stays “Not set up yet” if Stripe disputes are not in these tables. No button writes a status.
- **Depends on:** A1’s copy, so the cards are not edited in two PRs at once. Sequence A1 then A5.
- **Risk:** Medium. A write path would violate “never mark unpaid as paid”.
- **Tests:** SQL: a non-admin is rejected; amounts match fixture cents; the function has no UPDATE. UI test: no “mark paid” control.
- **User-visible result:** Admins can see the $9.99 and $4.99 charges that actually happened.
- **Do-not-touch:** Yes. Payment records are read. The PR diff must not grant UPDATE and must not call Stripe.

#### PR-A6 — Refunds and disputes, decision first

- **Priority:** P2, blocked on an owner decision.
- **Problem:** The spec asks for restricted, confirmed, reasoned, audited refunds. The live policy is that the $9.99 and the $4.99 are non-refundable, and `reject_signup_or_connection_fee_refund()` raises. Those cannot both ship.
- **Files / DB:** Until Garrett chooses, the only PR is a read-only disputes list of `stripe_disputes` if that table has rows, plus the refund status column already planned on A5. No refund RPC.
- **Proposed solution:** Open the PR as a written decision: either keep non-refundable and show disputes read-only, or design a refund RPC later that requires a second confirmation, a reason, an audit row, and a Stripe refund through a new edge function. That second design is out of this PR and needs its own approval. This roadmap does not specify refund parameters.
- **Depends on:** Garrett. A5 for the table shell.
- **Risk:** High if anyone adds a refund writer. Low for a read-only list.
- **Tests:** Assert the client bundle for this page contains no refund invoke.
- **User-visible result:** Admins can see a dispute if one exists. They cannot issue a refund from the app.
- **Do-not-touch:** Yes. Payment records and the non-refundable policy.

#### PR-A7 — Booking-review moderation

- **Priority:** P2 after PR-C3.
- **Problem:** Job reviews publish immediately. Platform testimonials are a different queue.
- **Files / DB:** `/app/admin/reviews` gains a second tab, or a sibling route, listing `booking_reviews` with the project number, both parties, the rating, and the report from C3. An admin hide function sets a moderated flag, requires a reason, and writes an audit row. Hidden rows drop out of `toPublicSafeReview`.
- **Proposed solution:** Evidence on screen is the review, the job, and the report. The admin writes a reason. The row is not deleted, so the counterparty’s history remains for #90.
- **Depends on:** PR-C3’s report table.
- **Risk:** Medium.
- **Tests:** SQL: hide removes the public row and keeps the table row; reason required; non-admin rejected.
- **User-visible result:** Admins can take a job review off the public profile with a recorded reason.
- **Do-not-touch:** No.

#### PR-A8 — Disputes workspace

- **Priority:** P3.
- **Problem:** Overview counts `disputed_bookings` and there is nowhere to work them.
- **Files / DB:** `/app/admin/disputes` listing bookings in a disputed status, with PPP number, parties’ display names, and the existing booking events. Notes append an audit row. No payment status edits.
- **Proposed solution:** A queue with the booking-tools link. Resolution updates booking status only through an existing guarded RPC if one exists; otherwise this PR is read-only plus notes.
- **Depends on:** A4’s project link pattern.
- **Risk:** Medium if it adds a status writer. Low if read-only.
- **Tests:** Admin-only. A note writes `write_audit_log`. No update of payment tables.
- **User-visible result:** Disputed jobs have a list.
- **Do-not-touch:** No payment writes. If a status RPC is reused, name it in the PR.

#### PR-A9 — Audit log viewer and the missing events

- **Priority:** P2.
- **Problem:** There is no viewer. Several spec events are not logged: change orders, booking start and complete, booking reviews, blocks, the deletion outcome, portfolio decisions. Connection-fee payment is already in `connection_checkout_events`.
- **Files / DB:** `/app/admin/audit` with filters (actor, action, date, project number). New `write_audit_log` calls inside the existing security-definer functions for the missing actions, each in its own small migration **or** one migration if the functions are independent. Prefer one action family per commit on this branch so review stays possible: change orders, then booking lifecycle, then reviews and blocks, then portfolio. Deletion’s audit row is #90’s job; this viewer just displays it.
- **Proposed solution:** Viewer is select-only. Inserts stay service-role. Show the connection checkout events in the same feed so “fee paid” is visible without a second log.
- **Depends on:** #90 if the deletion action name comes from that PR.
- **Risk:** Medium. Replacing a large function to add one audit call can drift from live. Diff against `pg_get_functiondef` before writing the migration.
- **Tests:** SQL: the action inserts a row; a client still cannot insert into `audit_logs`; the viewer RPC is admin-only.
- **User-visible result:** Admins can search what happened on a job.
- **Do-not-touch:** The functions being wrapped include change orders and bookings. The PR may add an audit call and must not change the money or status rules. Say that in the description.

#### PR-A10 — Settings, display only

- **Priority:** P3.
- **Problem:** The spec lists Settings. A screen that can edit fees is out of bounds.
- **Files / DB:** `/app/admin/settings` reading the public view from PR-S5 plus server-side constants rendered as text: activation $9.99, Connect $4.99, max contractors 3, fees are non-refundable. No inputs.
- **Proposed solution:** Read-only. A sentence says fee changes happen in a reviewed migration, not in this screen.
- **Depends on:** PR-S5.
- **Risk:** Low, as long as there is no form.
- **Tests:** Render test asserts no `<input>` and the two fee strings.
- **User-visible result:** Admins can look up the live fee policy.
- **Do-not-touch:** Yes in the sense that the page must not write `platform_settings`. The PR is the safe version.

#### PR-A11 — Approvals detail layout

- **Priority:** P3.
- **Problem:** The browser audit found the approval detail rendering below a long list, and a 3–5 second loading flash on admin pages.
- **Files / DB:** `AdminApprovalsPages.tsx`. Optional: split the detail route’s data fetch so the list does not block it. The route `/app/admin/approvals/:id` already exists.
- **Proposed solution:** On a phone, the detail is its own screen (the route). On a wide screen, the detail sits in a pane that stays in view. Loading uses the existing `BrandLoader` without remounting the whole shell.
- **Depends on:** A3 if both edit the approvals page. Land A3 first.
- **Risk:** Low.
- **Tests:** Existing approvals tests. A layout test that the detail link is the child route.
- **User-visible result:** Opening an application does not dump it under a long list.
- **Do-not-touch:** No.

---

### Priority Help — review the open PRs

Do not open PR-H0 as new work. Review and land:

| Order | PR | Branch | What it is |
| --- | --- | --- | --- |
| 1 | **#82** | `cursor/priority-help-db-192b` | Tables, RLS, role tests. New files only. |
| 2 | **#83** | `cursor/priority-help-edge-192b` | Edge function and guardrails. Provider stays unset until Garrett approves a paid AI vendor and the cost. |
| 3 | **#84** | `cursor/priority-help-widget-192b` | Widget for guests and signed-in users. Rebase after #87 and the mobile shell if those have touched `DashboardShell`. |
| 4 | **#85** | `cursor/priority-help-admin-192b` | Admin support center. Rebase after #92 so `adminNav.ts` merges cleanly. |

Review checklist before any of them merge:

- Answers come from policy text. A question with no policy gets a handoff, not a guess.
- The model sees no other user’s phone, email, address, messages, or payment rows, and no admin-only fields.
- The function cannot post a project, accept an offer, pay, refund, or change an account.
- The UI says it is an AI assistant.
- Escalation reaches a human queue (this is #85).
- Rate limit and a cost ceiling exist in #83 and fail closed when the provider key is missing.
- A privacy notice is on the widget.
- The launcher does not cover the bottom nav, the signup button, or checkout.

**PR-H1 — widget position follow-up**, only if #84’s launcher fails that last check.

- **Priority:** P2, conditional.
- **Files:** `src/components/support/PriorityHelp.tsx` and the shell padding from PR-B4.
- **Solution:** Anchor the launcher above the bottom nav and away from primary buttons.
- **Risk:** Low.
- **Tests:** Playwright at 390px that the nav’s Post control and the launcher are both clickable.
- **Do-not-touch:** No.

---

### Contact — review the open PR

#### PR #92 — public contact form and admin inbox

- **Priority:** P1. Already drafted on `cursor/contact-inbox-13c7`.
- **Problem:** `/contact` only opens the visitor’s mail app.
- **Files / DB:** The PR already adds `contact-form` edge function, `20261015120000_contact_messages.sql`, `ContactPage.tsx`, and `AdminContactMessagesPage`.
- **Proposed solution:** Land it after checking: validation, attachment type and size, rate limit, RLS so only admins read the rows, spam control that does not add a new paid service, and no email send until Resend is approved. Confirmation email is a follow-up, not a silent addition.
- **Depends on:** rebase onto #87 if both touched `App.tsx`.
- **Risk:** Medium. Public insert endpoint.
- **Tests:** The PR’s SQL, unit, and Playwright tests. Add a case that an authenticated non-admin cannot select the table, if that test is not already there.
- **User-visible result:** The contact page submits into an admin inbox. The visitor sees an on-screen confirmation. Email confirmation waits.
- **Do-not-touch:** No Stripe. Resend would be a new provider and stays out.

#### PR-T1 — confirmation email, after Resend is approved

- **Priority:** P3, gated.
- **Problem:** The spec asks for a confirmation email.
- **Files / DB:** `send-notification` or a small send inside `contact-form`, using the approved provider only.
- **Proposed solution:** One template, no marketing. Failure to send still keeps the stored message and still shows the on-screen confirmation.
- **Depends on:** #92 and Garrett’s approval of Resend.
- **Risk:** Medium. Email deliverability and secrets.
- **Tests:** Provider mocked. Missing API key does not 500 the form submit.
- **User-visible result:** The person gets an email that the message was received.
- **Do-not-touch:** No, once the provider is approved. Until then, do not add the dependency.

---

### Public site

#### PR-P1 — Homepage steps and the directory sentence

- **Priority:** P2.
- **Problem:** The spec describes a six-step workflow. The homepage has four. Browse copy says the site is not a directory while the nav says Find a Pro. A few fee lines are easy to misread.
- **Files / DB:** `src/features/home/HowItWorks.tsx`, the browse and reviewed-pro intro strings, `src/data/pricing.ts` only if a sentence is unclear. Keep the dollar amounts.
- **Proposed solution:** Six steps that match the product: post, pros see an anonymized job, up to three connect for $4.99, customer compares and hires, contact unlocks for that hired pair, the pro does the work and is paid off-platform. Replace “not a directory” with a sentence that Find a Pro lists reviewed pros and that posting a project is how hiring works. State that a fee does not guarantee a job, an estimate, or a match. No layout redesign.
- **Depends on:** none. If (d) changes fee refund sentences, quote those.
- **Risk:** Low.
- **Tests:** `publicCopy.test.ts` or the pricing copy tests updated for the new sentences and still asserting $9.99, $4.99, non-refundable, and off-platform job pay.
- **User-visible result:** The homepage matches the product and the nav.
- **Do-not-touch:** Fee amounts stay. Copy tests guard them.

#### PR-P2 — Find a Pro layout

- **Priority:** P3.
- **Problem:** Filters are misaligned. Profile titles are not links. An extra card looks unintentional.
- **Files / DB:** `src/pages/FindAProPage.tsx` and the storefront card component. Photos themselves are (b).
- **Proposed solution:** Align the filter row. Make the name a link to the existing profile route. Remove or explain the extra card by tracing the data; do not invent a fifth pro.
- **Depends on:** (b) if both edit the storefront. Rebase.
- **Risk:** Low.
- **Tests:** Existing `FindAProPage.test.tsx`. A card title is a link. Neutral labels still do not contain a business name.
- **User-visible result:** The directory is easier to scan and titles open profiles.
- **Do-not-touch:** No privacy-rule changes.

#### PR-P3 — FAQ entries for refunds, cancel, and delete

- **Priority:** P3 after the legal text and #90.
- **Problem:** The FAQ does not explain refunds, cancellation, or deletion.
- **Files / DB:** `src/data/faq.ts`.
- **Proposed solution:** Three answers that quote the published policy and the deletion behavior #90 actually ships. Until those land, do not invent an answer.
- **Depends on:** (d), PR-S1, #90.
- **Risk:** Low.
- **Tests:** FAQ visibility test includes the three questions.
- **User-visible result:** The FAQ matches the legal pages.
- **Do-not-touch:** Wording matches the non-refundable policy.

---

### SEO, performance, accessibility

#### PR-E1 — Titles, descriptions, canonicals, noindex

- **Priority:** P1. The audit measured duplicate titles and a homepage canonical on every route.
- **Problem:** One title and a canonical of `/` for almost every public URL.
- **Files / DB:** Extend `src/lib/seo/usePageTitle.ts` to set description and canonical, or add a sibling helper. Call it from Home, How it works, Pricing, Become a Pro, FAQ, Contact, Reviews, Trust, and Find a Pro. Private `/app/**` routes set `noindex`. Keep the helper out of the route table in `App.tsx` so it does not collide with #84, #85, #87, and #92.
- **Proposed solution:** Each public page has its own title and description. Canonical is that page’s absolute URL. App pages are `noindex`.
- **Depends on:** none.
- **Risk:** Low.
- **Tests:** A small render test per page for the document title. A test that an app route sets noindex.
- **User-visible result:** Browser tabs and search results can tell the pages apart.
- **Do-not-touch:** No.

#### PR-E2 — Open Graph PNG

- **Priority:** P2.
- **Problem:** `og:image` is a relative SVG. Most social apps will not show it.
- **Files / DB:** A real PNG in `public/` (export of the existing mark, not a new brand), absolute `og:image` and `twitter:image` in `index.html` pointing at `https://prioritypropertypros.com/...png`.
- **Proposed solution:** One absolute PNG URL. Dimensions suitable for a large summary card.
- **Depends on:** none.
- **Risk:** Low.
- **Tests:** HTML assertion in the existing pages test, if there is one, or a unit test of the tag string.
- **User-visible result:** Shared links can show an image.
- **Do-not-touch:** No.

#### PR-E3 — Structured data and sitemap updates

- **Priority:** P3.
- **Problem:** No JSON-LD. Sitemap will be stale once legal pages publish.
- **Files / DB:** JSON-LD on the homepage for the organization, using only facts already on the site (name, URL, support email, area served Conroe / Montgomery County). No review aggregate until real reviews exist. Sitemap gains `/terms` and `/privacy` only behind the same publish flag as #87, or in a follow-up commit after the flag is on.
- **Proposed solution:** Honest structured data. Skip star ratings.
- **Depends on:** PR-E1. Legal URLs depend on (d).
- **Risk:** Low.
- **Tests:** JSON parses and contains no `aggregateRating`.
- **User-visible result:** None on the page. Rich results can use the organization data.
- **Do-not-touch:** No fabricated counts.

#### PR-E4 — Split the customer and pro bundles

- **Priority:** P2.
- **Problem:** One large JS bundle. Mobile LCP is about 2.6–3.0 seconds.
- **Files / DB:** `src/App.tsx` lazy imports for customer, pro, and verifier pages, matching the admin pattern. Measure before adding `manualChunks`.
- **Proposed solution:** `React.lazy` on the three app shells. Leave the public homepage eager. Record before and after gzip sizes in the PR.
- **Depends on:** rebase after #84, #85, #87, and #92 have finished with `App.tsx`.
- **Risk:** Low. A missing suspense boundary flashes a blank page. Use `BrandLoader`.
- **Tests:** Existing route tests. Playwright still reaches a customer page and a pro page.
- **User-visible result:** Faster first load on a phone.
- **Do-not-touch:** No.

#### PR-E5 — Contrast, star widget semantics, focus

- **Priority:** P2.
- **Problem:** Gold eyebrow text fails contrast on the homepage and pricing. A star-rating `<p>` exposes `aria-label`, which that element does not support. Lighthouse accessibility was 92 on the homepage.
- **Files / DB:** Eyebrow classes (often `text-gold-700` on cream), `src/features/reviews/ReviewCard.tsx`, focus styles if a modal traps poorly.
- **Proposed solution:** Darken the eyebrow color until it clears WCAG AA on cream and on white. Put the star description on an element that allows an accessible name, or use visually available text. Check dialogs for focus return.
- **Depends on:** PR-B1 if both edit the star widget.
- **Risk:** Low.
- **Tests:** Component test for the accessible name. Contrast can be a commented computed-style check or a visual note with the hex values in the PR.
- **User-visible result:** Gold labels are readable. Star ratings announce correctly.
- **Do-not-touch:** No.

#### PR-E6 — Indexes, later

- **Priority:** P3. Do not do this at the current data size.
- **Problem:** Advisor lists unindexed foreign keys and per-row `auth.uid()` policies (audit L5).
- **Files / DB:** A future migration with indexes on the foreign keys that show up in real `EXPLAIN` output, and `(select auth.uid())` rewrites on the hottest policies.
- **Proposed solution:** Measure first. Skip until there is a slow query or a growth plan.
- **Depends on:** a captured slow query.
- **Risk:** Low for adding an index. Medium for rewriting many policies at once. Split by table when the time comes.
- **Tests:** The RLS expectation suite still passes.
- **User-visible result:** None until the data grows.
- **Do-not-touch:** Do not rewrite entitlement or matching policies in a drive-by.

---

### Testing and launch

#### PR-Q1 — Timezone-stable relationship test

- **Priority:** P2, and it can merge any day.
- **Problem:** `addProtectionMonths` uses local `setMonth`. The test expects `2027-01-15T00:00:00.000Z` from a UTC midnight input. Outside UTC the calendar day shifts (audit L7).
- **Files / DB:** `src/lib/marketplace/relationships.ts`, `relationships.test.ts`.
- **Proposed solution:** Add months in UTC (`setUTCMonth`) so the helper matches the test’s contract, and assert that in the test name. Run Vitest once without `TZ=UTC` to confirm.
- **Depends on:** none.
- **Risk:** Low. Confirm no caller depends on local-month arithmetic. The only caller in tests is this helper; server-side protection uses SQL.
- **Tests:** This file, in UTC and in `America/Chicago`.
- **User-visible result:** None. CI and laptops agree.
- **Do-not-touch:** No. Does not change `relationship_protection_months` or fees.

#### PR-Q2 — Safe-environment role walks

- **Priority:** P2, written as scenarios that land with the feature, not as one giant trailing PR.
- **Problem:** Phase 10 asks for every role, end to end, in a safe environment, plus security tests and a browser pass.
- **Files / DB:** Playwright specs under `e2e/`, SQL files under `supabase/tests/`. Use the existing harness. Never point tests at live Garrett or Plymate rows.
- **Proposed solution:** Each feature PR above already lists its tests. This item is the cross-check after the P0s: one scripted walk for customer, contractor, and admin on a local stack covering signup acceptance, a refused deletion during an active job, a paid-connect contact label, notification history, and a platform review staying pending. Security cases stay in SQL: anon selects, cross-user reads, fee amounts 999 and 499.
- **Depends on:** (a), (b), (c), (d), #90, PR-S6.
- **Risk:** Low. The risk is testing against production. Do not.
- **Tests:** The walk itself.
- **User-visible result:** None in production. A recorded pass or a list of failures.
- **Do-not-touch:** The walks read fees and entitlement. They do not change Stripe live mode.

#### PR-L1 — Launch-readiness report

- **Priority:** P2 after A5 and #92, and after the three marketing gates are actually fixed.
- **Problem:** There is no single place that says whether Conroe and Montgomery County are ready, with funnel numbers and the remaining risks.
- **Files / DB:** `/app/admin/launch` reading the existing dashboard RPCs plus a county filter on project city or ZIP if that column is already stored. Funnel: signups, activated, projects posted, connects paid, hires, completed, reviews. Risk list is a static checklist in the page: legal published, deletion safe, MFA enrolled, reviews moderated, SEO titles, support inbox. Checks that the software can detect (legal flag, `admin_mfa_required`, deletion function presence) are computed. The rest are labelled “confirm by hand”.
- **Proposed solution:** Numbers come from the database. The page never invents a count. Empty funnel cells say “none yet”.
- **Depends on:** A5 for payment totals, (d) for a legal signal, #90, PR-S6, PR-E1.
- **Risk:** Low if read-only.
- **Tests:** Fixture counts match the page. A zero state does not show a placeholder rating.
- **User-visible result:** Admins open one screen and see the local funnel and the remaining launch risks.
- **Do-not-touch:** Read-only. No fee or Stripe calls.

---

## 8. Owner actions that are not pull requests

| Action | Why it is not a PR | Gate |
| --- | --- | --- |
| Lawyer review of the drafts, then set `VITE_PUBLISH_LEGAL_PAGES=true` and rebuild | Publishing legal text | (d) and PR-S1 |
| Enroll admin MFA, then set `admin_mfa_required` | Lockout risk | PR-S7 |
| Turn on leaked-password protection and the Auth password minimum | Supabase dashboard | (c) |
| Confirm the live Stripe webhook endpoints, then undeploy the six legacy functions | Production functions | PR-S9 |
| Approve a paid AI provider and a monthly ceiling | New paid service | #83 stays dark until then |
| Approve Resend | New email provider | PR-T1 |
| Approve `pg_cron` and the matching edit for request-again | Extension plus `fill_project_opportunity_offers` | PR-C4a and PR-C4d |
| Choose platform-review policy | Product rule | PR-S6 |
| Choose whether any refund of $9.99 or $4.99 will ever exist | Conflicts with the non-refundable policy | PR-A6 |
| Decide later whether to retire the dormant REPEAT job-fee schedule | Legacy money rule, currently off | Not in this roadmap |

---

## 9. Suggested first merges

1. Review **#90** against live foreign keys and land it after approval. It is the data-loss bug.
2. Keep **#87 / (d)** in draft until the lawyer text exists. It is the other marketing gate.
3. Let **(a)**, **(b)**, and **(c)** finish in parallel. They are the broken screens and the signup form.
4. Land **#82** and **#83** whenever their diffs are clean. Hold **#84** and **#85** for the shell and nav rebases. Land **#92** before **#85**.
5. Then PR-S2, PR-S3, PR-S6, PR-B1, PR-B2, PR-E1. Those are small and independent once their file collisions are clear.
6. PR-C4 waits for an explicit yes to change matching.

Launch for a controlled Conroe / Montgomery County push is reasonable after: published Terms and Privacy, #90 deployed, admin MFA enrolled and enforced, platform reviews held for moderation, and per-page titles and canonicals. Email confirmation to the public still waits on Resend.

---

## 10. Per-PR report template

Use this at the bottom of every PR in this roadmap:

- Changes:
- Tests: full suite results (typecheck, lint, Vitest, Playwright). Note `TZ` until PR-Q1 has merged.
- Migrations and rollback file:
- Security effect:
- Stripe effect: none, or describe the glance required.
- Do-not-touch areas in the diff:
- Rollback steps:
- Still open:
- Ready to merge:
