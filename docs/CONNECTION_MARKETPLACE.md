# Connection Marketplace — $4.99 flat fee (payments OFF)

Active product model: PPP is a **connection marketplace**. It does **not** process homeowner→contractor project payments, collect deposits, escrow, take a percentage of the job, or guarantee hiring or workmanship.

## Authoritative price

`CONNECTION_FEE_CENTS = 499` (server constant + `platform_settings.connection_fee_cents` + CHECK constraint). Clients cannot pass a price.

## Payments stay OFF

| Flag | Value |
| --- | --- |
| `payments_live` | 0 (unchanged) |
| `charges_live` | 0 (unchanged) |
| `signup_fee_enabled` | 0 (recorded; checkout is not implemented here — PR #12 is parked) |
| `stripe_test_mode` | 1 (recorded only; **no Stripe code**) |

Clicking **Connect — $4.99** creates a `PAYMENT_DISABLED` connection, reserves a slot, and leaves `connection_contact_access` **LOCKED**. It does **not** unlock contact.

Future: trusted server-side verification of $4.99 may call `grant_connection_contact_access_from_fee` (stubbed, not granted to clients).

## Max 3

At most **3 occupying** connections per project (`connection_slots`, `SELECT … FOR UPDATE`, unique slot PK). Display: “3 connection spots available” / “N of 3 remaining” / “Connections Full”. Customer **Stop New Connections** closes new purchases; existing unlocked rows are not deleted.

## #14 contact entitlement

`booking_contact_access` remains the booking-path gate. Connections add `connection_contact_access`. `contractor_has_contact_access_on_project` is true only if **either** path is UNLOCKED / ADMIN_OVERRIDE. Missing entitlement = no access. Project/estimate/booking status never unlocks contact.

## Estimates (kept)

Submitting an estimate is never charged. Withdraw uses **Withdraw Estimate** with confirm copy; server sets `WITHDRAWN` and keeps history. See PR body for keep-vs-rearchitect owner decision.

## Legacy % fee engine

`fee_schedules` / `fee_schedule_brackets` and `feeEngine.ts` are **deprecated**, retained for history. Not used by active UI or the new lifecycle.

## Photos

PPP does **not** run image OCR. Upload guidance, filename sanitization, and `submit_content_report` exist. Do not pretend photos are verified.

## Refund concept (document only — attorney review)

$4.99 buys connection access, not a guaranteed job. No auto-refund for not winning, customer choosing another, customer canceling, or contractor regret. Charged-but-not-entitled technical failure is eligible for correction. Fraud via dispute/admin.

## VERIFIER

Role/schema retained. Public copy does not claim PPP inspected or certified workmanship. Admin contractor approval ≠ workmanship verification. Separate migration recommended if the role is ever removed.
