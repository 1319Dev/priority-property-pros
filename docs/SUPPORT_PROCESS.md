# Support process

Operator notes for Priority Property Pros. This file is not a public page. Public wording is in `docs/legal/`.

Contact for every request: support@prioritypropertypros.com.

Business mailing address (published in all six documents and in notification email footers): Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US. Treat a mailed privacy or refund request the same as an email: match it to the account email, confirm by email from that address, and log it in a new email thread in the support mailbox. The 45-day clock starts when the letter is received.

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
- Account deletion while the delete control is paused (PR #120 `ACCOUNT_DELETION_PAUSED`): requests arrive at support@prioritypropertypros.com with the subject “Account deletion request”. Confirm control of the account email, check the same refusals (active job, disputed booking or open Stripe dispute, unfinished refund, last admin), and complete the deletion with the #90 purge once it is live. Do not delete rows by hand.
- Account deletion (PR #90, not applied on this branch): `purge_account_owned_rows` is service-role only. The edge function `delete-account` checks the current password or a sign-in within 10 minutes (`RECENT_SIGN_IN_MS`). A follow-up on #90 deletes `contractor_portfolio` rows (titles, captions, storage paths), `contractor_credentials`, `contractor_services`, `contractor_service_areas`, the PPP-side `contractor_stripe_accounts` row, and orphaned `project_photos` rows. The final #90 behavior also rewrites the other party’s `notifications` that name the deleted user to neutral text (pending on the #90 branch at the time of this note). It does not call Stripe to close the Connect account. `estimates.notes` and `projects.description` stay on kept projects. `agreement_acceptances.user_agent` stays. A small number of older `audit_logs` metadata values can contain an email, and `forbid_audit_mutation` blocks changes. Message bodies stay. PPP sends Stripe nothing.
- Job-review edit window is `platform_settings.booking_review_edit_window_days` (30 if missing). PR #116 hides a job review by setting `hidden_at` and does not delete the row. A low star rating is not a hide reason. PR #105 leaves new `platform_reviews` in `PENDING` until an admin approves them. PR #118 public ratings use visible verified job reviews and omit hidden ones.
- Marketplace review moderation reasons are 3 to 500 characters and are written to `audit_logs`. They are not shown on the public review.
- Login uses Supabase Auth PKCE in local storage. Web push uses VAPID keys. The website anon key is public by design. Row-level security limits signed-in reads. None of those names belong in the public policies.

## Priority Help (applies once Priority Help is enabled)

Public wording: Privacy Policy sections 2, 5, 6, and 8; Terms section 14; Refund Policy section 6; Community Guidelines section 5. Code: PRs #82–#85, migration `20261019700001_priority_help.sql`.

- Retention the public text promises: guest chats deleted 90 days after the last activity unless a ticket is OPEN, IN_PROGRESS, or WAITING_ON_CUSTOMER; signed-in chats 365 days after RESOLVED/CLOSED (or after the last message for an AI-only chat). Settings `support_settings.guest_retention_days` (90) and `retention_days` (365). If either changes, update Privacy section 8 and Terms section 14 first.
- pg_cron job `priority-help-retention` runs `support_purge_expired_auto()` daily at 08:17 UTC. After applying the migration, confirm `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'priority-help-retention';` returns one active row. If it does not, the public 90-day promise is not met: schedule it or keep Priority Help off. The admin “Purge expired” button runs the same rules.
- Account deletion removes the user’s chats in the same transaction (`support_purge_on_profile_delete`).
- OpenAI: model `gpt-4.1-nano` through `/v1/chat/completions`, `store` not set. Before enabling, confirm in the OpenAI dashboard (Settings → Organization → Data controls) that sharing inputs and outputs with OpenAI for training is OFF; the Privacy Policy says PPP does not opt in. OpenAI's stated API retention (abuse-monitoring logs up to 30 days) was checked on 2026-10-11 at https://platform.openai.com/docs/guides/your-data and https://openai.com/enterprise-privacy/. Re-check those pages before publishing a new policy version.
- Redaction before OpenAI: emails, phone numbers, and street addresses (regex in `_shared/priorityHelp/guardrails.ts`). It is a filter, not a guarantee; the public text says so.
- A privacy request for chats: search `support_conversations` by account (signed-in) or by reference number the guest gives. Guests have no account, so access requests need the reference number shown in the chat.
