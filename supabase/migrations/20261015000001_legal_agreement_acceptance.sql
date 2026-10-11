-- Legal agreement versions for owner review.
-- NOT APPLIED. Do not run this against the hosted database until the owner
-- approves the wording in docs/legal/ and a Texas attorney has reviewed it.
-- Applying it does NOT replace the current Terms of Use or Privacy Policy and
-- does NOT require acceptance. platform_settings.legal_acceptance_required
-- is inserted as 0. Service role may later call set_legal_acceptance_required(true)
-- after the pages are live. That call does not change payment flags, Stripe
-- functions, or delete account data.
-- Draft rows stay is_current = false and published = false, so the Data API
-- does not serve them. The website routes stay off unless
-- VITE_PUBLISH_LEGAL_PAGES is the string true.

ALTER TABLE public.agreements
  ADD COLUMN audience text NOT NULL DEFAULT 'ALL',
  ADD COLUMN published boolean NOT NULL DEFAULT false;

ALTER TABLE public.agreements
  DROP CONSTRAINT IF EXISTS agreements_audience_check;

ALTER TABLE public.agreements
  ADD CONSTRAINT agreements_audience_check CHECK (audience IN ('ALL', 'CONTRACTOR'));

ALTER TABLE public.agreement_acceptances
  ADD COLUMN agreement_version integer;

UPDATE public.agreement_acceptances AS acceptance
SET agreement_version = agreement.version
FROM public.agreements AS agreement
WHERE agreement.id = acceptance.agreement_id
  AND acceptance.agreement_version IS NULL;

ALTER TABLE public.agreement_acceptances
  ALTER COLUMN agreement_version SET NOT NULL;

COMMENT ON COLUMN public.agreement_acceptances.agreement_version IS
  'Version copied from agreements at acceptance time. Insert-only. The client does not choose it.';

ALTER TABLE public.agreement_acceptances
  ADD COLUMN acceptance_source text NOT NULL DEFAULT 'signup';

ALTER TABLE public.agreement_acceptances
  DROP CONSTRAINT IF EXISTS agreement_acceptances_source_check;

ALTER TABLE public.agreement_acceptances
  ADD CONSTRAINT agreement_acceptances_source_check
  CHECK (acceptance_source IN ('signup', 'sign_in'));

COMMENT ON COLUMN public.agreement_acceptances.acceptance_source IS
  'signup = recorded while creating the account. sign_in = recorded later for an existing account. Turning the gate off does not delete either row.';

COMMENT ON COLUMN public.agreements.published IS
  'When false, agreement text is not readable through the Data API. Draft rows also stay is_current = false until set_legal_acceptance_required(true).';

CREATE OR REPLACE FUNCTION public.protect_agreement_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_version integer;
  current_row boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'agreement acceptances are insert-only';
  END IF;

  SELECT version, is_current
  INTO current_version, current_row
  FROM public.agreements
  WHERE id = NEW.agreement_id;

  IF NOT FOUND OR NOT coalesce(current_row, false) THEN
    RAISE EXCEPTION 'agreement_not_current'
      USING ERRCODE = 'P0001',
            HINT = 'Only the current agreement version can be accepted.';
  END IF;

  NEW.agreement_version := current_version;
  NEW.accepted_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agreement_acceptances_protect ON public.agreement_acceptances;
CREATE TRIGGER agreement_acceptances_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.agreement_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_agreement_acceptance();

REVOKE ALL ON FUNCTION public.protect_agreement_acceptance() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS agreements_select_current ON public.agreements;
CREATE POLICY agreements_select_current
  ON public.agreements
  FOR SELECT
  TO anon, authenticated
  USING (is_current AND published);

INSERT INTO public.platform_settings (key, value_int, description)
VALUES (
  'legal_acceptance_required',
  0,
  '0 = do not require the draft legal agreements. Signup is not rejected for them, and existing accounts are not prompted. 1 = require the current draft versions after set_legal_acceptance_required(true). Does not change payment flags, delete rows, or hide account data.'
)
ON CONFLICT (key) DO NOTHING;

-- LEGAL_BODY slug=terms-of-use version=3 file=docs/legal/terms-of-use.md
INSERT INTO public.agreements (slug, title, version, body, is_current, audience, published)
VALUES (
  'terms-of-use',
  'Terms of Use',
  3,
  $ppp_legal_terms_of_use$
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

The only contact address the product publishes today is [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com).

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

A job review can be edited for 30 days after it is posted. Marketplace reviews are moderated. Portfolio photos are not public until an admin approves them. The website does not currently give a customer a “block this pro” button.

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

Questions about these terms: [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com).

Job payment, scheduling, and workmanship stay between the customer and the contractor. Email PPP for marketplace questions.
$ppp_legal_terms_of_use$,
  false,
  'ALL',
  false
);

