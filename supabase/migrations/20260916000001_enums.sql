-- Phase 2 enums. Roles live in the database, not in client JWT metadata.

CREATE TYPE public.account_type AS ENUM (
  'CUSTOMER',
  'CONTRACTOR',
  'VERIFIER',
  'ADMIN'
);

CREATE TYPE public.account_status AS ENUM (
  'ACTIVE',
  'PENDING',
  'SUSPENDED',
  'DISABLED',
  'DELETED'
);

CREATE TYPE public.onboarding_status AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'COMPLETE'
);

CREATE TYPE public.approval_status AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SUSPENDED'
);
