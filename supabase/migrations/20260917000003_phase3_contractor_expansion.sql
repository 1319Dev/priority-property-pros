-- Expand contractor foundation for onboarding, services, areas, portfolio, credentials.
-- ALTER is additive. Existing contractor_profiles rows are preserved.

ALTER TABLE public.contractor_profiles
  ADD COLUMN accepting_work boolean NOT NULL DEFAULT true,
  ADD COLUMN min_job_cents integer,
  ADD COLUMN max_job_cents integer,
  ADD COLUMN headline text;

ALTER TABLE public.contractor_profiles
  ADD CONSTRAINT contractor_min_job_nonneg
    CHECK (min_job_cents IS NULL OR min_job_cents >= 0),
  ADD CONSTRAINT contractor_max_job_nonneg
    CHECK (max_job_cents IS NULL OR max_job_cents >= 0),
  ADD CONSTRAINT contractor_job_range
    CHECK (
      min_job_cents IS NULL
      OR max_job_cents IS NULL
      OR max_job_cents >= min_job_cents
    );

CREATE TABLE public.contractor_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.service_categories (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contractor_profile_id, category_id)
);

CREATE INDEX contractor_services_category_idx
  ON public.contractor_services (category_id);

CREATE TABLE public.contractor_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  mode public.service_area_mode NOT NULL DEFAULT 'ZIPS',
  center_zip text,
  center_lat numeric(9, 6),
  center_lng numeric(9, 6),
  radius_miles numeric(6, 2),
  zip_codes text[] NOT NULL DEFAULT '{}',
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_radius_positive
    CHECK (radius_miles IS NULL OR radius_miles > 0)
);

CREATE TRIGGER contractor_service_areas_set_updated_at
  BEFORE UPDATE ON public.contractor_service_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX contractor_service_areas_profile_idx
  ON public.contractor_service_areas (contractor_profile_id);

CREATE INDEX contractor_service_areas_zips_idx
  ON public.contractor_service_areas USING gin (zip_codes);

CREATE TABLE public.contractor_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text,
  storage_path text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER contractor_portfolio_set_updated_at
  BEFORE UPDATE ON public.contractor_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX contractor_portfolio_profile_idx
  ON public.contractor_portfolio (contractor_profile_id, sort_order);

CREATE TABLE public.contractor_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'OTHER',
  label text NOT NULL,
  document_path text,
  status public.credential_status NOT NULL DEFAULT 'NOT_SUBMITTED',
  expires_at date,
  reviewer_id uuid REFERENCES public.profiles (id),
  reviewer_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_credential_kind_check
    CHECK (kind IN ('LICENSE', 'INSURANCE', 'OTHER'))
);

CREATE TRIGGER contractor_credentials_set_updated_at
  BEFORE UPDATE ON public.contractor_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX contractor_credentials_profile_idx
  ON public.contractor_credentials (contractor_profile_id, status);

CREATE OR REPLACE FUNCTION public.protect_contractor_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('VERIFIED') AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'contractors cannot self-verify credentials';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      NEW.reviewer_id := NULL;
      NEW.reviewer_notes := NULL;
      NEW.reviewed_at := NULL;
      IF NEW.status NOT IN ('NOT_SUBMITTED', 'PENDING') THEN
        NEW.status := 'NOT_SUBMITTED';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
    OR NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
  ) AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    -- Owners may move NOT_SUBMITTED → PENDING when uploading a document.
    IF OLD.status IN ('NOT_SUBMITTED', 'REJECTED', 'EXPIRED')
       AND NEW.status = 'PENDING'
       AND NEW.reviewer_id IS NOT DISTINCT FROM OLD.reviewer_id
       AND NEW.reviewer_notes IS NOT DISTINCT FROM OLD.reviewer_notes THEN
      NEW.submitted_at := coalesce(NEW.submitted_at, now());
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'contractors cannot self-verify or change credential review fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contractor_credentials_protect
  BEFORE INSERT OR UPDATE ON public.contractor_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_contractor_credentials();
