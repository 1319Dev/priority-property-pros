# Terms of Use

> Draft for owner review. This is not legal advice. Have a Texas attorney review it before anyone relies on it and before it is published. These pages stay off prioritypropertypros.com until the owner approves the wording and turns them on. This draft does not change the live signup record until the new database migration is applied. Do not apply that migration until the wording is approved.

Effective date: [OWNER DECISION: the calendar date these terms take effect]

## Plain-language summary

- Priority Property Pros is a marketplace. Priority Property Pros LLC does not do the work. It is not the customer’s employer, not the contractor’s employer, not the general contractor, and not a guarantor of either party.
- Homeowners and businesses post projects. Matched contractors are offered those jobs. A project can have up to three connection slots.
- Customers and contractors pay a one-time $9.99 account activation when Stripe Checkout for that fee is turned on. It is not a monthly fee. The site says this fee is non-refundable.
- A contractor pays $4.99 to Connect on a project, including a later project with someone they have worked with before. That unlocks messaging for that pair and the customer’s choice to share contact details. It does not guarantee the job. The site says this fee is non-refundable.
- The customer pays the contractor directly for the work. PPP does not collect that payment and does not take a percentage of it.
- PPP does not state that a contractor is licensed, insured, bonded, or background-checked. Admin approval is not that kind of check.
- The signup form asks for acceptance of these documents. PPP does not reject a new account for that acceptance while the platform setting `legal_acceptance_required` is off. That setting ships off. After it is turned on, a new signup is refused unless the current versions were accepted, and an existing account is asked to accept at the next sign-in. Existing accounts can still view their data. Nothing is deleted. Signup acceptances and later sign-in acceptances are stored separately, each with the document version and the time.
- Several items are still the owner’s call. Each one is labeled OWNER DECISION.

These Terms of Use, the [Privacy Policy](/privacy), the [Refund & Cancellation Policy](/refunds), the [Community Guidelines](/community-guidelines), and the [Review & Content Guidelines](/content-guidelines) are one agreement. Contractor accounts also accept the [Contractor Participation Terms](/contractor-terms).

## 1. Who we are

Priority Property Pros LLC (“PPP,” “we,” “us”) operates the Priority Property Pros marketplace at prioritypropertypros.com. PPP is a Texas limited liability company. The product is a home-services marketplace focused on the Conroe and Montgomery County area, with room to grow across Texas. Matching uses the project ZIP and the trades and service area a contractor enters. It is not a hard fence around one county.

The only contact address the product publishes today is [support@prioritypropertypros.com](mailto:support@prioritypropertypros.com).

[OWNER DECISION: provide a mailing address if you want one in these terms. The product has no street address on file. This draft does not invent one.]

## 2. A marketplace, not the contractor

PPP provides software that lets a customer post a project and lets an independent contractor choose to connect. PPP does not perform the work. PPP does not hire the contractor to do the customer’s job. PPP does not supervise the job site. PPP is not a general contractor, a party to the job contract, or a guarantor of the work, the price, the schedule, or either person’s conduct.

The customer and the contractor decide whether to work together and on what terms. Estimates, change orders, and the price of the work are between them. The customer pays the contractor directly for any job cost. PPP does not collect that payment, hold it, escrow it, or take a percentage of it.

Contractor accounts are independent businesses. The details are in the Contractor Participation Terms. PPP does not claim, and these terms do not mean, that a contractor is licensed, insured, bonded, or background-checked.

## 3. Accounts and acceptance

You may sign up as a customer or as a contractor. A customer account is how homeowners and businesses post projects. Admin and verifier accounts are not offered on the public signup form. The verifier role exists in the database. These terms do not say a verifier inspected or certified any work.

The signup form has a required checkbox. Checking it is your agreement to the documents that apply to that account. While `legal_acceptance_required` is off, the server still creates the account and records acceptance of the shorter terms already in the product. It does not reject the account for these drafts. After that setting is turned on, the server refuses to create the account if that acceptance is missing or if the versions you accepted are not the current versions. On a signup that is recorded under the setting, PPP stores, for each document, the agreement version, the time, a source of signup, and a short user-agent string of up to 180 characters. PPP does not trust the browser to pick the version number that gets stored. The database copies the version from the current agreement row.

If you already have an account when the setting is turned on, the next sign-in shows a prompt asking you to accept the current versions. That prompt does not hide your projects, messages, bookings, or other account data, and it does not delete anything. Accepting writes a separate sign-in record with the version and the time. It does not replace or delete an older acceptance.

