-- Contractor reputation on the existing booking_reviews system.
-- Additive. Do NOT apply this file to production from an agent.
-- Does not change payment flags, checkout flags, Stripe price IDs, or fee amounts.
-- platform_reviews (reviews of the marketplace) stay a separate table.
--
-- Gate: mutual Hired (customer_hired_at AND contractor_hired_at), not a
-- client-supplied completed flag. VERIFIED_PPP_PROJECT is assigned only
-- inside submit_booking_review. CUSTOMER_REVIEW exists for a later
-- outside-customer path and cannot be inserted.
-- Votes, photos, filters, awards, and reminders are not built. They can
-- reference booking_reviews.id later.

CREATE TYPE public.booking_review_class AS ENUM ('VERIFIED_PPP_PROJECT', 'CUSTOMER_REVIEW');

CREATE TYPE public.booking_review_moderation_status AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');

CREATE TYPE public.booking_review_report_reason AS ENUM (
  'spam',
  'not_a_real_customer',
  'harassment',
  'personal_information',
  'conflict_of_interest',
  'other'
);

CREATE OR REPLACE FUNCTION public.review_text_is_excluded_from_public(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_text, '') ~* 'smoke[[:space:]]*tester';
$$;

CREATE OR REPLACE FUNCTION public.privacy_safe_homeowner_display(p_first_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_first_name, '')) ~ '^[A-Za-z][A-Za-z'' -]{0,39}$'
      THEN upper(left(btrim(p_first_name), 1)) || '.'
    ELSE 'Homeowner'
  END;
$$;

COMMENT ON FUNCTION public.privacy_safe_homeowner_display(text) IS
  'Initial only, or Homeowner. Never a last name, email, phone, or street.';

ALTER TABLE public.booking_reviews
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects (id),
  ADD COLUMN IF NOT EXISTS review_class public.booking_review_class,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS moderation_status public.booking_review_moderation_status NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS homeowner_display text,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES public.profiles (id);

UPDATE public.booking_reviews r
SET
  project_id = b.project_id,
  review_class = CASE
    WHEN r.reviewer_role = 'CUSTOMER' THEN 'VERIFIED_PPP_PROJECT'::public.booking_review_class
    ELSE NULL
  END,
  is_verified = (r.reviewer_role = 'CUSTOMER'),
  homeowner_display = CASE
    WHEN r.reviewer_role = 'CUSTOMER' THEN public.privacy_safe_homeowner_display(pr.first_name)
    ELSE NULL
  END,
  category = CASE
    WHEN r.reviewer_role <> 'CUSTOMER' THEN NULL
    WHEN sc.name IS NOT NULL
      AND char_length(btrim(sc.name)) BETWEEN 1 AND 80
      AND NOT public.text_contains_contact_info(sc.name)
      AND NOT public.text_contains_pre_hire_contact(sc.name)
      AND NOT public.review_text_is_excluded_from_public(sc.name)
      THEN btrim(sc.name)
    ELSE 'Project'
  END
FROM public.bookings b
JOIN public.projects proj ON proj.id = b.project_id
JOIN public.profiles pr ON pr.id = b.customer_id
LEFT JOIN public.service_categories sc ON sc.id = proj.category_id
WHERE r.booking_id = b.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.booking_reviews
    WHERE reviewer_role = 'CUSTOMER'
      AND project_id IS NOT NULL
    GROUP BY customer_id, project_id, contractor_profile_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate homeowner/project/contractor reviews exist';
  END IF;
END $$;

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_customer_has_project;

ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_customer_has_project
  CHECK (reviewer_role <> 'CUSTOMER' OR project_id IS NOT NULL);

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_class_assignment;

ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_class_assignment
  CHECK (
    review_class IS DISTINCT FROM 'CUSTOMER_REVIEW'
    AND (
      (reviewer_role = 'CUSTOMER' AND review_class = 'VERIFIED_PPP_PROJECT' AND is_verified = true)
      OR (reviewer_role = 'CONTRACTOR' AND review_class IS NULL AND is_verified = false)
    )
  );

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_category_len;

ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_category_len
  CHECK (category IS NULL OR char_length(btrim(category)) BETWEEN 1 AND 80);

