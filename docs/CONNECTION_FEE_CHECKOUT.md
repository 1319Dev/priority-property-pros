# Connection Fee TEST Checkout ($4.99)

Do **not** apply this to production. Do **not** put Stripe secrets in git, Vite, or the PR body.

## Flags (must stay)

| Flag | Production / this PR default |
| --- | --- |
| `payments_live` | 0 |
| `charges_live` | 0 |
| `signup_fee_enabled` | 0 |
| `stripe_test_mode` | 1 |
| `connection_fee_checkout_enabled` | 0 until owner enables on **staging only** |

`connection_fee_checkout_enabled` is independent of `payments_live`. Do not flip job-payment flags to test connections.

## Architecture

1. Contractor confirms **Connect — $4.99**.
2. Edge Function `create-connection-checkout` (JWT) reserves a slot (`RESERVED`, 30-minute TTL) and creates a Stripe TEST Checkout Session with **server** Price ID `price_1UH1RsPYJQAIQDv721IhjKS0` (499 USD cents).
3. Browser redirects to Stripe-hosted Checkout. PPP does not collect cards.
4. `connection-fee-webhook` (signature required) is the authoritative fulfillment path.
5. `reconcile-connection-checkout` may retrieve the session from Stripe. The success URL **never** unlocks contact.

State machine: **AVAILABLE → RESERVED (pending payment) → PAID**. `#14` `booking_contact_access` is granted UNLOCKED (`CONNECTION_FEE_PAYMENT`) only after trusted Stripe verification, then the purchase is marked PAID. Abandoned/expired Checkout **releases** the slot. Customer **Stop New Connections** rejects new reservations; in-flight RESERVED payments may still finalize; existing UNLOCKED `#14` rows stay.

Paid-but-not-reservable (expired / 4th slot) → `needs_refund` (no silent loss, no extra unlock).

## #14 (single entitlement store)

`booking_contact_access` is the only contact-access authority. A verified $4.99 Stripe TEST payment grants a connection-backed `#14` row (`nullable booking_id`, `connection_id` FK, `grant_source = CONNECTION_FEE_PAYMENT`) through `grant_booking_contact_access_from_connection_fee`, then `fulfill_connection_fee_checkout` marks the purchase PAID.

`contractor_has_contact_access_on_project` does **not** OR a second table. `connection_contact_access` is dropped. Missing entitlement = no private contact. Success URLs, query params, frontend state, and project/estimate/booking status never unlock.

## PR #12 activation

`STRIPE_ACTIVATION_PRICE_ID` / `price_1UH1SePYJQAIQDv7nrMo32Xp` is config-only here. Do **not** duplicate `create-signup-fee-checkout`. Shared `STRIPE_SECRET_KEY` (TEST) is OK on staging; webhook secrets and endpoints stay separate.

## Secrets (names only)

- `STRIPE_SECRET_KEY` (`sk_test_` only)
- `STRIPE_CONNECTION_PRICE_ID`
- `STRIPE_ACTIVATION_PRICE_ID` (unused by these functions)
- `STRIPE_WEBHOOK_SECRET` (`whsec_` for `connection-fee-webhook`)

Set them on staging project **giiskdvitimksdewnelc** only. Never on production **bersftkjpbzpgtahbqwd**.
