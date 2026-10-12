-- Legal agreement versions.
-- Version 20261018000001. 20261015000001 is already used on main by
-- paid_connection_booking_contact.
-- NOT APPLIED. Do not run this against the hosted database until the owner
-- approves publication. Applying it does NOT publish the pages and does NOT
-- turn acceptance on. platform_settings.legal_acceptance_required is inserted
-- as 0. Service role may later call set_legal_acceptance_required(true) after
-- the pages are live. That call sets published and published_at on these
-- versions. It does not change payment flags, Stripe functions, or delete
-- account data. Calling it with false sets the flag to 0 and does not clear
-- published_at.
-- Rows stay is_current = false and published = false until that enable call,
-- so the Data API does not serve them. The website routes stay off unless
-- VITE_PUBLISH_LEGAL_PAGES is the string true.

ALTER TABLE public.agreements
  ADD COLUMN audience text NOT NULL DEFAULT 'ALL',
  ADD COLUMN published boolean NOT NULL DEFAULT false,
  ADD COLUMN published_at timestamptz;

COMMENT ON COLUMN public.agreements.published_at IS
  'Effective date. Set to now() inside set_legal_acceptance_required(true) when this version is published, and only if it is still null. Disabling the setting does not clear it.';

ALTER TABLE public.profiles
  ADD COLUMN age_18_affirmed_at timestamptz;

COMMENT ON COLUMN public.profiles.age_18_affirmed_at IS
  'Time of an 18-or-older affirmation recorded at signup or on the later acceptance prompt, and only when legal_acceptance_required is on. The form does not collect a date of birth. This is an affirmation, not a verification of age. While the setting is off, signup is not rejected for a missing affirmation and this column stays null.';

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

-- Acceptances are written only by handle_new_user (signup) and accept_current_agreements()
-- (sign-in prompt), which also records the 18-or-older affirmation. A direct REST insert
-- would skip that affirmation, so the old insert-own policy is removed.
DROP POLICY IF EXISTS agreement_acceptances_insert_own ON public.agreement_acceptances;
REVOKE INSERT ON public.agreement_acceptances FROM authenticated;

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
  'Terms of Service',
  3,
  $ppp_legal_terms_of_use$
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
- Priority Help, a support chat, is not yet available. Section 14 describes how it would work if PPP turns it on.
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

**Priority Help (not yet available).** Priority Help is a support chat that PPP has built but has not turned on. It is not available today. If PPP turns it on, automatic replies are written by an AI assistant from PPP’s published help articles and current fees. An automatic reply can be incomplete or wrong. It is not legal, tax, or construction advice, and it does not change these terms, the [Refund & Cancellation Policy](/refunds), or a fee. The assistant cannot issue a refund, approve a refund exception, change an account, or share another person’s contact details. Choose Talk to Support, or use the [Contact us page (prioritypropertypros.com/contact)](/contact), to reach a person. PPP stores Priority Help chats and deletes them on the schedule in the [Privacy Policy](/privacy): a chat started without signing in is deleted 90 days after its last message, unless a ticket is still open. To write a reply, PPP sends the chat text to OpenAI after removing the email addresses, phone numbers, and street addresses it detects. Do not type card numbers, passwords, or another person’s contact details into the chat. PPP may limit, pause, or turn off Priority Help at any time, and may refuse messages that try to misuse it.

## 15. Changes

PPP will post updated terms on this page. The effective date of a version is its publication date. That posting is the notice. For a material change, PPP will also email the address on the account when PPP has that address. Notification settings do not have a separate switch for legal updates.

A new version is required from its publication date. New accounts must accept the current version and affirm that they are 18 or older, or the account is not created. Existing users are prompted on the next sign-in, as section 3 describes, including that age affirmation. They are not locked out of viewing their information or deleting the account. New marketplace actions wait on acceptance of the current versions. The version and the time are the record of what was accepted. The acceptance from a later sign-in is stored separately from the acceptance recorded when the account was created.

## 16. Contact and requests

Questions about these terms: use the [Contact us page (prioritypropertypros.com/contact)](/contact).

Mailing address: Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US.

Privacy requests (access, correction, a copy, deletion, or an opt-out) and refund-exception requests also go through the Contact us page. They can also be mailed to the mailing address above. The [Privacy Policy](/privacy) describes privacy requests. The [Refund & Cancellation Policy](/refunds) describes refund exceptions, including who reviews them and that an approved refund is sent from Stripe’s dashboard. Sending a request does not by itself change an account or create a refund.

Use the Contact us page for marketplace questions. Job responsibility is in Independent Marketplace and Contractor Responsibility.
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
- Priority Help, a support chat, is not yet available. The Priority Help parts of this policy describe how it would work and apply only if PPP turns it on. If it is turned on, PPP stores the chat, and the text you type is sent to OpenAI to write a reply after PPP removes the email addresses, phone numbers, and street addresses it detects. A chat started without signing in is deleted automatically 90 days after its last message. Details are in sections 2, 5, 6, and 8.
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