ALTER TABLE public.booking_reviews
  DROP CONSTRAINT IF EXISTS booking_reviews_homeowner_display_len;

ALTER TABLE public.booking_reviews
  ADD CONSTRAINT booking_reviews_homeowner_display_len
  CHECK (homeowner_display IS NULL OR char_length(btrim(homeowner_display)) BETWEEN 1 AND 80);

CREATE UNIQUE INDEX IF NOT EXISTS booking_reviews_one_homeowner_project_contractor
  ON public.booking_reviews (customer_id, project_id, contractor_profile_id)
  WHERE reviewer_role = 'CUSTOMER';

CREATE INDEX IF NOT EXISTS booking_reviews_moderation_idx
  ON public.booking_reviews (moderation_status, created_at DESC);

COMMENT ON TABLE public.booking_reviews IS
  'Profile reviews after mutual Hired. One CUSTOMER review per homeowner, project, and contractor. VERIFIED_PPP_PROJECT is assigned only by submit_booking_review when the reviewer owns the project, the contractor is the hired contractor, and both parties confirmed Hired. CUSTOMER_REVIEW is reserved and cannot be inserted. Hidden and removed reviews stay out of public aggregates. Future votes, photos, filters, awards, and reminders may reference this id and are not implemented. Not platform_reviews.';

CREATE TABLE public.booking_review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL UNIQUE REFERENCES public.booking_reviews (id) ON DELETE CASCADE,
  contractor_profile_id uuid NOT NULL REFERENCES public.contractor_profiles (id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_review_responses_body_len CHECK (char_length(btrim(body)) BETWEEN 1 AND 800)
);

CREATE TRIGGER booking_review_responses_set_updated_at
  BEFORE UPDATE ON public.booking_review_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.booking_review_responses IS
  'One public response per contractor review. The contractor may create and edit it. They cannot edit or delete the review.';

CREATE TABLE public.booking_review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.booking_reviews (id) ON DELETE CASCADE,
  reporter_profile_id uuid NOT NULL REFERENCES public.profiles (id),
  reason public.booking_review_report_reason NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_review_reports_note_len CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 500),
  CONSTRAINT booking_review_reports_one_per_reporter UNIQUE (review_id, reporter_profile_id)
);

CREATE INDEX booking_review_reports_review_idx
  ON public.booking_review_reports (review_id, created_at DESC);

COMMENT ON TABLE public.booking_review_reports IS
  'A report does not hide or remove the review. Admins moderate separately.';

CREATE TABLE public.booking_review_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.booking_reviews (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status public.booking_review_moderation_status NOT NULL,
  to_status public.booking_review_moderation_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_review_moderation_events_action_check
    CHECK (action IN ('keep_published', 'hide', 'restore', 'remove'))
);

CREATE INDEX booking_review_moderation_events_review_idx
  ON public.booking_review_moderation_events (review_id, created_at DESC);

COMMENT ON TABLE public.booking_review_moderation_events IS
  'Append-only moderation trail for contractor reviews. Also mirrored to audit_logs.';

CREATE OR REPLACE FUNCTION public.protect_review_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'reviews cannot be deleted from the client';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.ppp_rpc_is('submit_booking_review') AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'reviews cannot be written from the client';
    END IF;
    IF NEW.review_class = 'CUSTOMER_REVIEW' THEN
      RAISE EXCEPTION 'outside customer reviews are not enabled';
    END IF;
    IF NEW.reviewer_role = 'CUSTOMER' AND (
      NEW.review_class IS DISTINCT FROM 'VERIFIED_PPP_PROJECT' OR NEW.is_verified IS DISTINCT FROM true
    ) THEN
      RAISE EXCEPTION 'verified status is assigned by the platform';
    END IF;
    IF NEW.reviewer_role = 'CONTRACTOR' AND (NEW.review_class IS NOT NULL OR NEW.is_verified IS TRUE) THEN
      RAISE EXCEPTION 'verified status is assigned by the platform';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF public.ppp_rpc_is('moderate_booking_review') THEN
      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
         OR NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
         OR NEW.contractor_profile_id IS DISTINCT FROM OLD.contractor_profile_id
         OR NEW.reviewer_role IS DISTINCT FROM OLD.reviewer_role
         OR NEW.rating IS DISTINCT FROM OLD.rating
         OR NEW.body IS DISTINCT FROM OLD.body
         OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
         OR NEW.review_class IS DISTINCT FROM OLD.review_class
         OR NEW.category IS DISTINCT FROM OLD.category
         OR NEW.homeowner_display IS DISTINCT FROM OLD.homeowner_display
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'moderation cannot change the review';
      END IF;
      RETURN NEW;
    END IF;
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'reviews cannot be edited';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_booking_review_response_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'review responses cannot be deleted from the client';
    END IF;
    RETURN OLD;
  END IF;
  IF NOT public.ppp_rpc_is('respond_to_booking_review') AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'review responses cannot be written from the client';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.review_id := OLD.review_id;
    NEW.contractor_profile_id := OLD.contractor_profile_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_review_responses_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.booking_review_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_booking_review_response_row();

