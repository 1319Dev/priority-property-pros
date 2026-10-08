# ZIP centroids

`zip_centroids_us.csv` is the national Census 2023 ZCTA centroid set (public domain, 17 U.S.C. § 105). It is not a migration.

The migrations create `public.zip_centroids` and load Texas ZCTAs only. Texas covers the Conroe business, and each data file stays under 35 KB so it can be applied in production. Customer ZIPs outside Texas still match contractors who kept a legacy ZIP list.

To load the rest of the country later, an admin can import this CSV into `public.zip_centroids`. `ON CONFLICT (zip) DO NOTHING` keeps a second load from duplicating rows. From a database session that can read the file:

```sql
COPY public.zip_centroids (zip, lat, lng, city, state_code)
FROM '/path/to/zip_centroids_us.csv'
WITH (FORMAT csv, HEADER true);
```

If `COPY` is not available, split the CSV into `INSERT ... ON CONFLICT (zip) DO NOTHING` statements of about 35 KB and run those as an admin.