**Priority Help chat (not yet available).** Priority Help is a support chat that PPP has built but has not turned on. It is not available today. While it is off, none of this is collected and nothing is sent to OpenAI. If PPP turns it on, PPP stores the messages you type, the replies, and the times. If you are signed in, the chat is linked to your account. If you are not signed in, the chat is linked to a random code saved in your browser, not to your name. To limit abuse, PPP stores a one-way coded form of your network address rather than the address itself. Automatic replies are written by an AI assistant, not a person. A PPP admin can read any Priority Help chat, and a person replies only after you choose Talk to Support. For each automatic reply, PPP also records the AI model, the amount of text processed, and the cost, without the chat text. Do not type phone numbers, email addresses, street addresses, card numbers, passwords, or another person’s details into the chat.

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
- answer support questions in the Priority Help chat, if PPP turns it on
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
- **OpenAI (only if Priority Help is turned on).** Priority Help is not turned on today, and until it is, OpenAI receives no information from PPP. Once it is enabled, PPP sends OpenAI the message you type in that chat and up to eight earlier messages of the same chat, after removing the email addresses, phone numbers, and street addresses that PPP’s filter detects. A filter can miss details written in an unusual way, so do not type them. PPP’s published help articles and the current fee amounts are sent with it. PPP does not send your name, your account details, your projects, your messages with contractors or customers, your photos, or your payment details to OpenAI for this. PPP uses OpenAI’s API and does not opt in to sharing that data with OpenAI for training. OpenAI states that data sent to its API is not used to train its models unless the customer opts in. OpenAI also states that it may keep API inputs and outputs in abuse-monitoring logs for up to 30 days, longer only when the law requires it or when it is reasonably necessary to protect OpenAI’s services or others from harm, and that access to that data is limited to authorized OpenAI staff and contractors bound by confidentiality who review for abuse and misuse. Sources: OpenAI, “Data controls in the OpenAI platform” (https://platform.openai.com/docs/guides/your-data) and “Enterprise privacy at OpenAI” (https://openai.com/enterprise-privacy/), both checked October 11, 2026.

PPP does not sell personal information to these companies. They process it to provide the service.

## 6. Cookies and local storage

PPP does not run an ad-cookie banner because the current site does not use advertising cookies. The browser storage the product does use:

- **Login session.** The login service keeps the session in the browser’s local storage so you stay signed in. A password-reset request uses separate browser storage and does not replace that session.
- **Unposted project draft and a few site-update flags.** Session storage holds the project wizard until you post, and it holds a short flag so a site update does not reload in the middle of a form.
- **Priority Help guest code (only if Priority Help is turned on).** If you use Priority Help without signing in, the browser keeps a random code in local storage so the chat can continue on your next visit. Clearing site data removes the code, and the chat then starts over.
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

**Priority Help chats (only if Priority Help is turned on).** A chat started without signing in is deleted automatically 90 days after its last message. If that chat became a support ticket that is still open, it is kept until the ticket is resolved or closed, and is then deleted automatically 90 days later. A signed-in chat is deleted automatically 365 days after it is resolved or closed, or 365 days after its last message if it never became a ticket. Deleting your account deletes your Priority Help chats in the same step. The automatic deletion runs once a day, so a chat can remain up to one more day. PPP keeps a usage record for each automatic reply (the date, the AI model, the amount of text processed, and the cost) without the chat text; once the chat is deleted, that record no longer links to it. OpenAI’s own retention is described in section 5.

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

This is not legal advice.

Effective date: the date this version is published, shown at the top of this page.

A new account accepts the current version at signup, and PPP records the version and the time. Someone who already has an account is asked at the next sign-in to accept the current versions and to affirm that they are 18 or older. That affirmation is a statement the person makes. It is not a verification of age. That later acceptance is stored separately from the acceptance recorded when the account was created. They can still view their information and delete the account. Requiring acceptance does not delete an account or a payment record.

## Plain-language summary

- The $9.99 account activation is a one-time fee for customers and contractors. It buys account activation. It is delivered when the server verifies the Stripe payment and marks the fee paid. It is not a monthly subscription. It does not approve a contractor, unlock contact, or start a job.
- The $4.99 Connection Fee is what a contractor pays to connect on one project. It buys messaging for that pair and the customer’s option to share contact. It is delivered when the server verifies the payment and unlocks that connection. A rehire on a new project is another connection and another $4.99. Clicking Connect is not delivery.
- The $9.99 activation fee is generally non-refundable once account activation is delivered, except for a duplicate charge, an erroneous charge, a refund the law requires, or an approved exception.
- The $4.99 Connection Fee is non-refundable once the connection is delivered. If a contractor is charged but the connection can't be provided (the project was cancelled or closed, the opportunity expired, the customer blocked the contractor, or the same connection was charged twice), PPP refunds the $4.99 automatically to the original payment method. A refund the law requires, or an approved exception, is also available.
- Automatic Connection Fee refunds are sent through Stripe. Other exceptions are reviewed by the owner and, if approved, refunded through Stripe. Card data is entered at Stripe. PPP does not store card numbers.
- PPP does not collect the payment for the work. Cancelling a job does not create a PPP refund of that job payment, because PPP never held it.
- Cancelling a project does not refund a delivered platform fee and does not make PPP a party to the job. Job responsibility is in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms).

