# Refund & Cancellation Policy

> Draft for owner review. This is not legal advice. Have a Texas attorney review it before anyone relies on it and before it is published. These pages stay off prioritypropertypros.com until the owner approves the wording and turns them on. This draft does not change the live signup record until the new database migration is applied. Do not apply that migration until the wording is approved.

Effective date: [OWNER DECISION: the calendar date this policy takes effect]

PPP does not require acceptance of this draft while the platform setting `legal_acceptance_required` is off. That setting ships off. After it is turned on, a new signup records acceptance of the current version and the time as a signup. Someone who already has an account is prompted at the next sign-in, can still view their data, and any acceptance is stored separately as a sign-in. Turning the setting on does not delete an account or a payment record.

## Plain-language summary

- The $9.99 account activation is a one-time fee for customers and contractors. The website says it is non-refundable. It is not a monthly subscription.
- The $4.99 Connection Fee is what a contractor pays to connect on one project. A rehire on a new project is another connection and another $4.99. The website says this fee is non-refundable, including if nobody is hired or the project is cancelled.
- This app does not send refunds to Stripe. Card data is entered at Stripe. PPP does not store card numbers.
- PPP does not collect the payment for the work. Cancelling a job does not create a PPP refund of that job payment, because PPP never held it.
- PPP is not the employer, the general contractor, or a guarantor. Cancelling a project does not make PPP a party to the job.

This policy is part of the [Terms of Use](/terms). The [Privacy Policy](/privacy) describes payment records.

## 1. The two platform fees

PPP charges only these platform fees. Amounts are set on the server in US dollars. The browser does not choose the price.

**Account activation, $9.99, one time.** Customers and contractors each pay it once to open an account, and only when PPP has turned on Stripe Checkout for that fee. It is not $9.99 a month. There is no monthly charge to keep an account. Admin and verifier accounts are not charged. A success page does not mark the fee paid. The server checks the Stripe Checkout session, the price, and the amount before it marks the account paid.

**Connection Fee, $4.99 per project connection.** The contractor pays it only by choosing Connect, and only when that checkout is turned on. Customers do not pay a PPP Connection Fee. There is no bid fee. Submitting an estimate is not a separate PPP fee. Paying does not guarantee a hire, a reply, or that the work will happen.

**Rehires.** Hire Again lists contractors a customer has finished a job with and starts a new project. That new project is a new connection. The contractor pays $4.99 again to Connect on it. A past connection does not waive the fee. The connection checkout does not apply a rehire discount.

While a checkout is turned off, PPP does not charge that fee. An unpaid or unverified connection does not unlock messaging or contact sharing.

## 2. These fees are non-refundable

The public site, the signup form, and the Terms of Use stored for the current product say both fees are non-refundable. This policy states that same rule:

- The $9.99 account activation fee is non-refundable.
- The $4.99 Connection Fee is non-refundable.
- There is no refund if the contractor is not hired, the customer chooses someone else, the customer cancels, the contractor changes their mind, the contractor passes after paying, or the parties later decide not to do the work.
- A Connection Fee on a rehire is non-refundable on the same terms.
- Closing your account does not refund either fee.

The application has no refund button for these fees and does not call Stripe to create a refund. A database function that exists only as a dead end always raises an error and cannot issue a refund. Stripe Dashboard actions, if any, are outside this app. This policy does not promise that PPP will make one.

If a charge is taken but the connection or activation is not unlocked, the product can flag that row for an operator. Flagging a row is not a refund. This app still does not send the refund.

Nothing in this policy takes away a right that a Texas or federal law does not let a business waive. A Texas attorney should review this section before it is published. The product copy today is the non-refundable rule above. This draft does not add a goodwill-refund program.

## 3. Stripe

When checkout is on, you pay on Stripe Checkout. You enter the card at Stripe. PPP does not store the card number, the CVC, or the full card data. PPP stores payment metadata: checkout session id, payment intent id, amount ($9.99 or $4.99), currency (USD), status, and whether the fee was paid. Stripe’s own terms and privacy policy cover Stripe’s processing.

PPP does not use Stripe to collect, hold, or refund the customer’s payment for the work itself.

## 4. Cancelling a project or a booking

A customer can decline an estimate, stop new connections, and cancel a project when the product allows that status change. Pros already connected can still message. Cancelling a project does not refund a Connection Fee a contractor already paid for that project, and it does not refund the $9.99 activation.

A contractor can pass on an unpaid offer. Passing frees that slot for another contractor. Passing after a paid Connect does not refund the $4.99.

A booking can move to Cancelled from the statuses the product allows. A completed booking is not cancelled by that same control. Cancelling a booking cancels the marketplace record of the hire. It does not move the job payment, because that payment is not in PPP. Any cancellation terms for the work itself are between the customer and the contractor.

An abandoned Connect checkout can release a reserved slot after a server timeout (30 minutes unless that setting is changed). Releasing an unpaid reservation is not a charge and is not a refund.

## 5. Job payment and job disputes

The customer pays the contractor directly for the job. PPP does not invoice that amount, does not take a percentage, and does not refund it. If the customer and contractor disagree about the work, the price, or a cancellation of the work, they resolve that between themselves. PPP is not the employer, the general contractor, or a guarantor, and PPP does not decide that dispute.

A booking status of Disputed, when it is set, is a label on the marketplace record. It is not a PPP ruling and it is not a refund of the $9.99 or the $4.99.

## 6. Contact

Questions about a platform fee: [support@prioritypropertypros.com](mailto:support@prioritypropertypros.com). Include the account email and, if you have it, the project. Emailing does not by itself create a refund.
