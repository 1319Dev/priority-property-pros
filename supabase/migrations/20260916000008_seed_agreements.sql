-- Seed current legal copy. Body is a Phase 2 placeholder; replace in the dashboard later.

INSERT INTO public.agreements (slug, title, version, body, is_current)
VALUES
  (
    'terms-of-use',
    'Terms of Use',
    1,
    'Priority Property Pros is a local marketplace. PRIORITY PROPERTY PROS LLC is not the contractor. Independent contractors perform the work. By creating an account you agree to use the service lawfully, to provide accurate information, and to understand that Phase 2 does not include live job posting, payments, or Priority Verified.',
    true
  ),
  (
    'privacy-policy',
    'Privacy Policy',
    1,
    'We store the account information you submit (name, email, phone, and role foundation fields) in Supabase. The anon key in the website is public by design; Row Level Security protects your rows. Do not submit secrets into profile fields.',
    true
  );