This policy is part of the [Terms of Service](/terms). The [Privacy Policy](/privacy) describes payment records.

## 1. The two platform fees

PPP charges only these platform fees. Amounts are set on the server in US dollars. The browser does not choose the price. There is no monthly subscription and no commission on the job.

**Account activation, $9.99, one time.** Customers and contractors each pay it once to open an account, and only when PPP has turned on Stripe Checkout for that fee. It is not $9.99 a month. There is no monthly charge to keep an account. Admin and verifier accounts are not charged. It purchases account activation only. It does not approve a contractor, unlock anyone’s contact details, or start a job. A success page does not mark the fee paid. The service is delivered when the server checks the Stripe Checkout session, the price, and the amount, and marks the account paid.

**Connection Fee, $4.99 per project connection.** The contractor pays it only by choosing Connect, and only when that checkout is turned on. Customers do not pay a PPP Connection Fee. There is no bid fee. Submitting an estimate is not a separate PPP fee. It purchases connection access for that project: messaging with that customer, and the customer’s option to share contact details. It does not buy the job, a reply, or a promise that the work will happen. Clicking Connect is not delivery. The service is delivered when the server verifies the payment and unlocks that connection.

**Rehires.** Hire Again lists contractors a customer has finished a job with and starts a new project. That new project is a new connection. The contractor pays $4.99 again to Connect on it. A past connection does not waive the fee. The connection checkout does not apply a rehire discount.

While a checkout is turned off, PPP does not charge that fee. An unpaid or unverified connection does not unlock messaging or contact sharing. An abandoned unpaid Connect checkout can release a reserved slot after 30 minutes. Releasing an unpaid reservation is not a charge and is not a refund.

## 2. When a delivered fee stays paid

Once the applicable service is delivered, the fee is generally non-refundable:

- The $9.99 account activation fee is non-refundable once account activation is delivered, except for a duplicate charge, an erroneous charge, a refund the law requires, or an approved exception.
- The $4.99 Connection Fee is non-refundable once that connection is delivered, except for a refund the law requires or an approved exception. A Connection Fee charged for a connection that can't be provided is refunded automatically, as described below.
- Delivery of account activation is the server marking the fee paid after it verifies the Stripe Checkout session. Delivery of a connection is the server unlocking that connection after it verifies the payment.
- There is no refund under this general rule if the contractor is not hired, the customer chooses someone else, the customer cancels, the contractor changes their mind after the connection is delivered, the contractor passes after paying, or the parties later decide not to do the work.
- A Connection Fee on a rehire follows the same rule.
- Closing your account does not by itself refund either fee.

**Automatic Connection Fee refunds.** If a $4.99 Connection Fee is charged but the connection can't be provided, PPP refunds it automatically to the original payment method. That covers, for example, a project that was cancelled or closed, an opportunity that expired or is no longer open, a customer who blocked the contractor or stopped new connections, a reservation that expired before payment finished, and the same connection being charged twice. PPP checks these rules again after payment and before it unlocks the connection. A connection that was already delivered is never refunded automatically. Each automatic refund is for the $4.99 that was charged, is issued once, and is recorded. Stripe and the card issuer control how long the refund takes to appear. If the payment details do not match what PPP expected, the charge is held for owner review instead of being refunded automatically. You do not need to ask for an automatic refund.

**Activation fee charged but not delivered.** A $9.99 activation charge that does not result in account activation being marked paid is an erroneous charge under this policy. The product refunds an undelivered Connection Fee automatically. An undelivered activation fee is marked for owner review, and if the owner confirms it, the refund is issued through Stripe.

**Other exceptions.** A duplicate $9.99 charge, another erroneous charge, a refund the law requires, or an approved exception is reviewed by the owner. If the owner approves it, the refund is issued through Stripe. This policy does not promise that every request will be approved.

**How to ask.** Use the [Contact us page (prioritypropertypros.com/contact)](/contact). Include the account email, which fee ($9.99 activation or $4.99 Connection Fee), the amount, the date if you have it, and why you believe the charge is a duplicate, an erroneous charge, required by law, or another exception. You can also mail the same information to Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US. PPP may reply by email to the account email to confirm the request. The owner decides. PPP keeps a record of the request, the decision, and the Stripe refund reference when a refund is issued. Sending the request or letter does not by itself create a refund.

Nothing in this policy takes away a right that a Texas or federal law does not let a business waive.

## 3. Stripe

