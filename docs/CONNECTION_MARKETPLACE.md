# Connection Marketplace — $4.99 flat fee (payments OFF)

Active product model: PPP is a **connection marketplace**. It does **not** process homeowner→contractor project payments, collect deposits, escrow, take a percentage of the job, or guarantee hiring or workmanship.

## Authoritative price

`CONNECTION_FEE_CENTS = 499` (server constant + `platform_settings.connection_fee_cents` + CHECK constraint). Clients cannot pass a price.

## Payments stay OFF

| Flag | Value |
| --- | --- |
| `payments_live` | 0 (unchanged) |
| `charges_live` | 0 (unchanged) |
| `signup_fee_enabled` | 0 (recorded; $9.99 checkout stays in parked PR #12) |
| `stripe_test_mode` | 1 = TEST (default), 0 = LIVE. Explicit server-side Stripe environment control. Do not infer safety from the installed key. |
| `connection_fee_checkout_enabled` | 0 by default. Customer-facing kill switch for $4.99 Stripe Checkout. Independent of `payments_live`. May stay 0 with LIVE secrets installed later. |

Clicking **Connect — $4.99** never unlocks contact by itself. When checkout is off, the row stays `PAYMENT_DISABLED` and **no** `booking_contact_access` row is created (missing = no access). When enabled, the contractor goes to Stripe-hosted Checkout; webhook/reconcile must verify environment (`stripe_test_mode` vs key vs `event.livemode`), Price ID + 499 USD, then grant `#14` `booking_contact_access` (`CONNECTION_FEE_PAYMENT` / UNLOCKED) and only then mark the connection `PAID`. Success URLs cannot grant access. TEST events cannot fulfill LIVE transactions and vice versa.

See [`CONNECTION_FEE_CHECKOUT.md`](CONNECTION_FEE_CHECKOUT.md).

## Max 3

At most **3 occupying** connections per project (`connection_slots`, `SELECT … FOR UPDATE`, unique slot PK). Display: “3 connection spots available” / “N of 3 remaining” / “Connections Full”. Customer **Stop New Connections** closes new purchases; existing unlocked rows are not deleted.

## #14 contact entitlement (single store)

`booking_contact_access` is the **only** authoritative private-contact entitlement table.

- Booking-hire rows: `booking_id` set, `connection_id` null (original #14).
- Paid $4.99 connections: `connection_id` set, `booking_id` null. No fake booking.
- XOR check enforces exactly one subject. Unique indexes on each.
- `contractor_has_contact_access_on_project` reads this table only. It does **not** OR a second entitlement table and does **not** treat `project_connections` / Stripe rows as authorization.
- Missing entitlement = no access. Project/estimate/booking/connection status never unlocks contact.

`connection_contact_access` is dropped and must not ship as an authorization table. Purchase tables (`project_connections`, `connection_slots`, `connection_checkout_sessions`) remain for billing, idempotency, refunds, auditing, and max-3.

## Contractor job actions

**Connect** is the only primary step. Participate/accept is optional server-side: matched `AVAILABLE` or `ACCEPTED` opportunities may reserve or request a connection. The UI no longer asks contractors to tap Participate before Connect. Connect still never unlocks contact by itself.

**Pass on this job** (`contractor_end_job`) is the contractor skip/leave action. The UI says Pass for unpaid / open jobs (not “End this job”). Passing marks the opportunity `PASSED`, frees unpaid connection spots, and backfills the next ranked contractor.

| Starting state | Opportunity | Connection | Slots |
| --- | --- | --- | --- |
| Open, no connection | `PASSED` | unchanged | none |
| Unpaid occupying (`INITIATED` / `RESERVED` / `PAYMENT_DISABLED`) | `PASSED` | `CANCELLED` | connection slot freed |
| Paid, not hired | `CLOSED` | `COMPLETED` | paid connection slot stays occupied |
| Hired booking | refused unless already `PAID`, then `COMPLETED` only | hire kept | not freed |

Hard delete is blocked by purchase-history triggers. `#14` is never granted by Pass, End, or Connect. Paid-complete still uses **End this job** copy because that is finishing a paid connection, not skipping.

## Estimates (kept)

Submitting an estimate is never charged. Withdraw uses **Withdraw Estimate** with confirm copy; server sets `WITHDRAWN` and keeps history. See PR body for keep-vs-rearchitect owner decision.

## Legacy % fee engine

`fee_schedules` / `fee_schedule_brackets` and `feeEngine.ts` are **deprecated**, retained for history. Not used by active UI or the new lifecycle.

## Photos

PPP does **not** run image OCR. Upload guidance, filename sanitization, and `submit_content_report` exist. Do not pretend photos are verified.

## Refund policy (document only — attorney review)

The $9.99 account activation fee and the $4.99 Connection Fee are **non-refundable**. $4.99 buys connection access, not a guaranteed job. There is no refund if the contractor is not hired, the customer chooses someone else, the customer cancels, or the contractor changes their mind.

The app does **not** issue Stripe refunds for these fees. `needs_refund` is an internal ops flag for charged-but-not-entitled technical failures (no extra unlock). Operator correction, if any, is outside the product — Stripe Dashboard refunds remain possible for Garrett. Fraud is handled through dispute and admin review.

## VERIFIER

Role/schema retained. Public copy does not claim PPP inspected or certified workmanship. Admin contractor approval ≠ workmanship verification. Separate migration recommended if the role is ever removed.
