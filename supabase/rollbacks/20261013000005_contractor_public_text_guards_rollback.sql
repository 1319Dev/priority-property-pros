-- Rollback for 20261013000005_contractor_public_text_guards.sql
-- Drops the public-text trigger, its helper, and the NOT VALID checks.
-- Does not rewrite contractor_profiles and does not restore trimmed values.
-- Does not change Stripe, fees, matching, or contact-unlock entitlement.

DROP TRIGGER IF EXISTS contractor_profiles_enforce_public_text ON public.contractor_profiles;

ALTER TABLE public.contractor_profiles
  DROP CONSTRAINT IF EXISTS contractor_profiles_business_name_len,
  DROP CONSTRAINT IF EXISTS contractor_profiles_business_name_plain,
  DROP CONSTRAINT IF EXISTS contractor_profiles_primary_trade_len,
  DROP CONSTRAINT IF EXISTS contractor_profiles_primary_trade_plain,
  DROP CONSTRAINT IF EXISTS contractor_profiles_service_area_len,
  DROP CONSTRAINT IF EXISTS contractor_profiles_service_area_plain,
  DROP CONSTRAINT IF EXISTS contractor_profiles_headline_len,
  DROP CONSTRAINT IF EXISTS contractor_profiles_headline_plain,
  DROP CONSTRAINT IF EXISTS contractor_profiles_bio_len,
  DROP CONSTRAINT IF EXISTS contractor_profiles_bio_plain,
  DROP CONSTRAINT IF EXISTS contractor_profiles_website_url_http,
  DROP CONSTRAINT IF EXISTS contractor_profiles_years_experience_max;

DROP FUNCTION IF EXISTS public.enforce_contractor_public_text();
DROP FUNCTION IF EXISTS public.assert_contractor_public_plain_text(text, text, integer);