When checkout is on, you pay on Stripe Checkout. You enter the card at Stripe. PPP does not store the card number, the security code, or the full card data. PPP stores the payment references Stripe assigns, the amount ($9.99 or $4.99), the currency (US dollars), the status, and whether the fee was paid. Stripe’s own terms and privacy policy cover Stripe’s processing.

PPP does not use Stripe to collect, hold, or refund the customer’s payment for the work itself.

## 4. Cancelling a project or a booking

A customer can decline an estimate, stop new connections, and cancel a project when the product allows that status change. Pros already connected can still message. Cancelling a project does not refund a Connection Fee that was already delivered for that project, and it does not refund a delivered $9.99 activation, except for a duplicate charge, an erroneous charge, a refund the law requires, or an approved exception. If a contractor's Connection Fee payment goes through after the project was cancelled or closed, that connection can't be provided, and the $4.99 is refunded automatically under section 2.

A contractor can pass on an unpaid offer. Passing frees that slot for another contractor. Passing after a delivered Connect does not refund the $4.99 under the general rule in section 2.

A booking can move to Cancelled from the statuses the product allows. A completed booking is not cancelled by that same control. Cancelling a booking cancels the marketplace record of the hire. It does not move the job payment, because that payment is not in PPP. Cancellation terms for the work itself are covered in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms).

## 5. Job payment and job disputes

The customer pays the contractor directly for the job. PPP does not invoice that amount, does not take a percentage, and does not refund it. Who resolves a dispute about the work is in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms).

A booking status of Disputed, when it is set, is a label on the marketplace record. It is not a PPP ruling and it is not a refund of the $9.99 or the $4.99.

## 6. Contact

Questions about a platform fee: use the [Contact us page (prioritypropertypros.com/contact)](/contact). Include the account email and, if you have it, the project. Contacting PPP does not by itself create a refund.

Mailing address: Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US.
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

This is not legal advice.

Effective date: the date this version is published, shown at the top of this page.

A new account accepts the current version at signup, and PPP records the version and the time. Someone who already has an account is asked at the next sign-in to accept the current versions and to affirm that they are 18 or older. That affirmation is a statement the person makes. It is not a verification of age. That later acceptance is stored separately from the acceptance recorded when the account was created. They can still view their information and delete the account. Requiring acceptance does not delete an account.

## Plain-language summary

- Be accurate, be lawful, and use the marketplace for real home-service projects.
- Do not swap phone numbers, email addresses, or street addresses to skip the $4.99 Connection Fee.
- Do not harass people, post someone else’s private information, or pretend PPP did the work.
- You can report fraud, impersonation, harassment, threats, misleading profiles, suspected fake reviews, serious contractor misconduct, and rule violations. PPP may review a report. A review is not a decision about the construction work.
- PPP can warn, suspend, or close an account. One automatic text block is not an automatic permanent ban.
- Job responsibility is in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms).

These guidelines are part of the [Terms of Service](/terms). Reviews and photos also follow the [Review & Content Guidelines](/content-guidelines).

## 1. Who this covers

These guidelines cover customers, contractors, and anyone else using a Priority Property Pros account. Who performs the work is in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms). Contractor accounts also follow the [Contractor Participation Terms](/contractor-terms). These guidelines do not mean PPP has licensed, insured, bonded, or background-checked a contractor.

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
- Scrape the site, try to read or change another person’s private information, or try to get around the access limits.
- Upload malware or interfere with the service.
- Use the site for anything illegal.

## 3. Contact details and the Connection Fee

Before a paid Connect, do not put a phone number, email address, website, social handle, QR code, or exact street address in a project, profile, estimate, or message in order to hire off the platform and skip the $4.99 Connection Fee. The product rejects obvious contact text. That check is not a surveillance program and it does not catch every disguise.

After a paid Connect, the customer may share their own contact and project address with that contractor through the share control. Do not publish the other person’s phone, email, or street on a public page or in a review. The message box still rejects phone numbers, email addresses, and street addresses.

A blocked message or a warning for this rule does not, by itself, refund a Connection Fee that was already delivered. See the [Refund & Cancellation Policy](/refunds).

## 4. How you treat people

Do not harass, threaten, or discriminate against another person through the marketplace. Do not send repeated unwanted contact after a project is cancelled or a connection is closed. Do not post another person’s private information.

On an estimate or a booking, a customer can choose “Don't match me with this pro again.” That blocks the pro for that customer only. Matching skips that pro, the pro is left out of Hire Again, and the pro’s open, unaccepted offers on that customer’s other current projects close immediately. Paid connections and bookings are not changed. Work already underway stays as it is, and a paid Connection Fee stays paid. The customer can undo that from Blocked pros, and an admin can remove the block. A customer review of 1, 2, or 3 stars creates the same kind of block. A review of 4 or 5 stars does not. Raising that review to 4 or 5 stars does not remove it. A contractor’s review of a customer never creates a block. You can also cancel a project when the product allows it, stop new connections, and contact PPP through the [Contact us page (prioritypropertypros.com/contact)](/contact).

## 5. Reports

A homeowner or other account holder can report:

