# Refund & Cancellation Policy

This is not legal advice.

Effective date: the date this version is published. Priority Property Pros records that date as `published_at` on this agreement when this version is published. Until this version is published, it is not in effect.

PPP does not require acceptance of this version while the platform setting `legal_acceptance_required` is off. That setting ships off. After it is turned on, a new signup records acceptance of the current version and the time as a signup. Someone who already has an account is prompted at the next sign-in, can still view their information and delete the account, and any acceptance is stored separately as a sign-in. Turning the setting on does not delete an account or a payment record.

## Plain-language summary

- The $9.99 account activation is a one-time fee for customers and contractors. It buys account activation. It is delivered when the server verifies the Stripe payment and marks the fee paid. It is not a monthly subscription. It does not approve a contractor, unlock contact, or start a job.
- The $4.99 Connection Fee is what a contractor pays to connect on one project. It buys messaging for that pair and the customer’s option to share contact. It is delivered when the server verifies the payment and unlocks that connection. A rehire on a new project is another connection and another $4.99. Clicking Connect is not delivery.
- Once the applicable service is delivered, the fee is generally non-refundable, except for a duplicate charge, an erroneous charge, a refund the law requires, or an approved exception.
- This app does not send refunds to Stripe. Until a refund workflow is approved, an exception is handled manually in the Stripe Dashboard by the owner. Card data is entered at Stripe. PPP does not store card numbers.
- PPP does not collect the payment for the work. Cancelling a job does not create a PPP refund of that job payment, because PPP never held it.
- Cancelling a project does not refund a delivered platform fee and does not make PPP a party to the job. Job responsibility is in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms).

This policy is part of the [Terms of Service](/terms). The [Privacy Policy](/privacy) describes payment records.

## 1. The two platform fees

PPP charges only these platform fees. Amounts are set on the server in US dollars. The browser does not choose the price. There is no monthly subscription and no commission on the job.

**Account activation, $9.99, one time.** Customers and contractors each pay it once to open an account, and only when PPP has turned on Stripe Checkout for that fee. It is not $9.99 a month. There is no monthly charge to keep an account. Admin and verifier accounts are not charged. It purchases account activation only. It does not approve a contractor, unlock anyone’s contact details, or start a job. A success page does not mark the fee paid. The service is delivered when the server checks the Stripe Checkout session, the price, and the amount, and marks the account paid.

**Connection Fee, $4.99 per project connection.** The contractor pays it only by choosing Connect, and only when that checkout is turned on. Customers do not pay a PPP Connection Fee. There is no bid fee. Submitting an estimate is not a separate PPP fee. It purchases connection access for that project: messaging with that customer, and the customer’s option to share contact details. It does not buy the job, a reply, or a promise that the work will happen. Clicking Connect is not delivery. The service is delivered when the server verifies the payment and unlocks that connection.

**Rehires.** Hire Again lists contractors a customer has finished a job with and starts a new project. That new project is a new connection. The contractor pays $4.99 again to Connect on it. A past connection does not waive the fee. The connection checkout does not apply a rehire discount.

While a checkout is turned off, PPP does not charge that fee. An unpaid or unverified connection does not unlock messaging or contact sharing. An abandoned unpaid Connect checkout can release a reserved slot after 30 minutes (1,800 seconds, unless that server setting is changed). Releasing an unpaid reservation is not a charge and is not a refund.

## 2. When a delivered fee stays paid

Once the applicable service is delivered, the fee is generally non-refundable:

- The $9.99 account activation fee is non-refundable once account activation is delivered, except for a duplicate charge, an erroneous charge, a refund the law requires, or an approved exception.
- The $4.99 Connection Fee is non-refundable once that connection is delivered, except for a duplicate charge, an erroneous charge, a refund the law requires, or an approved exception.
- Delivery of account activation is the server marking the fee paid after it verifies the Stripe Checkout session. Delivery of a connection is the server unlocking that connection after it verifies the payment.
- There is no refund under this general rule if the contractor is not hired, the customer chooses someone else, the customer cancels, the contractor changes their mind after the connection is delivered, the contractor passes after paying, or the parties later decide not to do the work.
- A Connection Fee on a rehire follows the same rule.
- Closing your account does not by itself refund either fee.

A charge that does not deliver the service it was meant to buy — account activation not marked paid, or a connection not unlocked — is an erroneous charge for purposes of this policy. The product can flag that row `needs_refund`. Flagging a row is not a refund.

The application has no refund button for these fees and does not call Stripe to create a refund. The database function `reject_signup_or_connection_fee_refund()` always raises an error and cannot issue a refund. Until a refund workflow is approved, a duplicate charge, an erroneous charge, a refund the law requires, or an approved exception is handled manually in the Stripe Dashboard by the owner. That manual step is outside this app. This policy does not promise that the app will send the refund.

Nothing in this policy takes away a right that a Texas or federal law does not let a business waive.

## 3. Stripe

When checkout is on, you pay on Stripe Checkout. You enter the card at Stripe. PPP does not store the card number, the CVC, or the full card data. PPP stores payment metadata: checkout session id, payment intent id, amount ($9.99 or $4.99), currency (USD), status, and whether the fee was paid. Stripe’s own terms and privacy policy cover Stripe’s processing.

PPP does not use Stripe to collect, hold, or refund the customer’s payment for the work itself.

## 4. Cancelling a project or a booking

A customer can decline an estimate, stop new connections, and cancel a project when the product allows that status change. Pros already connected can still message. Cancelling a project does not refund a Connection Fee that was already delivered for that project, and it does not refund a delivered $9.99 activation, except for a duplicate charge, an erroneous charge, a refund the law requires, or an approved exception.

A contractor can pass on an unpaid offer. Passing frees that slot for another contractor. Passing after a delivered Connect does not refund the $4.99 under the general rule in section 2.

A booking can move to Cancelled from the statuses the product allows. A completed booking is not cancelled by that same control. Cancelling a booking cancels the marketplace record of the hire. It does not move the job payment, because that payment is not in PPP. Cancellation terms for the work itself are covered in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms).

## 5. Job payment and job disputes

The customer pays the contractor directly for the job. PPP does not invoice that amount, does not take a percentage, and does not refund it. Who resolves a dispute about the work is in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms).

A booking status of Disputed, when it is set, is a label on the marketplace record. It is not a PPP ruling and it is not a refund of the $9.99 or the $4.99.

## 6. Contact

Questions about a platform fee: [support@prioritypropertypros.com](mailto:support@prioritypropertypros.com). Include the account email and, if you have it, the project. Emailing does not by itself create a refund.
