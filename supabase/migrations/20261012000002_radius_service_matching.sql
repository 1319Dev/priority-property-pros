-- Radius service areas: ZIP-centroid distance, legacy ZIP-list fallback, and
-- an idempotent inference for contractors who already typed ZIP lists.
-- Does not change Stripe, checkout, webhooks, prices, or fee flags
-- (payments_live, charges_live, signup_fee_enabled, connection_fee_checkout_enabled).
-- No Edge Function changes. Matching stays in existing SQL functions.

-- ---------------------------------------------------------------------------
-- Distance helpers. Signature of location_matches stays the same so the
-- top-3 offer queue, pass backfill, and rematch trigger keep calling it.
-- p_lat / p_lng are ignored: those columns are the private street pin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.format_radius_miles(p_miles numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_miles IS NULL THEN NULL
    WHEN p_miles = trunc(p_miles) THEN trunc(p_miles)::integer::text
    ELSE trim(to_char(p_miles, 'FM999990.99'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.format_serves_within(
  p_miles numeric,
  p_city text,
  p_state text,
  p_zip text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_miles IS NULL OR p_miles <= 0 THEN NULL
    WHEN nullif(btrim(coalesce(p_city, '')), '') IS NOT NULL
         AND nullif(btrim(coalesce(p_state, '')), '') IS NOT NULL THEN
      'Serves within ' || public.format_radius_miles(p_miles) || ' miles of '
        || btrim(p_city) || ', ' || upper(btrim(p_state))
    WHEN public.normalize_zip(p_zip) IS NOT NULL THEN
      'Serves within ' || public.format_radius_miles(p_miles) || ' miles of '
        || public.normalize_zip(p_zip)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.sensible_radius_miles(p_max_miles numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_max_miles IS NULL OR p_max_miles <= 5 THEN 5
    WHEN p_max_miles <= 10 THEN 10
    WHEN p_max_miles <= 25 THEN 25
    WHEN p_max_miles <= 50 THEN 50
    WHEN p_max_miles <= 75 THEN 75
    WHEN p_max_miles <= 100 THEN 100
    ELSE 150
  END::numeric;
$$;

COMMENT ON FUNCTION public.sensible_radius_miles(numeric) IS
  'Smallest of 5, 10, 25, 50, 75, 100, 150 that covers the farthest listed ZIP. Caps at 150. Exact ZIP overrides stay on the row.';

CREATE OR REPLACE FUNCTION public.zip_centroid_miles(p_zip_a text, p_zip_b text)
RETURNS numeric
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT public.haversine_miles(a.lat, a.lng, b.lat, b.lng)
  FROM public.zip_centroids a
  JOIN public.zip_centroids b ON b.zip = public.normalize_zip(p_zip_b)
  WHERE a.zip = public.normalize_zip(p_zip_a);
$$;

COMMENT ON FUNCTION public.zip_centroid_miles(text, text) IS
  'Haversine miles between two Census ZCTA centroids. NULL when either ZIP is not in zip_centroids.';

REVOKE ALL ON FUNCTION public.format_radius_miles(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.format_serves_within(numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sensible_radius_miles(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zip_centroid_miles(text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Preview for the contractor radius picker. Authenticated only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.zip_service_area_preview(p_zip text, p_radius_miles numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base public.zip_centroids;
  normalized text := public.normalize_zip(p_zip);
  zip_count integer := 0;
  lat_pad numeric;
  lng_pad numeric;
  place text;
  noun text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required';
  END IF;
  IF p_radius_miles IS NULL OR p_radius_miles < 1 OR p_radius_miles > 150 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Choose a radius between 1 and 150 miles.');
  END IF;
  IF normalized IS NULL OR length(normalized) <> 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enter a valid US ZIP code.');
  END IF;

  SELECT * INTO base FROM public.zip_centroids WHERE zip = normalized;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enter a valid US ZIP code.');
  END IF;

  lat_pad := p_radius_miles / 69.0;
  lng_pad := p_radius_miles / (69.0 * greatest(abs(cos(radians(base.lat))), 0.2));

  SELECT count(*)::integer INTO zip_count
  FROM public.zip_centroids z
  WHERE z.lat BETWEEN base.lat - lat_pad AND base.lat + lat_pad
    AND z.lng BETWEEN base.lng - lng_pad AND base.lng + lng_pad
    AND public.haversine_miles(base.lat, base.lng, z.lat, z.lng) <= p_radius_miles;

  place := CASE
    WHEN nullif(btrim(coalesce(base.city, '')), '') IS NOT NULL
         AND nullif(btrim(coalesce(base.state_code, '')), '') IS NOT NULL
      THEN btrim(base.city) || ', ' || base.state_code
    ELSE base.zip
  END;
  noun := CASE WHEN zip_count = 1 THEN 'ZIP code' ELSE 'ZIP codes' END;

  RETURN jsonb_build_object(
    'ok', true,
    'zip', base.zip,
    'city', base.city,
    'state', base.state_code,
    'zip_count', zip_count,
    'preview', 'Covers about ' || zip_count::text || ' ' || noun || ' around ' || place,
    'public_label', public.format_serves_within(p_radius_miles, base.city, base.state_code, base.zip)
  );
END;
$$;

COMMENT ON FUNCTION public.zip_service_area_preview(text, numeric) IS
  'Validates a base ZIP against Census centroids and counts ZCTAs inside the radius. No street data.';

REVOKE ALL ON FUNCTION public.zip_service_area_preview(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zip_service_area_preview(text, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- Keep center coordinates and the public label aligned with the dataset.
-- Logged-in saves must use a known ZIP. Migration runs with auth.uid() NULL
-- and must not delete legacy zip_codes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_contractor_service_area_radius()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base public.zip_centroids;
  cleaned text[];
BEGIN
  NEW.center_zip := public.normalize_zip(NEW.center_zip);

  IF NEW.radius_miles IS NOT NULL AND (NEW.radius_miles < 1 OR NEW.radius_miles > 150) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Choose a radius between 1 and 150 miles';
    ELSIF NEW.radius_miles IS DISTINCT FROM OLD.radius_miles THEN
      RAISE EXCEPTION 'Choose a radius between 1 and 150 miles';
    END IF;
  END IF;

  IF NEW.radius_miles IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.center_zip IS NULL OR length(NEW.center_zip) <> 5 THEN
    RAISE EXCEPTION 'A base ZIP is required when a service radius is set';
  END IF;

  SELECT * INTO base FROM public.zip_centroids WHERE zip = NEW.center_zip;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enter a valid US ZIP code.';
  END IF;

  NEW.center_lat := base.lat;
  NEW.center_lng := base.lng;
  NEW.label := public.format_serves_within(NEW.radius_miles, base.city, base.state_code, NEW.center_zip);

  IF auth.uid() IS NOT NULL THEN
    SELECT coalesce(array_agg(z ORDER BY z), '{}'::text[])
    INTO cleaned
    FROM (
      SELECT DISTINCT public.normalize_zip(x) AS z
      FROM unnest(coalesce(NEW.zip_codes, '{}'::text[])) AS x
    ) s
    WHERE z IS NOT NULL AND length(z) = 5;

    IF EXISTS (
      SELECT 1
      FROM unnest(cleaned) AS z
      WHERE NOT EXISTS (SELECT 1 FROM public.zip_centroids c WHERE c.zip = z)
    ) THEN
      RAISE EXCEPTION 'Unknown ZIP code';
    END IF;
    NEW.zip_codes := cleaned;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(NEW.zip_codes, '{}'::text[])) AS z
    WHERE public.normalize_zip(z) IS NOT NULL
      AND public.normalize_zip(z) IS DISTINCT FROM NEW.center_zip
  ) THEN
    NEW.mode := 'ZIPS_AND_RADIUS';
  ELSE
    NEW.mode := 'RADIUS';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contractor_service_areas_sync_radius ON public.contractor_service_areas;
CREATE TRIGGER contractor_service_areas_sync_radius
  BEFORE INSERT OR UPDATE ON public.contractor_service_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_contractor_service_area_radius();

REVOKE ALL ON FUNCTION public.sync_contractor_service_area_radius() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Eligibility. Legacy rows (radius_miles IS NULL) still match the typed list.
-- Once a radius is set, a project matches when the ZIP centroids are within
-- that radius, or when the ZIP is an explicit override on zip_codes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.location_matches(
  p_zip text,
  p_lat numeric,
  p_lng numeric,
  p_area public.contractor_service_areas
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  zip text := public.normalize_zip(p_zip);
  area_zip text := public.normalize_zip(p_area.center_zip);
  miles numeric;
  normalized_zips text[];
BEGIN
  -- p_lat and p_lng stay in the signature for existing callers. They are the
  -- private street pin and are not used. Distance is ZIP centroid to centroid.

  SELECT coalesce(array_agg(public.normalize_zip(z)), '{}'::text[])
  INTO normalized_zips
  FROM unnest(coalesce(p_area.zip_codes, '{}'::text[])) AS z
  WHERE public.normalize_zip(z) IS NOT NULL;

  IF p_area.radius_miles IS NOT NULL AND area_zip IS NOT NULL THEN
    miles := public.zip_centroid_miles(zip, area_zip);
    IF miles IS NOT NULL AND miles <= p_area.radius_miles THEN
      RETURN true;
    END IF;
    IF zip IS NOT NULL AND zip = ANY (normalized_zips) THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  IF zip IS NOT NULL AND zip = ANY (normalized_zips) THEN
    RETURN true;
  END IF;
  IF zip IS NOT NULL AND area_zip IS NOT NULL AND zip = area_zip THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.location_matches(text, numeric, numeric, public.contractor_service_areas) IS
  'Project ZIP centroid within contractor radius, plus optional extra ZIPs. Legacy ZIP lists match only when radius_miles is null. Ignores street coordinates.';

-- Fit score uses the same centroid distance. Offer cap, fairness, and pass
-- backfill are unchanged; only the location term of the score moves.
CREATE OR REPLACE FUNCTION public.project_contractor_fit_score(
  p_project_id uuid,
  p_contractor_profile_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  cp public.contractor_profiles;
  acct public.profiles;
  score integer := 0;
  zip_exact boolean := false;
  area public.contractor_service_areas;
  miles numeric;
  best_radius integer := 0;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT * INTO cp FROM public.contractor_profiles WHERE id = p_contractor_profile_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT * INTO acct FROM public.profiles WHERE id = cp.profile_id;

  IF EXISTS (
    SELECT 1
    FROM public.contractor_services cs
    WHERE cs.contractor_profile_id = cp.id
      AND cs.category_id = proj.category_id
  ) THEN
    score := score + 30;
  END IF;
  IF acct.account_status = 'ACTIVE' THEN
    score := score + 15;
  END IF;
  IF cp.approval_status = 'APPROVED' THEN
    score := score + 15;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_service_areas a
    WHERE a.contractor_profile_id = cp.id
      AND public.normalize_zip(proj.zip_code) IS NOT NULL
      AND (
        public.normalize_zip(proj.zip_code) = public.normalize_zip(a.center_zip)
        OR public.normalize_zip(proj.zip_code) = ANY (
          SELECT public.normalize_zip(z) FROM unnest(a.zip_codes) AS z
        )
      )
  ) INTO zip_exact;

  IF zip_exact THEN
    score := score + 20;
  ELSE
    FOR area IN
      SELECT *
      FROM public.contractor_service_areas a
      WHERE a.contractor_profile_id = cp.id
        AND a.radius_miles IS NOT NULL
    LOOP
      miles := public.zip_centroid_miles(proj.zip_code, area.center_zip);
      IF miles IS NOT NULL AND miles <= area.radius_miles THEN
        IF miles <= (area.radius_miles / 2.0) THEN
          best_radius := GREATEST(best_radius, 12);
        ELSE
          best_radius := GREATEST(best_radius, 8);
        END IF;
      END IF;
    END LOOP;
    score := score + best_radius;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contractor_credentials cr
    WHERE cr.contractor_profile_id = cp.id
      AND cr.status = 'VERIFIED'
      AND (cr.expires_at IS NULL OR cr.expires_at >= CURRENT_DATE)
  ) THEN
    score := score + 10;
  END IF;

  score := score + LEAST(GREATEST(coalesce(cp.years_experience, 0), 0), 10);

  IF cp.min_job_cents IS NOT NULL OR cp.max_job_cents IS NOT NULL THEN
    score := score + 5;
  END IF;

  RETURN score;
END;
$$;

REVOKE ALL ON FUNCTION public.project_contractor_fit_score(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Idempotent inference.
-- Updates only rows with radius_miles IS NULL and at least one ZIP present in
-- zip_centroids. Does not delete or replace zip_codes. Rows that already have
-- a radius are left alone except a lat/lng backfill when the center ZIP is known.
-- A second run updates 0 inference rows.
-- Production row counts are reported with RAISE NOTICE at apply time. This repo
-- has no production snapshot; an empty contractor_service_areas table infers 0.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.infer_legacy_service_radii()
RETURNS TABLE (
  inferred integer,
  unresolved_legacy integer,
  already_had_radius integer,
  centroids_backfilled integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inferred integer := 0;
  v_unresolved integer := 0;
  v_already integer := 0;
  v_backfilled integer := 0;
BEGIN
  SELECT count(*)::integer INTO v_already
  FROM public.contractor_service_areas
  WHERE radius_miles IS NOT NULL;

  WITH known AS (
    SELECT a.id, public.normalize_zip(z.zip) AS zip
    FROM public.contractor_service_areas a
    CROSS JOIN LATERAL unnest(
      coalesce(a.zip_codes, '{}'::text[])
      || CASE
           WHEN a.center_zip IS NOT NULL THEN ARRAY[a.center_zip]
           ELSE '{}'::text[]
         END
    ) AS z(zip)
    JOIN public.zip_centroids c ON c.zip = public.normalize_zip(z.zip)
    WHERE a.radius_miles IS NULL
  ),
  stats AS (
    SELECT k.id, avg(c.lat) AS mean_lat, avg(c.lng) AS mean_lng
    FROM known k
    JOIN public.zip_centroids c ON c.zip = k.zip
    GROUP BY k.id
  ),
  base AS (
    SELECT DISTINCT ON (k.id)
      k.id,
      k.zip AS base_zip,
      c.lat,
      c.lng
    FROM known k
    JOIN public.zip_centroids c ON c.zip = k.zip
    JOIN stats s ON s.id = k.id
    ORDER BY k.id, public.haversine_miles(s.mean_lat, s.mean_lng, c.lat, c.lng), k.zip
  ),
  farthest AS (
    SELECT
      b.id,
      b.base_zip,
      b.lat,
      b.lng,
      max(public.haversine_miles(b.lat, b.lng, c.lat, c.lng)) AS max_miles
    FROM base b
    JOIN known k ON k.id = b.id
    JOIN public.zip_centroids c ON c.zip = k.zip
    GROUP BY b.id, b.base_zip, b.lat, b.lng
  )
  UPDATE public.contractor_service_areas a
  SET
    center_zip = f.base_zip,
    radius_miles = public.sensible_radius_miles(f.max_miles)
  FROM farthest f
  WHERE a.id = f.id
    AND a.radius_miles IS NULL;

  GET DIAGNOSTICS v_inferred = ROW_COUNT;

  UPDATE public.contractor_service_areas a
  SET
    center_zip = c.zip,
    center_lat = c.lat,
    center_lng = c.lng
  FROM public.zip_centroids c
  WHERE a.radius_miles IS NOT NULL
    AND c.zip = public.normalize_zip(a.center_zip)
    AND (
      a.center_lat IS NULL
      OR a.center_lng IS NULL
      OR a.center_zip IS DISTINCT FROM c.zip
    );

  GET DIAGNOSTICS v_backfilled = ROW_COUNT;

  SELECT count(*)::integer INTO v_unresolved
  FROM public.contractor_service_areas
  WHERE radius_miles IS NULL;

  inferred := v_inferred;
  unresolved_legacy := v_unresolved;
  already_had_radius := v_already;
  centroids_backfilled := v_backfilled;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.infer_legacy_service_radii() IS
  'Idempotent. Sets base ZIP and a covering radius only where radius_miles IS NULL and a listed ZIP exists in zip_centroids. Does not clear zip_codes. Re-running infers 0 rows.';

REVOKE ALL ON FUNCTION public.infer_legacy_service_radii() FROM PUBLIC, anon, authenticated;

DO $infer$
DECLARE
  stats record;
BEGIN
  SELECT * INTO stats FROM public.infer_legacy_service_radii();
  RAISE NOTICE 'zip radius data migration: inferred=% unresolved_legacy=% already_had_radius=% centroids_backfilled=% (zip_codes were not cleared)',
    stats.inferred, stats.unresolved_legacy, stats.already_had_radius, stats.centroids_backfilled;
END
$infer$;

-- ---------------------------------------------------------------------------
-- Public directory phrase. Pending contractors stay hidden.
-- ---------------------------------------------------------------------------

-- Profile city/state come from contractor_profiles.service_area ("Willis, TX" or "Willis").
-- Census may label the same ZIP differently (77318 is Conroe). Public labels prefer the profile.
CREATE OR REPLACE FUNCTION public.contractor_profile_place(p_service_area text)
RETURNS TABLE (city text, state_code text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  raw text := btrim(coalesce(p_service_area, ''));
  city_part text;
  state_part text;
  parsed_city text;
  parsed_state text;
BEGIN
  IF raw = '' THEN
    RETURN;
  END IF;
  IF public.text_contains_pre_hire_contact(raw) THEN
    RETURN;
  END IF;
  IF raw ~ '[0-9]' THEN
    RETURN;
  END IF;
  IF raw ~* '\y(street|avenue|road|drive|lane|court|parkway|blvd|boulevard)\y' THEN
    RETURN;
  END IF;

  IF position(',' IN raw) > 0 THEN
    city_part := btrim(split_part(raw, ',', 1));
    state_part := btrim(regexp_replace(split_part(raw, ',', 2), '\s.*$', ''));
    parsed_city := public.normalize_city(city_part);
    parsed_state := public.normalize_us_state(state_part);
    IF parsed_city IS NOT NULL AND parsed_state ~ '^[A-Z]{2}$' THEN
      city := parsed_city;
      state_code := parsed_state;
      RETURN NEXT;
    END IF;
    RETURN;
  END IF;

  IF length(raw) <= 40 AND raw ~ '^[A-Za-z][A-Za-z .''-]*$' THEN
    parsed_city := public.normalize_city(raw);
    IF parsed_city IS NOT NULL THEN
      city := parsed_city;
      state_code := NULL;
      RETURN NEXT;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_profile_place(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.contractor_public_service_label(p_contractor_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.format_serves_within(
    a.radius_miles,
    coalesce(place.city, c.city),
    coalesce(place.state_code, c.state_code),
    a.center_zip
  )
  FROM public.contractor_service_areas a
  JOIN public.contractor_profiles cp ON cp.id = a.contractor_profile_id
  LEFT JOIN public.zip_centroids c ON c.zip = public.normalize_zip(a.center_zip)
  LEFT JOIN LATERAL public.contractor_profile_place(cp.service_area) AS place ON true
  WHERE a.contractor_profile_id = p_contractor_profile_id
    AND a.radius_miles IS NOT NULL
    AND public.contractor_is_directory_listed(p_contractor_profile_id)
  ORDER BY a.created_at, a.id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.contractor_public_service_label(uuid) IS
  'Public phrase Serves within N miles of City, ST. Prefers the contractor profile city and state when service_area has them, otherwise the ZIP centroid place. NULL for legacy ZIP-only rows and for contractors who are not directory-listed.';

REVOKE ALL ON FUNCTION public.contractor_public_service_label(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contractor_public_service_label(uuid) TO anon, authenticated;

CREATE OR REPLACE VIEW public.contractor_public_profiles
WITH (security_invoker = false)
AS
SELECT
  cp.id,
  public.anonymized_pro_label(cp.primary_trade, NULL) AS display_label,
  cp.primary_trade,
  cp.years_experience,
  public.public_safe_blurb(cp.headline, cp.bio) AS short_description,
  public.public_safe_about(cp.bio, cp.headline) AS about,
  cp.accepting_work,
  cp.created_at,
  coalesce(
    public.contractor_public_service_label(cp.id),
    public.general_service_area(cp.service_area)
  ) AS service_area
FROM public.contractor_profiles cp
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

CREATE OR REPLACE VIEW public.contractor_public_areas
WITH (security_invoker = false)
AS
SELECT
  a.id,
  a.contractor_profile_id,
  coalesce(
    public.contractor_public_service_label(a.contractor_profile_id),
    public.general_service_area(cp.service_area)
  ) AS label
FROM public.contractor_service_areas a
JOIN public.contractor_profiles cp ON cp.id = a.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

COMMENT ON VIEW public.contractor_public_areas IS
  'Public service-area phrase only. Radius rows say Serves within N miles of City, ST. ZIP lists are not published.';

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
    public.anonymized_pro_label(
      cp.primary_trade,
      coalesce((
        SELECT array_agg(sc.name ORDER BY sc.name)
        FROM public.contractor_services cs
        JOIN public.service_categories sc ON sc.id = cs.category_id
        WHERE cs.contractor_profile_id = cp.id
      ), '{}'::text[])
    ),
    cp.primary_trade,
    coalesce((
      SELECT array_agg(sc.name ORDER BY sc.name)
      FROM public.contractor_services cs
      JOIN public.service_categories sc ON sc.id = cs.category_id
      WHERE cs.contractor_profile_id = cp.id
    ), '{}'::text[]),
    coalesce(
      public.contractor_public_service_label(cp.id),
      public.general_service_area(cp.service_area)
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
  ORDER BY 2, cp.id;
$$;

REVOKE ALL ON FUNCTION public.list_public_directory_contractors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_directory_contractors() TO anon, authenticated;