-- LEGAL_BODY slug=privacy-policy version=2 file=docs/legal/privacy-policy.md
INSERT INTO public.agreements (slug, title, version, body, is_current, audience, published)
VALUES (
  'privacy-policy',
  'Privacy Policy',
  2,
  $ppp_legal_privacy_policy$
# Privacy Policy

> Draft for owner review. This is not legal advice. Have a Texas attorney review it before anyone relies on it and before it is published. These pages stay off prioritypropertypros.com until the owner approves the wording and turns them on. This draft does not change the live signup record until the new database migration is applied. Do not apply that migration until the wording is approved.

Effective date: [OWNER DECISION: the calendar date this policy takes effect]

## Plain-language summary

- PPP collects the account, project, message, photo, review, and notification data described below so the marketplace can run.
- A project has a city, state, and ZIP for matching. The street address is private. Public contractor cards do not show a business name, phone, email, or street.
- Card numbers are entered at Stripe. PPP does not store card numbers. PPP stores payment metadata for the $9.99 activation and the $4.99 Connect.
- The site is hosted as a static site on GitHub Pages. Accounts, database, files, and login are on Supabase. Email goes through Resend. Web push goes through the browser’s push service. There is no advertising tracker in the current site.
- PPP does not sell personal information.
- You can delete your account from the account screen. Agreement acceptances go with the profile. An audit entry and Stripe’s own payment record can remain, as described below.
- The service is not for children. The minimum age is an owner decision, and the form does not ask for a birthday today.
- A Priority Help chat is not part of the product. If it launches, an AI provider would be an extra processor. That is marked conditional below.
- Texas privacy rights and general US practices are described below. A Texas attorney should confirm how the Texas Data Privacy and Security Act applies.

The [Terms of Use](/terms) are part of the same agreement, along with the [Refund & Cancellation Policy](/refunds), the [Community Guidelines](/community-guidelines), and the [Review & Content Guidelines](/content-guidelines). Contractor accounts also accept the [Contractor Participation Terms](/contractor-terms).

## 1. Who this policy covers

Priority Property Pros LLC (“PPP,” “we”) operates prioritypropertypros.com. This policy describes personal information the marketplace handles for customers (homeowners and businesses), contractors, and the admins who run the site. The verifier role exists in the database and is not a public signup. This policy does not describe a verifier inspecting your home.

The contact address in the product is [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com).

[OWNER DECISION: provide a mailing address if you want one published. This draft does not invent a street address.]

## 2. Information the product collects

**Account.** Name, email, password (stored by Supabase Auth, not in the PPP application tables), phone if you add one, and whether you are a customer or a contractor. A contractor also adds a business name, trade, and service area at signup, and can later add a headline, bio, years of experience, website, job-size range, service radius or ZIP list, a profile photo, contractor-provided license or insurance fields, and credentials. Those credential fields are what the contractor typed. PPP does not treat them as a license check, an insurance check, a bond, or a background check.

**Agreement records.** The signup checkbox is on the form. While the platform setting `legal_acceptance_required` is off, PPP does not reject a new account for these drafts and does not prompt existing accounts. After that setting is turned on, a new signup stores one row per current document with the version, the time, a source of signup, and a short user-agent string (up to 180 characters). An existing account is prompted at the next sign-in. Accepting then stores a separate row with a source of sign-in, the version, and the time. The version number is copied from the current agreement on the server. The prompt does not hide projects, messages, or other account data, and accepting does not delete older rows or the account.

**Projects.** Title, description, project type, city, state, ZIP, timing, optional budget, and photos of the work. The street and precise coordinates are stored in a private location record, not on the public project. An unposted wizard draft stays in that browser tab (session storage) until you post. Photos in an unposted draft are not kept if you reload the tab.

**Messages and contact share.** Message text, time, and read state for a project thread. The message box is not a place for phone numbers, email addresses, or street addresses. Those are rejected in the text. If a customer uses “Share my contact & address,” PPP shows that customer’s name, phone, email, and project address to that one connected contractor.

**Reviews.** For a job review: a rating from 1 to 5, the text, and the time it was posted or edited. For a marketplace review: rating, text, display name, and an optional city. Marketplace reviews are not Google reviews.

**Photos.** Project photos and contractor portfolio photos, including the file stored in private storage and the caption. Portfolio photos are not public until an admin approves them. Public pages do not receive the original file or the original file name.

**Payments.** When Stripe Checkout is enabled, Stripe collects the card data. PPP stores the checkout session id, the payment intent id, the amount ($9.99 or $4.99), the currency, the status, and when it was paid. PPP does not store the card number. PPP does not collect the payment for the job itself.

**Notifications.** Your on/off choices for in-app, push, and email. If you turn on web push, PPP stores the push endpoint (an https address), the browser encryption keys for that subscription, a user-agent string, and when it was last used.

**Reports and admin records.** A contractor can report a project photo. PPP stores the reporter, the target, and the reason. Admins record reasons when they approve or reject a marketplace review, and when they grant or revoke contact access. Those reasons go to an audit log. The review reason is not shown on the public review.

**Support.** The contact page opens an email in your own mail app to prioritypropertypros@gmail.com. PPP does not store that form on its servers.

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

When you delete your account, you type DELETE. The product then deletes the login and the rows tied to that account, including that person’s bookings, connections, and estimates, and it removes files stored under that account in project photos and contractor documents. Agreement-acceptance rows are removed with the profile. The $9.99 charge rows tied to the profile are removed with it. Processor event rows can remain with the profile id cleared. It also writes an audit entry that the account was deleted. References you left on someone else’s record, such as an approval you performed, are cleared off that record rather than deleting the other person’s account. You cannot delete the last active admin account.

Stripe keeps the payment record under Stripe’s policy. PPP cannot delete the card data it never stored. Deleting an account does not refund the $9.99 or a $4.99 Connection Fee.

The product does not publish a separate multi-year retention table. There is no fixed “we keep everything for X years” rule in the software. An acceptance row stays while the account stays, including older versions you accepted before a later one.

## 9. Your choices and your rights

You can update profile and notification settings in the app, turn push and email categories off, unsubscribe from a notification email, and delete your account as described in the [Terms of Use](/terms).

This policy is written for people in the United States, including Texas. The Texas Data Privacy and Security Act (TDPSA) gives covered businesses’ consumers the right to access, correct, delete, and obtain a copy of personal data, and to opt out of sale, targeted advertising, and certain profiling. PPP does not sell personal data and does not run targeted advertising or ad profiling. A Texas attorney should confirm whether the TDPSA’s revenue and volume thresholds make PPP a covered business. You may email [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com) to ask for access, a correction, a copy, or deletion either way. PPP will not discriminate against you for asking. If PPP denies a request, you may reply to that email and ask for another look.

PPP will respond within the time the law that applies to the request requires. This draft does not invent a shorter promise.

## 10. Children

The marketplace is for adults hiring and doing property work. It is not directed to children.

[OWNER DECISION: set the minimum age. This draft proposes that people under 18 may not create an account. The signup form does not ask for a date of birth and does not block an under-18 signup today. Do not treat this draft as a working age gate.]

## 11. Security

The site is served over HTTPS. Database access for signed-in users goes through row-level security and checked server functions. Admin accounts can be required to use a second factor. No method of storage or transmission is perfect. Email [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com) if you believe your account is being misused.

## 12. Changes

PPP will post an updated policy on this page and change the effective date at the top. That posting is the notice. For a material change, PPP will also email the address on the account when PPP has that address. Notification settings do not have a separate switch for legal updates. The new version becomes the agreement PPP can require only after `legal_acceptance_required` is turned on. Until then, the server does not reject a signup for these drafts. After it is on, a new signup must accept the current version or the server will not create the account, and that acceptance is stored as a signup. If you already have an account, the next sign-in asks you to accept, and that acceptance is stored separately as a sign-in, with the version and the time. You can still view your data before you do. Nothing is deleted.

## 13. Contact

Privacy questions and privacy requests: [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com).
$ppp_legal_privacy_policy$,
  false,
  'ALL',
  false
);

