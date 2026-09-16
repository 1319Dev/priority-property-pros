# Marketplace core — Phase 3

Priority Property Pros is a **local home-services marketplace**. PPP is **not** the contractor.

Phase 3 adds posting, contractor onboarding, matching (max 3 participating contractors), pre-estimate Q&A, estimates with a **~7% fee preview**, and customer selection. It does **not** charge cards, take payouts, or launch Priority Verified.

See [DATABASE.md](DATABASE.md) and [SECURITY.md](SECURITY.md) for tables and RLS.

## Flow

1. Customer drafts a project (need → category → photos → questions → location → when → budget → review) and **POST**s.
2. The database matches approved, in-area contractors (category, ZIP/radius, job size, availability, credentials when required).
3. Matched contractors see an **opportunity** with approximate location only (city/ZIP, not street).
4. At most **3** contractors can accept. The last slot is race-safe (`opportunity_slots` + project row lock).
5. Accepted contractors may ask questions; the customer answers.
6. Contractors submit estimates. Totals are recomputed from line items. Fee preview = total, PPP fee, contractor earnings. **No charge.**
7. Customer compares factual fields and **SELECT THIS PRO → CONFIRM**. One winner. Stop before payment.

## Completeness

`HIGH` / `MEDIUM` / `MORE_INFO_NEEDED` is informational. Posting still requires title, category, and ZIP.

## What is not in Phase 3

Stripe charges, booking, payouts, Priority Verified, full messaging, change orders, work workflow, full admin analytics, demo contractors, or wiping production users.

Apply SQL in filename order through `20260917000010_phase3_phase2_function_grants.sql`. Files `09`–`10` only tighten grants; they do not delete users.
