-- Trust & safety lifecycle enums.
-- Split from table/function use so new account_status values commit first.

ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'DEACTIVATED';
ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'DELETION_REQUESTED';
ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'DELETED_ANONYMIZED';

CREATE TYPE public.review_side AS ENUM ('CUSTOMER', 'CONTRACTOR');

CREATE TYPE public.trust_dispute_category AS ENUM (
  'FRAUDULENT_REVIEW',
  'INACCURATE_REVIEW',
  'RATING_SUSPENSION'
);

CREATE TYPE public.trust_dispute_status AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED_UPHELD',
  'RESOLVED_REMOVED',
  'RESOLVED_ADJUSTED',
  'CLOSED'
);

CREATE TYPE public.account_restriction_reason AS ENUM (
  'RATING_SUSPENSION',
  'ADMIN_SUSPENSION',
  'USER_DEACTIVATION',
  'DELETION_REQUEST'
);
