# Account activation Checkout ($9.99) — TEST and LIVE capable

Do **not** apply this to production from this PR until the owner is ready.
Do **not** put Stripe secrets in git, Vite, or the PR body.
Do **not** put LIVE Stripe secrets in staging.

This is **not** the $4.99 Connection Fee. Paying $9.99 never grants `#14` project contact, never approves a contractor, and never flips job-payment flags.

## Flags (must stay in this PR)

| Flag | Production / this PR default |
| --- | --- |
| `payments_live` | 0 |
| `charges_live` | 0 |
| `signup_fee_enabled` | **0** until owner enables |
| `connection_fee_checkout_enabled` | 0 (independent) |
| `stripe_test_mode` | **1 = TEST, 0 = LIVE.** Default remains **1**. Do not infer safety from whichever key is installed. |
| `signup_fee_cents` | 999 |

`signup_fee_enabled` is the customer-facing kill switch. Frontend and marketplace gates keep **current behavior** while it is 0. Do not flip job-payment flags to collect the signup fee.

## How to enable later (secrets + flags)

Do this on **staging first** (`giiskdvitimksdewnelc`). Production (`bersftkjpbzpgtahbqwd`) only after a TEST walkthrough.

1. Stripe Dashboard: create/confirm a **one-time USD Price** with `unit_amount = 999`. TEST Price while `stripe_test_mode=1`; LIVE Price only when the DB is LIVE.
2. Supabase Edge Function secrets (never Vite, never git):
   - `STRIPE_SECRET_KEY` — `sk_test_...` while `stripe_test_mode=1`; `sk_live_...` only later when the DB is LIVE
   - `STRIPE_ACTIVATION_PRICE_ID` — the Price from step 1 (must **not** be the Connection Fee Price)
   - `STRIPE_SIGNUP_FEE_WEBHOOK_SECRET` — `whsec_...` for a **separate** Stripe endpoint
3. Stripe webhook endpoint: `https://<PROJECT-REF>.supabase.co/functions/v1/signup-fee-webhook`  
   Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded` (optional: `checkout.session.expired`, `checkout.session.async_payment_failed`)
4. Deploy Edge Functions: `create-signup-fee-checkout`, `reconcile-signup-fee-checkout`, `signup-fee-webhook`
5. Apply `supabase/migrations/20261005000001_signup_activation_checkout.sql` if it is not already applied (additive; flags stay off)
6. Confirm settings still: `payments_live=0`, `charges_live=0`, `connection_fee_checkout_enabled` unchanged, `signup_fee_cents=999`, `stripe_test_mode` matches the key/Price
7. Owner SQL **only when ready to collect**: `UPDATE platform_settings SET value_int = 1 WHERE key = 'signup_fee_enabled';`
8. TEST card `4242 4242 4242 4242`. Paying must set `signup_fee_status=PAID` and must **not** set contractor `approval_status=APPROVED` or unlock `#14`.

To turn collection off without undeploying: set `signup_fee_enabled` back to 0.

## Environment control

Same fail-closed matrix as Connection Fee. Read `platform_settings.stripe_test_mode`. Any mismatch fails closed.

| `stripe_test_mode` | Secret | Price | Webhook `event.livemode` | Checkout session |
| --- | --- | --- | --- | --- |
| 1 (TEST) | `sk_test_...` required; `sk_live_` rejected | TEST Activation Price from `STRIPE_ACTIVATION_PRICE_ID` | `true` rejected | `cs_test_...` |
| 0 (LIVE) | `sk_live_...` required; `sk_test_` rejected | LIVE Activation Price from `STRIPE_ACTIVATION_PRICE_ID` | `false` rejected | `cs_live_...` |

`STRIPE_ACTIVATION_PRICE_ID` is required (no hardcoded TEST fallback on server paths). Edge Functions retrieve the Price from Stripe and require: livemode matches mode, `currency=usd`, `unit_amount=999`, `type=one_time`. Clients cannot supply Price ID, amount, or currency.

Known TEST catalog ID `price_1UH1SePYJQAIQDv7nrMo32Xp` is config-only, not a LIVE fallback.

## Architecture

1. New CUSTOMER / CONTRACTOR profiles are `signup_fee_status=UNPAID` (existing rows at migration time are grandfathered `NOT_REQUIRED`). VERIFIER / ADMIN are `NOT_REQUIRED`.
2. While `signup_fee_enabled=0`, unpaid users use the app as they do today. Gates and `/account/activate` stay off.
3. When enabled, `postLoginPath` / `RequireAuth` send unpaid CUSTOMER / CONTRACTOR accounts to `/account/activate`.
4. Edge Function `create-signup-fee-checkout` (JWT) reads `stripe_test_mode`, requires a matching secret + env Price ID, and creates a Stripe Checkout Session with the **server** Price ID (999 USD cents).
5. Browser redirects to Stripe-hosted Checkout. PPP does not collect cards. Success URL **never** marks paid.
6. `signup-fee-webhook` (JWT verify **off**, `STRIPE_SIGNUP_FEE_WEBHOOK_SECRET`) is the authoritative fulfillment path. `reconcile-signup-fee-checkout` may retrieve the session using the same environment checks.
7. `fulfill_signup_fee_checkout` sets `signup_fee_status=PAID` and records the ledger. It does **not** change `account_status`, contractor approval, or `#14` `booking_contact_access`.

Webhook secrets and endpoints stay **separate** from `connection-fee-webhook`. Connection Fee events (`ppp_kind=connection_fee`) are ignored here. Signup events are ignored by the Connection Fee webhook.

The $9.99 account activation fee is non-refundable in the product. `needs_refund` on a charge row is an operator flag, not an in-app Stripe refund.

## Secrets (names only — set later, not in this PR)

- `STRIPE_SECRET_KEY`
- `STRIPE_ACTIVATION_PRICE_ID`
- `STRIPE_SIGNUP_FEE_WEBHOOK_SECRET`

Never set LIVE secrets on staging. Never commit values.
