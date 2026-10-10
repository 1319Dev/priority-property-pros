-- Public Find a Pro labels, service area, and business-name gating.
--
-- Why the public name was generated
-- ---------------------------------
-- 20260925000001_public_anonymized_directory.sql introduced
-- anonymized_pro_label() ("Approved Handyman Pro") on purpose. The comment
-- there is "Anonymized public labels. Never return a real business_name to
-- anon." Public browse must not hand a customer a searchable company name,
-- website, license, phone, email, or street they can use to hire off-platform
-- and skip the connection fee. That rule stays.
--
-- What changes
-- ------------
-- The generated "Approved {Trade} Pro" string read like a fake business name.
-- Public cards now use a neutral role label: "{trade} pro in {city}"
-- (for example "Fence Repair & Handyman pro in Conroe"). It is not the
-- business_name. A missing trade becomes "Local pro".
--
-- The real business_name is returned only on the caller's own project, and
-- only when message_pair_has_connection_entitlement is already true (paid
-- $4.99 CONNECTION_FEE_PAYMENT unlock, or the existing admin override).
-- This migration does not change that function, signup fees, Stripe, matching,
-- or the directory's unpaid-contractor predicate.
--
-- Service area uses the home ZIP centroid (city, or the county name when the
-- Census ZCTA has no place) plus the radius. It does not prefer a free-text
-- service_area such as "Montgomery County, TX" over the ZIP's city, and it
-- does not publish a street or the ZIP.
--
-- "Other" is omitted from public service lists. The public label is built
-- only from service_categories names the contractor offers, plus the ZIP
-- city. Free-text primary_trade is used only when it matches one of those
-- catalog names. A phone or other typed trade never becomes the label.
--
-- Public review text still drops phone/email/URL. It also drops a body that
-- contains this contractor's business name or personal name. Nicknames,
-- misspellings, and someone else's name are not detected. PUBLIC_SAFE photos
-- are still not scanned for logos or lettering; pending photos stay off the
-- public portfolio (privacy_state PUBLIC_SAFE only), so "No portfolio yet"
-- remains correct while photos are in review.
--
-- Anon-readable views call only functions anon can execute, or SECURITY DEFINER
-- wrappers granted to anon that do not return business_name. They do not call
-- signup_fee_is_satisfied (anon has no EXECUTE on it). The directory RPC may
-- still call it because that RPC is SECURITY DEFINER.

