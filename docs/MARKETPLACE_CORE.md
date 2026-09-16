# Marketplace core — Phase 3

Priority Property Pros is a **local home-services marketplace**. PPP is **not** the contractor.

Phase 3 adds posting, contractor onboarding, matching (max 3 participating contractors), pre-estimate Q&A, estimates with a **historical ~7% fee snapshot**, and customer selection.

Phase 4A adds a **pending booking** on selection (not confirmation), a versioned progressive fee engine, relationships / Hire Again, change orders, and a verified-review guard. It does **not** charge cards, take payouts, or launch Priority Verified.

See [DATABASE.md](DATABASE.md), [SECURITY.md](SECURITY.md), and [PHASE4A.md](PHASE4A.md).

## Flow

1. Customer drafts a project (need → category → photos → questions → location → when → budget → review) and **POST**s.
2. The database matches approved, in-area contractors (category, ZIP/radius, job size, availability, credentials when required).
3. Matched contractors see an **opportunity** with approximate location only (city/ZIP, not street).
4. At most **3** contractors can accept. The last slot is race-safe (`opportunity_slots` + project row lock).
5. Accepted contractors may ask questions; the customer answers.
6. Contractors submit estimates. Totals are recomputed from line items. Fee preview = total, PPP fee, contractor earnings. **No charge.**
7. Customer compares factual fields and **SELECT THIS PRO**. That creates a **PENDING booking**. Exact address stays private. **No payment.** Stop before confirmation.

## Completeness

`HIGH` / `MEDIUM` / `MORE_INFO_NEEDED` is informational. Posting still requires title, category, and ZIP.

## What is not in Phase 3 or 4A

Stripe live charges, payouts, Priority Verified, full messaging, inspection marketplace, or wiping production users.

Apply SQL in filename order through `20260918000005_phase4a_rls_grants.sql`. Files after Phase 3 do not delete users. Estimate line items still support Labor / Materials / Equipment / Custom. Booking fees are progressive and versioned. PPP does **not** auto-rank a BEST estimate. Production UI must not fake a paid booking.