- fraud or impersonation
- harassment or threats
- a misleading profile
- a suspected fake review
- serious contractor misconduct
- a violation of these guidelines or the Terms of Service

Send the report through the [Contact us page (prioritypropertypros.com/contact)](/contact). The site does not have a separate in-app complaint center. A contractor can also report a project photo in the product. That report stores the reporter, the target, and the reason. An admin can read photo reports. The other person on a job can report that job review. An admin can hide a job review without deleting it. Marketplace reviews of PPP stay off the public page until an admin approves them. An admin who approves or rejects one records a written reason that is not shown on the public review. An admin can suspend, disable, or close an account.

PPP may review a report, ask for more information, moderate the content, suspend an account, or remove a contractor from the marketplace. PPP keeps the report and the decision in its records. PPP does not publish the other person’s private information in a public decision. A person who wants another look can reply to PPP’s answer. PPP does not promise to investigate every report or to resolve every report.

Reviewing a report is not a guarantee of workmanship, not an assumption of responsibility for the job, and not arbitration of a construction dispute. Disputes about the work stay in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms).

## 6. Enforcement

PPP may remove content, reject a contractor application, or suspend, disable, or close an account when these guidelines or the Terms of Service are broken, or when the use looks harmful or fraudulent. The product does not promise a particular number of warnings. For contact-swapping, the intended path is a warning, then suspension or termination for repeated abuse, not an automatic permanent ban on a single detection. Suspension is an admin action. The text filter itself only rejects the text.

Enforcement is not a finding that someone is licensed, insured, bonded, or background-checked, and it is not a promise that every violation will be caught. It is also not a ruling on a job-site dispute.

## 7. Contact

Report a marketplace problem through the [Contact us page (prioritypropertypros.com/contact)](/contact).

Mailing address: Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US.

Job-site disputes are covered in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms).
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

This is not legal advice.

Effective date: the date this version is published, shown at the top of this page.

A new account accepts the current version at signup, and PPP records the version and the time. Someone who already has an account is asked at the next sign-in to accept the current versions and to affirm that they are 18 or older. That affirmation is a statement the person makes. It is not a verification of age. That later acceptance is stored separately from the acceptance recorded when the account was created. They can still view their information and delete the account. Requiring acceptance does not delete a review, a photo, or an account.

## Plain-language summary

- A review of a hired job is about that job, not a review of PPP. The author can edit it for 30 days.
- A review of the PPP marketplace is separate. It stays off the public page until an admin approves it. An admin can approve or reject it with a written reason that is not shown publicly.
- Portfolio photos stay in review until an admin approves them. After approval, public pages show that approved photo through a short-lived link. Before a portfolio photo or project photo is uploaded, the app removes location information a camera stored in the file, such as GPS coordinates.
- Do not put phone numbers, email addresses, or street addresses in reviews or public text.
- A review is not a statement that PPP licensed, insured, bonded, or background-checked anyone.
- Suspected fake reviews and other content reports follow the Community Guidelines. Moderating content is not a decision about the construction work.

These guidelines are part of the [Terms of Service](/terms). Conduct rules and reports are in the [Community Guidelines](/community-guidelines).

## 1. Two different reviews

**Job reviews.** After both sides confirm Hired, either party can review the other. That review is not a review of the PPP marketplace, and it is not a Google review. The author can edit the stars or the text for 30 days after it is posted. After those 30 days, the edit control goes away. Public review text drops phone numbers, email addresses, and web addresses, and it drops a review body that contains that contractor’s business name or personal name. The other person on that job can report the review. An admin can hide the review or a contractor’s reply. Hiding keeps the review. It does not delete it. A low star rating by itself is not a reason to hide it. Public ratings on Find a Pro use visible verified job reviews. A hidden review is left out.

**Marketplace reviews.** A signed-in user can leave one review of Priority Property Pros itself. Those reviews are not Google reviews. They are checked for length, a rating from 1 to 5, and contact details. They stay off the public page until an admin approves them. An admin can approve or reject one and must record a written reason. That reason is kept in PPP’s admin records and is not shown on the public review. Account activation does not publish the review.

Stars and text must describe your own experience. Do not review a job you were not part of. Do not offer or accept anything of value for a review. Do not use a review to publish someone’s phone, email, or home address, or to accuse PPP of being the contractor who did the work.

## 2. Photos and other content

Project photos should show the work area and should not include house numbers, faces, license plates, or contact details. Before upload, the app removes location information a camera stored in the photo file, such as GPS coordinates. If it cannot, the photo is not uploaded. Contractors offered or connected on the project, including before a paid Connect, can open the photo, so what the picture shows can still point to the property. PPP does not run image text recognition, so a photo can still contain contact details that a text check would have blocked. A contractor viewing a project can report a photo. The report stores the reporter, the target, and the reason. An admin can read reports. The current screens do not include a separate admin inbox just for those reports.