-- LEGAL_BODY slug=refund-cancellation version=1 file=docs/legal/refund-cancellation-policy.md
INSERT INTO public.agreements (slug, title, version, body, is_current, audience, published)
VALUES (
  'refund-cancellation',
  'Refund & Cancellation Policy',
  1,
  $ppp_legal_refund_cancellation$
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

Questions about a platform fee: [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com). Include the account email and, if you have it, the project. Emailing does not by itself create a refund.
$ppp_legal_refund_cancellation$,
  false,
  'ALL',
  false
);

-- LEGAL_BODY slug=community-guidelines version=1 file=docs/legal/community-guidelines.md
INSERT INTO public.agreements (slug, title, version, body, is_current, audience, published)
VALUES (
  'community-guidelines',
  'Community Guidelines',
  1,
  $ppp_legal_community_guidelines$
# Community Guidelines

> Draft for owner review. This is not legal advice. Have a Texas attorney review it before anyone relies on it and before it is published. These pages stay off prioritypropertypros.com until the owner approves the wording and turns them on. This draft does not change the live signup record until the new database migration is applied. Do not apply that migration until the wording is approved.

Effective date: [OWNER DECISION: the calendar date these guidelines take effect]

PPP does not require acceptance of this draft while the platform setting `legal_acceptance_required` is off. That setting ships off. After it is turned on, a new signup records acceptance of the current version and the time as a signup. Someone who already has an account is prompted at the next sign-in, can still view their data, and any acceptance is stored separately as a sign-in. Turning the setting on does not delete an account.

## Plain-language summary

- Be accurate, be lawful, and use the marketplace for real home-service projects.
- Do not swap phone numbers, email addresses, or street addresses to skip the $4.99 Connection Fee.
- Do not harass people, post someone else’s private information, or pretend PPP did the work.
- PPP can warn, suspend, or close an account. One automatic text block is not an automatic permanent ban.
- PPP is not the employer, the general contractor, or a guarantor of anyone on the site.

These guidelines are part of the [Terms of Use](/terms). Reviews and photos also follow the [Review & Content Guidelines](/content-guidelines).

## 1. Who this covers

These guidelines cover customers, contractors, and anyone else using a Priority Property Pros account. Contractors are independent businesses under the [Contractor Participation Terms](/contractor-terms). Following these guidelines does not make a contractor an employee of Priority Property Pros LLC, and it does not mean PPP has licensed, insured, bonded, or background-checked that contractor.

## 2. Honest use

Do:

- Give your own name and a real email and phone you can answer.
- Describe the project, the trade, and the service area truthfully.
- Use messages for the project you connected on.
- Keep login details to yourself.

Do not:

- Create an account for a person you are not allowed to bind, or hold yourself out as PPP.
- Post a project you do not intend to consider, or a profile for work you do not do.
- Impersonate another customer, contractor, or PPP.
- Scrape the site, probe other people’s private rows, or attempt to bypass row-level security.
- Upload malware or interfere with the service.
- Use the site for anything illegal.

## 3. Contact details and the Connection Fee

Before a paid Connect, do not put a phone number, email address, website, social handle, QR code, or exact street address in a project, profile, estimate, or message in order to hire off the platform and skip the $4.99 Connection Fee. The product rejects obvious contact text. The scanner is not a surveillance program and it does not catch every disguise.

After a paid Connect, the customer may share their own contact and project address with that contractor through the share control. Do not publish the other person’s phone, email, or street on a public page or in a review. The message box still rejects phone numbers, email addresses, and street addresses.

There is no refund of a Connection Fee because a message was blocked or an account was warned for this rule. See the [Refund & Cancellation Policy](/refunds).

## 4. How you treat people

Do not harass, threaten, or discriminate against another person through the marketplace. Do not send repeated unwanted contact after a project is cancelled or a connection is closed. Do not post another person’s private information.

PPP does not provide a “block this pro” button today. The database has a relationship status that would remove a pro from Hire Again. These guidelines do not promise that button. You can cancel a project when the product allows it, stop new connections, and email [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com).

## 5. Enforcement

PPP may remove content, reject a contractor application, or suspend, disable, or close an account when these guidelines or the Terms of Use are broken, or when the use looks harmful or fraudulent. The product does not promise a particular number of warnings. For contact-swapping, the intended path is a warning, then suspension or termination for repeated abuse, not an automatic permanent ban on a single detection. Suspension is an admin action. The text filter itself only rejects the text.

Enforcement is not a finding that someone is licensed, insured, bonded, or background-checked, and it is not a promise that every violation will be caught.

## 6. Contact

Report a marketplace problem to [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com). Job-site disputes stay between the customer and the contractor.
$ppp_legal_community_guidelines$,
  false,
  'ALL',
  false
);

