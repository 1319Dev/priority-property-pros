-- Legal copy and recorded acceptances. Acceptances are insert-only for the owning user.

CREATE TABLE public.agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  body text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

CREATE UNIQUE INDEX agreements_one_current_per_slug
  ON public.agreements (slug)
  WHERE is_current;

CREATE TABLE public.agreement_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.agreements (id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  UNIQUE (agreement_id, profile_id)
);

CREATE INDEX agreement_acceptances_profile_idx
  ON public.agreement_acceptances (profile_id);
