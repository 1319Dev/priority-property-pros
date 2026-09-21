# Connection Fee Checkout ($4.99) — TEST and LIVE capable

Do **not** apply this to production from this PR. Do **not** put Stripe secrets in git, Vite, or the PR body.
Do **not** put LIVE Stripe secrets in staging.

## Flags (must stay)

| Flag | Production / this PR default |
| --- | --- |
| `payments_live` | 0 |
| `charges_live` | 0 |
| `signup_fee_enabled` | 0 |
| `stripe_test_mode` | **1 = TEST, 0 = LIVE.** Default remains **1**. This is the server-side Stripe environment control. Do not infer safety from whichever key is installed. |
| `connection_fee_checkout_enabled` | 0 until owner enables. Customer-facing kill switch. May stay 0 even when LIVE secrets are installed later. |

`connection_fee_checkout_enabled` is independent of `payments_live`. Do not flip job-payment flags to test connections. Do not enable the $9.99 signup fee.

## Environment control

Read `platform_settings.stripe_test_mode`. Any mismatch fails closed.

| `stripe_test_mode` | Secret | Price | Webhook `event.livemode` | Checkout session |
| --- | --- | --- | --- | --- |
| 1 (TEST) | `sk_test_...` required; `sk_live_` rejected | TEST Connection Price ID from `STRIPE_CONNECTION_PRICE_ID` | `true` rejected | `cs_test_...` |
| 0 (LIVE) | `sk_live_...` required; `sk_test_` rejected | LIVE Connection Price ID from `STRIPE_CONNECTION_PRICE_ID` | `false` rejected | `cs_live_...` |

Never allow a live key while the DB says test mode. Never allow a test key while the DB says live mode. Never allow a TEST webhook event to fulfill a LIVE transaction or vice versa.

`STRIPE_CONNECTION_PRICE_ID` is required (no hardcoded TEST fallback on server paths). Edge Functions retrieve the Price from Stripe and require: livemode matches mode, `currency=usd`, `unit_amount=499`, `type=one_time`. Clients cannot supply or override Price ID, amount, or currency.

## Architecture

1. Contractor confirms **Connect — $4.99**.
2. Edge Function `create-connection-checkout` (JWT) reads `stripe_test_mode`, requires a matching secret + env Price ID, reserves a slot (`RESERVED`, 30-minute TTL), and creates a Stripe Checkout Session with the **server** Price ID (499 USD cents).
3. Browser redirects to Stripe-hosted Checkout. PPP does not collect cards.
4. `connection-fee-webhook` (JWT verify **off**, `STRIPE_WEBHOOK_SECRET` / `whsec_` signature required) is the authoritative fulfillment path. `event.livemode` must match `stripe_test_mode`.
5. `reconcile-connection-checkout` may retrieve the session from Stripe using the same environment checks. The success URL **never** unlocks contact.

State machine: **AVAILABLE → RESERVED (pending payment) → PAID**. `#14` `booking_contact_access` is granted UNLOCKED (`CONNECTION_FEE_PAYMENT`) only after trusted Stripe verification, then `fulfill_connection_fee_checkout` marks the purchase PAID. Abandoned/expired Checkout **releases** the slot. Customer **Stop New Connections** rejects new reservations; in-flight RESERVED payments may still finalize; existing UNLOCKED `#14` rows stay.

Paid-but-not-reservable (expired / 4th slot) → `needs_refund` flag (no silent loss, no extra unlock). That flag is **not** an in-app refund. The $4.99 Connection Fee and $9.99 account activation fee are non-refundable in the product. This app does not call Stripe refunds. Stripe Dashboard refunds remain possible outside the app.

## #14 (single entitlement store)

`booking_contact_access` is the only contact-access authority. A verified $4.99 Stripe payment grants a connection-backed `#14` row (`nullable booking_id`, `connection_id` FK, `grant_source = CONNECTION_FEE_PAYMENT`) through `grant_booking_contact_access_from_connection_fee`, then `fulfill_connection_fee_checkout` marks the purchase PAID.

`contractor_has_contact_access_on_project` does **not** OR a second table. `connection_contact_access` is dropped. Missing entitlement = no private contact. Success URLs, query params, frontend state, and project/estimate/booking status never unlock.

## Account activation (PR signup checkout)

The $9.99 activation Checkout lives in [SIGNUP_FEE_CHECKOUT.md](SIGNUP_FEE_CHECKOUT.md). `STRIPE_ACTIVATION_PRICE_ID` is required by `create-signup-fee-checkout` / `signup-fee-webhook` / `reconcile-signup-fee-checkout`. Do **not** use that Price ID for Connection Fee. Webhook secrets and endpoints stay separate. `signup_fee_enabled` stays 0 in this Connection Fee path.

## Secrets (names only — set later, not in this PR)

- `STRIPE_SECRET_KEY` (`sk_test_` while `stripe_test_mode=1`; `sk_live_` only later when the DB is LIVE)
- `STRIPE_CONNECTION_PRICE_ID` (TEST Price now; LIVE Connection Price later)
- `STRIPE_ACTIVATION_PRICE_ID` (used by the separate $9.99 signup/activation functions; must not be the Connection Price)
- `STRIPE_WEBHOOK_SECRET` (`whsec_` for `connection-fee-webhook`; TEST vs LIVE endpoint)

Staging project **giiskdvitimksdewnelc**: TEST secrets only. Never LIVE secrets on staging.
Never set these on production **bersftkjpbzpgtahbqwd** from this PR.
