-- First admin (run in Supabase SQL editor as the project owner).
-- Never expose this as a button or client RPC.

-- 1. Sign up normally on the website as a CUSTOMER with your real email.
-- 2. Confirm the email.
-- 3. Replace YOUR-ADMIN-EMAIL@example.com and run this entire script.

DO $$
DECLARE
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id
  FROM auth.users
  WHERE email = 'YOUR-ADMIN-EMAIL@example.com';

  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'No auth user with that email. Sign up on the site first, then rerun.';
  END IF;

  -- SQL editor has no JWT, so protect_profile_columns allows this ADMIN write.
  -- The website cannot perform the same update (auth.uid() is set).
  UPDATE public.profiles
  SET
    account_type = 'ADMIN',
    account_status = 'ACTIVE',
    signup_fee_status = 'NOT_REQUIRED'
  WHERE id = admin_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    admin_id,
    'admin.promoted_via_sql',
    'profiles',
    admin_id,
    jsonb_build_object('note', 'First admin created in SQL editor')
  );
END;
$$;