-- LEGAL_BODY slug=review-content version=1 file=docs/legal/review-content-guidelines.md
INSERT INTO public.agreements (slug, title, version, body, is_current, audience, published)
VALUES (
  'review-content',
  'Review & Content Guidelines',
  1,
  $ppp_legal_review_content$
# Review & Content Guidelines

> Draft for owner review. This is not legal advice. Have a Texas attorney review it before anyone relies on it and before it is published. These pages stay off prioritypropertypros.com until the owner approves the wording and turns them on. This draft does not change the live signup record until the new database migration is applied. Do not apply that migration until the wording is approved.

Effective date: [OWNER DECISION: the calendar date these guidelines take effect]

PPP does not require acceptance of this draft while the platform setting `legal_acceptance_required` is off. That setting ships off. After it is turned on, a new signup records acceptance of the current version and the time as a signup. Someone who already has an account is prompted at the next sign-in, can still view their data, and any acceptance is stored separately as a sign-in. Turning the setting on does not delete a review, a photo, or an account.

## Plain-language summary

- A review of a hired job is about that job, not a review of PPP. The author can edit it for 30 days.
- A review of the PPP marketplace is separate. It is checked before it is public, and an admin can approve or reject it with a written reason.
- Portfolio photos stay in review until an admin approves them. Public pages do not show the original file.
- Do not put phone numbers, email addresses, or street addresses in reviews or public text.
- A review is not a statement that PPP licensed, insured, bonded, or background-checked anyone.

These guidelines are part of the [Terms of Use](/terms). Conduct rules are in the [Community Guidelines](/community-guidelines).

## 1. Two different reviews

**Job reviews.** After both sides confirm Hired, either party can review the other. That review is not a review of the PPP marketplace, and it is not a Google review. The author can edit the stars or the text for 30 days after it is posted. That length is a server setting (`booking_review_edit_window_days`). If the setting is missing, the window is still 30 days. After the window closes, the edit control goes away. Public review text drops phone numbers, email addresses, and web addresses, and it drops a review body that contains that contractor’s business name or personal name.

**Marketplace reviews.** A signed-in user can leave one review of Priority Property Pros itself. Those reviews are not Google reviews. They are checked for length, a rating from 1 to 5, and contact details, and then they are approved. An admin can later approve or reject one. Both decisions require a written reason of 3 to 500 characters. The reason is stored in the audit log and is not shown on the public review.

Stars and text must describe your own experience. Do not review a job you were not part of. Do not offer or accept anything of value for a review. Do not use a review to publish someone’s phone, email, or home address, or to accuse PPP of being the contractor who did the work.

## 2. Photos and other content

Project photos should show the work area and should not include house numbers, faces, license plates, or contact details. PPP does not run image text recognition, so a photo can still contain something the text scanner would have blocked. A contractor viewing a project can report a photo. The report stores the reporter, the target, and the reason. An admin can read reports. The current screens do not include a separate admin inbox just for those reports.

Portfolio photos start in review. They are not public until an admin marks them approved. Public pages show the approved caption with a generic illustration, not the original file, the file name, or the photo’s location metadata. An admin can hide a photo instead. PPP does not strip camera location data from the original file on the server. The original stays in private storage.

Profile text, estimates, and messages follow the same contact rule as the [Community Guidelines](/community-guidelines). You keep ownership of what you submit. You give PPP permission to host and moderate it as the product actually does.

## 3. What content does not mean

A review, a star rating, a portfolio caption, or an “Approved platform profile” badge is not a PPP inspection of the work. It is not a statement that the contractor is licensed, insured, bonded, or background-checked. Contractor-provided license or insurance fields stay contractor-provided. PPP does not currently verify licenses, insurance, or workmanship.

The website does not currently give a customer a “block this pro” button. A relationship status named blocked exists in the database and would remove a pro from Hire Again. These guidelines do not promise the button. You may still decline an estimate, stop new connections, and cancel a project when the product allows it.

## 4. Moderation

PPP may refuse, edit display of, or remove content that breaks these guidelines, the Community Guidelines, or the Terms of Use, including by rejecting a marketplace review or hiding a photo. Moderation is not a ruling on a job dispute and it does not refund a $9.99 activation or a $4.99 Connection Fee.

## 5. Contact

Questions about a review or a photo: [prioritypropertypros@gmail.com](mailto:prioritypropertypros@gmail.com).
$ppp_legal_review_content$,
  false,
  'ALL',
  false
);

