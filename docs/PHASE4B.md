# Phase 4B — Stripe Connect payments (TEST MODE ONLY)

Additive on Phase 4A. **Do not enable live Stripe. Do not merge until reviewed.**  
`platform_settings.payments_live = 0` and `charges_live = 0` stay false. Booking rows still CHECK both flags are false.

Apply after Phase 4A, in filename order:

25. `20260919000001_phase4b_enums_settings.sql`
26. `20260919000002_phase4b_tables.sql`
27. `20260919000003_phase4b_guards.sql`
28. `20260919000004_phase4b_rpcs.sql`
29. `20260919000005_phase4b_more_rpcs.sql`
30. `20260919000006_phase4b_rls_grants.sql`

These files do **not** drop users, projects, estimates, bookings, or Phase 4A fee schedules.

## Connect model

**Stripe Connect Express** with hosted Account Links.

PPP is the platform account. Contractors complete Stripe-hosted KYC/onboarding. PPP never stores bank numbers, SSNs, ID documents, or KYC payloads.

Customer charges are created on the **platform** (PaymentIntents / Checkout Sessions). Contractor payouts are later **Transfers** to the connected account. Customer payment is **not** immediately withdrawable.

Statuses (server-synced from Stripe capabilities, not from the UI):

| PPP status | Meaning |
| --- | --- |
| `NOT_STARTED` | No connected account |
| `ONBOARDING` | Account exists; details not submitted |
| `RESTRICTED` | Details submitted but payouts/transfers not fully active |
| `READY` | `charges_enabled`, `payouts_enabled`, and transfers capability `active` |
| `DISABLED` | Stripe disabled reason present |

Contractors may marketplace-participate without being READY. **Transfers are blocked until READY.**

## Fee schedule (unchanged from Phase 4A)

ORIGINAL progressive integer cents, snapshotted at confirm:

- $0–$499.99 @ 8%; $500–$2,499.99 @ 7%; $2,500–$9,999.99 @ 5%; $10,000–$24,999.99 @ 3.5%; $25,000+ @ 2.5%
- Min $15; Max $1,500 including approved positive change orders

REPEAT: 2%, min $10, max $500.

Marketplace fee remains **contractor-paid**. It is not a customer checkout surcharge. Stripe processing costs are separate ledger lines (`PROCESSING_COST`) taken from Stripe balance-transaction data when available — not hardcoded as a public %.

## Payment methods

Checkout supports **card** and **US bank (ACH)**. Copy:

- Bank Account — Recommended for larger project payments
- Card — Fast and convenient

No settlement-timing claims.

## Payment schedules

First-class items: `BOOKING_DEPOSIT | MILESTONE | FINAL_PAYMENT | APPROVED_CHANGE_ORDER`.

Configurable guidance (not hard-law), from `platform_settings`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `deposit_full_pay_max_cents` | 100000 ($1,000) | Under this: full pay to confirm is allowed |
| `structured_milestones_min_cents` | 500000 ($5,000) | At/above: deposit + milestone + final |
| `default_deposit_bps` / `max_deposit_bps` | 2500 (25%) | Deposit guidance cap |

Clients cannot set authoritative amounts. Schedule totals must match approved booking + approved positive COs.

## Confirmation and contact unlock

Browser success redirects **do not** confirm bookings.

Required booking payment/deposit succeeds via **verified webhook** → `confirm_booking_from_payment` → booking `CONFIRMED` → contact/address unlock (Phase 4A `booking_job_contact` / private-location RLS). Failed/incomplete payment stays unconfirmed; no relationship; no marketplace fee owed.

`confirm_booking_for_testing` remains **ADMIN-only TEST ONLY**. It is **not** the real payment path. Stripe test webhooks supersede it for actual payment confirmation.

## Webhooks

Edge Function `stripe-webhook`:

- Verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`; rejects invalid
- Idempotent via `stripe_events.stripe_event_id` unique
- Out-of-order: a later `processing`/`failed` event cannot un-succeed a payment
- Logs redacted summaries (no PAN/bank/PII secrets)

Subscribe at least:

`payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.processing`, `payment_intent.canceled`, `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `account.updated`, `capability.updated`, `transfer.created`, `transfer.updated`, `transfer.reversed`, `payout.paid`, `payout.failed`

## Ledger

Append-only `ledger_entries`. Corrections are new rows. Integer cents. Types include gross customer payment, processing cost, marketplace fee, contractor gross, refunds, dispute hold/loss, transfers, payouts.

