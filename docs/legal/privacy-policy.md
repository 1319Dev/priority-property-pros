# Privacy Policy

This is not legal advice.

Effective date: the date this version is published. Until this version is published, it is not in effect.

## Plain-language summary

- PPP collects the account, project, message, photo, review, and notification data described below so the marketplace can run.
- A project has a city, state, and ZIP for matching. The street address is private. Public contractor cards do not show a business name, phone, email, or street.
- Card numbers are entered at Stripe. PPP does not store card numbers. PPP stores payment metadata for the $9.99 activation and the $4.99 Connect.
- The site is hosted as a static site on GitHub Pages. Accounts, database, files, and login are on Supabase. Email goes through Resend. Web push goes through the browser’s push service. There is no advertising tracker in the current site.
- PPP does not sell personal information.
- You can delete your account from the account screen. The login is removed. Some marketplace records stay with your name and contact cleared. Portfolio rows, credentials, messages, and older audit notes can remain, as described below. Stripe keeps its own payment records. PPP does not send Stripe a deletion notice. The product does not include an in-app export.
- The marketplace is for people 18 or older. That is an affirmation you make, not a verification of your age. The signup form does not ask for a date of birth.
- A Priority Help chat is not part of the product. If it launches, an AI provider would be an extra processor. That is marked conditional below.
- Texas privacy rights and general US practices are described below.

The [Terms of Service](/terms) are part of the same agreement, along with the [Refund & Cancellation Policy](/refunds), the [Community Guidelines](/community-guidelines), and the [Review & Content Guidelines](/content-guidelines). Contractor accounts also accept the [Contractor Participation Terms](/contractor-terms).

## 1. Who this policy covers

Priority Property Pros LLC (“PPP,” “we”) operates prioritypropertypros.com. This policy describes personal information the marketplace handles for customers (homeowners and businesses), contractors, and the admins who run the site. The verifier role exists in the database and is not a public signup. This policy does not describe a verifier inspecting your home.

The contact published on the site is [support@prioritypropertypros.com](mailto:support@prioritypropertypros.com). This policy does not publish a street address.

## 2. Information the product collects

**Account.** Name, email, password (stored by Supabase Auth, not in the PPP application tables), phone if you add one, and whether you are a customer or a contractor. A contractor also adds a business name, trade, and service area at signup, and can later add a headline, bio, years of experience, website, job-size range, service radius or ZIP list, a profile photo, contractor-provided license or insurance fields, and credentials. Those credential fields are what the contractor typed. PPP does not treat them as a license check, an insurance check, a bond, or a background check.

**Age affirmation.** The form does not ask for a date of birth. Being 18 or older is an affirmation you make. It is not a verification of your age, a date of birth, or an identity document. Until these pages are published and the requirement to accept these versions is turned on, signup does not ask for the affirmation and does not store it. After that requirement is on, a new signup asks you to affirm that you are 18 or older, and PPP records the time of that affirmation. An account that already exists is asked for the same affirmation when it accepts the current versions at the next sign-in. Accounts created before the requirement is on are not asked until that prompt. Anyone who can call the signup service directly can send the affirmation flag. PPP records the statement. It does not check an identity document.

**Agreement records.** The signup checkbox is on the form. Until the requirement to accept these versions is turned on, PPP does not reject a new account for these versions and does not prompt existing accounts. After that requirement is turned on, a new account stores one record per current document with the version and the time. An existing account is prompted at the next sign-in. Accepting then stores a separate record with the version and the time. The version number is copied from the current agreement. The prompt does not hide projects, messages, or other account information. If you do not accept, you can still view that information and delete the account. The product does not include an in-app export. While the requirement is on, new marketplace actions are refused until you accept. Accepting does not delete older records or the account.

**Projects.** Title, description, project type, city, state, ZIP, timing, optional budget, and photos of the work. The street and precise coordinates are stored in a private location record, not on the public project. An unposted wizard draft stays in that browser tab (session storage) until you post. Photos in an unposted draft are not kept if you reload the tab.

**Messages and contact share.** Message text, time, and read state for a project thread. The message box is not a place for phone numbers, email addresses, or street addresses. Those are rejected in the text. If a customer uses “Share my contact & address,” PPP shows that customer’s name, phone, email, and project address to that one connected contractor.

**Reviews.** For a job review: a rating from 1 to 5, the text, and the time it was posted or edited. For a marketplace review: rating, text, display name, and an optional city. Marketplace reviews are not Google reviews.

**Photos.** Project photos and contractor portfolio photos, including the file stored in private storage and the caption. Portfolio photos are not public until an admin approves them. After approval, public pages show that approved photo through a short-lived link. The storage stays private, and the original file name is not published as a public address. PPP does not currently remove location information a camera stored in the file, such as GPS coordinates, so that information can travel with an approved photo.