A contractor uploads a portfolio photo. It starts in review. It is not public until an admin approves it. Public pages then show that approved photo through a short-lived link, with the approved caption. Unapproved photos are not shown. There is no stand-in illustration in place of the photo. The file stays in private storage, and the original file name is not published as a public address. An admin can hide a photo instead. Before upload, the app removes location information a camera stored in the file, such as GPS coordinates. Portfolio photos uploaded before that change can still contain it until PPP finishes removing it from older files.

Profile text, estimates, and messages follow the same contact rule as the [Community Guidelines](/community-guidelines). You keep ownership of what you submit. You give PPP permission to host and moderate it as the product actually does.

## 3. What content does not mean

A review, a star rating, a portfolio caption, or an “Approved platform profile” badge is not a PPP inspection of the work. It is not a statement that the contractor is licensed, insured, bonded, or background-checked. Contractor-provided license or insurance fields stay contractor-provided. PPP does not currently verify licenses, insurance, or workmanship. Who is responsible for the work is in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms).

A customer review of 1, 2, or 3 stars blocks that pro for that customer only. A review of 4 or 5 stars does not. Matching skips that pro. The pro’s open, unaccepted offers on that customer’s other current projects close immediately. The pro is left out of Hire Again. Paid connections and bookings are not changed. Editing that review up to 4 or 5 stars does not remove the block. The customer can remove the block, and an admin can remove it. A contractor’s review of a customer never creates a block. On an estimate or a booking, the customer can also choose “Don't match me with this pro again,” which blocks that pro for that customer in the same way, including closing those open, unaccepted offers. A job already underway stays as it is, and a paid connection stays paid. The customer can undo that later from Blocked pros. You may still decline an estimate, stop new connections, and cancel a project when the product allows it.

## 4. Moderation

PPP may refuse, edit display of, or remove content that breaks these guidelines, the Community Guidelines, or the Terms of Service, including by rejecting a marketplace review or hiding a photo. Reports of suspected fake reviews, misleading profiles, and other marketplace misconduct are in the [Community Guidelines](/community-guidelines). Moderation is not a ruling on a job dispute, not a guarantee of workmanship, and it does not refund a delivered $9.99 activation or a delivered $4.99 Connection Fee.

## 5. Contact

Questions about a review or a photo: use the [Contact us page (prioritypropertypros.com/contact)](/contact).

Mailing address: Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US.
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

This is not legal advice.

Effective date: the date this version is published, shown at the top of this page.

## Plain-language summary

- How you relate to Priority Property Pros, including responsibility for the work, is in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms). These terms do not repeat that section.
- PPP does not state that you are licensed, insured, bonded, or background-checked. Putting a license or insurance note on your profile does not mean PPP verified it.
- You pay the $9.99 one-time activation, then $4.99 each time you choose to Connect, including when a past customer posts a new project and you connect again. Each fee is generally non-refundable once that service is delivered, with the exceptions in the Refund & Cancellation Policy. If you are charged $4.99 but the connection can't be provided, it is refunded automatically.
- You choose which jobs to take. The customer pays you directly. PPP does not take a percentage of the job.

These terms are part of the [Terms of Service](/terms) for contractor accounts. Customers can read them. Only contractor signups are asked to accept them, and only those acceptances are stored on contractor accounts. The [Refund & Cancellation Policy](/refunds) and the [Community Guidelines](/community-guidelines) also apply.

## 1. Independent business

Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms) is the statement of your relationship to PPP, including responsibility for workmanship, employees, subcontractors, required licenses, insurance obligations, safety, permits, warranties, and damage you cause. These terms do not repeat that section. You may not present yourself as PPP, as employed by PPP, or as a crew PPP sent. PPP does not withhold employment taxes for you and does not set your hours.

You are responsible for your own tools, helpers, taxes, and the agreements you make with customers. Any license, insurance, or bond that the law or a customer requires is your obligation, as that section of the Terms of Service describes. PPP does not require proof of insurance in the product, and these terms do not add an insurance requirement. PPP also does not run a background-check program, and these terms do not create one.

## 2. What PPP does not claim about you

Admin approval means PPP has accepted the profile onto the marketplace. It is not a license check, an insurance check, a bond check, a background check, or a workmanship guarantee. Paying $9.99 does not approve you.

You may enter a license number, an insurance carrier, and other credentials. Those entries are contractor-provided. The public directory does not show the license number. If a badge is shown, its wording is limited to labels such as “Approved platform profile,” “Contractor-provided license,” “Contractor-provided insurance,” or “Contractor-provided credential.” PPP does not currently verify licenses, insurance, or workmanship. Customers are told to ask for proof themselves before they hire.

Nothing on the site means you are licensed, insured, bonded, or background-checked.

## 3. Fees you pay PPP

You pay a one-time $9.99 account activation when that Stripe Checkout is turned on. Then $0 a month. You pay $4.99 each time you choose to Connect on a project. That includes a new project from a customer you have worked with before. Hire Again does not waive the Connection Fee.

