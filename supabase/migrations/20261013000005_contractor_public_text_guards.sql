-- Reject phone, email, and URL patterns in public contractor text, and cap lengths.
-- Website values must be http:// or https://.
--
-- Does not UPDATE existing contractor_profiles rows. CHECK constraints are
-- NOT VALID, so rows already stored are left as they are and are not scanned.
-- A later edit of a violating row fails until that field is fixed.
-- Does not change Stripe, fees, matching, or contact-unlock entitlement.
--
-- Production scan of bersftkjpbzpgtahbqwd on 2026-10-10, read only:
--   4 contractor_profiles. None contain a phone, email, or URL pattern in
--   business_name, primary_trade, service_area, headline, or bio. None have
--   a non-http website, a bio over 2000 characters, or years_experience
--   outside 0..80. Contractor a6208af2 has a trailing space on business_name.
--   This migration does not trim it.

CREATE OR REPLACE FUNCTION public.assert_contractor_public_plain_text(
  p_label text,
  p_value text,
  p_max integer
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN;
  END IF;
  IF char_length(p_value) > p_max THEN
    RAISE EXCEPTION '% must be % characters or fewer', p_label, p_max;
  END IF;
  IF public.text_contains_pre_hire_contact(p_value) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_contractor_public_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.business_name IS DISTINCT FROM OLD.business_name THEN
    NEW.business_name := btrim(coalesce(NEW.business_name, ''));
    PERFORM public.assert_contractor_public_plain_text('business name', NEW.business_name, 80);
  END IF;

  IF TG_OP = 'INSERT' OR NEW.primary_trade IS DISTINCT FROM OLD.primary_trade THEN
    NEW.primary_trade := nullif(btrim(NEW.primary_trade), '');
    PERFORM public.assert_contractor_public_plain_text('primary trade', NEW.primary_trade, 80);
  END IF;

  IF TG_OP = 'INSERT' OR NEW.service_area IS DISTINCT FROM OLD.service_area THEN
    NEW.service_area := nullif(btrim(NEW.service_area), '');
    PERFORM public.assert_contractor_public_plain_text('service area', NEW.service_area, 120);
  END IF;

  IF TG_OP = 'INSERT' OR NEW.headline IS DISTINCT FROM OLD.headline THEN
    NEW.headline := nullif(btrim(NEW.headline), '');
    PERFORM public.assert_contractor_public_plain_text('headline', NEW.headline, 120);
  END IF;

  IF TG_OP = 'INSERT' OR NEW.bio IS DISTINCT FROM OLD.bio THEN
    NEW.bio := nullif(btrim(NEW.bio), '');
    PERFORM public.assert_contractor_public_plain_text('bio', NEW.bio, 2000);
  END IF;

  IF TG_OP = 'INSERT' OR NEW.website_url IS DISTINCT FROM OLD.website_url THEN
    NEW.website_url := nullif(btrim(NEW.website_url), '');
    IF NEW.website_url IS NOT NULL THEN
      IF char_length(NEW.website_url) > 200
         OR NEW.website_url !~* '^https?://[^[:space:]]+$'
         OR NEW.website_url ~* 'javascript:' THEN
        RAISE EXCEPTION 'Enter a website that starts with http:// or https://';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.years_experience IS DISTINCT FROM OLD.years_experience THEN
    IF NEW.years_experience IS NOT NULL
       AND (NEW.years_experience < 0 OR NEW.years_experience > 80) THEN
      RAISE EXCEPTION 'years of experience must be between 0 and 80';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contractor_profiles_enforce_public_text ON public.contractor_profiles;
CREATE TRIGGER contractor_profiles_enforce_public_text
  BEFORE INSERT OR UPDATE ON public.contractor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_contractor_public_text();

REVOKE ALL ON FUNCTION public.assert_contractor_public_plain_text(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_contractor_public_text() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_contractor_public_plain_text(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_contractor_public_text() TO authenticated;

COMMENT ON FUNCTION public.enforce_contractor_public_text() IS
  'Rejects phone, email, and URL patterns in public contractor text and caps field lengths. Websites must be http or https. Does not change fees or contact entitlement. Existing rows are not rewritten.';

ALTER TABLE public.contractor_profiles
  DROP CONSTRAINT IF EXISTS contractor_profiles_business_name_len,
  DROP CONSTRAINT IF EXISTS contractor_profiles_primary_trade_len,
  DROP CONSTRAINT IF EXISTS contractor_profiles_service_area_len,
  DROP CONSTRAINT IF EXISTS contractor_profiles_headline_len,
  DROP CONSTRAINT IF EXISTS contractor_profiles_bio_len,
  DROP CONSTRAINT IF EXISTS contractor_profiles_website_url_http,
  DROP CONSTRAINT IF EXISTS contractor_profiles_years_experience_max,
  DROP CONSTRAINT IF EXISTS contractor_profiles_business_name_plain,
  DROP CONSTRAINT IF EXISTS contractor_profiles_primary_trade_plain,
  DROP CONSTRAINT IF EXISTS contractor_profiles_service_area_plain,
  DROP CONSTRAINT IF EXISTS contractor_profiles_headline_plain,
  DROP CONSTRAINT IF EXISTS contractor_profiles_bio_plain;

ALTER TABLE public.contractor_profiles
  ADD CONSTRAINT contractor_profiles_business_name_len
    CHECK (char_length(business_name) <= 80) NOT VALID,
  ADD CONSTRAINT contractor_profiles_business_name_plain
    CHECK (NOT public.text_contains_pre_hire_contact(business_name)) NOT VALID,
  ADD CONSTRAINT contractor_profiles_primary_trade_len
    CHECK (primary_trade IS NULL OR char_length(primary_trade) <= 80) NOT VALID,
  ADD CONSTRAINT contractor_profiles_primary_trade_plain
    CHECK (NOT public.text_contains_pre_hire_contact(primary_trade)) NOT VALID,
  ADD CONSTRAINT contractor_profiles_service_area_len
    CHECK (service_area IS NULL OR char_length(service_area) <= 120) NOT VALID,
  ADD CONSTRAINT contractor_profiles_service_area_plain
    CHECK (NOT public.text_contains_pre_hire_contact(service_area)) NOT VALID,
  ADD CONSTRAINT contractor_profiles_headline_len
    CHECK (headline IS NULL OR char_length(headline) <= 120) NOT VALID,
  ADD CONSTRAINT contractor_profiles_headline_plain
    CHECK (NOT public.text_contains_pre_hire_contact(headline)) NOT VALID,
  ADD CONSTRAINT contractor_profiles_bio_len
    CHECK (bio IS NULL OR char_length(bio) <= 2000) NOT VALID,
  ADD CONSTRAINT contractor_profiles_bio_plain
    CHECK (NOT public.text_contains_pre_hire_contact(bio)) NOT VALID,
  ADD CONSTRAINT contractor_profiles_website_url_http
    CHECK (
      website_url IS NULL
      OR (
        char_length(btrim(website_url)) <= 200
        AND btrim(website_url) ~* '^https?://[^[:space:]]+$'
        AND btrim(website_url) !~* 'javascript:'
      )
    ) NOT VALID,
  ADD CONSTRAINT contractor_profiles_years_experience_max
    CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 80) NOT VALID;