**Payments.** When Stripe Checkout is enabled, Stripe collects the card data. PPP stores the checkout session id, the payment intent id, the amount ($9.99 or $4.99), the currency, the status, and when it was paid. PPP does not store the card number. PPP does not collect the payment for the job itself.

**Notifications.** Your on/off choices for in-app, push, and email. If you turn on web push, PPP stores the push endpoint (an https address), the browser encryption keys for that subscription, a user-agent string, and when it was last used.

**Reports and admin records.** A contractor can report a project photo. PPP stores the reporter, the target, and the reason. Admins record reasons when they approve or reject a marketplace review, and when they grant or revoke contact access. Those reasons go to an audit log. The review reason is not shown on the public review. Reports sent by email to support@prioritypropertypros.com are handled in that mailbox. The site does not have a separate in-app complaint center.

**Support.** The contact page opens an email in your own mail app to support@prioritypropertypros.com. PPP does not store that form on its servers.

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
- record acceptance of the current agreements, and the 18-or-older affirmation, when that requirement is on
- delete an account when you ask, and keep an audit record of that deletion
- fix errors and keep the service secure

PPP does not use this information to sell ads, and the current website does not include a third-party analytics or advertising tracker.

## 4. Public and private

**Public, or shown to visitors who are not logged in.** Approved contractor cards: a neutral trade-and-city label, categories, a general service area, years of experience if provided, a short description with contact details removed, aggregate PPP ratings when real reviews exist, generic credential badges, approved portfolio captions, and, once a portfolio photo is approved, that photo through a short-lived link. Approved marketplace reviews of PPP. The public card does not include the business name, personal name, phone, email, website, street, or license number. The original file name is not published as a public address. Location information a camera stored in an approved photo can still be in that file.

**Shown to a matched contractor before Connect.** Project description and an approximate location. The jobs list can include city, state, and ZIP. The street, the customer’s phone, and the customer’s email stay hidden.

**Shown after a paid Connect, to that pair.** Messaging, and the contractor’s business name to that customer on that project. The customer’s phone, email, and street are shown to that contractor only after the customer shares them.

**Admins** can see application and moderation data they need to approve contractors, moderate reviews and photos, and unlock or lock a specific contact record. There is no public admin signup.

## 5. Processors

PPP uses these services to run the product:

- **Supabase** hosts the database, login, file storage, and server functions. Row-level security limits which rows a signed-in person can read. The anon key in the website is public by design. It is not a password to other people’s data.
- **Stripe** processes the $9.99 and $4.99 Checkout payments when those checkouts are enabled. Stripe’s own privacy policy covers the card data Stripe collects.
- **GitHub Pages** hosts the static website at prioritypropertypros.com.
- **Resend** sends notification email.
- **Your browser’s push service** (for example the service behind Chrome, Firefox, or Safari) delivers web push if you turn it on. PPP holds the VAPID keys used to send those pushes. The private key is not in the website code.
- **An AI provider, conditional.** Priority Help chat is not in the product today. If PPP launches it, chat text would be sent to that provider to generate a reply, and this policy would name the provider before that launch. Until then, no AI provider receives your projects, messages, or photos.

PPP does not sell personal information to these companies. They process it to provide the service.

## 6. Cookies and local storage

PPP does not run an ad-cookie banner because the current site does not use advertising cookies. The browser storage the product does use:

- **Login session.** Supabase Auth keeps the session in the browser’s local storage so you stay signed in. The main client uses PKCE. A password-reset request uses a separate storage key and does not replace that session.
- **Unposted project draft and a few site-update flags.** Session storage holds the project wizard until you post, and it holds a short flag so a site update does not reload in the middle of a form.
- **PWA cache.** The site can install a service worker that caches the app shell so pages load again and so web push can be delivered. That cache is the site’s files, not a profile sold to advertisers.

You can clear this storage in your browser. Clearing it signs you out and drops an unposted draft.

## 7. Selling and advertising

PPP does not sell personal information. PPP does not share it for targeted advertising. PPP does not use it to profile you for ads.

## 8. How long information stays

PPP keeps account and project information while the account is open and the marketplace needs it to show the job, the messages, and the reviews.

When you delete your account, you type DELETE. The product asks for your current password, or it accepts a sign-in from the last 10 minutes. Deletion is refused while you have an open dispute, a refund that is still unfinished, an active booking, or you are the last active admin.

The product then removes the login and the email address, and it clears the profile name, phone, and profile photo before the profile itself is deleted. It clears the street address and precise map coordinates on your projects. It deletes empty draft projects that have no booking, connection, estimate, offer, or message thread. It clears free-text reasons on refund rows, cancellation notes, and payment-schedule descriptions, and a category can remain in place of that text. It deletes content reports you filed, your reviews of the PPP marketplace, your notifications, push subscriptions, notification preferences, and blocks between you and a contractor. References you left on someone else’s record, such as an approval you performed, are cleared off that record rather than deleting the other person’s account.