## Transfers / payouts

Statuses: `PENDING | ELIGIBLE | TRANSFER_PENDING | TRANSFERRED | HELD | REVERSED | FAILED`.

Eligible after a succeeded payment once the booking is confirmed (milestones also need customer approval). Duplicate Stripe transfer ids are unique. UI never shows held/pending as available. No instant-payout promise.

## Milestones, change orders, cancellations, refunds, disputes

- Contractor marks milestone complete; **cannot** self-approve a customer-required approval.
- Approved positive COs add `APPROVED_CHANGE_ORDER` items under the **snapshotted** fee cap.
- Cancellation categories include BEFORE_PAYMENT through MUTUAL. Complex post-work refunds stay `PENDING_REVIEW`.
- Refunds are server-side (admin Edge Function). Success history is never deleted.
- Stripe chargebacks (`STRIPE_CHARGEBACK`) vs PPP project disputes (`PPP_PROJECT`). Chargebacks HOLD transfers. No fake arbitration AI.

## Abandoned bookings

Cancel or TTL-expire a PENDING/AWAITING_PAYMENT booking: no contact, no relationship, no fee. Project selection is cleared so the customer can choose another **still-valid** estimate. Expired contractor estimates are **not** auto-reopened. Matching-pool opportunities that were CLOSED stay closed.

## Email confirmation

Do **not** flip Auth “Confirm email” in a way that locks out the current test workflow.

**Before public launch:** keep Confirm email enabled, add custom SMTP, and confirm redirect URLs. Auto-confirm is a test convenience only.

## Secrets (names only)

| Name | Where | Value in git? |
| --- | --- | --- |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Vite / GitHub Actions **variables** | Placeholder `pk_test_your_publishable_key` only |
| `STRIPE_SECRET_KEY` | Edge Function secret | **No** — must be `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Edge Function secret | **No** — `whsec_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions runtime | **No** — never Vite |

Edge Functions refuse secrets that do not start with `sk_test_`. Live keys are a hard error.

## Garrett / Stripe Dashboard checklist (TEST MODE)

Do **not** switch the Stripe account to live mode.

1. Open [https://dashboard.stripe.com](https://dashboard.stripe.com) and confirm the **TEST DATA** toggle is on.
2. **Connect** → Settings: enable Connect. Use **Express** accounts. Complete platform profile as required by Stripe for test mode.
3. **Developers → API keys**: copy the **publishable** key (`pk_test_...`) into GitHub Actions variable `VITE_STRIPE_PUBLISHABLE_KEY` and local `.env.local`. Never copy the secret key into Vite.
4. **Developers → API keys**: copy the **secret** key (`sk_test_...`) into Supabase **Project Settings → Edge Functions → Secrets** as `STRIPE_SECRET_KEY`.
5. Deploy Edge Functions (`stripe-webhook`, `create-payment-intent`, `create-connect-account-link`, `create-refund`, `create-transfer`).
6. **Developers → Webhooks → Add endpoint** pointing at  
   `https://<PROJECT-REF>.supabase.co/functions/v1/stripe-webhook`  
   Subscribe to the events listed above. Copy the signing secret into Edge Function secret `STRIPE_WEBHOOK_SECRET`.
7. Optional: Stripe **Test clocks** for ACH delay simulation. Not required.
8. Contractor **Set up payouts** uses hosted Account Links (Express onboarding). Use Stripe test identity data.
9. Customer checkout: test card `ACCT-000015`, any future expiry, any CVC. For ACH, use Stripe’s test bank accounts. Do not claim settlement timing.
10. Confirm `payments_live` and `charges_live` are still `0` in `platform_settings`.

## Live-mode activation checklist (DO NOT EXECUTE)

1. Legal: Terms, refund policy, contractor independent-contractor language, ACH authorization, Connect TOS.
2. Stripe live account, live Connect settings, live webhook endpoint, live keys (`sk_live_` / `pk_live_`).
3. A dedicated migration to allow `payments_live=1` / `charges_live=1` (the Phase 4B trigger currently forbids this).
4. Remove the Edge Function `sk_test_`-only guard.
5. Tax, 1099, and payout hold-period policy.
6. Production SMTP + Confirm email.
7. Incident runbooks for disputes, refunds, and failed ACH.

## Admin test confirm decision

Keep `confirm_booking_for_testing`. Labelled TEST ONLY. Real paid confirmation is `confirm_booking_from_payment` after a verified webhook.