The Connection Fee buys connection access for that project: messaging with that customer, and the customer’s option to share contact details. It does not buy the job. The customer may hire someone else or hire no one. Account activation is delivered when the server verifies the Stripe payment and marks the fee paid. A connection is delivered when the server verifies the payment and unlocks that connection. Clicking Connect is not delivery. Under the [Refund & Cancellation Policy](/refunds), the $9.99 activation is generally non-refundable once it is delivered, except for a duplicate charge, an erroneous charge, a refund the law requires, or an approved exception. The $4.99 Connection Fee is non-refundable once the connection is delivered. If you are charged but the connection can't be provided, for example because the project was cancelled or closed, the opportunity expired, the customer blocked you, or you were charged twice, PPP refunds the $4.99 automatically to your original payment method. Other exceptions are reviewed by the owner.

You do not pay PPP a percentage of the job. The customer pays you directly for the work. PPP does not collect that payment.

## 4. How you get work

PPP may offer you projects that match the trade and service area you enter. A project has up to three occupying connection slots. You may pass. Passing an unpaid offer frees the slot. You are not required to Connect.

Your business name stays off the public directory until a paid Connect on a project. Phone, email, website, and street stay off that public card. Do not put contact details in your public text to route around the Connection Fee. The product rejects obvious contact text. See the [Community Guidelines](/community-guidelines).

After you pay $4.99 and the server verifies it, you and that customer can message on that project. The message box still blocks phone numbers, email addresses, and street addresses. You see the customer’s phone, email, and street only if that customer uses “Share my contact & address,” or if an admin unlocks that specific record with a reason.

## 5. Your work and your disputes

You set your estimate in the product. Job responsibility, and disputes about the work, are in Independent Marketplace and Contractor Responsibility in the [Terms of Service](/terms). A dispute between you and a customer about the work is ordinarily between the two of you. A Disputed booking status is not a decision by PPP and is not a refund of the Connection Fee. Reports about marketplace conduct are in the [Community Guidelines](/community-guidelines). Reviewing a report is not a decision about the work.

## 6. Acceptance

Contractor signup uses the same checkbox as any other signup, and the checkbox names these Contractor Participation Terms. You must be 18 or older. That is an affirmation you make, not a verification of your age. The server stores the version and the time, records the time of the age affirmation, and a new contractor account is not created if the current version was not accepted or the affirmation is missing. If these terms are updated after you already have an account, the next sign-in asks you to accept the current versions and to affirm that you are 18 or older if you have not already done so. That later acceptance is stored separately from the acceptance recorded when the account was created, with its own version and time. You can still view your jobs, messages, and account information, and you can delete the account, before you accept. New marketplace actions wait on that acceptance. Nothing is deleted because you have not yet accepted.

## 7. Contact

Questions about these terms: use the [Contact us page (prioritypropertypros.com/contact)](/contact).

Mailing address: Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US.
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
  SET is_current = true,
      published = true,
      published_at = coalesce(published_at, now())
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
  'Service role only. Turns legal_acceptance_required on or off. Enabling makes these agreement versions current, sets published, and sets published_at when it is still null. Disabling sets the flag to 0, does not clear published_at, and does not delete acceptances, profiles, projects, messages, reviews, photos, or payment rows, and does not change Stripe functions or fee flags.';

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

  IF coalesce(meta->>'affirmed_age_18', 'false') NOT IN ('true', '1', 'yes') THEN
    RAISE EXCEPTION 'age_18_required'
      USING ERRCODE = 'P0001',
            HINT = 'Signup requires an affirmation that you are 18 or older. The form does not ask for a date of birth.';
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