Files stored under your account in project photos and contractor documents are removed after that account update. That file cleanup can fail without undoing the deletion, so a file can remain.

These records stay, with the link to your account removed:

- Projects other than those empty drafts.
- Bookings, connections, job reviews, change orders, and project messages. Message text stays, so the other person can still read what was written.
- Payment, refund, and cancellation records, including amounts, status, dates, and the Stripe ids on those rows. The $9.99 activation charge stays in that same way, with the link to your account removed.
- The record of which agreement version you accepted and when. It is kept with an opaque id, not on a live profile.
- A contractor profile can remain under the name “Deleted Pro,” suspended and not accepting work, with the headline, bio, website, license note, insurance note, trade, and service-area text cleared.

This deletion does not clear every row on that contractor profile. Portfolio photo rows, including titles, captions, and storage paths, credential rows, service rows, service-area rows, and the Stripe Connect account id are not cleared. The image files are part of the storage cleanup above. Project-photo rows on a project that is kept can still point at a file the cleanup tried to delete. Audit log entries can still contain an email address or an admin note from before the deletion.

PPP does not send a deletion notice to Stripe, and PPP sends Stripe nothing as part of deletion. Stripe keeps its own payment, customer, and Checkout records under Stripe’s policy. PPP keeps the Stripe ids that refer to those records. PPP cannot delete card numbers it never stored. Deleting an account does not by itself refund the $9.99 or a $4.99 Connection Fee. Refund exceptions are in the [Refund & Cancellation Policy](/refunds).

The product does not publish a separate multi-year retention table. There is no fixed “we keep everything for X years” rule in the software. An acceptance record can remain after the account is deleted, as this section describes. The time of an 18-or-older affirmation is stored on the profile and is removed when that profile is deleted.

## 9. Your choices and your rights

You can update profile and notification settings in the app, turn push and email categories off, unsubscribe from a notification email, and delete your account as described in the [Terms of Service](/terms).

The product does not include an in-app export or a download of your personal information. You can still view the account information the product shows you, and you can email [support@prioritypropertypros.com](mailto:support@prioritypropertypros.com) to ask for access, a correction, a copy, or deletion.

This policy is written for people in the United States, including Texas. The Texas Data Privacy and Security Act (TDPSA) gives consumers of a covered business the right to access, correct, delete, and obtain a copy of personal data, and to opt out of sale, targeted advertising, and certain profiling. PPP does not sell personal data and does not run targeted advertising or ad profiling. You may email [support@prioritypropertypros.com](mailto:support@prioritypropertypros.com) to ask for access, a correction, a copy, or deletion. PPP will not discriminate against you for asking. If PPP denies a request, you may reply to that email and ask for another look.

PPP will respond within the time the law that applies to the request requires.

If you decline an updated version of the agreements, you can still view your account information and delete your account. While acceptance of the current versions is required, new marketplace actions stay unavailable until you accept. That limit does not apply while the requirement to accept these versions is off.

## 10. Children

The marketplace is for adults hiring and doing property work. It is not directed to children. You must be 18 or older to create an account. That is an affirmation you make, not a verification of your age. The signup form does not ask for a date of birth. After the requirement to accept these versions is turned on, a new signup asks you to affirm that you are 18 or older and PPP records the time. An existing account is asked for the same affirmation when it accepts the current versions. While that requirement is off, the form does not require the affirmation and does not reject a signup for it.

## 11. Security

The site is served over HTTPS. Database access for signed-in users goes through row-level security and checked server functions. Admin accounts can be required to use a second factor. No method of storage or transmission is perfect. Email [support@prioritypropertypros.com](mailto:support@prioritypropertypros.com) if you believe your account is being misused.

## 12. Changes

PPP will post an updated policy on this page. The effective date of a version is its publication date. That posting is the notice. For a material change, PPP will also email the address on the account when PPP has that address. Notification settings do not have a separate switch for legal updates. The new version becomes the agreement PPP can require only after the requirement to accept these versions is turned on. Until then, the server does not reject a signup for these versions. After it is on, a new account must accept the current version and affirm that the person is 18 or older, or the server will not create the account. If you already have an account, the next sign-in asks you to accept and to make that affirmation, and that acceptance is stored separately from the acceptance recorded when the account was created, with the version and the time. You can still view your information and delete your account before you accept. Nothing is deleted because you have not yet accepted.

## 13. Contact

Privacy questions and privacy requests: [support@prioritypropertypros.com](mailto:support@prioritypropertypros.com).
