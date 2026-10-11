# Obsolete test-mode edge functions — removal plan

Checked 2026-10-11 against Supabase project `bersftkjpbzpgtahbqwd` (Priority Property Pros, live) and git `main` at `2d4933a`. This document is a plan only. It does not undeploy a function, change a Stripe endpoint, change a price, or change the live `$9.99` / `$4.99` functions.

## What is deployed and not in git

These six functions are `ACTIVE` in the Supabase project and have no directory under `supabase/functions/` and no entry in `supabase/config.toml`:

| Function | Version | `verify_jwt` | Created (UTC) | Last updated (UTC) |
| --- | --- | --- | --- | --- |
| `stripe-webhook` | 6 | false | 2026-09-17 01:14:35 | 2026-09-17 01:15:28 |
| `create-payment-intent` | 5 | true | 2026-09-17 01:16:00 | 2026-09-17 01:16:00 |
| `create-connect-account-link` | 5 | true | 2026-09-17 01:16:02 | 2026-09-17 01:16:02 |
| `create-transfer` | 5 | true | 2026-09-17 01:16:24 | 2026-09-17 01:16:24 |
| `create-refund` | 5 | true | 2026-09-17 01:16:24 | 2026-09-17 01:16:24 |
| `confirm-signup-fee-session` | 4 | true | 2026-09-17 18:34:29 | 2026-09-17 18:34:29 |

The source was read from the deployed bundles (not committed). Every one of them refuses a live Stripe secret:

- `stripe-webhook`, `create-payment-intent`, `create-connect-account-link`, `create-transfer`, and `create-refund` call `stripeClient()`, which throws unless `STRIPE_SECRET_KEY` starts with `sk_test_`. `stripe-webhook` does that before it verifies a signature, so a live key fails closed and does not write a payment row.
- `confirm-signup-fee-session` returns unpaid unless the session id starts with `cs_test_`, then calls `requireTestSecret()`, which also requires `sk_test_`.
- Their metadata uses `ppp_stripe_mode: "test"`. `create-refund` calls `stripe.refunds.create` only for a row in the old job-payment `payments` table, and only for an admin. That is not the `$9.99` or `$4.99` path. Those two fees stay blocked by `reject_signup_or_connection_fee_refund`, which always raises `non_refundable_platform_fee` and is revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`.

They are still public HTTP endpoints. If someone later puts an `sk_test_` key in `STRIPE_SECRET_KEY`, `stripe-webhook` can call database functions that still exist (`claim_stripe_event`, `apply_payment_intent_update`, `register_payment_intent`, `record_refund`, `apply_stripe_dispute`). That is the reason to remove them after the Stripe check below. Do not remove those database functions in the same step; this plan is edge functions only.

## Proof they are unused

### Repo

- No `supabase/functions/<name>/` directory for any of the six.
- `supabase/config.toml` lists only the live functions: `create-connection-checkout`, `reconcile-connection-checkout`, `connection-fee-webhook`, `delete-account`, `create-signup-fee-checkout`, `reconcile-signup-fee-checkout`, `signup-fee-webhook`, `send-notification`, `notification-unsubscribe`.
- No `functions/v1/<name>` call exists in `src/`, `supabase/functions/`, `supabase/migrations/`, `e2e/`, or `scripts/`.
- The five job-payment names are listed only as `LEGACY_JOB_PAYMENT_FUNCTIONS`, a denylist. `confirm-signup-fee-session` has no reference in the repo at all.

### Live frontend bundle

`https://prioritypropertypros.com/` loads `assets/index-BFPVwabl.js` (fetched 2026-10-11). That file contains `create-connection-checkout` and `create-signup-fee-checkout`. It does not contain `stripe-webhook`, `create-payment-intent`, `create-connect-account-link`, `create-transfer`, `create-refund`, or `confirm-signup-fee-session`.

### Database, cron, and pg_net

Checked on `bersftkjpbzpgtahbqwd` with read-only SQL:

- `pg_cron` is not installed. There is no `cron` schema.
- `pg_net` is installed. `net.http_request_queue` had 0 rows whose URL contained any of the six names.
- `net._http_response` had 3 historical rows. None of their bodies contained any of the six names.
- No `public` function body contains any of the six names.
- No non-internal trigger definition contains any of the six names.

### Gateway logs (24 hours, not a lifetime proof)

From 2026-10-10 10:50 UTC through 2026-10-11 10:50 UTC the API gateway recorded 4,645 `edge_logs` rows and **0** requests whose path contained `/functions/v1/`. That window shows no call to these six functions. It also shows no call to the live checkout functions, so it is only a one-day sample. The caller proof above is the one to use.

