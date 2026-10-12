-- Priority Help is live: publish Terms of Service v4 and Privacy Policy v3.
--
-- The only change from Terms v3 / Privacy v2 is the Priority Help wording:
-- "not yet available / only if PPP turns it on" becomes the live description
-- (automated assistant, OpenAI processing, storage, 90/365-day retention).
-- The stored body is the exact text of docs/legal/terms-of-use.md and
-- docs/legal/privacy-policy.md, so acceptances keep pointing at the text the
-- person saw. Existing acceptances of v3 / v2 are kept; accounts are asked to
-- accept the new versions at their next sign-in (the existing prompt).
-- Other documents (refund v1, community v1, review-content v1,
-- contractor-participation v1) are unchanged.
-- set_legal_acceptance_required(true) is updated to publish these versions.
-- Does not change fees, Stripe, payments, or admin_mfa_required.

INSERT INTO public.agreements (slug, title, version, body, is_current, audience, published)
VALUES
  ('terms-of-use', 'Terms of Service', 4, $ppp_legal_terms_v4$
# Terms of Service

This is not legal advice.

Effective date: the date this version is published, shown at the top of this page.

## Plain-language summary

- Who performs the work, and who is responsible for the job, is in Independent Marketplace and Contractor Responsibility below.
- Homeowners and businesses post projects. Matched contractors are offered those jobs. A project can have up to three connection slots occupied at the same time.
- Customers and contractors pay a one-time $9.99 account activation when Stripe Checkout for that fee is turned on. It is not a monthly fee. The fee is generally non-refundable once account activation is delivered, with the exceptions in the Refund & Cancellation Policy.
- A contractor pays $4.99 to Connect on a project, including a later project with someone they have worked with before. That unlocks messaging for that pair and the customer’s choice to share contact details. It does not promise that the customer will hire that contractor. The fee is non-refundable once that connection is delivered. If the contractor is charged but the connection can't be provided, the $4.99 is refunded automatically.
- The customer pays the contractor directly for the work. PPP does not collect that payment and does not take a percentage of it.
- PPP does not state that a contractor is licensed, insured, bonded, or background-checked. Admin approval is not that kind of check.
- Priority Help is a support chat on the site. Its automatic replies are written by an AI assistant and can be wrong. Section 14 describes how it works.
- You must be 18 or older to create an account. That is an affirmation you make, not a verification of your age.
- To create an account, you must accept these documents and affirm that you are 18 or older. PPP records the version of each document and the time. If you already have an account, you are asked at your next sign-in to accept the current versions and to make that same affirmation. Until you accept, you can still view your information and delete your account, but new marketplace actions are paused. Nothing is deleted because someone has not yet accepted. The acceptance recorded at that later sign-in is stored separately from the acceptance recorded when the account was created. Each one keeps the document version and the time.

These Terms of Service, the [Privacy Policy](/privacy), the [Refund & Cancellation Policy](/refunds), the [Community Guidelines](/community-guidelines), and the [Review & Content Guidelines](/content-guidelines) are one agreement. Contractor accounts also accept the [Contractor Participation Terms](/contractor-terms).

## 1. Who we are

Priority Property Pros LLC (“PPP,” “we,” “us”) operates the Priority Property Pros marketplace at prioritypropertypros.com. PPP is a Texas limited liability company. The product is a home-services marketplace focused on the Conroe and Montgomery County area, with room to grow across Texas and, later, nationwide. Matching uses the project ZIP and the trades and service area a contractor enters. It is not a hard fence around one county.

Contact PPP through the [Contact us page (prioritypropertypros.com/contact)](/contact), or by mail at Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US.

## Independent Marketplace and Contractor Responsibility

Priority Property Pros LLC operates solely as an online marketplace connecting homeowners with independent third-party contractors.

Priority Property Pros does not perform, supervise, manage, direct, inspect, or guarantee construction, repair, maintenance, or other services provided by contractors through the platform.

All contractors operate independently and are not employees, agents, partners, or representatives of Priority Property Pros.

Homeowners and contractors are solely responsible for negotiating project terms, entering into service agreements, arranging payments for contracted work, and resolving disputes relating to the services performed.

Disputes concerning workmanship, project completion, property damage, contractor payments, warranties, or other matters arising from contracted services are generally the responsibility of the homeowner and contractor involved.

Priority Property Pros is not a party to agreements between homeowners and contractors unless expressly stated otherwise.

Nothing in these Terms excludes liability that cannot legally be excluded or limits any rights or remedies provided by applicable law.

PPP provides marketplace technology and connection services. Contractors are responsible for their workmanship, their employees, their subcontractors, the licenses the law or the customer requires, their insurance obligations, safety, permits, warranties, and damage they cause. Homeowners are responsible for selecting contractors, reviewing estimates, and agreeing to the project terms. PPP does not guarantee a contractor’s performance, qualifications, or the outcome of a job.

The customer pays the contractor directly for any job cost. PPP does not collect that payment, hold it, escrow it, or take a percentage of it. PPP does not claim, and these terms do not mean, that a contractor is licensed, insured, bonded, or background-checked. Contractor rules that sit on top of this section are in the [Contractor Participation Terms](/contractor-terms).

## 3. Accounts and acceptance

You may sign up as a customer or as a contractor. A customer account is how homeowners and businesses post projects. Admin accounts and a verifier role are not offered on the public signup form. These terms do not say a verifier inspected or certified any work.

The signup form has a required checkbox. Checking it is your agreement to the documents that apply to that account. Links to these Terms of Service, the Privacy Policy, and the other documents are on that form. The server refuses to create the account if that acceptance is missing, if the versions you accepted are not the current versions, or if you did not affirm that you are 18 or older. PPP stores, for each document, the agreement version and the time. PPP copies the version from the current agreement. It does not use a version number chosen only in the browser.

If you already had an account when these versions were published, the next sign-in shows a prompt asking you to accept the current versions and to affirm that you are 18 or older. The prompt does not hide your projects, messages, bookings, or other account information, and it does not delete anything. Accepting writes a separate acceptance with the version and the time, and it records the time of the age affirmation if one was not already on the account. It does not replace or delete an older acceptance.

If you decline the updated versions, you can still view your account information and delete your account. The product does not include an in-app export of your data. New marketplace actions are refused until you accept: posting a project, sending an estimate, sending a project message, or creating a project connection. Viewing what is already there, marking a message read, and deleting the account stay available.

You agree to give accurate information and to keep your login to yourself. Passwords must be at least 8 characters. PPP’s sign-up, password-reset, and password-change screens do not accept a shorter one. Email confirmation is part of signup when the login service asks for it. You can ask to change the email on the account. The address stays the same until both the current address and the new address confirm the change. A contractor is not matched to jobs until the account is active and an admin has approved the contractor profile. Paying the $9.99 activation fee does not approve a contractor, does not reveal anyone’s contact details, and does not start a job.

You must be 18 or older to create an account. That is an affirmation you make. It is not a verification of your age, a date of birth, or an identity document. The form does not ask for a date of birth. A new signup asks for the affirmation and PPP records the time. An existing account is asked for the same affirmation on the sign-in prompt described above.

PPP may refuse, suspend, or disable an account. Account statuses used in the product include active, pending, suspended, disabled, and deleted. A pending account can look around. Matching waits on an active, approved contractor.

## 4. Fees

Two platform fees exist. Both are in US dollars. The customer’s browser does not set the price. Refunds and cancellations are in the [Refund & Cancellation Policy](/refunds). That policy is part of these terms.

- **Account activation: $9.99, one time.** Customers and contractors pay it. It is not $9.99 a month. There is no monthly charge to keep an account. Admin and verifier accounts are not charged this fee. It purchases account activation only. It does not approve a contractor, unlock contact, or start a job. Checkout is Stripe Checkout, and only when PPP has turned that checkout on. The service is delivered when the server verifies the Stripe Checkout session and marks the fee paid. A success page does not mark the fee paid by itself. Once that service is delivered, the fee is generally non-refundable, except for a duplicate charge, an erroneous charge, a refund the law requires, or an approved exception.
- **Connection Fee: $4.99 per project connection.** The contractor pays it, and only when that contractor chooses to Connect. A later project with the same customer, including Hire Again, is a new project connection and is another $4.99. There is no bid fee and no rehire waiver in the connection checkout. Customers do not pay a PPP Connection Fee. It purchases messaging for that customer and that contractor on that project, and the customer’s option to share contact details. It does not promise a hire. Clicking Connect is not delivery. The service is delivered when the server verifies the payment and unlocks that connection. An abandoned unpaid Connect checkout can release its reserved slot after 30 minutes. Releasing an unpaid reservation is not a charge and is not delivery. Once the connection is delivered, the fee is non-refundable. If the contractor is charged but the connection can't be provided (for example, the project was cancelled or closed, the opportunity expired, the customer blocked the contractor, or the same connection was charged twice), PPP refunds the $4.99 automatically to the original payment method. A refund the law requires, or an approved exception, is handled under the Refund & Cancellation Policy.

While either checkout is turned off, PPP does not charge that fee. A connection that is not verified as paid does not unlock messaging or contact. If a $4.99 Connection Fee is charged but the connection can't be provided, PPP refunds it automatically. If a $9.99 activation fee is charged but account activation is not marked paid, that charge is an erroneous charge and PPP reviews it.

Card numbers are entered on Stripe’s page. PPP does not store card numbers. PPP stores the payment references Stripe assigns, the amount, and whether the fee was paid.

To ask for one of the refund exceptions, use the [Contact us page (prioritypropertypros.com/contact)](/contact). You do not need to ask for an automatic Connection Fee refund. The request, who decides it, and how an approved refund is sent are in the [Refund & Cancellation Policy](/refunds).

## 5. Projects and the three connection slots

A customer posts a project: the kind of work, a description, city, state, ZIP, timing, and an optional budget range. The street address and precise coordinates are stored separately and are not part of the public listing. Until you post, a draft can sit in that browser tab only. It is not saved on PPP’s servers until you post.

PPP offers the project to matched contractors in the trade and service area. Up to three contractors can occupy connection slots on that project at the same time. If a contractor passes, that offer can go to the next eligible contractor. More than three people can be offered the job over its life. No more than three occupy a slot at once.

A customer can stop new connections. Pros already connected can still message. A customer can decline an estimate, cancel a project when the product allows it, and choose who to hire. Choosing a pro starts a booking. Both sides confirm Hired before that booking is a mutual hire. PPP does not rank a “best” estimate and does not choose the contractor for the homeowner.

The $4.99 Connection Fee is for that project connection. It is not a promise that the customer will hire that contractor.

## 6. Names, messages, and contact

On the public Find a Pro directory, a contractor is shown with a neutral label such as a trade and city, not the business name. The public card also omits phone, email, website, social handles, street address, and license numbers. A general service area, such as a city and radius, can be shown. A portfolio photo appears there only after an admin approves it, and then only through a short-lived link. Unapproved photos are not shown. Public ratings, when they appear, come from visible verified job reviews. A review an admin has hidden is left out of that public rating.

After a paid Connect on a project, or an admin override for that same pair:

- That customer and that contractor can message each other on that project.
- That customer can see that contractor’s business name on that project. The public directory still hides it.
- The message box still rejects phone numbers, email addresses, and street addresses, even after Connect.
- The customer can choose “Share my contact & address.” That shares the customer’s name, phone, email, and the address on the profile and project with that contractor only. Other pros on the same project do not get it. The customer can keep messaging without sharing.

Before that share, a contractor offered the job can see an approximate location (city and state, and the ZIP on the jobs list), not the street. An admin can unlock or revoke contact access for one specific record and records the reason. That reason is not published.

## 7. Do not route around the Connection Fee

You agree not to use PPP to exchange contact details in order to hire off the platform and skip the Connection Fee. The [Community Guidelines](/community-guidelines) are part of that promise. Before a paid connection, the product rejects obvious phone numbers, email addresses, websites, social handles, QR codes, and exact street addresses in project text, profiles, estimates, and messages.

The Trust page states the enforcement PPP intends: a warning, suspension, or termination for repeated abuse, and not an automatic permanent ban on a single detection. The product enforces this by rejecting the text. Suspension or closure of an account is an admin action. That check is not a surveillance program, and it does not catch every disguise.

After a legitimate Connect between those two people, ordinary contact may be shared through the share control in section 6. That does not let you publish the other person’s contact on a public page.

## 8. Reviews, photos, and conduct

Job reviews, marketplace reviews, portfolio photos, and project photos follow the [Review & Content Guidelines](/content-guidelines). Day-to-day conduct follows the [Community Guidelines](/community-guidelines). Both are part of these terms.

A job review can be edited for 30 days after it is posted. The other person on that job can report the review. An admin can hide a job review or a contractor’s reply. Hiding keeps the review. It does not delete it. A low star rating by itself is not a reason to hide it. A review of the PPP marketplace stays off the public page until an admin approves it.

A contractor uploads a portfolio photo. It stays in review until an admin approves it. Public pages show only that approved photo, through a short-lived link. An admin can hide a photo instead. Before a portfolio photo or project photo is uploaded, the app removes location information a camera stored in the file, such as GPS coordinates. If it cannot remove that information, the photo is not uploaded. The [Privacy Policy](/privacy) explains this, including photos uploaded before the change, and who can see each kind of photo.

On an estimate or a booking, a customer can choose “Don't match me with this pro again.” That blocks the pro for that customer only. Matching skips that pro, the pro is left out of Hire Again, and the pro’s open, unaccepted offers on that customer’s other current projects close immediately. Paid connections and bookings are not changed. A job already underway stays as it is, and a paid connection stays paid. The customer can undo that later from Blocked pros, and an admin can remove the block. A customer review of 1, 2, or 3 stars creates the same kind of block. A review of 4 or 5 stars does not. Raising a 1-, 2-, or 3-star review to 4 or 5 stars does not remove the block. A contractor’s review of a customer never creates a block.

Reports of fraud or impersonation, harassment or threats, misleading profiles, suspected fake reviews, serious contractor misconduct, and rule violations follow the Community Guidelines. Reviewing a report is not a guarantee of workmanship, not an assumption of responsibility for the job, and not a decision of a construction dispute.

## 9. Notifications

PPP can notify you in the app, by web push, and by email. Email is sent through Google Workspace from PPP’s support mailbox. Web push uses your browser’s push service. You can turn categories on or off. Those categories cover new jobs, messages, connections, estimates, bookings, change orders, reviews, and account notices. In-app notices start on. Email starts on for most of those categories. Push starts off until you turn it on. On an iPhone, push needs the site added to the Home Screen (iOS 16.4 or later). Message emails are limited to one per conversation every 15 minutes, and only while the message is still unread. Email can include an unsubscribe link.

## 10. Disputes

Job disputes between a homeowner and a contractor are covered in Independent Marketplace and Contractor Responsibility. Those disputes are ordinarily between them. PPP is not automatically a party to litigation about workmanship, payments for the work, property damage, delays, or warranties. The court and venue for a dispute between a homeowner and a contractor follow the law that applies to that dispute and any enforceable agreement between them. These terms do not require those disputes to be filed in Montgomery County.

A booking can be marked Disputed in the product. That status does not mean PPP has decided who is right, and it does not refund a platform fee. Platform fees are covered only by the Refund & Cancellation Policy.

Disputes that are directly with PPP about these terms or the marketplace service are governed by Texas law where that choice is permitted. The proposed venue for those disputes is Montgomery County, Texas, where that venue is legally enforceable. These terms do not require arbitration. They do not waive a class action, a jury, or any consumer right or mandatory protection that the law does not allow a business to waive. Nothing in this section limits the sentence in Independent Marketplace and Contractor Responsibility that preserves liability and remedies the law does not allow these terms to exclude.

## 11. Closing your account

You can delete your own account from the account screen. You must type DELETE to confirm. If that control is temporarily unavailable, use the [Contact us page (prioritypropertypros.com/contact)](/contact) and send the request from the email on the account with the subject “Account deletion request,” and PPP will handle it as the [Privacy Policy](/privacy) describes. What is removed, and what can remain, is described in the [Privacy Policy](/privacy). Deleting your account does not by itself refund a platform fee. You cannot delete the last active admin account. The screen tells you deletion cannot be undone. Declining updated terms does not remove this deletion right.

## 12. Admins

There is no public admin signup. The first admin is created in the database by the owner. Admins can review contractor applications, moderate marketplace reviews, approve or hide portfolio photos, and grant or revoke contact access on a specific record with a reason. Admin access can require a second sign-in factor. An admin is not the contractor and does not perform the work. Admin approval is not a warranty and is not a statement that a contractor is licensed, insured, bonded, or background-checked.

## 13. Your content and ours

You keep ownership of the text and photos you submit. You give PPP permission to host, display, and moderate them as the product actually does: public fields only where the product makes them public, and private fields only to the people the product is built to show them to. You promise you have the right to submit that material.

The PPP name, logos, and site design belong to PPP. You may not copy the site or use the name in a way that suggests PPP did the work.

## 14. Disclaimers

The marketplace software is provided as it runs today. Features such as Stripe Checkout can be switched off. PPP does not warrant that the site will be uninterrupted or error free.

Responsibility for the work, and liability these terms do not exclude, is in Independent Marketplace and Contractor Responsibility.

**Priority Help.** Priority Help is a support chat on the site. It is an automated assistant, not a person; a person is in the chat only after the chat says one has joined. Automatic replies are written by an AI assistant from PPP’s published help articles and current fees. An automatic reply can be incomplete or wrong. It is not legal, tax, or construction advice, and it does not change these terms, the [Refund & Cancellation Policy](/refunds), or a fee. The assistant cannot issue a refund, approve a refund exception, change an account, or share another person’s contact details. Choose Talk to Support, or use the [Contact us page (prioritypropertypros.com/contact)](/contact), to reach a person. PPP stores Priority Help chats and deletes them on the schedule in the [Privacy Policy](/privacy): a chat started without signing in is deleted 90 days after its last message, unless a ticket is still open. To write a reply, PPP sends the chat text to OpenAI after removing the email addresses, phone numbers, and street addresses it detects. Do not type card numbers, passwords, or another person’s contact details into the chat. PPP may limit, pause, or turn off Priority Help at any time, and may refuse messages that try to misuse it.

## 15. Changes

PPP will post updated terms on this page. The effective date of a version is its publication date. That posting is the notice. For a material change, PPP will also email the address on the account when PPP has that address. Notification settings do not have a separate switch for legal updates.

A new version is required from its publication date. New accounts must accept the current version and affirm that they are 18 or older, or the account is not created. Existing users are prompted on the next sign-in, as section 3 describes, including that age affirmation. They are not locked out of viewing their information or deleting the account. New marketplace actions wait on acceptance of the current versions. The version and the time are the record of what was accepted. The acceptance from a later sign-in is stored separately from the acceptance recorded when the account was created.

## 16. Contact and requests

Questions about these terms: use the [Contact us page (prioritypropertypros.com/contact)](/contact).

Mailing address: Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US.

Privacy requests (access, correction, a copy, deletion, or an opt-out) and refund-exception requests also go through the Contact us page. They can also be mailed to the mailing address above. The [Privacy Policy](/privacy) describes privacy requests. The [Refund & Cancellation Policy](/refunds) describes refund exceptions, including who reviews them and that an approved refund is sent from Stripe’s dashboard. Sending a request does not by itself change an account or create a refund.

Use the Contact us page for marketplace questions. Job responsibility is in Independent Marketplace and Contractor Responsibility.
$ppp_legal_terms_v4$, false, 'ALL', false),
  ('privacy-policy', 'Privacy Policy', 3, $ppp_legal_privacy_v3$
# Privacy Policy

This is not legal advice.

Effective date: the date this version is published, shown at the top of this page.

## Plain-language summary

- PPP collects the account, project, message, photo, review, and notification data described below so the marketplace can run.
- A project has a city, state, and ZIP for matching. The street address is private. Public contractor cards do not show a business name, phone, email, or street.
- Card numbers are entered at Stripe. PPP does not store card numbers. PPP stores payment metadata for the $9.99 activation and the $4.99 Connect.
- The site is hosted as a static site on GitHub Pages. Accounts, database, files, and login are on Supabase. Email is sent through Google Workspace. Web push goes through the browser’s push service. There is no advertising tracker in the current site.
- PPP does not sell personal information.
- You can delete your account from the account screen, or through the Contact us page if that control is temporarily unavailable. Your login, email, name, phone, profile photo, and street address are removed. Payment records stay with amounts and dates but without your name or contact. Text you wrote for other people, such as messages, estimates, reviews, and project descriptions, can remain, as described below. Portfolio photos, credentials, services, service areas, and project photos are removed. A small number of older internal security logs may still contain an email address. Stripe keeps its own payment records and the contractor’s Stripe account. PPP does not close that Stripe account and does not send Stripe a deletion notice. The product does not include an in-app export.
- The marketplace is for people 18 or older. That is an affirmation you make, not a verification of your age. The signup form does not ask for a date of birth.
- Priority Help is a support chat on the site. PPP stores the chat, and the text you type is sent to OpenAI to write a reply after PPP removes the email addresses, phone numbers, and street addresses it detects. A chat started without signing in is deleted automatically 90 days after its last message. Details are in sections 2, 5, 6, and 8.
- Location information, such as GPS coordinates, and other camera details are removed from project and portfolio photos uploaded through the site. The app does this in your browser before upload. If it cannot remove them, the photo is not uploaded. A few photos uploaded before this change can still contain location information until PPP finishes removing it. A project photo can be opened by contractors offered your project before a paid Connect.
- Texas privacy rights and general US practices are described below.

The [Terms of Service](/terms) are part of the same agreement, along with the [Refund & Cancellation Policy](/refunds), the [Community Guidelines](/community-guidelines), and the [Review & Content Guidelines](/content-guidelines). Contractor accounts also accept the [Contractor Participation Terms](/contractor-terms).

## 1. Who this policy covers

Priority Property Pros LLC (“PPP,” “we”) operates prioritypropertypros.com. This policy describes personal information the marketplace handles for customers (homeowners and businesses), contractors, and the admins who run the site. A verifier role is not a public signup. This policy does not describe a verifier inspecting your home.

Contact PPP through the [Contact us page (prioritypropertypros.com/contact)](/contact), or by mail at Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US. Privacy requests can be sent to either, as section 9 describes.

## 2. Information the product collects

**Account.** Name, email, password (stored by Supabase Auth, not in the PPP application tables), phone if you add one, and whether you are a customer or a contractor. A contractor also adds a business name, trade, and service area at signup, and can later add a headline, bio, years of experience, website, job-size range, service radius or ZIP list, a profile photo, contractor-provided license or insurance fields, and credentials. Those credential fields are what the contractor typed. PPP does not treat them as a license check, an insurance check, a bond, or a background check.

**Age affirmation.** The form does not ask for a date of birth. Being 18 or older is an affirmation you make. It is not a verification of your age, a date of birth, or an identity document. A new signup asks you to affirm that you are 18 or older, and PPP records the time of that affirmation. An account that already existed when these versions were published is asked for the same affirmation when it accepts the current versions at the next sign-in. Anyone who can call the signup service directly can send the affirmation flag. PPP records the statement. It does not check an identity document.

**Agreement records.** The signup checkbox is on the form. A new account stores one record per current document with the version and the time. An existing account is prompted at the next sign-in. Accepting then stores a separate record with the version and the time. The version number is copied from the current agreement. The prompt does not hide projects, messages, or other account information. If you do not accept, you can still view that information and delete the account. The product does not include an in-app export. New marketplace actions are refused until you accept. Accepting does not delete older records or the account.

**Projects.** Title, description, project type, city, state, ZIP, timing, optional budget, and photos of the work. The street and precise coordinates are stored privately, not on the public project. An unposted draft stays in that browser tab until you post. Photos in an unposted draft are not kept if you reload the tab.

**Messages and contact share.** Message text, time, and read state for a project thread. The message box is not a place for phone numbers, email addresses, or street addresses. Those are rejected in the text. If a customer uses “Share my contact & address,” PPP shows that customer’s name, phone, email, and project address to that one connected contractor.

**Reviews.** For a job review: a rating from 1 to 5, the text, and the time it was posted or edited. For a marketplace review: rating, text, display name, and an optional city. Marketplace reviews are not Google reviews.

**Photos.** Project photos, and contractor portfolio photos with their captions. A contractor uploads a portfolio photo. It stays in review until an admin approves it. Public pages show only an approved photo, through a short-lived link. Unapproved photos are not shown. The file stays in private storage, and the original file name is not published as a public address.

**Photo location information.** Before a project photo or portfolio photo is uploaded, the app makes a new copy of the image in your browser without the information a camera or phone stored in the file (EXIF data such as GPS coordinates, the time taken, and the device model, plus similar XMP and IPTC data and comments). If the app cannot remove that information, for example because your browser cannot open the photo format, the photo is not uploaded. HEIC photos are saved as JPEG. Photos uploaded before this change were stored as the original file and can still contain that information until PPP finishes removing it from those older files. A project photo can be opened by you, by admins, and by contractors offered or connected on that project, including before a paid Connect. An approved portfolio photo can be opened by any visitor while its short-lived link works. The picture itself can still show where it was taken, such as a house number or street sign, so check what is in the photo before you upload it.

**Payments.** When Stripe Checkout is enabled, Stripe collects the card data. PPP stores the payment references Stripe assigns, the amount ($9.99 or $4.99), the currency, the status, and when it was paid. PPP does not store the card number. PPP does not collect the payment for the job itself.

**Notifications.** Your on/off choices for in-app, push, and email. If you turn on web push, PPP stores the address the browser gives for that subscription, the keys that subscription uses, a short description of the browser, and when it was last used.

**Reports and admin records.** A contractor can report a project photo. PPP stores the reporter, the target, and the reason. Admins record reasons when they approve or reject a marketplace review, and when they grant or revoke contact access. Those reasons are kept in PPP’s admin records. The review reason is not shown on the public review. Reports sent through the Contact us page arrive in PPP’s support mailbox and are handled there. The site does not have a separate in-app complaint center.

**Support.** The Contact us page opens a message in your own email app, addressed to PPP’s support mailbox. PPP does not store that form on its servers.

**Priority Help chat.** Priority Help is a support chat on the site. When you use it, PPP stores the messages you type, the replies, and the times. If you are signed in, the chat is linked to your account. If you are not signed in, the chat is linked to a random code saved in your browser, not to your name. To limit abuse, PPP stores a one-way coded form of your network address rather than the address itself. Automatic replies are written by an AI assistant, not a person. A PPP admin can read any Priority Help chat, and a person replies only after you choose Talk to Support. For each automatic reply, PPP also records the AI model, the amount of text processed, and the cost, without the chat text. Do not type phone numbers, email addresses, street addresses, card numbers, passwords, or another person’s details into the chat.

PPP does not ask for a Social Security number, a government ID image, or a background-check report. PPP does not collect a bond.

## 3. How that information is used

PPP uses this information to:

- create and protect your account, including email confirmation and password reset
- show you the right home screen for a customer, contractor, or admin
- match projects to contractors by trade and service area, with up to three connection slots
- take the $9.99 activation and the $4.99 Connect when those checkouts are turned on
- unlock messaging and the customer’s contact-share control only after a verified Connect or a specific admin override
- show public directory cards without the business name or contact details
- deliver in-app notices, web push, and email you have not turned off
- moderate marketplace reviews and portfolio photos
- detect obvious pre-connection contact details so people do not skip the Connection Fee
- answer support questions in the Priority Help chat
- record acceptance of the current agreements, and the 18-or-older affirmation
- delete an account when you ask, and keep an audit record of that deletion
- fix errors and keep the service secure

PPP does not use this information to sell ads, and the current website does not include a third-party analytics or advertising tracker.

## 4. Public and private

**Public, or shown to visitors who are not logged in.** Approved contractor cards: a neutral trade-and-city label, categories, a general service area, years of experience if provided, a short description with contact details removed, ratings from visible verified job reviews when those reviews exist, generic credential badges, approved portfolio captions, and the approved portfolio photo through a short-lived link. A hidden job review is left out of that public rating. Marketplace reviews of PPP appear only after an admin approves them. The public card does not include the business name, personal name, phone, email, website, street, or license number. The original file name is not published as a public address. Camera location information is removed from photos uploaded through the site. A photo uploaded before that change can still contain it until PPP finishes removing it.

**Shown to a matched contractor before Connect.** Project description, project photos, and an approximate location. The jobs list can include city, state, and ZIP. The street, the customer’s phone, and the customer’s email stay hidden. Camera location information is removed from project photos uploaded through the site, as section 2 describes, but the picture itself can still show where it was taken.

**Shown after a paid Connect, to that pair.** Messaging, and the contractor’s business name to that customer on that project. The customer’s phone, email, and street are shown to that contractor only after the customer shares them.

**Admins** can see application and moderation data they need to approve contractors, moderate reviews and photos, and unlock or lock a specific contact record. There is no public admin signup.

## 5. Processors

PPP uses these services to run the product:

- **Supabase** hosts the database, login, file storage, and server functions. A signed-in person can read only the records the product is built to show them.
- **Stripe** processes the $9.99 and $4.99 Checkout payments when those checkouts are enabled. Stripe’s own privacy policy covers the card data Stripe collects.
- **GitHub Pages** hosts the static website at prioritypropertypros.com.
- **Google Workspace** (Google) sends account and notification email from PPP’s support mailbox.
- **Your browser’s push service** (for example the service behind Chrome, Firefox, or Safari) delivers web push if you turn it on. PPP holds the keys used to send those pushes. The private key is not in the website code.
- **OpenAI (Priority Help).** OpenAI receives information from PPP only when you use Priority Help and an automatic reply is written. PPP then sends OpenAI the message you type in that chat and up to eight earlier messages of the same chat, after removing the email addresses, phone numbers, and street addresses that PPP’s filter detects. A filter can miss details written in an unusual way, so do not type them. PPP’s published help articles and the current fee amounts are sent with it. PPP does not send your name, your account details, your projects, your messages with contractors or customers, your photos, or your payment details to OpenAI for this. PPP uses OpenAI’s API and does not opt in to sharing that data with OpenAI for training. OpenAI states that data sent to its API is not used to train its models unless the customer opts in. OpenAI also states that it may keep API inputs and outputs in abuse-monitoring logs for up to 30 days, longer only when the law requires it or when it is reasonably necessary to protect OpenAI’s services or others from harm, and that access to that data is limited to authorized OpenAI staff and contractors bound by confidentiality who review for abuse and misuse. Sources: OpenAI, “Data controls in the OpenAI platform” (https://platform.openai.com/docs/guides/your-data) and “Enterprise privacy at OpenAI” (https://openai.com/enterprise-privacy/), both checked October 11, 2026.

PPP does not sell personal information to these companies. They process it to provide the service.

## 6. Cookies and local storage

PPP does not run an ad-cookie banner because the current site does not use advertising cookies. The browser storage the product does use:

- **Login session.** The login service keeps the session in the browser’s local storage so you stay signed in. A password-reset request uses separate browser storage and does not replace that session.
- **Unposted project draft and a few site-update flags.** Session storage holds the project wizard until you post, and it holds a short flag so a site update does not reload in the middle of a form.
- **Priority Help guest code.** If you use Priority Help without signing in, the browser keeps a random code in local storage so the chat can continue on your next visit. Clearing site data removes the code, and the chat then starts over.
- **PWA cache.** The site can install a service worker that caches the app shell so pages load again and so web push can be delivered. That cache is the site’s files, not a profile sold to advertisers.

You can clear this storage in your browser. Clearing it signs you out and drops an unposted draft.

## 7. Selling and advertising

PPP does not sell personal information. PPP does not share it for targeted advertising. PPP does not use it to profile you for ads.

## 8. How long information stays

PPP keeps account and project information while the account is open and the marketplace needs it to show the job, the messages, and the reviews.

**Deleting your account.** You delete your account from the account screen. You type DELETE. The product asks for your current password, or it accepts a sign-in from the last 10 minutes. Deletion is refused while a job is still active (not yet finished or cancelled), while a booking is disputed or a card dispute with Stripe is still open, while a refund is unfinished, or while you are the last active admin. The account changes below happen together in one step. If any part fails, none of them is made, and the account stays as it was.

**If the delete control is unavailable.** PPP can temporarily turn off the delete control, for example while it fixes a problem. While it is off, use the [Contact us page (prioritypropertypros.com/contact)](/contact) and send the request from the email on the account with the subject “Account deletion request.” PPP may ask you to confirm that you control that email. PPP will answer within the time in section 9. The same refusals and the same results described in this section apply.

**Removed or cleared.**

- The login, and the email address on it.
- Your name, phone, and profile photo, and then the profile itself.
- The street address and precise map coordinates on your projects.
- Empty draft projects that have no booking, connection, estimate, offer, or message thread.
- Photos you added to your projects, both the records and the files.
- For a contractor: portfolio photos with their titles and captions, credential entries, services, service areas, and the Stripe Connect account record PPP stores. A contractor profile can remain under the name “Deleted Pro,” suspended and not accepting work, with the headline, bio, website, license note, insurance note, trade, service-area text, years of experience, and job-size range cleared.
- Your notifications, push subscriptions, notification preferences, reviews of the PPP marketplace, content reports you filed, and blocks between you and a contractor.
- Notifications in other people’s accounts that name you, such as “New message from …,” are changed to neutral wording that does not name you.
- Free-text reasons on refund rows, cancellation notes, and payment-schedule descriptions. A category can remain in place of that text.
- References you left on someone else’s record, such as an approval you performed, are cleared off that record rather than deleting the other person’s account.

Files stored under your account in project photos and contractor documents are removed right after that account update. That file cleanup can fail without undoing the deletion, so a file can remain in private storage, no longer linked to any account.

**Kept, with the link to your account removed.**

- Payment, refund, $9.99 activation, $4.99 Connection Fee, cancellation, and accounting records. They keep the amount, the status, the Stripe references, and the dates. They do not keep your name, email, phone, or address. An accounting note that cannot be rewritten, and Stripe’s own dispute classification, can remain.
- Projects other than those empty drafts, with the title, description, city, state, and ZIP. The street and precise coordinates are cleared, as above.
- Bookings and connections.
- Text you wrote that is part of someone else’s job history: project descriptions, estimates and estimate notes, project messages, job reviews, and change orders. That text stays as written, so the other person can still read it. If you typed your name or another detail into that text, it stays in that text. Reviews of the PPP marketplace itself are removed, as above.
- The record of which agreement version you accepted and when, with the browser information sent with that acceptance. It is kept with an id that is no longer a live profile.

**What PPP cannot change.** A small number of older internal security logs may contain an email address. Those logs cannot be altered.

**Stripe.** PPP does not send a deletion notice to Stripe, and PPP sends Stripe nothing as part of deletion. PPP does not close a contractor’s Stripe Connect account at Stripe. Stripe keeps that account, and its own payment, customer, and Checkout records, under Stripe’s policy. PPP keeps the Stripe ids that refer to those payment records. PPP cannot delete card numbers it never stored. Deleting an account does not by itself refund the $9.99 or a $4.99 Connection Fee. Refund exceptions are in the [Refund & Cancellation Policy](/refunds).

**Priority Help chats.** A chat started without signing in is deleted automatically 90 days after its last message. If that chat became a support ticket that is still open, it is kept until the ticket is resolved or closed, and is then deleted automatically 90 days later. A signed-in chat is deleted automatically 365 days after it is resolved or closed, or 365 days after its last message if it never became a ticket. Deleting your account deletes your Priority Help chats in the same step. The automatic deletion runs once a day, so a chat can remain up to one more day. PPP keeps a usage record for each automatic reply (the date, the AI model, the amount of text processed, and the cost) without the chat text; once the chat is deleted, that record no longer links to it. OpenAI’s own retention is described in section 5.

Apart from Priority Help chats, the product does not publish a separate multi-year retention table. There is no fixed “we keep everything for X years” rule in the software. An acceptance record can remain after the account is deleted, as this section describes. The time of an 18-or-older affirmation is stored on the profile and is removed when that profile is deleted.

## 9. Your choices and your rights

You can update profile and notification settings in the app, turn push and email categories off, unsubscribe from a notification email, ask to change your email (the change waits until both addresses confirm it), and delete your account as described in the [Terms of Service](/terms).

The product does not include an in-app export or a download of your personal information. You can still view the account information the product shows you.

**Privacy requests.** Use the [Contact us page (prioritypropertypros.com/contact)](/contact), or mail your request to Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US. Say whether you want access, a correction, a copy, deletion, or an opt-out, and include the email on the account. PPP may ask you to confirm that you control that email before it acts, for example by replying from that address. A mailed request is answered by email to the account email. PPP does not sell personal information and does not use it for targeted advertising, so there is no sale list or ad profile to remove. You can turn notification email off from the unsubscribe link in a message or from notification settings in the app.

PPP will answer within 45 days. If the request needs more time, PPP may take up to 45 more days and will tell you before the first 45 days end. PPP keeps a record of the request and how it was handled. PPP will not discriminate against you for asking. If PPP denies a request, you may reply to PPP’s answer and ask for another look. Deleting the account from the account screen is separate from this request and follows section 8.

This policy is written for people in the United States, including Texas. The Texas Data Privacy and Security Act (TDPSA) gives consumers of a covered business the right to access, correct, delete, and obtain a copy of personal data, and to opt out of sale, targeted advertising, and certain profiling. PPP does not sell personal data and does not run targeted advertising or ad profiling. The request process above is how PPP handles those asks.

If you decline an updated version of the agreements, you can still view your account information and delete your account. New marketplace actions stay unavailable until you accept.

## 10. Children

The marketplace is for adults hiring and doing property work. It is not directed to children. You must be 18 or older to create an account. That is an affirmation you make, not a verification of your age. The signup form does not ask for a date of birth. A new signup asks you to affirm that you are 18 or older and PPP records the time. An existing account is asked for the same affirmation when it accepts the current versions.

## 11. Security

The site is served over HTTPS. Signed-in access is limited to the records the product is built to show that person, and sensitive actions go through checked server steps. Admin accounts can be required to use a second factor. No method of storage or transmission is perfect. Contact PPP through the [Contact us page (prioritypropertypros.com/contact)](/contact) if you believe your account is being misused.

## 12. Changes

PPP will post an updated policy on this page. The effective date of a version is its publication date. That posting is the notice. For a material change, PPP will also email the address on the account when PPP has that address. Notification settings do not have a separate switch for legal updates. A new version is required from its publication date. A new account must accept the current version and affirm that the person is 18 or older, or the server will not create the account. If you already have an account, the next sign-in asks you to accept and to make that affirmation, and that acceptance is stored separately from the acceptance recorded when the account was created, with the version and the time. You can still view your information and delete your account before you accept. Nothing is deleted because you have not yet accepted.

## 13. Contact

Privacy questions and privacy requests: use the [Contact us page (prioritypropertypros.com/contact)](/contact).

Mailing address: Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US.
$ppp_legal_privacy_v3$, false, 'ALL', false);

UPDATE public.agreements
SET is_current = false
WHERE ((slug = 'terms-of-use' AND version <> 4) OR (slug = 'privacy-policy' AND version <> 3))
  AND is_current;

UPDATE public.agreements
SET is_current = true,
    published = true,
    published_at = now()
WHERE (slug, version) IN (('terms-of-use', 4), ('privacy-policy', 3));

CREATE OR REPLACE FUNCTION public.set_legal_acceptance_required(p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_service_role();

  INSERT INTO public.platform_settings (key, value_int, description)
  VALUES (
    'legal_acceptance_required',
    CASE WHEN coalesce(p_enabled, false) THEN 1 ELSE 0 END,
    '0 = draft legal acceptance is not required. 1 = require the current approved agreement versions. Does not change payment flags or delete account data.'
  )
  ON CONFLICT (key) DO UPDATE
  SET value_int = EXCLUDED.value_int
  WHERE public.platform_settings.key = 'legal_acceptance_required';

  IF NOT coalesce(p_enabled, false) THEN
    RETURN;
  END IF;

  UPDATE public.agreements
  SET is_current = false
  WHERE slug IN (
    'terms-of-use',
    'privacy-policy',
    'refund-cancellation',
    'community-guidelines',
    'review-content',
    'contractor-participation'
  )
    AND is_current;

  UPDATE public.agreements
  SET is_current = true,
      published = true,
      published_at = coalesce(published_at, now())
  WHERE (slug, version) IN (
    ('terms-of-use', 4),
    ('privacy-policy', 3),
    ('refund-cancellation', 1),
    ('community-guidelines', 1),
    ('review-content', 1),
    ('contractor-participation', 1)
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.set_legal_acceptance_required(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_legal_acceptance_required(boolean) TO service_role;