-- LEGAL_BODY slug=contractor-participation version=1 file=docs/legal/contractor-participation-terms.md
INSERT INTO public.agreements (slug, title, version, body, is_current, audience, published)
VALUES (
  'contractor-participation',
  'Contractor Participation Terms',
  1,
  $ppp_legal_contractor_participation$
# Contractor Participation Terms

> Draft for owner review. This is not legal advice. Have a Texas attorney review it before anyone relies on it and before it is published. These pages stay off prioritypropertypros.com until the owner approves the wording and turns them on. This draft does not change the live signup record until the new database migration is applied. Do not apply that migration until the wording is approved.

Effective date: [OWNER DECISION: the calendar date these terms take effect]

## Plain-language summary

- If you sign up as a contractor, you are an independent business. You are not an employee, agent, or partner of Priority Property Pros LLC.
- PPP does not perform the work, does not act as the general contractor, and does not guarantee you, the customer, or the job.
- PPP does not state that you are licensed, insured, bonded, or background-checked. Putting a license or insurance note on your profile does not mean PPP verified it.
- You pay the $9.99 one-time activation, then $4.99 each time you choose to Connect, including when a past customer posts a new project and you connect again. The site says both fees are non-refundable.
- You choose which jobs to take. The customer pays you directly. PPP does not take a percentage of the job.

These terms are part of the [Terms of Use](/terms) for contractor accounts. Customers can read them. Only contractor signups are asked to accept them, and only those acceptances are stored on contractor accounts. The [Refund & Cancellation Policy](/refunds) and the [Community Guidelines](/community-guidelines) also apply.

## 1. Independent business

You provide services to customers as an independent business. You are not an employee of PPP. You are not PPP’s agent. You may not present yourself as PPP, as employed by PPP, or as a crew PPP sent. PPP does not withhold employment taxes for you, does not set your hours, and does not supervise the job site.

You are responsible for your own tools, helpers, taxes, permits, and the agreements you make with customers. Any license, insurance, or bond that the law or a customer requires is your obligation. PPP does not require proof of insurance in the product, and these terms do not add an insurance requirement. PPP also does not run a background-check program, and these terms do not create one.

## 2. What PPP does not claim about you

Admin approval means PPP has accepted the profile onto the marketplace. It is not a license check, an insurance check, a bond check, a background check, or a workmanship guarantee. Paying $9.99 does not approve you.

You may enter a license number, an insurance carrier, and other credentials. Those entries are contractor-provided. The public directory does not show the license number. If a badge is shown, its wording is limited to labels such as “Approved platform profile,” “Contractor-provided license,” “Contractor-provided insurance,” or “Contractor-provided credential.” PPP does not currently verify licenses, insurance, or workmanship. Customers are told to ask for proof themselves before they hire.

Nothing on the site means you are licensed, insured, bonded, or background-checked.

## 3. Fees you pay PPP

You pay a one-time $9.99 account activation when that Stripe Checkout is turned on. Then $0 a month. You pay $4.99 each time you choose to Connect on a project. That includes a new project from a customer you have worked with before. Hire Again does not waive the Connection Fee.

The Connection Fee buys connection access for that project: messaging with that customer, and the customer’s option to share contact details. It does not buy the job. The customer may hire someone else or hire no one. The [Refund & Cancellation Policy](/refunds) says both the $9.99 and the $4.99 are non-refundable, including in those cases. This app does not issue those refunds.

You do not pay PPP a percentage of the job. The customer pays you directly for the work. PPP does not collect that payment.

## 4. How you get work

PPP may offer you projects that match the trade and service area you enter. A project has up to three occupying connection slots. You may pass. Passing an unpaid offer frees the slot. You are not required to Connect.

Your business name stays off the public directory until a paid Connect on a project. Phone, email, website, and street stay off that public card. Do not put contact details in your public text to route around the Connection Fee. The product rejects obvious contact text. See the [Community Guidelines](/community-guidelines).

After you pay $4.99 and the server verifies it, you and that customer can message on that project. The message box still blocks phone numbers, email addresses, and street addresses. You see the customer’s phone, email, and street only if that customer uses “Share my contact & address,” or if an admin unlocks that specific record with a reason.

## 5. Your work and your disputes

You set your estimate and your terms with the customer. PPP does not guarantee that the customer will pay you, that the description is complete, or that the job will proceed. If you and the customer disagree, that dispute is between you. PPP is not the general contractor and is not a guarantor. A Disputed booking status is not a decision by PPP and is not a refund of the Connection Fee.

## 6. Acceptance

Contractor signup uses the same checkbox as any other signup, and the checkbox names these Contractor Participation Terms. While `legal_acceptance_required` is off, the server does not reject the account for these drafts. After that setting is on, the server stores the version and the time as a signup acceptance, and a new contractor account is not created if the current version was not accepted. If these terms are updated after you already have an account, the next sign-in asks you to accept. That acceptance is stored separately as a sign-in, with its own version and time. You can still view your jobs, messages, and account data before you accept. Nothing is deleted.
$ppp_legal_contractor_participation$,
  false,
  'CONTRACTOR',
  false
);

