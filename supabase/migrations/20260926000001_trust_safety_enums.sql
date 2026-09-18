-- Trust & safety lifecycle enums.
-- Split from table/function use so new account_status values commit first.
-- Preview/staging only: giiskdvitimksdewnelc. Do NOT apply to production bersftkjpbzpgtahbqwd.
-- Idempotent: staging may already have partial 20260918 trust_safety_enums.

ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'DEACTIVATED';
ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'DELETION_REQUESTED';
ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'DELETED_ANONYMIZED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_side') THEN
    CREATE TYPE public.review_side AS ENUM ('CUSTOMER', 'CONTRACTOR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trust_dispute_category') THEN
    CREATE TYPE public.trust_dispute_category AS ENUM (
      'FRAUDULENT_REVIEW',
      'INACCURATE_REVIEW',
      'RATING_SUSPENSION'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trust_dispute_status') THEN
    CREATE TYPE public.trust_dispute_status AS ENUM (
      'OPEN',
      'UNDER_REVIEW',
      'RESOLVED_UPHELD',
      'RESOLVED_REMOVED',
      'RESOLVED_ADJUSTED',
      'CLOSED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_restriction_reason') THEN
    CREATE TYPE public.account_restriction_reason AS ENUM (
      'RATING_SUSPENSION',
      'ADMIN_SUSPENSION',
      'USER_DEACTIVATION',
      'DELETION_REQUEST'
    );
  END IF;
END
$$;
