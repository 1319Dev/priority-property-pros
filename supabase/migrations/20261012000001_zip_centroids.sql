-- ZIP / ZCTA centroids for radius service areas.
-- No payment, Stripe, or fee-flag changes.
--
-- Dataset (public domain, U.S. government work, 17 U.S.C. § 105 — no license key):
--   Coordinates: U.S. Census Bureau 2023 Gazetteer Files, ZCTA national,
--     internal point latitude/longitude (INTPTLAT / INTPTLONG).
--     https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
--     File: 2023_Gaz_zcta_national.zip
--   City: 2020 Census ZCTA-to-Place relationship. The place with the largest
--     land-area overlap is kept, with the Census place-class suffix removed
--     ("Conroe city" -> "Conroe").
--   State: 2020 Census ZCTA-to-County relationship. The county with the largest
--     land-area overlap supplies the state. If a ZCTA has no place, the county
--     name is stored as the city fallback.
--   https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.2020.html
--
-- ZCTAs approximate USPS ZIP Codes. PO Box-only and single-delivery ZIPs are
-- often absent. Regenerate with scripts/build-zip-centroids.py.
--
-- This migration creates the table, index, and policies only. Texas ZCTAs load
-- in the following 20261012000001_*_zip_centroids_tx_part*.sql files. The full
-- national set is supabase/data/zip_centroids_us.csv (not a migration).

CREATE TABLE public.zip_centroids (
  zip text PRIMARY KEY,
  lat numeric(9, 6) NOT NULL,
  lng numeric(9, 6) NOT NULL,
  city text,
  state_code text,
  CONSTRAINT zip_centroids_zip_format CHECK (zip ~ '^[0-9]{5}$'),
  CONSTRAINT zip_centroids_lat_range CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT zip_centroids_lng_range CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT zip_centroids_state_format CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$')
);

COMMENT ON TABLE public.zip_centroids IS
  'Public-domain Census ZCTA centroids (2023 Gazetteer) plus 2020 place/county names. Reference data. Not customer addresses.';

CREATE INDEX zip_centroids_lat_lng_idx ON public.zip_centroids (lat, lng);

ALTER TABLE public.zip_centroids ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.zip_centroids FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.zip_centroids TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.zip_centroids TO authenticated;

CREATE POLICY zip_centroids_select_public
  ON public.zip_centroids FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY zip_centroids_write_admin
  ON public.zip_centroids FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
