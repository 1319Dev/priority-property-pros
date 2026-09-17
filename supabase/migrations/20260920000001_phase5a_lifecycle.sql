-- Phase 5A: customer project lifecycle (edit / cancel / notices).
-- Additive. Does not drop users, projects, estimates, bookings, or fee schedules.
-- Does not enable live Stripe. payments_live / charges_live stay false.

ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE public.estimate_status ADD VALUE IF NOT EXISTS 'SUPERSEDED';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS scope_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_selection_consistency;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_selection_consistency CHECK (
    (
      selected_estimate_id IS NULL
      AND selected_contractor_profile_id IS NULL
      AND selected_at IS NULL
    )
    OR (
      status IN ('CONTRACTOR_SELECTED', 'CANCELLED')
      AND selected_estimate_id IS NOT NULL
      AND selected_contractor_profile_id IS NOT NULL
    )
  );

COMMENT ON COLUMN public.projects.scope_revision IS
  'Increments on material scope edits after contractors have priced or accepted. Existing estimates are superseded and must be resubmitted.';

CREATE TABLE IF NOT EXISTS public.project_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('CUSTOMER', 'CONTRACTOR', 'BOTH')),
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id)
);

CREATE INDEX IF NOT EXISTS project_notices_project_idx
  ON public.project_notices (project_id, created_at DESC);

ALTER TABLE public.project_notices ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.project_notices IS
  'Lightweight in-app status banners. Not chat. Owner and participating contractors see only authorized copy.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.project_has_participation(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.project_id = p_project_id AND o.status = 'ACCEPTED'
  ) OR EXISTS (
    SELECT 1 FROM public.estimates e
    WHERE e.project_id = p_project_id
      AND e.status IN ('SUBMITTED', 'REVISED', 'ACCEPTED')
  );
$$;

CREATE OR REPLACE FUNCTION public.project_opportunity_count(p_project_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.opportunities o WHERE o.project_id = p_project_id;
$$;

CREATE OR REPLACE FUNCTION public.project_protected_booking_exists(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.project_id = p_project_id
      AND b.status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED')
  );
$$;

CREATE OR REPLACE FUNCTION public.contractor_can_read_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.project_id = p_project_id
      AND o.contractor_profile_id = public.current_contractor_profile_id()
      AND (
        o.status IN ('AVAILABLE', 'ACCEPTED')
        OR (o.status IN ('CLOSED', 'EXPIRED') AND o.responded_at IS NOT NULL)
      )
  ) OR public.contractor_is_selected_on_project(p_project_id)
    OR public.booking_is_confirmed_for_contractor(p_project_id);
$$;

CREATE OR REPLACE FUNCTION public.insert_project_notice(
  p_project_id uuid,
  p_audience text,
  p_kind text,
  p_title text,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.project_notices (project_id, audience, kind, title, body, created_by)
  VALUES (p_project_id, p_audience, p_kind, p_title, p_body, auth.uid())
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_material_scope_change(p_project_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.projects;
BEGIN
  PERFORM public.ppp_set_rpc('update_customer_project');
  SELECT * INTO p FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;

  UPDATE public.estimates
  SET status = 'SUPERSEDED'
  WHERE project_id = p_project_id
    AND status IN ('DRAFT', 'SUBMITTED', 'REVISED');

  UPDATE public.projects
  SET
    scope_revision = p.scope_revision + 1,
    status = CASE
      WHEN p.status IN ('ESTIMATES_AVAILABLE', 'CONTRACTORS_RESPONDING', 'MATCHING', 'POSTED')
        THEN 'CONTRACTORS_RESPONDING'::public.project_status
      ELSE p.status
    END
  WHERE id = p_project_id;

  PERFORM public.insert_project_notice(
    p_project_id,
    'BOTH',
    'SCOPE_CHANGED',
    'Project details changed',
    CASE
      WHEN p_reason = 'photos' THEN
        'The customer updated the photos. Previous estimates are out of date and need a new submission before they cover this job.'
      WHEN p_reason = 'answers' THEN
        'The customer updated the project answers. Previous estimates are out of date and need a new submission before they cover this job.'
      ELSE
        'The customer updated the job details. Previous estimates are out of date and need a new submission before they cover this job.'
    END
  );

  PERFORM public.write_audit_log(
    auth.uid(),
    'project.scope_changed',
    'project',
    p_project_id,
    jsonb_build_object('reason', p_reason, 'from_revision', p.scope_revision)
  );
END;
$$;
