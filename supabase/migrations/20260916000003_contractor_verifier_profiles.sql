-- Foundation contractor / verifier rows. Approval is admin-only (Phase 2: no self-approve).

CREATE TABLE public.contractor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT '',
  primary_trade text,
  service_area text,
  years_experience integer,
  license_number text,
  insurance_carrier text,
  website_url text,
  bio text,
  onboarding_status public.onboarding_status NOT NULL DEFAULT 'NOT_STARTED',
  approval_status public.approval_status NOT NULL DEFAULT 'PENDING',
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_years_experience_nonnegative
    CHECK (years_experience IS NULL OR years_experience >= 0)
);

CREATE TRIGGER contractor_profiles_set_updated_at
  BEFORE UPDATE ON public.contractor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.verifier_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  coverage_area text,
  bio text,
  onboarding_status public.onboarding_status NOT NULL DEFAULT 'NOT_STARTED',
  approval_status public.approval_status NOT NULL DEFAULT 'PENDING',
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER verifier_profiles_set_updated_at
  BEFORE UPDATE ON public.verifier_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
