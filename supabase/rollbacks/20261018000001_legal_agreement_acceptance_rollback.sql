-- Rollback for 20261018000001_legal_agreement_acceptance.sql.
-- NOT APPLIED with that migration. Do not run this on a database that never
-- applied 20261018000001.
-- Removes the draft agreement versions, the acceptance gate, and the columns
-- this migration added. Restores handle_new_user and the agreements select
-- policy from before that migration.
-- Does not delete profiles, projects, messages, reviews, photos, or payment
-- rows. Does not change Stripe functions or fee flags. Acceptances of the
-- older current terms stay. Acceptances of only the versions inserted by
-- 20261018000001 are removed so those draft rows can be deleted.

DROP TRIGGER IF EXISTS agreement_acceptances_protect ON public.agreement_acceptances;

DROP FUNCTION IF EXISTS public.protect_agreement_acceptance();
DROP FUNCTION IF EXISTS public.legal_acceptance_required();
DROP FUNCTION IF EXISTS public.set_legal_acceptance_required(boolean);
DROP FUNCTION IF EXISTS public.assert_signup_agreement_versions(jsonb, public.account_type);
DROP FUNCTION IF EXISTS public.record_current_agreement_acceptances(uuid, text, public.account_type, text);
DROP FUNCTION IF EXISTS public.accept_current_agreements(text);
DROP FUNCTION IF EXISTS public.missing_current_agreements();

DROP POLICY IF EXISTS agreements_select_current ON public.agreements;
CREATE POLICY agreements_select_current
  ON public.agreements
  FOR SELECT
  TO anon, authenticated
  USING (is_current);

DELETE FROM public.platform_settings WHERE key = 'legal_acceptance_required';

UPDATE public.agreements
SET is_current = false
WHERE (slug, version) IN (
  ('terms-of-use', 3),
  ('privacy-policy', 2),
  ('refund-cancellation', 1),
  ('community-guidelines', 1),
  ('review-content', 1),
  ('contractor-participation', 1)
);

UPDATE public.agreements AS older
SET is_current = true
WHERE (older.slug, older.version) IN (
  SELECT candidate.slug, max(candidate.version)
  FROM public.agreements AS candidate
  WHERE candidate.slug IN (
    'terms-of-use',
    'privacy-policy',
    'refund-cancellation',
    'community-guidelines',
    'review-content',
    'contractor-participation'
  )
    AND (candidate.slug, candidate.version) NOT IN (
      ('terms-of-use', 3),
      ('privacy-policy', 2),
      ('refund-cancellation', 1),
      ('community-guidelines', 1),
      ('review-content', 1),
      ('contractor-participation', 1)
    )
  GROUP BY candidate.slug
)
AND NOT EXISTS (
  SELECT 1
  FROM public.agreements AS current_row
  WHERE current_row.slug = older.slug
    AND current_row.is_current
);

DELETE FROM public.agreement_acceptances
WHERE agreement_id IN (
  SELECT agreement.id
  FROM public.agreements AS agreement
  WHERE (agreement.slug, agreement.version) IN (
    ('terms-of-use', 3),
    ('privacy-policy', 2),
    ('refund-cancellation', 1),
    ('community-guidelines', 1),
    ('review-content', 1),
    ('contractor-participation', 1)
  )
);

DELETE FROM public.agreements
WHERE (slug, version) IN (
  ('terms-of-use', 3),
  ('privacy-policy', 2),
  ('refund-cancellation', 1),
  ('community-guidelines', 1),
  ('review-content', 1),
  ('contractor-participation', 1)
);

ALTER TABLE public.agreements
  DROP CONSTRAINT IF EXISTS agreements_audience_check;

ALTER TABLE public.agreements
  DROP COLUMN IF EXISTS audience,
  DROP COLUMN IF EXISTS published;

ALTER TABLE public.agreement_acceptances
  DROP CONSTRAINT IF EXISTS agreement_acceptances_source_check;

ALTER TABLE public.agreement_acceptances
  DROP COLUMN IF EXISTS agreement_version,
  DROP COLUMN IF EXISTS acceptance_source;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_type public.account_type;
  initial_status public.account_status;
  initial_fee public.signup_fee_status;
  meta jsonb;
BEGIN
  meta := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  safe_type := public.permitted_signup_account_type(meta->>'account_type');

  IF safe_type = 'CUSTOMER' AND NEW.email_confirmed_at IS NOT NULL THEN
    initial_status := 'ACTIVE';
  ELSE
    initial_status := 'PENDING';
  END IF;

  IF safe_type IN ('CUSTOMER', 'CONTRACTOR') THEN
    initial_fee := 'UNPAID';
  ELSE
    initial_fee := 'NOT_REQUIRED';
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    account_type,
    account_status,
    signup_fee_status
  ) VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(meta->>'first_name', ''),
    coalesce(meta->>'last_name', ''),
    nullif(meta->>'phone', ''),
    safe_type,
    initial_status,
    initial_fee
  );

  IF safe_type = 'CONTRACTOR' THEN
    INSERT INTO public.contractor_profiles (
      profile_id,
      business_name,
      primary_trade,
      service_area,
      bio,
      onboarding_status
    ) VALUES (
      NEW.id,
      coalesce(meta->>'business_name', ''),
      nullif(meta->>'primary_trade', ''),
      nullif(meta->>'service_area', ''),
      nullif(meta->>'bio', ''),
      'IN_PROGRESS'
    );
  ELSIF safe_type = 'VERIFIER' THEN
    INSERT INTO public.verifier_profiles (
      profile_id,
      coverage_area,
      bio,
      onboarding_status
    ) VALUES (
      NEW.id,
      coalesce(meta->>'coverage_area', ''),
      nullif(meta->>'bio', ''),
      'IN_PROGRESS'
    );
  END IF;

  IF coalesce(meta->>'accepted_terms', 'false') IN ('true', '1', 'yes') THEN
    INSERT INTO public.agreement_acceptances (agreement_id, profile_id, user_agent)
    SELECT a.id, NEW.id, nullif(meta->>'user_agent', '')
    FROM public.agreements a
    WHERE a.is_current
      AND a.slug IN ('terms-of-use', 'privacy-policy')
    ON CONFLICT (agreement_id, profile_id) DO NOTHING;
  END IF;

  PERFORM public.write_audit_log(
    NEW.id,
    'profile.created',
    'profiles',
    NEW.id,
    jsonb_build_object(
      'account_type', safe_type,
      'requested_account_type', meta->>'account_type',
      'signup_fee_status', initial_fee
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