-- ---------------------------------------------------------------------------
-- Pure label helpers. No table reads. Safe to inline into anon views.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.public_service_is_other(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT lower(btrim(coalesce(p_name, ''))) = 'other';
$$;

CREATE OR REPLACE FUNCTION public.public_service_is_broad(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT lower(btrim(coalesce(p_name, ''))) IN (
    'other',
    'handyman',
    'general property maintenance',
    'all of it',
    'local'
  );
$$;

CREATE OR REPLACE FUNCTION public.public_trade_is_safe(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(btrim(coalesce(p_name, '')), '') IS NOT NULL
    AND NOT public.public_service_is_other(p_name)
    AND NOT public.text_contains_pre_hire_contact(p_name)
    AND NOT public.text_contains_contact_info(p_name)
    AND btrim(p_name) !~* '\d+\s+\w+.*\y(street|st|ave|avenue|rd|road|blvd|lane|ln|dr|drive|ct|court|way|pkwy|parkway)\y'
    AND btrim(p_name) !~ '^[0-9]{5}(-[0-9]{4})?$';
$$;

CREATE OR REPLACE FUNCTION public.public_primary_trade(p_primary_trade text, p_categories text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_best text;
  v_best_score integer := -1;
  v_score integer;
  v_chosen text;
BEGIN
  v_chosen := nullif(btrim(coalesce(p_primary_trade, '')), '');
  IF v_chosen IS NOT NULL AND p_categories IS NOT NULL THEN
    FOREACH v_name IN ARRAY p_categories LOOP
      IF lower(btrim(v_name)) = lower(v_chosen) AND public.public_trade_is_safe(v_name) THEN
        RETURN btrim(v_name);
      END IF;
    END LOOP;
  END IF;

  IF p_categories IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_name IN ARRAY p_categories LOOP
    IF NOT public.public_trade_is_safe(v_name) THEN
      CONTINUE;
    END IF;
    v_score := CASE WHEN public.public_service_is_broad(v_name) THEN 0 ELSE 1000 END
      + char_length(btrim(v_name));
    IF v_best IS NULL
       OR v_score > v_best_score
       OR (v_score = v_best_score AND btrim(v_name) < v_best) THEN
      v_best := btrim(v_name);
      v_best_score := v_score;
    END IF;
  END LOOP;
  RETURN v_best;
END;
$$;

CREATE OR REPLACE FUNCTION public.public_pro_label(
  p_primary_trade text,
  p_categories text[],
  p_city text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_primary text;
  v_second text;
  v_name text;
  v_best text;
  v_best_score integer := -1;
  v_score integer;
  v_city text;
  v_phrase text;
BEGIN
  v_primary := coalesce(public.public_primary_trade(p_primary_trade, p_categories), 'Local');

  IF p_categories IS NOT NULL THEN
    FOREACH v_name IN ARRAY p_categories LOOP
      IF NOT public.public_trade_is_safe(v_name) THEN
        CONTINUE;
      END IF;
      IF lower(btrim(v_name)) = lower(v_primary) THEN
        CONTINUE;
      END IF;
      v_score := CASE WHEN public.public_service_is_broad(v_name) THEN 0 ELSE 1000 END
        + char_length(btrim(v_name));
      IF v_best IS NULL
         OR v_score > v_best_score
         OR (v_score = v_best_score AND btrim(v_name) < v_best) THEN
        v_best := btrim(v_name);
        v_best_score := v_score;
      END IF;
    END LOOP;
  END IF;
  v_second := v_best;

  IF v_second IS NOT NULL
     AND public.public_service_is_broad(v_primary)
     AND NOT public.public_service_is_broad(v_second) THEN
    v_phrase := v_second || ' & ' || v_primary;
  ELSE
    v_phrase := v_primary;
  END IF;

  v_city := nullif(btrim(coalesce(p_city, '')), '');
  IF v_city IS NULL
     OR public.text_contains_pre_hire_contact(v_city)
     OR public.text_contains_contact_info(v_city)
     OR v_city ~ '[0-9]'
     OR v_city ~* '\y(street|st|ave|avenue|rd|road|blvd|lane|ln|dr|drive|ct|court|way|pkwy|parkway)\y' THEN
    v_city := NULL;
  END IF;

  IF v_city IS NULL THEN
    RETURN v_phrase || ' pro';
  END IF;
  RETURN v_phrase || ' pro in ' || v_city;
END;
$$;

-- Redacts phone, email, URL, this contractor's business name, and their
-- first/last name. A business name shorter than 4 characters is ignored so
-- a generic word is not wiped. Residual risk: nicknames, misspellings,
-- initials, and a different company's name are not detected.
CREATE OR REPLACE FUNCTION public.public_review_body(
  p_body text,
  p_business_name text,
  p_first_name text,
  p_last_name text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_text text;
  v_token text;
  v_pattern text;
BEGIN
  v_text := nullif(btrim(coalesce(p_body, '')), '');
  IF v_text IS NULL OR public.text_contains_pre_hire_contact(v_text) THEN
    RETURN 'Verified PPP review.';
  END IF;

  FOREACH v_token IN ARRAY ARRAY[
    nullif(btrim(coalesce(p_business_name, '')), ''),
    nullif(btrim(coalesce(p_first_name, '')), ''),
    nullif(btrim(coalesce(p_last_name, '')), '')
  ]
  LOOP
    IF v_token IS NULL OR char_length(v_token) < 4 THEN
      CONTINUE;
    END IF;
    IF position(' ' IN v_token) > 0 THEN
      IF position(lower(v_token) IN lower(v_text)) > 0 THEN
        RETURN 'Verified PPP review.';
      END IF;
    ELSE
      v_pattern := '\m' || regexp_replace(v_token, '([^[:alnum:]_])', '\\\1', 'g') || '\M';
      IF v_text ~* v_pattern THEN
        RETURN 'Verified PPP review.';
      END IF;
    END IF;
  END LOOP;

  v_text := regexp_replace(v_text, '\s+', ' ', 'g');
  IF char_length(v_text) > 280 THEN
    RETURN left(v_text, 277) || '…';
  END IF;
  RETURN v_text;
END;
$$;

REVOKE ALL ON FUNCTION public.public_service_is_other(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_service_is_broad(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_trade_is_safe(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_primary_trade(text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_pro_label(text, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_review_body(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_service_is_other(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_service_is_broad(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_trade_is_safe(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_primary_trade(text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_pro_label(text, text[], text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_review_body(text, text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.public_pro_label(text, text[], text) IS
  'Neutral public role label such as "Fence Repair & Handyman pro in Conroe". Never a business name. No table access. EXECUTE granted to anon because public views inline it.';
COMMENT ON FUNCTION public.public_review_body(text, text, text, text) IS
  'Public review text. Drops phone, email, URL, and this contractor''s business or personal name when those strings appear. Does not detect nicknames or misspellings. EXECUTE granted to anon because contractor_public_reviews inlines it.';

-- ---------------------------------------------------------------------------
-- Home ZIP place for the public phrase. City from zip_centroids, never the
-- free-text service_area and never the ZIP digits or a street.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.contractor_public_service_label(p_contractor_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.format_serves_within(
    a.radius_miles,
    c.city,
    c.state_code,
    NULL
  )
  FROM public.contractor_service_areas a
  JOIN public.zip_centroids c ON c.zip = public.normalize_zip(a.center_zip)
  WHERE a.contractor_profile_id = p_contractor_profile_id
    AND a.radius_miles IS NOT NULL
    AND nullif(btrim(coalesce(c.city, '')), '') IS NOT NULL
    AND public.contractor_is_directory_listed(p_contractor_profile_id)
  ORDER BY a.created_at, a.id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.contractor_public_service_label(uuid) IS
  'Public phrase Serves within N miles of the home ZIP city (or county, when the ZCTA has no place) and state. Does not publish the ZIP or a street. NULL when the contractor is not directory-listed.';

REVOKE ALL ON FUNCTION public.contractor_public_service_label(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contractor_public_service_label(uuid) TO anon, authenticated;

-- Directory card bits. SECURITY DEFINER so the view can read contractor_profiles
-- without returning business_name. NULL when the contractor is not listed.
CREATE OR REPLACE FUNCTION public.public_directory_label(p_contractor_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade text;
  v_business text;
  v_cats text[];
  v_city text;
BEGIN
  IF NOT public.contractor_is_directory_listed(p_contractor_profile_id) THEN
    RETURN NULL;
  END IF;

  SELECT cp.primary_trade, cp.business_name
  INTO v_trade, v_business
  FROM public.contractor_profiles cp
  WHERE cp.id = p_contractor_profile_id;

  IF v_trade IS NOT NULL
     AND v_business IS NOT NULL
     AND lower(btrim(v_trade)) = lower(btrim(v_business)) THEN
    v_trade := NULL;
  END IF;

  SELECT coalesce(array_agg(sc.name ORDER BY sc.name), '{}'::text[])
  INTO v_cats
  FROM public.contractor_services cs
  JOIN public.service_categories sc ON sc.id = cs.category_id
  WHERE cs.contractor_profile_id = p_contractor_profile_id
    AND NOT public.public_service_is_other(sc.name)
    AND (
      v_business IS NULL
      OR btrim(v_business) = ''
      OR lower(btrim(sc.name)) IS DISTINCT FROM lower(btrim(v_business))
    );

  SELECT c.city
  INTO v_city
  FROM public.contractor_service_areas a
  JOIN public.zip_centroids c ON c.zip = public.normalize_zip(a.center_zip)
  WHERE a.contractor_profile_id = p_contractor_profile_id
    AND nullif(btrim(coalesce(c.city, '')), '') IS NOT NULL
    AND c.city !~ '[0-9]'
  ORDER BY (a.radius_miles IS NULL), a.created_at, a.id
  LIMIT 1;

  RETURN public.public_pro_label(v_trade, v_cats, v_city);
END;
$$;

CREATE OR REPLACE FUNCTION public.public_directory_primary_trade(p_contractor_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade text;
  v_business text;
  v_cats text[];
BEGIN
  IF NOT public.contractor_is_directory_listed(p_contractor_profile_id) THEN
    RETURN NULL;
  END IF;

  SELECT cp.primary_trade, cp.business_name
  INTO v_trade, v_business
  FROM public.contractor_profiles cp
  WHERE cp.id = p_contractor_profile_id;

  IF v_trade IS NOT NULL
     AND v_business IS NOT NULL
     AND lower(btrim(v_trade)) = lower(btrim(v_business)) THEN
    v_trade := NULL;
  END IF;

  SELECT coalesce(array_agg(sc.name ORDER BY sc.name), '{}'::text[])
  INTO v_cats
  FROM public.contractor_services cs
  JOIN public.service_categories sc ON sc.id = cs.category_id
  WHERE cs.contractor_profile_id = p_contractor_profile_id
    AND NOT public.public_service_is_other(sc.name);

  RETURN public.public_primary_trade(v_trade, v_cats);
END;
$$;

CREATE OR REPLACE FUNCTION public.public_directory_categories(p_contractor_profile_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business text;
  v_cats text[];
BEGIN
  IF NOT public.contractor_is_directory_listed(p_contractor_profile_id) THEN
    RETURN '{}'::text[];
  END IF;

  SELECT cp.business_name INTO v_business
  FROM public.contractor_profiles cp
  WHERE cp.id = p_contractor_profile_id;

  SELECT coalesce(array_agg(sc.name ORDER BY sc.name), '{}'::text[])
  INTO v_cats
  FROM public.contractor_services cs
  JOIN public.service_categories sc ON sc.id = cs.category_id
  WHERE cs.contractor_profile_id = p_contractor_profile_id
    AND NOT public.public_service_is_other(sc.name)
    AND public.public_trade_is_safe(sc.name)
    AND (
      v_business IS NULL
      OR btrim(v_business) = ''
      OR lower(btrim(sc.name)) IS DISTINCT FROM lower(btrim(v_business))
    );

  RETURN v_cats;
END;
$$;

REVOKE ALL ON FUNCTION public.public_directory_label(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_directory_primary_trade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_directory_categories(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_directory_label(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_directory_primary_trade(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_directory_categories(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.public_directory_label(uuid) IS
  'Neutral public label for a directory-listed contractor. Does not return business_name. Granted to anon so contractor_public_profiles can call it.';

-- Unpaid gate below is unchanged from 20261012000003_unpaid_contractor_gates.sql.
-- Do not call signup_fee_is_satisfied from these views.
CREATE OR REPLACE VIEW public.contractor_public_profiles
WITH (security_invoker = false)
AS
SELECT
  cp.id,
  public.public_directory_label(cp.id) AS display_label,
  public.public_directory_primary_trade(cp.id) AS primary_trade,
  cp.years_experience,
  public.public_safe_blurb(cp.headline, cp.bio) AS short_description,
  public.public_safe_about(cp.bio, cp.headline) AS about,
  cp.accepting_work,
  cp.created_at,
  coalesce(
    public.contractor_public_service_label(cp.id),
    'Local service area'
  ) AS service_area
FROM public.contractor_profiles cp
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

CREATE OR REPLACE VIEW public.contractor_public_services
WITH (security_invoker = false)
AS
SELECT
  cs.id,
  cs.contractor_profile_id,
  cs.category_id,
  sc.slug AS category_slug,
  sc.name AS category_name
FROM public.contractor_services cs
JOIN public.contractor_profiles cp ON cp.id = cs.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
JOIN public.service_categories sc ON sc.id = cs.category_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'))
  AND NOT public.public_service_is_other(sc.name)
  AND (
    btrim(cp.business_name) = ''
    OR lower(btrim(sc.name)) IS DISTINCT FROM lower(btrim(cp.business_name))
  );

CREATE OR REPLACE VIEW public.contractor_public_reviews
WITH (security_invoker = false)
AS
SELECT
  r.id,
  r.contractor_profile_id,
  r.rating,
  public.public_review_body(r.body, cp.business_name, p.first_name, p.last_name) AS body
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND (NOT public.signup_fee_enabled() OR p.signup_fee_status IN ('PAID', 'NOT_REQUIRED') OR p.account_type NOT IN ('CUSTOMER', 'CONTRACTOR'));

COMMENT ON VIEW public.contractor_public_profiles IS
  'Approved, signup-fee-satisfied contractors. display_label is a trade and city, not a business name. No phone, email, street, website, or license.';
COMMENT ON VIEW public.contractor_public_services IS
  'Public catalog services for a listed contractor. Omits Other and a category whose name equals the business name.';
COMMENT ON VIEW public.contractor_public_reviews IS
  'Verified customer reviews. Contact text and this contractor''s business or personal name are replaced with a generic line.';

CREATE OR REPLACE FUNCTION public.list_public_directory_contractors()
RETURNS TABLE (
  id uuid,
  display_label text,
  primary_trade text,
  categories text[],
  service_area text,
  years_experience integer,
  rating_average numeric,
  rating_count integer,
  badges jsonb,
  short_description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.id,
    public.public_directory_label(cp.id),
    public.public_directory_primary_trade(cp.id),
    public.public_directory_categories(cp.id),
    coalesce(
      public.contractor_public_service_label(cp.id),
      'Local service area'
    ),
    cp.years_experience,
    r.rating_average,
    coalesce(r.rating_count, 0),
    (
      jsonb_build_array(jsonb_build_object('kind', 'APPROVED', 'label', 'Approved Pro'))
      || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'kind', cr.kind,
          'label', public.generic_credential_badge_label(cr.kind)
        ) ORDER BY cr.kind)
        FROM public.contractor_credentials cr
        WHERE cr.contractor_profile_id = cp.id
          AND cr.status = 'VERIFIED'
      ), '[]'::jsonb)
    ),
    public.public_safe_blurb(cp.headline, cp.bio)
  FROM public.contractor_profiles cp
  JOIN public.profiles p ON p.id = cp.profile_id
  LEFT JOIN public.contractor_public_ratings r ON r.contractor_profile_id = cp.id
  WHERE cp.approval_status = 'APPROVED'
    AND p.account_status = 'ACTIVE'
    AND public.signup_fee_is_satisfied(cp.profile_id)
  ORDER BY 2, cp.id;
$$;

REVOKE ALL ON FUNCTION public.list_public_directory_contractors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_directory_contractors() TO anon, authenticated;

COMMENT ON FUNCTION public.list_public_directory_contractors() IS
  'Public directory. APPROVED + ACTIVE + signup_fee_is_satisfied. Neutral trade/city label. No business name, email, phone, website, photo, street, or license.';

-- Name on the caller's own project. Reuses message_pair_has_connection_entitlement
-- without changing it. Admins and the contractor see the business name.
-- Anyone else, including the project customer before a paid connection, gets
-- the neutral label. An unrelated caller gets an error and no row.
CREATE OR REPLACE FUNCTION public.contractor_name_for_my_project(
  p_project_id uuid,
  p_contractor_profile_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_profile uuid;
  v_business text;
  v_label text;
  v_reveal boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;

  SELECT p.customer_id INTO v_owner
  FROM public.projects p
  WHERE p.id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT cp.profile_id, cp.business_name
  INTO v_profile, v_business
  FROM public.contractor_profiles cp
  WHERE cp.id = p_contractor_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  v_label := coalesce(public.public_directory_label(p_contractor_profile_id), 'Local pro');

  IF public.is_admin() OR auth.uid() = v_profile THEN
    v_reveal := true;
  ELSIF v_owner = auth.uid()
     AND public.message_pair_has_connection_entitlement(p_project_id, p_contractor_profile_id) THEN
    v_reveal := true;
  ELSIF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF v_reveal
     AND nullif(btrim(coalesce(v_business, '')), '') IS NOT NULL
     AND NOT public.text_contains_contact_info(v_business)
     AND NOT public.text_contains_pre_hire_contact(v_business) THEN
    RETURN btrim(v_business);
  END IF;
  RETURN v_label;
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_name_for_my_project(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_name_for_my_project(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.contractor_name_for_my_project(uuid, uuid) IS
  'Business name only for an admin, the contractor, or the project customer after message_pair_has_connection_entitlement. Otherwise the neutral public label. No phone, email, or street.';

-- Project connection cards. Entitlement check is unchanged.
CREATE OR REPLACE FUNCTION public.list_my_project_connection_cards(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_agg(item.card ORDER BY item.created_at)
      FROM (
        SELECT
          c.created_at,
          jsonb_build_object(
            'connection_id', c.id,
            'contractor_profile_id', c.contractor_profile_id,
            'display_name',
              CASE
                WHEN (
                  public.is_admin()
                  OR public.message_pair_has_connection_entitlement(c.project_id, c.contractor_profile_id)
                )
                  AND cp.business_name IS NOT NULL
                  AND btrim(cp.business_name) <> ''
                  AND NOT public.text_contains_contact_info(cp.business_name)
                  AND NOT public.text_contains_pre_hire_contact(cp.business_name)
                  THEN btrim(cp.business_name)
                ELSE coalesce(public.public_directory_label(cp.id), 'Local pro')
              END,
            'connection_status', c.status,
            'booking_status', (
              SELECT b.status
              FROM public.bookings b
              WHERE b.project_id = c.project_id
                AND b.contractor_profile_id = c.contractor_profile_id
                AND b.status IS DISTINCT FROM 'CANCELLED'
              ORDER BY b.created_at DESC
              LIMIT 1
            ),
            'can_message', public.message_pair_has_connection_entitlement(c.project_id, c.contractor_profile_id)
          ) AS card
        FROM public.project_connections c
        JOIN public.projects p ON p.id = c.project_id
        JOIN public.contractor_profiles cp ON cp.id = c.contractor_profile_id
        WHERE c.project_id = p_project_id
          AND (
            p.customer_id = (SELECT auth.uid())
            OR public.is_admin()
          )
          AND c.status IN ('INITIATED', 'RESERVED', 'PAYMENT_DISABLED', 'PAID', 'COMPLETED')
      ) item
    ),
    '[]'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.list_my_project_connection_cards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_project_connection_cards(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_my_project_connection_cards(uuid) IS
  'Project owner or admin connection cards. The project customer sees the business name only when message_pair_has_connection_entitlement is already true. Admins see the business name. Otherwise the neutral public label. No phone, email, street, or fee fields.';

-- Inbox. Rows exist only after the entitlement filter. Customers then see the
-- business name. The fallback label is the neutral public label.
-- Production applied project_reference_numbers after message_inbox_reads, so
-- the live function returns project_reference_number. Keep that field.
CREATE OR REPLACE FUNCTION public.list_my_message_threads()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pairs AS (
    SELECT DISTINCT ON (a.project_id, a.contractor_profile_id)
      a.project_id,
      a.contractor_profile_id
    FROM public.booking_contact_access a
    WHERE public.message_pair_has_connection_entitlement(a.project_id, a.contractor_profile_id)
    ORDER BY a.project_id, a.contractor_profile_id
  ),
  rows AS (
    SELECT
      t.id AS thread_id,
      pairs.project_id,
      pairs.contractor_profile_id,
      CASE
        WHEN public.text_contains_contact_info(p.title) OR public.text_contains_pre_hire_contact(p.title)
          THEN 'Project'
        ELSE coalesce(nullif(btrim(p.title), ''), 'Project')
      END AS project_title,
      p.reference_number AS project_reference_number,
      CASE
        WHEN public.text_contains_contact_info(p.city) OR public.text_contains_pre_hire_contact(p.city)
          THEN NULL
        ELSE nullif(btrim(p.city), '')
      END AS city,
      CASE
        WHEN public.text_contains_contact_info(p.state) OR public.text_contains_pre_hire_contact(p.state)
          THEN NULL
        ELSE nullif(btrim(p.state), '')
      END AS state,
      coalesce(public.public_directory_label(cp.id), 'Local pro') AS contractor_label,
      CASE
        WHEN p.customer_id = (SELECT auth.uid()) THEN
          CASE
            WHEN cp.business_name IS NULL
              OR btrim(cp.business_name) = ''
              OR public.text_contains_contact_info(cp.business_name)
              OR public.text_contains_pre_hire_contact(cp.business_name)
              THEN coalesce(public.public_directory_label(cp.id), 'Local pro')
            ELSE btrim(cp.business_name)
          END
        ELSE
          CASE
            WHEN cust.first_name IS NULL
              OR btrim(cust.first_name) = ''
              OR public.text_contains_contact_info(cust.first_name)
              OR public.text_contains_pre_hire_contact(cust.first_name)
              THEN 'Customer'
            ELSE btrim(cust.first_name)
          END
      END AS other_party_label,
      (
        SELECT m.created_at
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message_at,
      (
        SELECT left(m.body, 140)
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_preview,
      coalesce((
        SELECT m.sender_profile_id = (SELECT auth.uid())
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ), false) AS last_sender_is_viewer,
      coalesce((
        SELECT count(*)::int
        FROM public.project_messages m
        WHERE m.thread_id = t.id
          AND m.sender_profile_id IS DISTINCT FROM (SELECT auth.uid())
          AND m.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz)
      ), 0) AS unread_count,
      rd.last_read_at,
      (
        SELECT b.id
        FROM public.bookings b
        WHERE b.project_id = pairs.project_id
          AND b.contractor_profile_id = pairs.contractor_profile_id
          AND b.status IS DISTINCT FROM 'CANCELLED'
        ORDER BY b.created_at DESC
        LIMIT 1
      ) AS booking_id,
      (
        SELECT o.id
        FROM public.opportunities o
        WHERE o.project_id = pairs.project_id
          AND o.contractor_profile_id = pairs.contractor_profile_id
        ORDER BY o.created_at DESC
        LIMIT 1
      ) AS opportunity_id
    FROM pairs
    JOIN public.projects p ON p.id = pairs.project_id
    JOIN public.profiles cust ON cust.id = p.customer_id
    JOIN public.contractor_profiles cp ON cp.id = pairs.contractor_profile_id
    LEFT JOIN public.project_message_threads t
      ON t.project_id = pairs.project_id
     AND t.contractor_profile_id = pairs.contractor_profile_id
    LEFT JOIN public.project_message_reads rd
      ON rd.thread_id = t.id
     AND rd.profile_id = (SELECT auth.uid())
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'thread_id', rows.thread_id,
        'project_id', rows.project_id,
        'contractor_profile_id', rows.contractor_profile_id,
        'project_title', rows.project_title,
        'project_reference_number', rows.project_reference_number,
        'city', rows.city,
        'state', rows.state,
        'contractor_label', rows.contractor_label,
        'other_party_label', rows.other_party_label,
        'last_message_at', rows.last_message_at,
        'last_preview', rows.last_preview,
        'last_sender_is_viewer', rows.last_sender_is_viewer,
        'unread_count', rows.unread_count,
        'last_read_at', rows.last_read_at,
        'booking_id', rows.booking_id,
        'opportunity_id', rows.opportunity_id
      )
      ORDER BY rows.last_message_at DESC NULLS LAST, rows.project_title
    ),
    '[]'::jsonb
  )
  FROM rows;
$$;

COMMENT ON FUNCTION public.list_my_message_threads() IS
  'Inbox rows only after message_pair_has_connection_entitlement. Customers then see the contractor business name. Includes project_reference_number. Before that, this function returns no row. No phone, email, or street.';

REVOKE ALL ON FUNCTION public.list_my_message_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_message_threads() TO authenticated;

-- Notification body. A customer sees the business name in "New message from …"
-- only while the paid connection entitlement is still active. Otherwise the
-- stored body is replaced on read. Payload contact keys stay stripped.
CREATE OR REPLACE FUNCTION public.list_my_notifications()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(item ORDER BY (item->>'created_at') DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'id', n.id,
      'kind', n.kind,
      'title', n.title,
      'body',
        CASE
          WHEN n.kind = 'message.received'
            AND NOT public.is_admin()
            AND (n.payload ->> 'contractor_profile_id') IS DISTINCT FROM public.current_contractor_profile_id()::text
            AND coalesce(n.payload ->> 'project_id', '') ~ '^[0-9a-fA-F-]{36}$'
            AND coalesce(n.payload ->> 'contractor_profile_id', '') ~ '^[0-9a-fA-F-]{36}$'
            AND NOT public.message_pair_has_connection_entitlement(
              (n.payload ->> 'project_id')::uuid,
              (n.payload ->> 'contractor_profile_id')::uuid
            )
            THEN 'New message about your project.'
          ELSE n.body
        END,
      'entity_type', n.entity_type,
      'entity_id', n.entity_id,
      'payload', public.strip_private_contact_keys(n.payload),
      'channel', n.channel,
      'read_at', n.read_at,
      'created_at', n.created_at
    ) AS item
    FROM public.notifications n
    WHERE n.recipient_profile_id = auth.uid()
    ORDER BY n.created_at DESC
    LIMIT 50
  ) q;
$$;

REVOKE ALL ON FUNCTION public.list_my_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_notifications() TO authenticated;

COMMENT ON FUNCTION public.list_my_notifications() IS
  'Caller notifications. Message notices keep a contractor business name only while message_pair_has_connection_entitlement is true. Payload never includes phone, email, street, or coords.';

CREATE OR REPLACE FUNCTION public.notify_project_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.project_message_threads;
  v_owner uuid;
  v_contractor_user uuid;
  v_recipient uuid;
  v_from text;
  v_business text;
BEGIN
  SELECT * INTO v_thread FROM public.project_message_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.project_message_threads
  SET updated_at = now()
  WHERE id = v_thread.id;

  SELECT p.customer_id INTO v_owner
  FROM public.projects p
  WHERE p.id = v_thread.project_id;
  v_contractor_user := public.contractor_owner_profile_id(v_thread.contractor_profile_id);

  IF NEW.sender_profile_id = v_owner THEN
    v_recipient := v_contractor_user;
    SELECT coalesce(nullif(btrim(first_name), ''), 'a customer') INTO v_from
    FROM public.profiles
    WHERE id = v_owner;
  ELSIF NEW.sender_profile_id = v_contractor_user THEN
    v_recipient := v_owner;
    IF public.message_pair_has_connection_entitlement(v_thread.project_id, v_thread.contractor_profile_id) THEN
      SELECT nullif(btrim(business_name), '') INTO v_business
      FROM public.contractor_profiles
      WHERE id = v_thread.contractor_profile_id;
      v_from := coalesce(v_business, 'a pro');
    ELSE
      v_from := coalesce(public.public_directory_label(v_thread.contractor_profile_id), 'a pro');
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_profile_id THEN
    RETURN NEW;
  END IF;

  IF v_from IS NULL
     OR public.text_contains_contact_info(v_from)
     OR public.text_contains_pre_hire_contact(v_from) THEN
    v_from := CASE WHEN NEW.sender_profile_id = v_owner THEN 'a customer' ELSE 'a pro' END;
  END IF;

  PERFORM public.ppp_set_rpc('notify_project_message');
  PERFORM public.enqueue_notification(
    v_recipient,
    'message.received',
    'New message',
    'New message from ' || v_from || '.',
    'project_message_threads',
    v_thread.id,
    jsonb_build_object(
      'thread_id', v_thread.id,
      'project_id', v_thread.project_id,
      'contractor_profile_id', v_thread.contractor_profile_id
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_project_message() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notify_project_message() IS
  'In-app notice. The customer sees the contractor business name only when message_pair_has_connection_entitlement is already true. Payload is thread ids only.';

-- Hire Again. Business name only when the completed booking's project still
-- has the paid connection entitlement for this caller. Otherwise the neutral label.
CREATE OR REPLACE FUNCTION public.hire_again_contractors()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  months integer;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  months := public.relationship_protection_months();
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      r.id AS relationship_id,
      r.contractor_profile_id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.bookings b
          WHERE b.id = r.last_completed_booking_id
            AND public.message_pair_has_connection_entitlement(b.project_id, r.contractor_profile_id)
        )
        AND nullif(btrim(cp.business_name), '') IS NOT NULL
        AND NOT public.text_contains_contact_info(cp.business_name)
        AND NOT public.text_contains_pre_hire_contact(cp.business_name)
          THEN btrim(cp.business_name)
        ELSE coalesce(public.public_directory_label(cp.id), 'Local pro')
      END AS business_name,
      coalesce(
        public.public_directory_primary_trade(cp.id),
        public.public_primary_trade(
          CASE
            WHEN lower(btrim(coalesce(cp.primary_trade, ''))) = lower(btrim(coalesce(cp.business_name, '')))
              THEN NULL
            ELSE cp.primary_trade
          END,
          NULL
        )
      ) AS primary_trade,
      r.introduced_at,
      r.last_completed_at,
      r.last_completed_booking_id,
      r.protected_until,
      r.protected_until > now() AS currently_protected,
      months AS protection_months,
      false AS charges_live,
      false AS payments_live
    FROM public.customer_contractor_relationships r
    JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
    WHERE r.customer_id = auth.uid()
      AND r.status = 'ACTIVE'
      AND r.last_completed_booking_id IS NOT NULL
    ORDER BY r.last_completed_at DESC NULLS LAST
  ) x;
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.hire_again_contractors() IS
  'Caller''s completed relationships. business_name is the real name only when message_pair_has_connection_entitlement is true for the completed booking''s project. Otherwise the neutral public label. Does not change protection months or payment flags.';