CREATE OR REPLACE FUNCTION public.protect_booking_review_report_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'review reports cannot be deleted from the client';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'review reports cannot be edited';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT public.ppp_rpc_is('report_booking_review') AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'review reports cannot be written from the client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_review_reports_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.booking_review_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_booking_review_report_row();

CREATE OR REPLACE FUNCTION public.protect_booking_review_moderation_event_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'moderation history cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'moderation history cannot be edited';
  END IF;
  IF NOT public.ppp_rpc_is('moderate_booking_review') AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'moderation history cannot be written from the client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_review_moderation_events_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.booking_review_moderation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_booking_review_moderation_event_row();

CREATE OR REPLACE FUNCTION public.submit_booking_review(
  p_booking_id uuid,
  p_rating integer,
  p_body text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings;
  proj public.projects;
  rid uuid;
  reviewer_role text;
  is_customer boolean;
  is_contractor boolean;
  v_body text;
  v_category text;
  v_display text;
  v_class public.booking_review_class;
  v_verified boolean;
BEGIN
  PERFORM public.ppp_set_rpc('submit_booking_review');
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  SELECT * INTO proj FROM public.projects WHERE id = b.project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found'; END IF;

  is_customer := b.customer_id IS NOT DISTINCT FROM auth.uid();
  is_contractor := b.contractor_profile_id IS NOT DISTINCT FROM public.current_contractor_profile_id();

  IF NOT is_customer AND NOT is_contractor THEN
    RAISE EXCEPTION 'only booking participants can review after mutual hire';
  END IF;
  IF public.is_admin() AND NOT is_customer AND NOT is_contractor THEN
    RAISE EXCEPTION 'only the project homeowner can review the hired contractor';
  END IF;
  IF b.status IN ('CANCELLED', 'DISPUTED') THEN
    RAISE EXCEPTION 'reviews require mutual hired confirmation';
  END IF;
  IF b.customer_hired_at IS NULL OR b.contractor_hired_at IS NULL THEN
    RAISE EXCEPTION 'reviews require mutual hired confirmation';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'rating must be 1 through 5';
  END IF;

  reviewer_role := CASE WHEN is_customer THEN 'CUSTOMER' ELSE 'CONTRACTOR' END;

  IF is_customer THEN
    IF proj.customer_id IS DISTINCT FROM auth.uid()
       OR b.customer_id IS DISTINCT FROM proj.customer_id THEN
      RAISE EXCEPTION 'only the project homeowner can review the hired contractor';
    END IF;
    IF proj.selected_contractor_profile_id IS NOT NULL
       AND proj.selected_contractor_profile_id IS DISTINCT FROM b.contractor_profile_id THEN
      RAISE EXCEPTION 'reviews require the hired contractor on this project';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_reviews r
    WHERE r.booking_id = b.id
      AND r.reviewer_role = reviewer_role
  ) THEN
    RAISE EXCEPTION 'you already reviewed this booking';
  END IF;

  IF reviewer_role = 'CUSTOMER' AND EXISTS (
    SELECT 1
    FROM public.booking_reviews r
    WHERE r.customer_id = b.customer_id
      AND r.project_id = b.project_id
      AND r.contractor_profile_id = b.contractor_profile_id
      AND r.reviewer_role = 'CUSTOMER'
  ) THEN
    RAISE EXCEPTION 'you already reviewed this contractor on this project';
  END IF;

  v_body := nullif(regexp_replace(btrim(coalesce(p_body, '')), '\s+', ' ', 'g'), '');
  IF reviewer_role = 'CUSTOMER' THEN
    IF v_body IS NULL OR char_length(v_body) < 20 OR char_length(v_body) > 1000 THEN
      RAISE EXCEPTION 'review must be between 20 and 1000 characters';
    END IF;
  ELSIF v_body IS NOT NULL AND (char_length(v_body) > 1000) THEN
    RAISE EXCEPTION 'review must be between 20 and 1000 characters';
  END IF;

  IF v_body IS NOT NULL AND (
    public.text_contains_contact_info(v_body)
    OR public.text_contains_pre_hire_contact(v_body)
  ) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;
  IF v_body IS NOT NULL AND public.review_text_is_excluded_from_public(v_body) THEN
    RAISE EXCEPTION 'test reviews are not published';
  END IF;

  IF reviewer_role = 'CUSTOMER' THEN
    v_class := 'VERIFIED_PPP_PROJECT';
    v_verified := true;
    SELECT CASE
      WHEN sc.name IS NOT NULL
        AND char_length(btrim(sc.name)) BETWEEN 1 AND 80
        AND NOT public.text_contains_contact_info(sc.name)
        AND NOT public.text_contains_pre_hire_contact(sc.name)
        AND NOT public.review_text_is_excluded_from_public(sc.name)
        THEN btrim(sc.name)
      ELSE 'Project'
    END
    INTO v_category
    FROM public.service_categories sc
    WHERE sc.id = proj.category_id;
    v_category := coalesce(v_category, 'Project');
    SELECT public.privacy_safe_homeowner_display(p.first_name)
    INTO v_display
    FROM public.profiles p
    WHERE p.id = b.customer_id;
    v_display := coalesce(v_display, 'Homeowner');
  ELSE
    v_class := NULL;
    v_verified := false;
    v_category := NULL;
    v_display := NULL;
  END IF;

  INSERT INTO public.booking_reviews (
    booking_id,
    project_id,
    customer_id,
    contractor_profile_id,
    rating,
    body,
    is_verified,
    reviewer_role,
    review_class,
    category,
    moderation_status,
    homeowner_display
  ) VALUES (
    b.id,
    b.project_id,
    b.customer_id,
    b.contractor_profile_id,
    p_rating,
    v_body,
    v_verified,
    reviewer_role,
    v_class,
    v_category,
    'PUBLISHED',
    v_display
  )
  RETURNING id INTO rid;

  PERFORM public.write_booking_event(
    b.id,
    'review.submitted',
    jsonb_build_object(
      'review_id', rid,
      'rating', p_rating,
      'reviewer_role', reviewer_role,
      'review_class', v_class
    )
  );
  RETURN jsonb_build_object(
    'review_id', rid,
    'verified', v_verified,
    'review_class', v_class,
    'reviewer_role', reviewer_role,
    'mutually_hired', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_booking_review(
  p_review_id uuid,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rev public.booking_reviews;
  v_body text;
  existing_id uuid;
  created timestamptz;
  updated timestamptz;
BEGIN
  PERFORM public.ppp_set_rpc('respond_to_booking_review');
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO rev FROM public.booking_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found';
  END IF;
  IF rev.reviewer_role IS DISTINCT FROM 'CUSTOMER'
     OR rev.review_class IS DISTINCT FROM 'VERIFIED_PPP_PROJECT' THEN
    RAISE EXCEPTION 'only a homeowner review can be answered';
  END IF;
  IF rev.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id() THEN
    RAISE EXCEPTION 'only the reviewed contractor can respond';
  END IF;
  IF rev.moderation_status = 'REMOVED' THEN
    RAISE EXCEPTION 'removed reviews cannot be answered';
  END IF;

  v_body := nullif(regexp_replace(btrim(coalesce(p_body, '')), '\s+', ' ', 'g'), '');
  IF v_body IS NULL OR char_length(v_body) < 1 OR char_length(v_body) > 800 THEN
    RAISE EXCEPTION 'response must be between 1 and 800 characters';
  END IF;
  IF public.text_contains_contact_info(v_body) OR public.text_contains_pre_hire_contact(v_body) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;

  SELECT id INTO existing_id
  FROM public.booking_review_responses
  WHERE review_id = rev.id;

  IF existing_id IS NULL THEN
    INSERT INTO public.booking_review_responses (review_id, contractor_profile_id, body)
    VALUES (rev.id, rev.contractor_profile_id, v_body)
    RETURNING id, created_at, updated_at INTO existing_id, created, updated;
  ELSE
    UPDATE public.booking_review_responses
    SET body = v_body
    WHERE id = existing_id
    RETURNING created_at, updated_at INTO created, updated;
  END IF;

  RETURN jsonb_build_object(
    'response_id', existing_id,
    'created_at', created,
    'updated_at', updated
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_booking_review(
  p_review_id uuid,
  p_reason text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rev public.booking_reviews;
  v_reason public.booking_review_report_reason;
  v_note text;
  rid uuid;
  current_status public.booking_review_moderation_status;
BEGIN
  PERFORM public.ppp_set_rpc('report_booking_review');
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO rev FROM public.booking_reviews WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found';
  END IF;
  IF rev.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id() THEN
    RAISE EXCEPTION 'only the reviewed contractor can report this review';
  END IF;
  IF rev.reviewer_role IS DISTINCT FROM 'CUSTOMER' THEN
    RAISE EXCEPTION 'only a homeowner review can be reported';
  END IF;

  BEGIN
    v_reason := p_reason::public.booking_review_report_reason;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'unknown report reason';
  END;

  v_note := nullif(regexp_replace(btrim(coalesce(p_note, '')), '\s+', ' ', 'g'), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'report note must be 500 characters or less';
  END IF;
  IF v_note IS NOT NULL AND (
    public.text_contains_contact_info(v_note) OR public.text_contains_pre_hire_contact(v_note)
  ) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;

  current_status := rev.moderation_status;

  INSERT INTO public.booking_review_reports (review_id, reporter_profile_id, reason, note)
  VALUES (rev.id, auth.uid(), v_reason, v_note)
  RETURNING id INTO rid;

  IF (SELECT moderation_status FROM public.booking_reviews WHERE id = rev.id) IS DISTINCT FROM current_status THEN
    RAISE EXCEPTION 'a report must not change moderation status';
  END IF;

  RETURN jsonb_build_object(
    'report_id', rid,
    'moderation_status', current_status,
    'auto_hidden', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_booking_review(
  p_review_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rev public.booking_reviews;
  next_status public.booking_review_moderation_status;
BEGIN
  PERFORM public.ppp_set_rpc('moderate_booking_review');
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can moderate a contractor review';
  END IF;
  IF p_action NOT IN ('keep_published', 'hide', 'restore', 'remove') THEN
    RAISE EXCEPTION 'unknown moderation action';
  END IF;

  SELECT * INTO rev FROM public.booking_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found';
  END IF;
  IF rev.reviewer_role IS DISTINCT FROM 'CUSTOMER' THEN
    RAISE EXCEPTION 'only a homeowner review can be moderated here';
  END IF;

  IF p_action = 'keep_published' THEN
    IF rev.moderation_status IS DISTINCT FROM 'PUBLISHED' THEN
      RAISE EXCEPTION 'review is not published';
    END IF;
    next_status := 'PUBLISHED';
  ELSIF p_action = 'hide' THEN
    IF rev.moderation_status = 'REMOVED' THEN
      RAISE EXCEPTION 'removed reviews stay removed until restored';
    END IF;
    next_status := 'HIDDEN';
  ELSIF p_action = 'restore' THEN
    IF rev.moderation_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'review is already published';
    END IF;
    next_status := 'PUBLISHED';
  ELSE
    next_status := 'REMOVED';
  END IF;

  UPDATE public.booking_reviews
  SET
    moderation_status = next_status,
    moderated_at = now(),
    moderated_by = auth.uid()
  WHERE id = rev.id;

  INSERT INTO public.booking_review_moderation_events (
    review_id, actor_id, action, from_status, to_status
  ) VALUES (
    rev.id, auth.uid(), p_action, rev.moderation_status, next_status
  );

  PERFORM public.write_audit_log(
    auth.uid(),
    'booking_review.' || p_action,
    'booking_review',
    rev.id,
    jsonb_build_object('from_status', rev.moderation_status, 'to_status', next_status)
  );

  RETURN jsonb_build_object(
    'review_id', rev.id,
    'moderation_status', next_status,
    'action', p_action
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_contractor_reviews()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contractor uuid;
  v_average numeric;
  v_count integer;
  v_verified integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  v_contractor := public.current_contractor_profile_id();
  IF v_contractor IS NULL THEN
    RAISE EXCEPTION 'contractor profile required';
  END IF;

  SELECT
    round(avg(r.rating)::numeric, 1),
    count(*)::integer,
    count(*) FILTER (WHERE r.review_class = 'VERIFIED_PPP_PROJECT')::integer
  INTO v_average, v_count, v_verified
  FROM public.booking_reviews r
  WHERE r.contractor_profile_id = v_contractor
    AND r.reviewer_role = 'CUSTOMER'
    AND r.review_class = 'VERIFIED_PPP_PROJECT'
    AND r.moderation_status = 'PUBLISHED'
    AND r.is_verified = true
    AND NOT public.review_text_is_excluded_from_public(coalesce(r.body, ''))
    AND NOT public.review_text_is_excluded_from_public(coalesce(r.homeowner_display, ''))
    AND NOT public.review_text_is_excluded_from_public(coalesce(r.category, ''));

  RETURN jsonb_build_object(
    'rating_average', CASE WHEN coalesce(v_count, 0) = 0 THEN NULL ELSE v_average END,
    'rating_count', coalesce(v_count, 0),
    'verified_count', coalesce(v_verified, 0),
    'reviews', coalesce((
      SELECT jsonb_agg(listed.item ORDER BY listed.created_at DESC)
      FROM (
        SELECT
          r.created_at,
          jsonb_build_object(
            'id', r.id,
            'rating', r.rating,
            'body', r.body,
            'category', r.category,
            'created_at', r.created_at,
            'homeowner_display', r.homeowner_display,
            'review_class', r.review_class,
            'moderation_status', r.moderation_status,
            'verified', r.review_class = 'VERIFIED_PPP_PROJECT',
            'response_body', resp.body,
            'response_created_at', resp.created_at,
            'response_updated_at', resp.updated_at,
            'reported_by_me', EXISTS (
              SELECT 1
              FROM public.booking_review_reports rep
              WHERE rep.review_id = r.id
                AND rep.reporter_profile_id = auth.uid()
            )
          ) AS item
        FROM public.booking_reviews r
        LEFT JOIN public.booking_review_responses resp ON resp.review_id = r.id
        WHERE r.contractor_profile_id = v_contractor
          AND r.reviewer_role = 'CUSTOMER'
          AND NOT public.review_text_is_excluded_from_public(coalesce(r.body, ''))
          AND NOT public.review_text_is_excluded_from_public(coalesce(r.homeowner_display, ''))
          AND NOT public.review_text_is_excluded_from_public(coalesce(r.category, ''))
        ORDER BY r.created_at DESC
        LIMIT 50
      ) listed
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_contractor_reviews_for_admin()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can moderate a contractor review';
  END IF;

  RETURN jsonb_build_object(
    'reviews', coalesce((
      SELECT jsonb_agg(listed.item ORDER BY listed.created_at DESC)
      FROM (
        SELECT
          r.created_at,
          jsonb_build_object(
            'id', r.id,
            'rating', r.rating,
            'body', r.body,
            'category', r.category,
            'created_at', r.created_at,
            'homeowner_display', r.homeowner_display,
            'review_class', r.review_class,
            'moderation_status', r.moderation_status,
            'verified', r.review_class = 'VERIFIED_PPP_PROJECT',
            'contractor_profile_id', r.contractor_profile_id,
            'display_label', public.anonymized_pro_label(cp.primary_trade, NULL),
            'response_body', resp.body,
            'reports', coalesce((
              SELECT jsonb_agg(jsonb_build_object(
                'id', rep.id,
                'reason', rep.reason,
                'note', rep.note,
                'created_at', rep.created_at
              ) ORDER BY rep.created_at DESC)
              FROM public.booking_review_reports rep
              WHERE rep.review_id = r.id
            ), '[]'::jsonb),
            'events', coalesce((
              SELECT jsonb_agg(jsonb_build_object(
                'id', ev.id,
                'action', ev.action,
                'from_status', ev.from_status,
                'to_status', ev.to_status,
                'created_at', ev.created_at
              ) ORDER BY ev.created_at DESC)
              FROM public.booking_review_moderation_events ev
              WHERE ev.review_id = r.id
            ), '[]'::jsonb)
          ) AS item
        FROM public.booking_reviews r
        JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
        LEFT JOIN public.booking_review_responses resp ON resp.review_id = r.id
        WHERE r.reviewer_role = 'CUSTOMER'
        ORDER BY r.created_at DESC
        LIMIT 200
      ) listed
    ), '[]'::jsonb)
  );
END;
$$;

-- Public aggregates count published verified homeowner reviews only.
CREATE OR REPLACE VIEW public.contractor_public_ratings
WITH (security_invoker = false)
AS
SELECT
  r.contractor_profile_id,
  round(avg(r.rating)::numeric, 1) AS rating_average,
  count(*)::integer AS rating_count
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND r.review_class = 'VERIFIED_PPP_PROJECT'
  AND r.moderation_status = 'PUBLISHED'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND r.contractor_profile_id IS DISTINCT FROM 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6'::uuid
  AND NOT public.review_text_is_excluded_from_public(coalesce(r.body, ''))
  AND NOT public.review_text_is_excluded_from_public(coalesce(r.homeowner_display, ''))
  AND NOT public.review_text_is_excluded_from_public(coalesce(r.category, ''))
GROUP BY r.contractor_profile_id;

CREATE OR REPLACE VIEW public.contractor_public_reviews
WITH (security_invoker = false)
AS
SELECT
  r.id,
  r.contractor_profile_id,
  r.rating,
  CASE
    WHEN r.body IS NULL OR btrim(r.body) = '' OR public.text_contains_pre_hire_contact(r.body)
      THEN 'Verified PPP review.'
    WHEN char_length(regexp_replace(btrim(r.body), '\s+', ' ', 'g')) > 280
      THEN left(regexp_replace(btrim(r.body), '\s+', ' ', 'g'), 277) || '…'
    ELSE regexp_replace(btrim(r.body), '\s+', ' ', 'g')
  END AS body,
  r.category,
  r.created_at,
  r.homeowner_display,
  (r.review_class = 'VERIFIED_PPP_PROJECT') AS verified,
  CASE
    WHEN resp.body IS NULL
      OR btrim(resp.body) = ''
      OR public.text_contains_pre_hire_contact(resp.body)
      OR public.review_text_is_excluded_from_public(resp.body)
      THEN NULL
    WHEN char_length(regexp_replace(btrim(resp.body), '\s+', ' ', 'g')) > 280
      THEN left(regexp_replace(btrim(resp.body), '\s+', ' ', 'g'), 277) || '…'
    ELSE regexp_replace(btrim(resp.body), '\s+', ' ', 'g')
  END AS response_body,
  CASE
    WHEN resp.body IS NULL
      OR public.text_contains_pre_hire_contact(resp.body)
      OR public.review_text_is_excluded_from_public(resp.body)
      THEN NULL
    ELSE resp.created_at
  END AS response_created_at,
  CASE
    WHEN resp.body IS NULL
      OR public.text_contains_pre_hire_contact(resp.body)
      OR public.review_text_is_excluded_from_public(resp.body)
      THEN NULL
    ELSE resp.updated_at
  END AS response_updated_at
FROM public.booking_reviews r
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
LEFT JOIN public.booking_review_responses resp ON resp.review_id = r.id
WHERE r.is_verified = true
  AND r.reviewer_role = 'CUSTOMER'
  AND r.review_class = 'VERIFIED_PPP_PROJECT'
  AND r.moderation_status = 'PUBLISHED'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
  AND r.contractor_profile_id IS DISTINCT FROM 'af55cdfe-b3aa-421d-84b3-0411d9d7e3b6'::uuid
  AND NOT public.review_text_is_excluded_from_public(coalesce(r.body, ''))
  AND NOT public.review_text_is_excluded_from_public(coalesce(r.homeowner_display, ''))
  AND NOT public.review_text_is_excluded_from_public(coalesce(r.category, ''));

COMMENT ON VIEW public.contractor_public_ratings IS
  'Published verified PPP project reviews only. Hidden and removed reviews drop out. No customer identifiers. Smoke-tester and demo text are excluded. SECURITY DEFINER view on purpose so anon never reads booking_reviews.';
COMMENT ON VIEW public.contractor_public_reviews IS
  'Published verified review text, category, date, homeowner initial, and one contractor response. No phone, email, street, booking id, or business name.';

DROP FUNCTION IF EXISTS public.list_public_directory_reviews(uuid);

CREATE FUNCTION public.list_public_directory_reviews(p_id uuid)
RETURNS TABLE (
  id uuid,
  rating smallint,
  body text,
  category text,
  created_at timestamptz,
  homeowner_display text,
  verified boolean,
  response_body text,
  response_created_at timestamptz,
  response_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.rating,
    r.body,
    r.category,
    r.created_at,
    r.homeowner_display,
    r.verified,
    r.response_body,
    r.response_created_at,
    r.response_updated_at
  FROM public.contractor_public_reviews r
  WHERE r.contractor_profile_id = p_id
    AND public.contractor_is_directory_listed(p_id)
  ORDER BY r.created_at DESC, r.id;
$$;

COMMENT ON FUNCTION public.list_public_directory_reviews(uuid) IS
  'Published verified PPP project reviews only. Hidden, removed, smoke-tester, and demo text stay out. No customer identity.';

REVOKE ALL ON FUNCTION public.review_text_is_excluded_from_public(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.privacy_safe_homeowner_display(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_review_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_booking_review_response_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_booking_review_report_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_booking_review_moderation_event_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_booking_review(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_to_booking_review(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_booking_review(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moderate_booking_review(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_contractor_reviews() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_contractor_reviews_for_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_public_directory_reviews(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_booking_review(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_booking_review(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_booking_review(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_booking_review(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_contractor_reviews() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_contractor_reviews_for_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_directory_reviews(uuid) TO anon, authenticated;

GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;
GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;

ALTER TABLE public.booking_review_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_review_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_review_moderation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.booking_review_responses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.booking_review_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.booking_review_moderation_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.booking_reviews FROM anon;

GRANT SELECT ON TABLE public.booking_review_responses TO authenticated;
GRANT SELECT ON TABLE public.booking_review_reports TO authenticated;
GRANT SELECT ON TABLE public.booking_review_moderation_events TO authenticated;

CREATE POLICY booking_review_responses_select_parties
  ON public.booking_review_responses
  FOR SELECT
  TO authenticated
  USING (
    contractor_profile_id = public.current_contractor_profile_id()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.booking_reviews r
      WHERE r.id = review_id
        AND r.customer_id = auth.uid()
    )
  );

CREATE POLICY booking_review_reports_select_reporter_or_admin
  ON public.booking_review_reports
  FOR SELECT
  TO authenticated
  USING (
    reporter_profile_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY booking_review_moderation_events_select_admin
  ON public.booking_review_moderation_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

COMMENT ON FUNCTION public.submit_booking_review(uuid, integer, text) IS
  'Either booking participant may review after mutual Hired. A homeowner review of the hired contractor on their own project is stored as VERIFIED_PPP_PROJECT. Callers cannot choose the class. One review per homeowner, project, and contractor. Outside CUSTOMER_REVIEW inserts are rejected.';
COMMENT ON FUNCTION public.respond_to_booking_review(uuid, text) IS
  'The reviewed contractor creates or edits the single public response. Does not change stars, text, or verified status.';
COMMENT ON FUNCTION public.report_booking_review(uuid, text, text) IS
  'Contractor report. Does not hide or remove the review.';
COMMENT ON FUNCTION public.moderate_booking_review(uuid, text) IS
  'Admin keep, hide, restore, or remove. Writes moderation history and audit_logs. Does not create reviews or assign verified status.';
