-- Customer projects. Exact street/coordinates live in project_private_locations
-- so opportunity contractors never receive the house address before selection.

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.service_categories (id),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status public.project_status NOT NULL DEFAULT 'DRAFT',
  completeness public.project_completeness NOT NULL DEFAULT 'MORE_INFO_NEEDED',
  city text,
  state text,
  zip_code text,
  timing public.timing_preference,
  preferred_date date,
  budget_min_cents integer,
  budget_max_cents integer,
  draft_step integer NOT NULL DEFAULT 1,
  selected_contractor_profile_id uuid REFERENCES public.contractor_profiles (id),
  selected_estimate_id uuid,
  posted_at timestamptz,
  selected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_budget_nonneg
    CHECK (
      (budget_min_cents IS NULL OR budget_min_cents >= 0)
      AND (budget_max_cents IS NULL OR budget_max_cents >= 0)
    ),
  CONSTRAINT projects_budget_range
    CHECK (
      budget_min_cents IS NULL
      OR budget_max_cents IS NULL
      OR budget_max_cents >= budget_min_cents
    ),
  CONSTRAINT projects_draft_step_range
    CHECK (draft_step BETWEEN 1 AND 8),
  CONSTRAINT projects_selection_consistency
    CHECK (
      (
        selected_estimate_id IS NULL
        AND selected_contractor_profile_id IS NULL
        AND selected_at IS NULL
      )
      OR (
        status = 'CONTRACTOR_SELECTED'
        AND selected_estimate_id IS NOT NULL
        AND selected_contractor_profile_id IS NOT NULL
      )
    )
);

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX projects_customer_idx ON public.projects (customer_id, created_at DESC);
CREATE INDEX projects_status_idx ON public.projects (status);
CREATE INDEX projects_category_zip_idx ON public.projects (category_id, zip_code);
CREATE INDEX projects_posted_idx ON public.projects (posted_at DESC);

CREATE TABLE public.project_private_locations (
  project_id uuid PRIMARY KEY REFERENCES public.projects (id) ON DELETE CASCADE,
  street_line1 text,
  street_line2 text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER project_private_locations_set_updated_at
  BEFORE UPDATE ON public.project_private_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.project_private_locations IS
  'Exact address and coordinates. Visible to the customer, admins, and the selected contractor only.';

CREATE TABLE public.project_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_photos_project_idx
  ON public.project_photos (project_id, sort_order);

CREATE TABLE public.project_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.service_questions (id) ON DELETE CASCADE,
  answer_text text,
  answer_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, question_id)
);

CREATE TRIGGER project_answers_set_updated_at
  BEFORE UPDATE ON public.project_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX project_answers_project_idx ON public.project_answers (project_id);

CREATE TABLE public.project_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  from_status public.project_status,
  to_status public.project_status NOT NULL,
  changed_by uuid REFERENCES public.profiles (id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_status_history_project_idx
  ON public.project_status_history (project_id, created_at);
