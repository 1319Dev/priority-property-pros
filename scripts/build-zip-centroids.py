#!/usr/bin/env python3
"""Build ZIP centroid schema, Texas migration parts, and the national CSV.

Sources (U.S. government work, public domain, 17 U.S.C. § 105):
  - 2023 Gazetteer ZCTA national file (internal-point lat/lng)
    https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip
  - 2020 ZCTA-to-Place relationship (primary city = largest land overlap)
  - 2020 ZCTA-to-County relationship (state, and city fallback)

ZCTAs are not USPS ZIP Codes. PO Box-only and unique ZIPs may be absent.
Does not call a paid geocoder.

Usage:
  python3 scripts/build-zip-centroids.py
  python3 scripts/build-zip-centroids.py --gaz /tmp/zcta/2023_Gaz_zcta_national.txt \\
      --place /tmp/zcta/rel.zip --county /tmp/zcta/county.txt
"""

from __future__ import annotations

import argparse
import csv
import re
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "supabase" / "migrations" / "20261012000001_zip_centroids.sql"
DATA_CSV = ROOT / "supabase" / "data" / "zip_centroids_us.csv"
MIGRATIONS = ROOT / "supabase" / "migrations"
MAX_PART_BYTES = 35_000

GAZ_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip"
PLACE_URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_place20_natl.txt"
COUNTY_URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt"

STATE_BY_FIPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
    "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
    "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
    "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
    "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
    "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
    "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
}

PLACE_SUFFIX = re.compile(
    r"\s+(city and borough|consolidated government|unified government|metro township|"
    r"charter township|zona urbana|urbanización|urbanizacion|municipality|comunidad|"
    r"city|town|village|cdp|borough|township)$",
    re.IGNORECASE,
)


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading {url}")
    urllib.request.urlretrieve(url, dest)


def read_text(path: Path) -> str:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            name = archive.namelist()[0]
            return archive.read(name).decode("utf-8-sig")
    return path.read_text(encoding="utf-8-sig")


def clean_place(name: str) -> str:
    cleaned = PLACE_SUFFIX.sub("", name.strip())
    return re.sub(r"\s+", " ", cleaned).strip()


def sql_text(value: str | None) -> str:
    if value is None or value == "":
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def best_overlap(path: Path, name_index: int, geoid_index: int) -> dict[str, tuple[int, str, str]]:
    """zip -> (land, display name, state fips from the related GEOID)."""
    best: dict[str, tuple[int, str, str]] = {}
    lines = read_text(path).splitlines()
    for line in lines[1:]:
        parts = line.split("|")
        if len(parts) < 17:
            continue
        zcta = parts[1].strip()
        if len(zcta) != 5 or not zcta.isdigit():
            continue
        name = parts[name_index].strip()
        if not name:
            continue
        geoid = parts[geoid_index].strip()
        try:
            land = int(parts[16] or "0")
        except ValueError:
            land = 0
        current = best.get(zcta)
        if current is None or land > current[0]:
            best[zcta] = (land, name, geoid[:2])
    return best


def load_gaz(path: Path) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    for line in read_text(path).splitlines()[1:]:
        cols = line.split("\t")
        if len(cols) < 7:
            continue
        zcta = cols[0].strip()
        if len(zcta) != 5 or not zcta.isdigit():
            continue
        lat = f"{float(cols[5]):.6f}"
        lng = f"{float(cols[6]):.6f}"
        rows.append((zcta, lat, lng))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gaz", type=Path)
    parser.add_argument("--place", type=Path)
    parser.add_argument("--county", type=Path)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    cache = Path("/tmp/zcta")
    gaz = args.gaz or cache / "2023_Gaz_zcta_national.zip"
    place = args.place or cache / "tab20_zcta520_place20_natl.txt"
    county = args.county or cache / "tab20_zcta520_county20_natl.txt"
    if args.gaz is None:
        download(GAZ_URL, gaz)
    if args.place is None and not place.exists():
        # The earlier download in this environment used rel.zip.
        alt = cache / "rel.zip"
        if alt.exists():
            place = alt
        else:
            download(PLACE_URL, place)
    if args.county is None and not county.exists():
        download(COUNTY_URL, county)

    gaz_rows = load_gaz(gaz)
    places = best_overlap(place, name_index=10, geoid_index=9)
    counties = best_overlap(county, name_index=10, geoid_index=9)

    header = """-- ZIP / ZCTA centroids for radius service areas.
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

"""
    args.out.write_text(header, encoding="utf-8")

    missing_state = 0
    missing_city = 0
    parsed_rows: list[tuple[str, str, str, str, str]] = []
    for zcta, lat, lng in gaz_rows:
        place_row = places.get(zcta)
        county_row = counties.get(zcta)
        state_fips = ""
        if county_row and county_row[2] in STATE_BY_FIPS:
            state_fips = county_row[2]
        elif place_row and place_row[2] in STATE_BY_FIPS:
            state_fips = place_row[2]
        state = STATE_BY_FIPS.get(state_fips) or ""
        city = clean_place(place_row[1]) if place_row else ""
        if not city and county_row:
            city = county_row[1].strip()
        if not city:
            missing_city += 1
        if not state:
            missing_state += 1
        parsed_rows.append((zcta, lat, lng, city, state))

    DATA_CSV.parent.mkdir(parents=True, exist_ok=True)
    with DATA_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["zip", "lat", "lng", "city", "state_code"])
        writer.writerows(parsed_rows)

    texas = [row for row in parsed_rows if row[4] == "TX"]

    def render_part(part_rows: list[tuple[str, str, str, str, str]], index: int, total: int) -> str:
        lines = [
            f"-- Texas ZCTA centroids, part {index} of {total}.",
            "-- Public-domain U.S. Census 2023 Gazetteer (17 U.S.C. § 105). Idempotent.",
            "INSERT INTO public.zip_centroids (zip, lat, lng, city, state_code) VALUES",
        ]
        tuples = [
            f"({sql_text(zcta)},{lat},{lng},{sql_text(city) if city else 'NULL'},{sql_text(state) if state else 'NULL'})"
            for zcta, lat, lng, city, state in part_rows
        ]
        lines.append(",\n".join(tuples))
        lines.append("ON CONFLICT (zip) DO NOTHING;")
        return "\n".join(lines) + "\n"

    packed: list[list[tuple[str, str, str, str, str]]] = []
    current: list[tuple[str, str, str, str, str]] = []
    for row in texas:
        trial = current + [row]
        if current and len(render_part(trial, 99, 99).encode("utf-8")) > MAX_PART_BYTES:
            packed.append(current)
            current = [row]
        else:
            current = trial
    if current:
        packed.append(current)

    for old in MIGRATIONS.glob("20261012000001_*_zip_centroids_tx_part*.sql"):
        old.unlink()
    for index, part_rows in enumerate(packed, start=1):
        path = MIGRATIONS / f"20261012000001_{index}_zip_centroids_tx_part{index}.sql"
        path.write_text(render_part(part_rows, index, len(packed)), encoding="utf-8")

    print(
        f"wrote {args.out} national_rows={len(parsed_rows)} texas_rows={len(texas)} "
        f"parts={len(packed)} missing_city={missing_city} missing_state={missing_state}"
    )


if __name__ == "__main__":
    main()
