-- Current legal agreement versions. Bodies are operational drafts; attorney review required before launch.
-- Preview/staging only: giiskdvitimksdewnelc. Do NOT apply to production bersftkjpbzpgtahbqwd.
-- FINAL model copy (must stay in sync with src/data/legal.ts):
--   Homeowners $0 signup; contractors $9.99 one-time activation
--   Flat $4.99 Connection Fee (not a progressive / published-schedule percentage)
--   Rating auto-suspend only when unrounded avg < 4.00 AND eligible count >= 5
--   Checkout not live / Coming Soon
--   PPP does not process project payments; homeowner pays contractor directly

UPDATE public.agreements
SET is_current = false
WHERE slug IN (
  'terms-of-use',
  'privacy-policy',
  'marketplace-disclaimer',
  'community-guidelines',
  'dispute-policy',
  'suspension-termination'
)
  AND is_current = true;

INSERT INTO public.agreements (slug, title, version, body, is_current)
VALUES
  (
    'terms-of-use',
    'Terms of Use',
    2,
    'DRAFT — attorney review required before launch. Priority Property Pros is a local marketplace. PRIORITY PROPERTY PROS LLC is not the contractor. Independent contractors perform the work. Homeowners join for $0 signup. Contractors pay a one-time $9.99 activation fee. Online checkout is not live in this product; Connection Fee checkout is Coming Soon. Homeowners have no monthly fee and no PPP Connection Fee when they hire. Contractors on the $0/month Free plan pay a flat $4.99 Connection Fee per legitimate new connection, regardless of project value — not a progressive percentage schedule. After connection, the homeowner pays the contractor directly for the work. PPP does not process, hold in escrow, or payout homeowner-to-contractor project money. Priority Pro is Coming Soon at $49/month or $499/year and cannot be purchased. Reviews require a completed PPP job. PPP may auto-suspend new marketplace work only when the unrounded eligible average is below 4.00 AND the eligible review count is at least 5. Exactly 4.00 does not suspend. PPP does not verify licenses or workmanship.',
    true
  ),
  (
    'privacy-policy',
    'Privacy Policy',
    2,
    'DRAFT — attorney review required before launch. We store account identity (name, email, phone, role, status), contractor profile and credential uploads, project details including a separately stored street address, estimates, bookings, fee snapshots, reviews, in-app notifications, dispute records, optional dispute evidence, agreement acceptances, and append-only audit logs. The public directory shows anonymized contractor cards and eligible PPP ratings only. Exact contact stays locked until a hire connection. Homeowners join for $0 signup. Contractors pay a one-time $9.99 activation fee. Connection Fees are a flat $4.99 and checkout is Coming Soon — not live. Live card charges are off. PPP does not process homeowner-to-contractor project payments; after connection the homeowner pays the contractor directly. Account deletion removes the listing and new participation while keeping legal, financial, dispute, and job history.',
    true
  ),
  (
    'marketplace-disclaimer',
    'Marketplace Disclaimer',
    1,
    'DRAFT — attorney review required before launch. PPP is a venue. Independent contractors do the work. Admin approval to join is not a license, insurance, or quality verification. Priority Verified is not live. Homeowners join for $0 signup. Contractors pay a one-time $9.99 activation fee. The Connection Fee is a flat $4.99 per legitimate new connection, not a progressive published schedule. Connection Fee checkout is Coming Soon and is not live. PPP does not hold escrow or process live job payments. After connection, the homeowner pays the contractor directly.',
    true
  ),
  (
    'community-guidelines',
    'Community & Review Guidelines',
    1,
    'DRAFT — attorney review required before launch. Homeowners and contractors may review each other only after a completed PPP job. No self-review, no duplicate reviews per side, no invented job ids. Public ratings use eligible completed-job reviews only. PPP may auto-suspend new marketplace work only when the unrounded eligible average is below 4.00 AND the eligible review count is at least 5. Exactly 4.00 does not suspend. Do not post phone numbers, emails, or links in reviews or project text.',
    true
  ),
  (
    'dispute-policy',
    'Dispute Policy',
    1,
    'DRAFT — attorney review required before launch. File review or rating-suspension disputes from Account → Disputes. Rating auto-suspension applies only when the unrounded eligible average is below 4.00 AND the eligible review count is at least 5. Statuses: OPEN, UNDER_REVIEW, RESOLVED_UPHELD, RESOLVED_REMOVED, RESOLVED_ADJUSTED, CLOSED. Admins cannot resolve their own dispute or unsuspend themselves. Records are kept. Checkout is not live / Coming Soon. PPP does not process project payments.',
    true
  ),
  (
    'suspension-termination',
    'Account Suspension & Termination',
    1,
    'DRAFT — attorney review required before launch. PPP may auto-suspend new marketplace work only when the unrounded eligible average is below 4.00 AND the eligible review count is at least 5. Exactly 4.00 does not suspend. Deletion removes public listing and new participation while preserving legal and marketplace history. Homeowners join for $0 signup. Contractors pay a one-time $9.99 activation fee. Connection Fees are a flat $4.99. Checkout is not live / Coming Soon. PPP does not process project payments; the homeowner pays the contractor directly.',
    true
  )
ON CONFLICT (slug, version) DO UPDATE
SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  is_current = EXCLUDED.is_current;