CREATE OR REPLACE FUNCTION public.accept_current_agreements(
  p_user_agent text DEFAULT NULL,
  p_affirmed_age_18 boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account public.account_type;
  affirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;

  IF NOT public.legal_acceptance_required() THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT profile.account_type, profile.age_18_affirmed_at
  INTO account, affirmed_at
  FROM public.profiles AS profile
  WHERE profile.id = auth.uid();

  IF account IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF affirmed_at IS NULL AND p_affirmed_age_18 IS NOT TRUE THEN
    RAISE EXCEPTION 'age_18_required'
      USING ERRCODE = 'P0001',
            HINT = 'Accepting the current agreements requires an affirmation that you are 18 or older. This is an affirmation, not a verification of age. The form does not ask for a date of birth.';
  END IF;

  IF p_affirmed_age_18 IS TRUE AND affirmed_at IS NULL THEN
    UPDATE public.profiles
    SET age_18_affirmed_at = now()
    WHERE id = auth.uid()
      AND age_18_affirmed_at IS NULL;
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

COMMENT ON FUNCTION public.accept_current_agreements(text, boolean) IS
  'Records acceptance of the current versions for auth.uid() when legal_acceptance_required is on, and records an 18-or-older affirmation when the profile does not already have one. Raises age_18_required if that affirmation is missing. Does nothing when the setting is off. Does not change account_status, hide data, or delete rows. The affirmation is a statement, not a verification of age.';

REVOKE ALL ON FUNCTION public.assert_signup_agreement_versions(jsonb, public.account_type) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_current_agreement_acceptances(uuid, text, public.account_type, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_current_agreements(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.missing_current_agreements() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.accept_current_agreements(text, boolean) TO authenticated;
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
    signup_fee_status,
    age_18_affirmed_at
  ) VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(meta->>'first_name', ''),
    coalesce(meta->>'last_name', ''),
    nullif(meta->>'phone', ''),
    safe_type,
    initial_status,
    initial_fee,
    CASE
      WHEN public.legal_acceptance_required()
        AND coalesce(meta->>'affirmed_age_18', 'false') IN ('true', '1', 'yes')
      THEN now()
      ELSE NULL
    END
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
      coalesce(meta->>'coverage_area', ''),
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
  'Creates the profile. Agreement enforcement and the 18-or-older affirmation run only when legal_acceptance_required is on. When it is off, signup is not rejected and only the already-current terms and privacy rows are recorded if the checkbox was accepted. Does not hide or delete existing account data and does not change Stripe or fee flags.';

CREATE OR REPLACE FUNCTION public.profile_missing_current_agreements(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agreements AS agreement
    JOIN public.profiles AS profile ON profile.id = p_profile_id
    WHERE agreement.is_current
      AND (
        agreement.audience = 'ALL'
        OR (agreement.audience = 'CONTRACTOR' AND profile.account_type = 'CONTRACTOR')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.agreement_acceptances AS acceptance
        WHERE acceptance.agreement_id = agreement.id
          AND acceptance.profile_id = p_profile_id
      )
  );
$$;

COMMENT ON FUNCTION public.profile_missing_current_agreements(uuid) IS
  'Internal helper for the new-marketplace-action trigger. True when that profile has not accepted a current agreement. Read-only.';

REVOKE ALL ON FUNCTION public.profile_missing_current_agreements(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_current_terms_for_new_marketplace_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF NOT public.legal_acceptance_required() THEN
    RETURN NEW;
  END IF;

  IF actor IS NULL THEN
    -- Service role. The $4.99 Connect reservation is written (insert, or update to
    -- RESERVED) by the checkout function with the service role before any Stripe
    -- session exists, so check the contractor on that row. Webhook fulfillment,
    -- refunds, and expiry are not checked. Every other service-role write passes.
    IF TG_TABLE_NAME = 'project_connections' THEN
      SELECT contractor.profile_id
      INTO actor
      FROM public.contractor_profiles AS contractor
      WHERE contractor.id = NEW.contractor_profile_id;
    END IF;
    IF actor IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF public.profile_missing_current_agreements(actor) THEN
    RAISE EXCEPTION 'terms_acceptance_required'
      USING ERRCODE = 'P0001',
            HINT = 'Accept the current agreements before a new marketplace action. You can still view your account and delete it. You have not been charged.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_current_terms_for_new_marketplace_action() IS
  'BEFORE INSERT, plus the UPDATE that moves a project connection to RESERVED. Raises terms_acceptance_required when legal_acceptance_required is on and the acting user is missing a current agreement. Admins pass. Service-role writes pass, except a project_connections reservation, which is checked against that row''s contractor before any Stripe session exists. Does not block SELECT, updates, account deletion, or payment tables. Does not change Stripe functions or fee flags.';

REVOKE ALL ON FUNCTION public.enforce_current_terms_for_new_marketplace_action() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS projects_enforce_current_terms ON public.projects;
CREATE TRIGGER projects_enforce_current_terms
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_current_terms_for_new_marketplace_action();

DROP TRIGGER IF EXISTS estimates_enforce_current_terms ON public.estimates;
CREATE TRIGGER estimates_enforce_current_terms
  BEFORE INSERT ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_current_terms_for_new_marketplace_action();

DROP TRIGGER IF EXISTS project_messages_enforce_current_terms ON public.project_messages;
CREATE TRIGGER project_messages_enforce_current_terms
  BEFORE INSERT ON public.project_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_current_terms_for_new_marketplace_action();

DROP TRIGGER IF EXISTS project_connections_enforce_current_terms ON public.project_connections;
CREATE TRIGGER project_connections_enforce_current_terms
  BEFORE INSERT ON public.project_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_current_terms_for_new_marketplace_action();

-- A $4.99 reservation can also reuse an existing connection row (UPDATE to RESERVED).
-- That happens before any Stripe session, so it is checked the same way. Moves from
-- RESERVED to PAID (webhook), refunds, expiry, and cancellations are not checked.
DROP TRIGGER IF EXISTS project_connections_enforce_current_terms_reserve ON public.project_connections;
CREATE TRIGGER project_connections_enforce_current_terms_reserve
  BEFORE UPDATE OF status ON public.project_connections
  FOR EACH ROW
  WHEN (NEW.status = 'RESERVED' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.enforce_current_terms_for_new_marketplace_action();