CREATE OR REPLACE FUNCTION public.legal_acceptance_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT value_int FROM public.platform_settings WHERE key = 'legal_acceptance_required'),
    0
  ) <> 0;
$$;

COMMENT ON FUNCTION public.legal_acceptance_required() IS
  'True only when platform_settings.legal_acceptance_required is a non-zero integer. Missing or 0 is off. Does not expose other settings and does not grant access to profiles, messages, or payment rows.';

REVOKE ALL ON FUNCTION public.legal_acceptance_required() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.legal_acceptance_required() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_legal_acceptance_required(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SET is_current = true
  WHERE (slug, version) IN (
    ('terms-of-use', 3),
    ('privacy-policy', 2),
    ('refund-cancellation', 1),
    ('community-guidelines', 1),
    ('review-content', 1),
    ('contractor-participation', 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_legal_acceptance_required(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_legal_acceptance_required(boolean) TO service_role;

COMMENT ON FUNCTION public.set_legal_acceptance_required(boolean) IS
  'Service role only. Turns legal_acceptance_required on or off. Enabling makes the draft agreement versions current. Disabling does not delete acceptances, profiles, projects, messages, reviews, photos, or payment rows, and does not change Stripe functions or fee flags.';

CREATE OR REPLACE FUNCTION public.assert_signup_agreement_versions(
  meta jsonb,
  p_account_type public.account_type
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  requested jsonb;
  rec record;
  raw_version text;
BEGIN
  IF NOT public.legal_acceptance_required() THEN
    RETURN;
  END IF;

  IF coalesce(meta->>'accepted_terms', 'false') NOT IN ('true', '1', 'yes') THEN
    RAISE EXCEPTION 'terms_not_accepted'
      USING ERRCODE = 'P0001',
            HINT = 'Signup requires explicit acceptance of the current legal agreements.';
  END IF;

  BEGIN
    requested := (meta->>'accepted_agreement_versions')::jsonb;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'agreement_version_mismatch'
        USING ERRCODE = 'P0001',
              HINT = 'Refresh the signup page and accept the current agreements.';
  END;

  IF requested IS NULL OR jsonb_typeof(requested) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'agreement_version_mismatch'
      USING ERRCODE = 'P0001',
            HINT = 'Refresh the signup page and accept the current agreements.';
  END IF;

  FOR rec IN
    SELECT agreement.slug, agreement.version
    FROM public.agreements AS agreement
    WHERE agreement.is_current
      AND (
        agreement.audience = 'ALL'
        OR (agreement.audience = 'CONTRACTOR' AND p_account_type = 'CONTRACTOR')
      )
  LOOP
    raw_version := requested->>rec.slug;
    IF raw_version IS NULL OR raw_version !~ '^[0-9]+$' OR raw_version::integer IS DISTINCT FROM rec.version THEN
      RAISE EXCEPTION 'agreement_version_mismatch'
        USING ERRCODE = 'P0001',
              HINT = format('Accept the current %s (version %s).', rec.slug, rec.version);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_current_agreement_acceptances(
  p_profile_id uuid,
  p_user_agent text,
  p_account_type public.account_type,
  p_source text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer;
BEGIN
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile id is required';
  END IF;

  IF p_source IS DISTINCT FROM 'signup' AND p_source IS DISTINCT FROM 'sign_in' THEN
    RAISE EXCEPTION 'invalid agreement acceptance source';
  END IF;

  INSERT INTO public.agreement_acceptances (
    agreement_id,
    profile_id,
    user_agent,
    agreement_version,
    accepted_at,
    acceptance_source
  )
  SELECT
    agreement.id,
    p_profile_id,
    nullif(left(coalesce(p_user_agent, ''), 180), ''),
    agreement.version,
    now(),
    p_source
  FROM public.agreements AS agreement
  WHERE agreement.is_current
    AND (
      agreement.audience = 'ALL'
      OR (agreement.audience = 'CONTRACTOR' AND p_account_type = 'CONTRACTOR')
    )
  ON CONFLICT (agreement_id, profile_id) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_current_agreements(p_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account public.account_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;

  IF NOT public.legal_acceptance_required() THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT profile.account_type
  INTO account
  FROM public.profiles AS profile
  WHERE profile.id = auth.uid();

  IF account IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  PERFORM public.record_current_agreement_acceptances(auth.uid(), p_user_agent, account, 'sign_in');

  RETURN (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'slug', agreement.slug,
          'version', acceptance.agreement_version,
          'accepted_at', acceptance.accepted_at,
          'acceptance_source', acceptance.acceptance_source
        )
        ORDER BY agreement.slug
      ),
      '[]'::jsonb
    )
    FROM public.agreement_acceptances AS acceptance
    JOIN public.agreements AS agreement ON agreement.id = acceptance.agreement_id
    WHERE acceptance.profile_id = auth.uid()
      AND agreement.is_current
      AND acceptance.acceptance_source = 'sign_in'
      AND (
        agreement.audience = 'ALL'
        OR (agreement.audience = 'CONTRACTOR' AND account = 'CONTRACTOR')
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.missing_current_agreements()
RETURNS TABLE (slug text, title text, version integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;

  IF NOT public.legal_acceptance_required() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT agreement.slug, agreement.title, agreement.version
  FROM public.agreements AS agreement
  JOIN public.profiles AS profile ON profile.id = auth.uid()
  WHERE agreement.is_current
    AND (
      agreement.audience = 'ALL'
      OR (agreement.audience = 'CONTRACTOR' AND profile.account_type = 'CONTRACTOR')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.agreement_acceptances AS acceptance
      WHERE acceptance.agreement_id = agreement.id
        AND acceptance.profile_id = auth.uid()
    )
  ORDER BY agreement.slug;
END;
$$;

COMMENT ON FUNCTION public.missing_current_agreements() IS
  'Lists current agreements this account has not accepted, and only when legal_acceptance_required is on. Returns no rows when the setting is off. Does not block reads of projects, messages, or profiles and does not delete anything.';

COMMENT ON FUNCTION public.accept_current_agreements(text) IS
  'Records a sign-in acceptance of the current versions and timestamps for auth.uid() when legal_acceptance_required is on. Does nothing when the setting is off. Does not change account_status, hide data, or delete rows.';

REVOKE ALL ON FUNCTION public.assert_signup_agreement_versions(jsonb, public.account_type) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_current_agreement_acceptances(uuid, text, public.account_type, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_current_agreements(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.missing_current_agreements() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.accept_current_agreements(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.missing_current_agreements() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_type public.account_type;
  initial_status public.account_status;
  initial_fee public.signup_fee_status;
  meta jsonb;
BEGIN
  meta := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  safe_type := public.permitted_signup_account_type(meta->>'account_type');
  IF public.legal_acceptance_required() THEN
    PERFORM public.assert_signup_agreement_versions(meta, safe_type);
  END IF;

  IF safe_type = 'CUSTOMER' AND NEW.email_confirmed_at IS NOT NULL THEN
    initial_status := 'ACTIVE';
  ELSE
    initial_status := 'PENDING';
  END IF;

  IF safe_type IN ('CUSTOMER', 'CONTRACTOR') THEN
    initial_fee := 'UNPAID';
  ELSE
    initial_fee := 'NOT_REQUIRED';
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    account_type,
    account_status,
    signup_fee_status
  ) VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(meta->>'first_name', ''),
    coalesce(meta->>'last_name', ''),
    nullif(meta->>'phone', ''),
    safe_type,
    initial_status,
    initial_fee
  );

  IF safe_type = 'CONTRACTOR' THEN
    INSERT INTO public.contractor_profiles (
      profile_id,
      business_name,
      primary_trade,
      service_area,
      bio,
      onboarding_status
    ) VALUES (
      NEW.id,
      coalesce(meta->>'business_name', ''),
      nullif(meta->>'primary_trade', ''),
      nullif(meta->>'service_area', ''),
      nullif(meta->>'bio', ''),
      'IN_PROGRESS'
    );
  ELSIF safe_type = 'VERIFIER' THEN
    INSERT INTO public.verifier_profiles (
      profile_id,
      coverage_area,
      bio,
      onboarding_status
    ) VALUES (
      NEW.id,
      nullif(meta->>'coverage_area', ''),
      nullif(meta->>'bio', ''),
      'IN_PROGRESS'
    );
  END IF;

  IF public.legal_acceptance_required() THEN
    PERFORM public.record_current_agreement_acceptances(
      NEW.id,
      nullif(left(coalesce(meta->>'user_agent', ''), 180), ''),
      safe_type,
      'signup'
    );
  ELSIF coalesce(meta->>'accepted_terms', 'false') IN ('true', '1', 'yes') THEN
    INSERT INTO public.agreement_acceptances (
      agreement_id,
      profile_id,
      user_agent,
      agreement_version,
      accepted_at,
      acceptance_source
    )
    SELECT
      agreement.id,
      NEW.id,
      nullif(left(coalesce(meta->>'user_agent', ''), 180), ''),
      agreement.version,
      now(),
      'signup'
    FROM public.agreements AS agreement
    WHERE agreement.is_current
      AND agreement.slug IN ('terms-of-use', 'privacy-policy')
    ON CONFLICT (agreement_id, profile_id) DO NOTHING;
  END IF;

  PERFORM public.write_audit_log(
    NEW.id,
    'profile.created',
    'profiles',
    NEW.id,
    jsonb_build_object(
      'account_type', safe_type,
      'requested_account_type', meta->>'account_type',
      'signup_fee_status', initial_fee,
      'legal_acceptance_required', public.legal_acceptance_required()
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates the profile. Agreement enforcement runs only when legal_acceptance_required is on. When it is off, signup is not rejected and only the already-current terms and privacy rows are recorded if the checkbox was accepted. Does not hide or delete existing account data and does not change Stripe or fee flags.';
