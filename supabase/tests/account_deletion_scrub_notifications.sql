-- Tests for 20261017100002_account_deletion_scrub_notifications.sql.
-- Run only on a copy of the production schema with all three account deletion
-- migrations applied, inside a transaction that ends in ROLLBACK.
-- Part A is self-contained and writes nothing. Part B is the walkthrough.

BEGIN;

-- Part A. Helper behaviour.
DO $test$
DECLARE
  t text[] := ARRAY['Synthia', 'Testcustomer', 'Synthia Testcustomer', 'ppp-synthetic-customer@example.invalid', '+15555550101', '15555550101'];
BEGIN
  ASSERT public.scrub_deleted_identity_text('New message from Synthia.', t, 'a deleted user')
    = 'New message from a deleted user.', 'first name in a message body';
  ASSERT public.scrub_deleted_identity_text('Synthia Testcustomer joined', t, 'a deleted user')
    = 'a deleted user joined', 'full name is replaced before first name';
  ASSERT public.scrub_deleted_identity_text('mail ppp-synthetic-customer@example.invalid now', t, 'a deleted user')
    = 'mail a deleted user now', 'email with dots, dash, and @ is matched literally';
  ASSERT public.scrub_deleted_identity_text('call +15555550101', t, 'a deleted user')
    = 'call a deleted user', 'phone with a leading +';
  ASSERT public.scrub_deleted_identity_text('SYNTHIA said', t, 'a deleted user')
    = 'a deleted user said', 'case-insensitive';
  ASSERT public.scrub_deleted_identity_text('Synthiana said', t, 'a deleted user')
    = 'Synthiana said', 'whole words only';
  ASSERT public.scrub_deleted_identity_text('Your booking is confirmed.', t, 'a deleted user')
    = 'Your booking is confirmed.', 'unrelated text is unchanged';
  ASSERT public.scrub_deleted_identity_text('A.B (C) [x] * pro', ARRAY['A.B (C) [x] *'], 'a former PPP pro')
    = 'a former PPP pro pro', 'regex characters in a business name are literal';
  ASSERT public.scrub_deleted_identity_text('AxB', ARRAY['A.B'], 'z') = 'AxB', 'a dot is not a wildcard';
  ASSERT public.scrub_deleted_identity_text(NULL, t, 'z') IS NULL, 'null text';
  ASSERT public.scrub_deleted_identity_jsonb(
      '{"customer_name":"Synthia","note":"Synthia asked","list":["Synthia",1],"project_id":"p","path":"/x"}'::jsonb,
      t, 'a deleted user', true)
    = '{"note":"a deleted user asked","list":["a deleted user",1],"project_id":"p","path":"/x"}'::jsonb,
    'name keys dropped, strings scrubbed, ids and paths kept';
  ASSERT public.scrub_deleted_identity_jsonb('{"customer_name":"Synthia"}'::jsonb, t, 'a deleted user', false)
    = '{"customer_name":"a deleted user"}'::jsonb, 'keys kept when not dropping';
  ASSERT NOT has_function_privilege('authenticated', 'public.scrub_deleted_identity_text(text, text[], text)', 'EXECUTE'),
    'helper not granted to clients';
  ASSERT NOT has_function_privilege('anon', 'public.scrub_deleted_identity_jsonb(jsonb, text[], text, boolean)', 'EXECUTE'),
    'helper not granted to anon';
END
$test$;

ROLLBACK;

-- Part B. Walkthrough (service role, inside a rolled-back transaction).
-- Fixture: customer Synthia Testcustomer and pro "Synthetic Test Pro LLC" on one
-- project and thread. Each sends one message, so the pro has
-- 'New message from Synthia.' and the customer has
-- 'New message from Synthetic Test Pro LLC.'. Also:
--   R1 to the pro, estimate on her project, payload customer_name and a note naming her.
--   P1 to the customer, booking.hired on the shared booking, payload business_name.
--   U1 to the pro, 'New message from Synthia.' in a thread of a different customer.
--   UP1 to a third user, 'New message from Synthetic Test Pro LLC.' in another thread.
--   G1 to a third user, unrelated entity, body with her full name and payload with her email.
--   U2 to a third user, plain unrelated text.
-- 1. Delete the customer. Expect:
--    pro's message notification body 'New message from a deleted user.'
--    R1 title and body 'a deleted user selected your estimate', customer_name key gone,
--    note 'a deleted user asked', project_id kept.
--    G1 body 'a deleted user joined a project', payload contact 'a deleted user'.
--    U1, UP1, U2 unchanged. Her own notifications removed by the profile cascade.
--    Notifications of real users unchanged. rpc result notifications_scrubbed = 3.
-- 2. Delete the pro. Expect:
--    customer's message notification body 'New message from a former PPP pro.'
--    P1 body 'a former PPP pro was hired.', business_name key gone, path and booking_id kept.
--    UP1 unchanged (a business name alone is only replaced in the pro's own rows).
--    G1 and U2 unchanged.
-- 3. Refused delete (active job): every notification unchanged.
-- 4. Forced failure at the profile delete, after the scrub ran: every
--    notification unchanged (the scrub rolls back with the purge).
-- 5. Updates do not send email or push: notifications_dispatch_channels is AFTER INSERT only.
