# Support process

Operator notes for Priority Property Pros. This file is not a public page. Public wording is in `docs/legal/`.

Contact for every request: support@prioritypropertypros.com.

There is no in-app ticket system and no in-app export. The support mailbox is the log. Keep the email thread. Do not put card numbers in the reply.

## Privacy requests

People can ask for access, a correction, a copy, deletion, or an opt-out.

1. Confirm the message names the account email. If it does not, ask for it.
2. Confirm the person controls that email before changing or deleting anything. A reply from that address is enough. A recent sign-in the person can describe is enough when the mailbox does not match. Do not ask for a government ID image, a Social Security number, or a date of birth. The product does not collect those.
3. Classify the request: access, correction, copy, deletion, or opt-out.
4. Access or a copy: tell them what the product shows them in the app (profile, projects, messages, reviews, photos, notification settings). There is no download button. Send a copy by email only of information that is actually on the account. Do not invent balances, payments, or refunds.
5. Correction: fix profile fields the person can also edit, or correct an email only through the confirmed email-change flow (both the current address and the new address must confirm). Do not rewrite immutable audit rows, ledger notes, or Stripe dispute classifications.
6. Deletion: point them to the in-app delete screen (type DELETE, current password or a sign-in within the last 10 minutes) unless they cannot sign in. In-app deletion follows PR #90’s anonymize model once that migration is applied. It is refused while a job is active (`PENDING`, `AWAITING_PAYMENT`, `CONFIRMED`, `IN_PROGRESS`), while a booking is `DISPUTED` or a Stripe dispute is open, while `needs_refund` is set or a refund status is `pending`, `requires_action`, or `processing`, or while the account is the last active admin. Do not run a manual SQL delete.
7. Opt-out: PPP does not sell personal information and does not run targeted advertising. Say that. Notification email is turned off from the unsubscribe link or notification settings. There is no SMS product, so there is no text-message opt-out to process.
8. Reply within 45 days of a complete request. If the request is complex, one extension of up to 45 more days is allowed. Tell them before the first 45 days end. If you deny the request, say why and that they can reply to ask for another look.
9. Log, in the email thread: date received, account email, request type, identity check used, what was done, date of the reply, and any extension.

## Refund exceptions

The $9.99 activation and the $4.99 Connection Fee are generally non-refundable once delivered. Delivery of activation is server verification of the Stripe Checkout session plus the fee marked paid. Delivery of Connect is server verification plus that connection unlocked. A success page does not mark a fee paid. Clicking Connect is not delivery.

Exceptions: a duplicate charge, an erroneous charge (money taken but the service was not delivered), a refund the law requires, or an exception the owner approves.

1. The request must come to support@prioritypropertypros.com and name the account email, which fee, the amount, the date if known, and the reason.
2. The owner approves or declines. Nobody else approves. The app has no refund button.
3. `reject_signup_or_connection_fee_refund()` always raises. Do not add `stripe.refunds`, `refunds.create`, or a call to `/v1/refunds` unless a later pull request is approved for that workflow.
4. A `needs_refund` flag on a signup charge, connection, or checkout session is an operator mark. It is not a refund.
5. If the owner approves, issue the refund in the Stripe Dashboard for that charge. Record the Stripe refund reference, amount, date, and reason category on the email thread. Do not change fee amounts, `payments_live`, `charges_live`, `signup_fee_enabled`, or `connection_fee_checkout_enabled`.
6. A declined request gets a short reply that says the fee stays paid and why. Emailing does not by itself create a refund.
7. Closing an account does not refund a delivered fee.

## Implementation details removed from the public documents

- Acceptance stays off until `set_legal_acceptance_required(true)` runs as service role. The platform setting `legal_acceptance_required` ships as `0`. Draft agreement rows stay `is_current = false` and `published = false`, so the Data API does not serve them. `published_at` is set inside that same enable call. Public text calls this “the requirement to accept these versions” and “the date this version is published.”
- Age is an affirmation, not a verification. When the requirement is on, `assert_signup_agreement_versions` raises `age_18_required` unless signup metadata `affirmed_age_18` is true, 1, or yes. `handle_new_user` sets `profiles.age_18_affirmed_at`. Existing accounts affirm on `accept_current_agreements(text, boolean)`, which raises `age_18_required` if the profile has no affirmation yet. The signup form does not ask for a date of birth. While the setting is off, signup is not rejected for a missing affirmation.
- Agreement rows store `agreement_version`, `accepted_at`, `acceptance_source` (`signup` or `sign_in`), and `user_agent` truncated to 180 characters. Public text does not name those columns.
- Low-rating block: trigger `booking_reviews_low_rating_block` calls `apply_customer_low_rating_block` when `reviewer_role = CUSTOMER` and `rating <= 3` (1, 2, or 3). It inserts `customer_contractor_blocks` with reason `LOW_RATING` and calls `close_blocked_contractor_open_offers`, which closes that pro’s `AVAILABLE` offers on the customer’s other projects in `POSTED`, `MATCHING`, `CONTRACTORS_RESPONDING`, or `ESTIMATES_AVAILABLE`. `contractor_eligible_for_project` returns false when a block row exists. `hire_again_contractors` leaves blocked pros out. Paid connections and bookings are not updated. Raising the rating does not delete the row. Contractor reviews of customers never insert a block. Manual block is `block_contractor_for_customer` (reason `CUSTOMER_REQUEST`). Undo is `unblock_contractor_for_customer`. Admins can delete under `customer_contractor_blocks_delete_admin`.
- Connection slot cap is `platform_settings.max_participating_contractors = 3`. Unpaid Connect reservation TTL is 1800 seconds.
- Portfolio: non-admin inserts are forced to `REVIEW_REQUIRED`. Public display after PR #95 is `list_public_portfolio_objects` plus a short-lived signed URL. The `contractor-docs` bucket stays private. `PUBLIC_SAFE` plus an approved, active, directory-listed contractor is required. GPS/EXIF is not stripped. There is no generic-illustration asset.
- Account deletion (PR #90, not applied on this branch): `purge_account_owned_rows` is service-role only. The edge function `delete-account` checks the current password or a sign-in within 10 minutes (`RECENT_SIGN_IN_MS`). Portfolio rows, credentials, services, service areas, and the Stripe Connect id are not cleared. Project-photo rows can still point at files the storage wipe tried to delete. `audit_logs` are immutable and older metadata may contain an email or an admin note. Message bodies stay. PPP sends Stripe nothing.
- Job-review edit window is `platform_settings.booking_review_edit_window_days` (30 if missing). PR #116 hides a job review by setting `hidden_at` and does not delete the row. A low star rating is not a hide reason. PR #105 leaves new `platform_reviews` in `PENDING` until an admin approves them. PR #118 public ratings use visible verified job reviews and omit hidden ones.
- Marketplace review moderation reasons are 3 to 500 characters and are written to `audit_logs`. They are not shown on the public review.
- Login uses Supabase Auth PKCE in local storage. Web push uses VAPID keys. The website anon key is public by design. Row-level security limits signed-in reads. None of those names belong in the public policies.
