# Privacy Policy

> Draft for owner review. This is not legal advice, and it is not the privacy policy stored in the product yet. Have a Texas attorney review it before anyone relies on it or before it is published. Signup still records acceptance of the shorter policy in the agreements table. This draft does not replace that record until you approve it and update the record.

Effective date: [OWNER DECISION: the calendar date this policy takes effect]

## Plain-language summary

- PPP collects the account, project, message, photo, review, and notification data described below so the marketplace can run.
- A project has a city, state, and ZIP for matching. The street address is private. Public contractor cards do not show a business name, phone, email, or street.
- Card numbers are entered at Stripe. PPP does not store card numbers. PPP stores payment metadata for the $9.99 activation and the $4.99 Connect.
- The site is hosted as a static site on GitHub Pages. Accounts, database, files, and login are on Supabase. Email goes through Resend. Web push goes through the browser’s push service. There is no advertising tracker in the current site.
- PPP does not sell personal information.
- You can delete your account from the account screen. Some audit and payment records can remain, as described below.
- The service is not for children. The minimum age is an owner decision, and the form does not ask for a birthday today.
- A Priority Help chat is not part of the product. If it launches, an AI provider would be an extra processor. That is marked conditional below.
- Texas privacy rights and general US practices are described below. A Texas attorney should confirm how the Texas Data Privacy and Security Act applies.

The Terms of Service are at [/terms](/terms).

## 1. Who this policy covers

Priority Property Pros LLC (“PPP,” “we”) operates prioritypropertypros.com. This policy describes personal information the marketplace handles for customers (homeowners and businesses), contractors, and the admins who run the site. The verifier role exists in the database and is not a public signup. This policy does not describe a verifier inspecting your home.

The contact address in the product is [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com).

[OWNER DECISION: provide a mailing address if you want one published. This draft does not invent a street address.]

## 2. Information the product collects

**Account.** Name, email, password (stored by Supabase Auth, not in the PPP application tables), phone if you add one, and whether you are a customer or a contractor. A contractor also adds a business name, trade, and service area at signup, and can later add a headline, bio, years of experience, website, job-size range, service radius or ZIP list, a profile photo, contractor-provided license or insurance fields, and credentials. Signup stores a short user-agent string (up to 180 characters) and, when you check the box, a record that you accepted the current terms and privacy policy, with that user-agent string.

**Projects.** Title, description, project type, city, state, ZIP, timing, optional budget, and photos of the work. The street and precise coordinates are stored in a private location record, not on the public project. An unposted wizard draft stays in that browser tab (session storage) until you post. Photos in an unposted draft are not kept if you reload the tab.

**Messages and contact share.** Message text, time, and read state for a project thread. The message box is not a place for phone numbers, email addresses, or street addresses. Those are rejected in the text. If a customer uses “Share my contact & address,” PPP shows that customer’s name, phone, email, and project address to that one connected contractor.

**Reviews.** For a job review: a rating from 1 to 5, the text, and the time it was posted or edited. For a marketplace review: rating, text, display name, and an optional city. Marketplace reviews are not Google reviews.

**Photos.** Project photos and contractor portfolio photos, including the file stored in private storage and the caption. Portfolio photos are not public until an admin approves them. Public pages do not receive the original file or the original file name.

**Payments.** When Stripe Checkout is enabled, Stripe collects the card data. PPP stores the checkout session id, the payment intent id, the amount ($9.99 or $4.99), the currency, the status, and when it was paid. PPP does not store the card number. PPP does not collect the payment for the job itself.

**Notifications.** Your on/off choices for in-app, push, and email. If you turn on web push, PPP stores the push endpoint (an https address), the browser encryption keys for that subscription, a user-agent string, and when it was last used.

**Reports and admin records.** A contractor can report a project photo. PPP stores the reporter, the target, and the reason. Admins record reasons when they approve or reject a marketplace review, and when they grant or revoke contact access. Those reasons go to an audit log. The review reason is not shown on the public review.

**Support.** The contact page opens an email in your own mail app to prioritypropertypros@gmail.com. PPP does not store that form on its servers.

PPP does not ask for a Social Security number, a government ID image, or a background-check report.

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
- delete an account when you ask, and keep an audit record of that deletion
- fix errors and keep the service secure

PPP does not use this information to sell ads, and the current website does not include a third-party analytics or advertising tracker.

## 4. Public and private

**Public, or shown to visitors who are not logged in.** Approved contractor cards: a neutral trade-and-city label, categories, a general service area, years of experience if provided, a short description with contact details removed, aggregate PPP ratings when real reviews exist, generic credential badges, and approved portfolio captions. Approved marketplace reviews of PPP. The public card does not include the business name, personal name, phone, email, website, street, license number, or original photo file.

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

When you delete your account, the product deletes the login and the rows the deletion function removes, including that person’s bookings, connections, estimates, and the files under that account in project-photo and contractor-document storage. It also writes an audit entry that the account was deleted. References you left on someone else’s record, such as an approval you performed, are cleared off that record rather than deleting the other person’s account. Stripe keeps the payment record under Stripe’s policy. PPP cannot delete the card data it never stored.

The product does not publish a separate multi-year retention table. There is no fixed “we keep everything for X years” rule in the software.

## 9. Your choices and your rights

You can update profile and notification settings in the app, turn push and email categories off, unsubscribe from a notification email, and delete your account as described in the Terms of Service.

This policy is written for people in the United States, including Texas. The Texas Data Privacy and Security Act (TDPSA) gives covered businesses’ consumers the right to access, correct, delete, and obtain a copy of personal data, and to opt out of sale, targeted advertising, and certain profiling. PPP does not sell personal data and does not run targeted advertising or ad profiling. A Texas attorney should confirm whether the TDPSA’s revenue and volume thresholds make PPP a covered business. You may email [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com) to ask for access, a correction, a copy, or deletion either way. PPP will not discriminate against you for asking. If PPP denies a request, you may reply to that email and ask for another look.

PPP will respond within the time the law that applies to the request requires. This draft does not invent a shorter promise.

## 10. Children

The marketplace is for adults hiring and doing property work. It is not directed to children.

[OWNER DECISION: set the minimum age. This draft proposes that people under 18 may not create an account. The signup form does not ask for a date of birth and does not block an under-18 signup today. Do not treat this draft as a working age gate.]

## 11. Security

The site is served over HTTPS. Database access for signed-in users goes through row-level security and checked server functions. Admin accounts can be required to use a second factor. No method of storage or transmission is perfect. Email [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com) if you believe your account is being misused.

## 12. Changes

PPP will post an updated policy on this page and change the effective date at the top. That posting is the notice. For a material change, PPP will also email the address on the account. Notification settings do not have a separate switch for legal updates. The copy in the agreements table is what a new signup accepts until that record is updated.

## 13. Contact

Privacy questions and privacy requests: [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com).