You agree to give accurate information and to keep your login to yourself. Passwords on the form must be at least 8 characters. Email confirmation is part of signup when the auth service asks for it. A contractor is not matched to jobs until the account is active and an admin has approved the contractor profile. Paying the $9.99 activation fee does not approve a contractor and does not reveal anyone’s contact details.

You must be old enough to use the service.

[OWNER DECISION: set the minimum age. This draft proposes that people under 18 may not create an account. The signup form does not ask for a date of birth and does not block an under-18 signup today.]

PPP may refuse, suspend, or disable an account. Account statuses used in the product include active, pending, suspended, disabled, and deleted. A pending account can look around. Matching waits on an active, approved contractor.

## 4. Fees

Two platform fees exist. Both are in US dollars. The customer’s browser does not set the price. Refunds and cancellations are in the [Refund & Cancellation Policy](/refunds). That policy is part of these terms.

- **Account activation: $9.99, one time.** Customers and contractors pay it. It is not $9.99 a month. There is no monthly charge to keep an account. Admin and verifier accounts are not charged this fee. The site states that this fee is non-refundable. Checkout is Stripe Checkout, and only when PPP has turned that checkout on. A success page does not mark the fee paid by itself. The server has to verify the Stripe payment.
- **Connection Fee: $4.99 per project connection.** The contractor pays it, and only when that contractor chooses to Connect. A later project with the same customer, including Hire Again, is a new project connection and is another $4.99. There is no bid fee and no rehire waiver in the connection checkout. Customers do not pay a PPP Connection Fee. The site states that this fee is non-refundable. Clicking Connect does not unlock anything by itself. Contact and messaging stay locked until the server verifies the $4.99 payment.

While either checkout is turned off, PPP does not charge that fee. A connection that is not verified as paid does not unlock messaging or contact.

Card numbers are entered on Stripe’s page. PPP does not store card numbers. PPP stores payment metadata such as the checkout session id, the payment intent id, the amount, and whether the fee was paid.

## 5. Projects and the three connection slots

A customer posts a project: the kind of work, a description, city, state, ZIP, timing, and an optional budget range. The street address and precise coordinates are stored separately and are not part of the public listing. Until you post, a draft can sit in that browser tab only. It is not saved on PPP’s servers until you post.

PPP offers the project to matched contractors in the trade and service area. Up to three contractors can occupy connection slots on that project at the same time. The cap is the server setting `max_participating_contractors`, which is 3. If a contractor passes, that offer can go to the next eligible contractor. More than three people can be offered the job over its life. No more than three occupy a slot at once.

A customer can stop new connections. Pros already connected can still message. A customer can decline an estimate, cancel a project when the product allows it, and choose who to hire. Choosing a pro starts a booking. Both sides confirm Hired before that booking is a mutual hire. PPP does not rank a “best” estimate.

The $4.99 Connection Fee is for that project connection. It is not a promise that the customer will hire that contractor.

## 6. Names, messages, and contact

On the public Find a Pro directory, a contractor is shown with a neutral label such as a trade and city, not the business name. The public card also omits phone, email, website, social handles, street address, license numbers, and the original portfolio file. A general service area, such as a city and radius, can be shown.

After a paid Connect on a project, or an admin override for that same pair:

- That customer and that contractor can message each other on that project.
- That customer can see that contractor’s business name on that project. The public directory still hides it.
- The message box still rejects phone numbers, email addresses, and street addresses, even after Connect.
- The customer can choose “Share my contact & address.” That shares the customer’s name, phone, email, and the address on the profile and project with that contractor only. Other pros on the same project do not get it. The customer can keep messaging without sharing.

Before that share, a contractor offered the job can see an approximate location (city and state, and the ZIP on the jobs list), not the street. An admin can unlock or revoke contact access for one specific record. The reason is stored in an audit log.

## 7. Do not route around the Connection Fee

You agree not to use PPP to exchange contact details in order to hire off the platform and skip the Connection Fee. The [Community Guidelines](/community-guidelines) are part of that promise. Before a paid connection, the product rejects obvious phone numbers, email addresses, websites, social handles, QR codes, and exact street addresses in project text, profiles, estimates, and messages.

