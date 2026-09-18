-- Manual SQL-editor checklist for the $4.99 connection marketplace.
-- Do NOT run against production. Do NOT flip payments_live / charges_live.

-- 1. Price is 499
-- SELECT public.connection_fee_cents();  -- 499

-- 2. Connect click while payments off
-- SELECT public.request_project_connection('<project-id>');
-- Expect: status PAYMENT_DISABLED, fee_cents 499, contact_unlocked false.

-- 3. Duplicate pair
-- Repeat the same contractor+project → exception 'duplicate connection'.

-- 4. Fourth occupying slot
-- Three connections, then a fourth contractor → exception 'connections full'.

-- 5. Stop new connections (customer owner)
-- SELECT public.stop_new_project_connections('<project-id>');
-- Existing UNLOCKED connection_contact_access rows stay.

-- 6. Entitlement
-- booking_job_contact still requires #14. Connect click must not grant UNLOCKED.

-- 7. Flags
-- SELECT key, value_int FROM public.platform_settings
-- WHERE key IN ('payments_live','charges_live','signup_fee_enabled','stripe_test_mode','connection_fee_cents');
-- Expect: 0, 0, 0, 1, 499
