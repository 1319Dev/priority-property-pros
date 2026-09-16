-- DB-managed service catalog. Homepage may still list a static fallback;
-- the wizard and matching read from these tables.

CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  blurb text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_regulated boolean NOT NULL DEFAULT false,
  requires_verified_credential boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER service_categories_set_updated_at
  BEFORE UPDATE ON public.service_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX service_categories_active_sort_idx
  ON public.service_categories (is_active, sort_order);

COMMENT ON TABLE public.service_categories IS
  'Marketplace categories. Regulated electrical/plumbing/HVAC are not enabled as ordinary unverified services.';

CREATE TABLE public.service_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.service_categories (id) ON DELETE CASCADE,
  prompt text NOT NULL,
  help_text text,
  kind public.question_kind NOT NULL DEFAULT 'TEXT',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER service_questions_set_updated_at
  BEFORE UPDATE ON public.service_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX service_questions_category_idx
  ON public.service_questions (category_id, sort_order);
