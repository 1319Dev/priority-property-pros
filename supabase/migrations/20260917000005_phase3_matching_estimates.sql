-- Matching, 3-pro slots, pre-estimate Q&A, estimates, line items.

CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, contractor_profile_id)
);

CREATE INDEX matches_contractor_idx ON public.matches (contractor_profile_id);
CREATE INDEX matches_project_idx ON public.matches (project_id);

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches (id) ON DELETE SET NULL,
  status public.opportunity_status NOT NULL DEFAULT 'AVAILABLE',
  available_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, contractor_profile_id)
);

CREATE TRIGGER opportunities_set_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX opportunities_contractor_status_idx
  ON public.opportunities (contractor_profile_id, status);
CREATE INDEX opportunities_project_status_idx
  ON public.opportunities (project_id, status);

-- Atomic max-3 participating contractors. Unique (project_id, slot_number)
-- plus a project row lock in accept_opportunity is the race-safe cap.
CREATE TABLE public.opportunity_slots (
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  slot_number smallint NOT NULL,
  opportunity_id uuid NOT NULL UNIQUE REFERENCES public.opportunities (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, slot_number),
  CONSTRAINT opportunity_slots_range CHECK (slot_number BETWEEN 1 AND 3)
);

CREATE TABLE public.estimate_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
  asked_by_contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  prompt text NOT NULL,
  answer_text text,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER estimate_questions_set_updated_at
  BEFORE UPDATE ON public.estimate_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX estimate_questions_project_idx ON public.estimate_questions (project_id);
CREATE INDEX estimate_questions_opportunity_idx ON public.estimate_questions (opportunity_id);

CREATE TABLE public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  status public.estimate_status NOT NULL DEFAULT 'DRAFT',
  notes text,
  subtotal_cents integer NOT NULL DEFAULT 0,
  fee_bps integer NOT NULL DEFAULT 700,
  fee_cents integer NOT NULL DEFAULT 0,
  contractor_earnings_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  valid_until date,
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimates_money_nonneg CHECK (
    subtotal_cents >= 0
    AND fee_cents >= 0
    AND contractor_earnings_cents >= 0
    AND total_cents >= 0
  ),
  UNIQUE (opportunity_id)
);

CREATE TRIGGER estimates_set_updated_at
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX estimates_project_status_idx ON public.estimates (project_id, status);
CREATE INDEX estimates_contractor_idx ON public.estimates (contractor_profile_id);

CREATE UNIQUE INDEX estimates_one_accepted_per_project
  ON public.estimates (project_id)
  WHERE status = 'ACCEPTED';

CREATE TABLE public.estimate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates (id) ON DELETE CASCADE,
  label text NOT NULL,
  quantity numeric(12, 2) NOT NULL DEFAULT 1,
  unit_cents integer NOT NULL DEFAULT 0,
  line_total_cents integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimate_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT estimate_items_unit_nonneg CHECK (unit_cents >= 0),
  CONSTRAINT estimate_items_line_nonneg CHECK (line_total_cents >= 0)
);

CREATE TRIGGER estimate_items_set_updated_at
  BEFORE UPDATE ON public.estimate_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX estimate_items_estimate_idx
  ON public.estimate_items (estimate_id, sort_order);

ALTER TABLE public.projects
  ADD CONSTRAINT projects_selected_estimate_fk
  FOREIGN KEY (selected_estimate_id) REFERENCES public.estimates (id);