## Confirm the live Stripe webhook is not `/stripe-webhook`

This environment cannot read the Stripe account. The owner has to confirm it in the Stripe Dashboard before any undeploy. Do not edit, delete, or rotate a live endpoint while checking.

1. Open the Stripe Dashboard and turn **Test mode off** so the view is live mode.
2. Go to **Developers → Webhooks** (Workbench → Webhooks in the newer dashboard).
3. Open every endpoint. Read the endpoint URL on the detail page.
4. A live endpoint should be one of these, unchanged:
   - `https://bersftkjpbzpgtahbqwd.supabase.co/functions/v1/signup-fee-webhook` (`$9.99` activation, secret `STRIPE_SIGNUP_FEE_WEBHOOK_SECRET`)
   - `https://bersftkjpbzpgtahbqwd.supabase.co/functions/v1/connection-fee-webhook` (`$4.99` connection fee, secret `STRIPE_WEBHOOK_SECRET`)
5. Stop if any **live** endpoint URL contains `/functions/v1/stripe-webhook`. Leave that endpoint in place and do not undeploy `stripe-webhook` until the live events are moved to `connection-fee-webhook` or `signup-fee-webhook` on purpose, in a separate approved change.
6. Switch to **Test mode** and note whether a test endpoint points at `/stripe-webhook`. A test-mode endpoint does not receive live events. Leave it until the undeploy step, and do not point it at a live function.
7. Do not change the live endpoint URL, the signing secret, or the subscribed events. Do not change price IDs.

## Owner steps to remove them (not done here)

Download the source first. Current Supabase docs (`functions download`) write the files into `supabase/functions/<name>` of the directory you run the command in. Use a temporary directory, not this repo, so the obsolete source is not committed and `supabase functions deploy` with no name cannot publish it.

```bash
mkdir -p /tmp/ppp-obsolete-functions && cd /tmp/ppp-obsolete-functions
supabase init
supabase login
supabase functions download stripe-webhook --project-ref bersftkjpbzpgtahbqwd
supabase functions download create-payment-intent --project-ref bersftkjpbzpgtahbqwd
supabase functions download create-connect-account-link --project-ref bersftkjpbzpgtahbqwd
supabase functions download create-transfer --project-ref bersftkjpbzpgtahbqwd
supabase functions download create-refund --project-ref bersftkjpbzpgtahbqwd
supabase functions download confirm-signup-fee-session --project-ref bersftkjpbzpgtahbqwd
```

Run `supabase functions download --help` first if the CLI has changed. Keep the download outside git. The Dashboard **Download** button on each function is an equivalent copy.

After the live Stripe check shows no live endpoint on `/stripe-webhook`, link the project and delete only these six. `supabase functions delete` removes the function from the linked project and does not delete the local download.

```bash
supabase link --project-ref bersftkjpbzpgtahbqwd
supabase functions delete --help
supabase functions delete stripe-webhook
supabase functions delete create-payment-intent
supabase functions delete create-connect-account-link
supabase functions delete create-transfer
supabase functions delete create-refund
supabase functions delete confirm-signup-fee-session
```

Do not delete `create-signup-fee-checkout`, `reconcile-signup-fee-checkout`, `signup-fee-webhook`, `create-connection-checkout`, `reconcile-connection-checkout`, `connection-fee-webhook`, `delete-account`, `send-notification`, or `notification-unsubscribe`.

## Rollback

Redeploy from the downloaded directory. `stripe-webhook` was deployed with JWT verification off. The other five verify JWTs.

```bash
cd /tmp/ppp-obsolete-functions
supabase functions deploy stripe-webhook --project-ref bersftkjpbzpgtahbqwd --no-verify-jwt
supabase functions deploy create-payment-intent --project-ref bersftkjpbzpgtahbqwd
supabase functions deploy create-connect-account-link --project-ref bersftkjpbzpgtahbqwd
supabase functions deploy create-transfer --project-ref bersftkjpbzpgtahbqwd
supabase functions deploy create-refund --project-ref bersftkjpbzpgtahbqwd
supabase functions deploy confirm-signup-fee-session --project-ref bersftkjpbzpgtahbqwd
```

Do not run `supabase functions deploy` with no function name from the main repo after a download, and do not run it from the temp directory without the six names, or a later `deploy` of everything in that folder will publish the obsolete functions again.

No migration is part of this plan. No edge function in this pull request needs a redeploy.
