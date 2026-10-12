# Connection Fee: invalid-checkout blocking and automatic refunds

Owner decision, 2026-10-11: the $4.99 Connection Fee can't be paid on an expired, cancelled, unavailable, or otherwise invalid connection. If a payment still goes through and the connection can't be provided, PPP refunds it automatically.

Fees ($4.99 / $9.99), Price IDs, and the normal successful-payment path are unchanged.

## Before payment (create-connection-checkout)

`assert_connection_checkout_allowed` runs before anything is reserved and before any Stripe session exists. It refuses checkout (HTTP 409, "You have not been charged") when any of these is true:

- the project is cancelled, still a draft, or no longer exists
- the customer stopped new connections
- the customer already chose another pro
- the customer's account isn't active
- the contractor isn't active and approved
- the customer blocked this contractor
- the opportunity is passed, expired, or closed
- the contractor is already connected on this project

## After payment (connection-fee-webhook and reconcile-connection-checkout)

1. The Stripe signature is checked first. This step is unchanged.
2. `connection_checkout_session_validity` re-checks the same rules before anything is granted. A connection that's already PAID always passes this check, so a retried webhook never refunds a connection that was delivered.
3. If the check fails, the connection isn't fulfilled. It's refunded instead.
4. After `fulfill_connection_fee_checkout` runs, the database decides whether a refund is owed. That covers these cases:
   - fulfill flagged `needs_refund`: the reservation expired, activation is unpaid, or the entitlement failed
   - the connection was already PAID by a different session (a duplicate charge)
5. Wrong price, amount, currency, or metadata is an integrity failure. These are recorded as `MANUAL_REVIEW` and admins are alerted. **No automatic refund is issued** for them.

## Idempotency and verification

- `connection_fee_refunds` holds one row per Checkout session. Both the session id and the PaymentIntent id are UNIQUE.
- Each Stripe call carries the header `Idempotency-Key: ppp_conn_refund_<checkout session id>_a<attempt>`.
- Before creating a refund, the code lists the refunds already on that PaymentIntent. If one is pending or succeeded (including one made by hand in the Dashboard), it's recorded instead of creating another. Stripe also won't refund more than was charged.
- The refund amount is always the server constant of 499 cents.
- If a Stripe call fails, the webhook answers 500 and Stripe retries the event. The retry reuses the same row with the next attempt number.
- Every state change writes to `audit_logs` (`connection_fee.refund.*`) and to `connection_events`. Admins get an in-app notification (`admin.connection_fee_refund`) when a refund starts, fails, or needs review.
- **Independent check:** `refund.updated` and `refund.failed` events tagged `ppp_kind=connection_fee_refund` are recorded by `record_connection_fee_refund_verification`. If the amount or PaymentIntent doesn't match, the row moves to MANUAL_REVIEW.
- `connection_fee_refund_reconcile_report()` (admin or service role, read-only) lists three things:
  - flagged sessions that have no refund row
  - refunds that aren't SUCCEEDED
  - SUCCEEDED refunds that Stripe hasn't confirmed yet

  Run it in the SQL editor:

  `select public.connection_fee_refund_reconcile_report();`

## What the owner does when deploying (only after approval)

1. Back up first: `connection_checkout_sessions`, `project_connections`, `audit_logs`.
2. Apply migration `20261020200001_connection_checkout_validity_and_refunds.sql`.
3. Deploy the edge functions `create-connection-checkout`, `connection-fee-webhook` and `reconcile-connection-checkout`.
4. Optional but recommended: in the Stripe Dashboard, open the existing Connection Fee webhook endpoint and add the events `refund.updated` and `refund.failed`. This lets Stripe confirm each refund. No new endpoint or secret is needed.
5. Confirm the live `STRIPE_SECRET_KEY` can create refunds. A standard secret key can. A restricted key needs "Refunds: write".

Rollback: `supabase/rollbacks/20261020200001_connection_checkout_validity_and_refunds_rollback.sql`. Redeploy the previous functions first. Refunds already issued in Stripe stay issued.

## Legal wording to update before publishing (PR #87)

- `refund-cancellation-policy.md` §1 bullet 4 and §2 ("This app does not send refunds to Stripe…", "This app has no refund button… does not send a refund to Stripe") are no longer accurate. Suggested replacement: "If a $4.99 Connection Fee is charged but the connection can't be provided (for example, the project was cancelled, the customer stopped new connections, the reservation expired, or the same connection was paid twice), PPP refunds it automatically to the original card. Other exceptions are reviewed by the owner."
- `refund-cancellation-policy.md` "A charge that does not deliver the service… The product can mark that charge for review. Marking it for review is not a refund." Suggested replacement: "…The product refunds an undelivered Connection Fee automatically. An undelivered activation fee is marked for owner review."
- The #121 checkout notice ("…except duplicate or erroneous charges…") stays accurate as written.