The Trust page states the enforcement PPP intends: a warning, suspension, or termination for repeated abuse, and not an automatic permanent ban on a single detection. The product enforces this by rejecting the text. Suspension or closure of an account is an admin action. The scanner is not a surveillance program, and it does not catch every disguise.

After a legitimate Connect between those two people, ordinary contact may be shared through the share control in section 6. That does not let you publish the other person’s contact on a public page.

## 8. Reviews, photos, and conduct

Job reviews, marketplace reviews, portfolio photos, and project photos follow the [Review & Content Guidelines](/content-guidelines). Day-to-day conduct follows the [Community Guidelines](/community-guidelines). Both are part of these terms.

A job review can be edited for 30 days after it is posted. Marketplace reviews are moderated. Portfolio photos are not public until an admin approves them. On an estimate or a booking, a customer can choose “Don't match me with this pro again.” Future projects skip that pro. A job already underway stays as it is, and a paid connection stays paid. The customer can undo that later from Blocked pros. A customer review of 3 stars or less also keeps that pro off future projects until the customer unblocks them.

## 9. Notifications

PPP can notify you in the app, by web push, and by email. Email is sent through Resend. Web push uses your browser’s push service. You can turn categories on or off. Those categories cover new jobs, messages, connections, estimates, bookings, change orders, reviews, and account notices. In-app notices start on. Email starts on for most of those categories. Push starts off until you turn it on. On an iPhone, push needs the site added to the Home Screen (iOS 16.4 or later). Message emails are limited to one per conversation every 15 minutes, and only while the message is still unread. Email can include an unsubscribe link.

## 10. Disputes between customers and contractors

Disputes about the work, the price, the schedule, materials, or conduct are between the customer and the contractor. PPP is not the judge of those disputes and does not pay either party for the job. A booking can be marked Disputed in the product. That status does not mean PPP has decided who is right, and it does not refund a platform fee. Platform fees are covered only by the Refund & Cancellation Policy.

[OWNER DECISION: choose arbitration or the courts. This draft does not require arbitration, a class-action waiver, or a jury waiver. It leaves disputes about these terms to whatever forum you select here.]

[OWNER DECISION: choose the governing law and the Texas county for venue. PPP is a Texas limited liability company. This draft does not pick a county or a court.]

## 11. Closing your account

You can delete your own account from the account screen. You must type DELETE to confirm. What is removed, and what can remain, is described in the [Privacy Policy](/privacy). Deleting your account does not refund a platform fee. You cannot delete the last active admin account. The screen tells you deletion cannot be undone.

## 12. Admins

There is no public admin signup. The first admin is created in the database by the owner. Admins can review contractor applications, moderate marketplace reviews, approve or hide portfolio photos, and grant or revoke contact access on a specific record with a reason. Admin access can require a second sign-in factor. An admin is not the contractor and does not perform the work. Admin approval is not a warranty and is not a statement that a contractor is licensed, insured, bonded, or background-checked.

## 13. Your content and ours

You keep ownership of the text and photos you submit. You give PPP permission to host, display, and moderate them as the product actually does: public fields only where the product makes them public, and private fields only to the people the product is built to show them to. You promise you have the right to submit that material.

The PPP name, logos, and site design belong to PPP. You may not copy the site or use the name in a way that suggests PPP did the work.

## 14. Disclaimers

The marketplace is provided as it runs today. Features such as Stripe Checkout can be switched off. PPP does not warrant that the site will be uninterrupted or error free, or that a contractor, a customer, or a job will meet your expectations.

To the extent the law allows, PPP is not liable for the other party’s work, pay, delay, or conduct, or for a hiring decision you make. Nothing in this draft takes away a right that a Texas or federal law does not let us take away.

## 15. Changes

PPP will post updated terms on this page and change the effective date at the top. That posting is the notice. For a material change, PPP will also email the address on the account when PPP has that address. Notification settings do not have a separate switch for legal updates.

A new version can be made the current row when PPP turns `legal_acceptance_required` on. Until that setting is on, these drafts are stored but are not the required acceptance. After it is on, new signups must accept the current version or the account is not created. Existing users are prompted on the next sign-in, as section 3 describes, and are not locked out of viewing their data. The version, the time, and whether the row was a signup or a later sign-in are the record of what was accepted.

## 16. Contact

Questions about these terms: [support@prioritypropertypros.com](mailto:support@prioritypropertypros.com).

Job payment, scheduling, and workmanship stay between the customer and the contractor. Email PPP for marketplace questions.
