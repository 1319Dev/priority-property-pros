-- Permanent job reference numbers.
-- Assigned when a project row is created. Existing rows are backfilled in
-- created_at order starting at 1001. The app displays PPP-<n>.
-- Does not change fees, checkout, or approval RPCs.
-- SELECT policies on projects already expose every column of a visible row,
-- including this one. list_my_customer_projects and get_my_customer_project
-- return SETOF projects via SELECT *, so they expose it without a rewrite.

CREATE SEQUENCE IF NOT EXISTS public.project_reference_seq
  AS bigint
  START WITH 1001
  INCREMENT BY 1
  MINVALUE 1
  NO CYCLE;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS reference_number bigint;

WITH ordered AS (
  SELECT
    id,
    1000 + row_number() OVER (ORDER BY created_at ASC, id ASC) AS reference_number
  FROM public.projects
  WHERE reference_number IS NULL
)
UPDATE public.projects AS p
SET reference_number = ordered.reference_number
FROM ordered
WHERE p.id = ordered.id;

SELECT setval(
  'public.project_reference_seq',
  GREATEST(
    1000,
    COALESCE((SELECT MAX(reference_number) FROM public.projects), 1000)
  )
);

ALTER TABLE public.projects
  ALTER COLUMN reference_number SET DEFAULT nextval('public.project_reference_seq'),
  ALTER COLUMN reference_number SET NOT NULL;

ALTER SEQUENCE public.project_reference_seq OWNED BY public.projects.reference_number;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_reference_number_key;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_reference_number_key UNIQUE (reference_number);

COMMENT ON COLUMN public.projects.reference_number IS
  'Permanent job reference. Assigned from project_reference_seq. Displayed as PPP-<n>. Clients cannot set or change it.';

GRANT USAGE, SELECT ON SEQUENCE public.project_reference_seq TO authenticated, service_role;

-- Owner and admin UPDATE policies allow the whole row. A table-level UPDATE
-- grant would also ignore a later column revoke, and restricting column
-- privileges breaks select *. This trigger is the guard.
CREATE OR REPLACE FUNCTION public.protect_project_reference_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      IF NEW.reference_number IS NULL THEN
        NEW.reference_number := nextval('public.project_reference_seq');
      END IF;
      RETURN NEW;
    END IF;

    -- Logged-in clients cannot choose the number. The column default already
    -- called nextval when the column was omitted; keep that value. Any other
    -- supplied value is replaced with the next sequence value.
    BEGIN
      v_current := currval('public.project_reference_seq');
    EXCEPTION
      WHEN object_not_in_prerequisite_state THEN
        v_current := NULL;
    END;

    IF NEW.reference_number IS NULL
       OR v_current IS NULL
       OR NEW.reference_number IS DISTINCT FROM v_current THEN
      NEW.reference_number := nextval('public.project_reference_seq');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.reference_number IS DISTINCT FROM OLD.reference_number AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'project reference numbers are permanent and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_project_reference_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS projects_protect_reference_number ON public.projects;
CREATE TRIGGER projects_protect_reference_number
  BEFORE INSERT OR UPDATE OF reference_number ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_project_reference_number();

COMMENT ON FUNCTION public.protect_project_reference_number() IS
  'Assigns project_reference_seq on insert for signed-in clients and rejects later changes. Service-role sessions (auth.uid() IS NULL) may repair a number.';


CREATE OR REPLACE FUNCTION public.list_my_message_threads()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pairs AS (
    SELECT DISTINCT ON (a.project_id, a.contractor_profile_id)
      a.project_id,
      a.contractor_profile_id
    FROM public.booking_contact_access a
    WHERE public.message_pair_has_connection_entitlement(a.project_id, a.contractor_profile_id)
    ORDER BY a.project_id, a.contractor_profile_id
  ),
  rows AS (
    SELECT
      t.id AS thread_id,
      pairs.project_id,
      pairs.contractor_profile_id,
      CASE
        WHEN public.text_contains_contact_info(p.title) OR public.text_contains_pre_hire_contact(p.title)
          THEN 'Project'
        ELSE coalesce(nullif(btrim(p.title), ''), 'Project')
      END AS project_title,
      p.reference_number AS project_reference_number,
      CASE
        WHEN public.text_contains_contact_info(p.city) OR public.text_contains_pre_hire_contact(p.city)
          THEN NULL
        ELSE nullif(btrim(p.city), '')
      END AS city,
      CASE
        WHEN public.text_contains_contact_info(p.state) OR public.text_contains_pre_hire_contact(p.state)
          THEN NULL
        ELSE nullif(btrim(p.state), '')
      END AS state,
      public.anonymized_pro_label(cp.primary_trade, NULL) AS contractor_label,
      CASE
        WHEN p.customer_id = (SELECT auth.uid()) THEN
          CASE
            WHEN cp.business_name IS NULL
              OR btrim(cp.business_name) = ''
              OR public.text_contains_contact_info(cp.business_name)
              OR public.text_contains_pre_hire_contact(cp.business_name)
              THEN public.anonymized_pro_label(cp.primary_trade, NULL)
            ELSE btrim(cp.business_name)
          END
        ELSE
          CASE
            WHEN cust.first_name IS NULL
              OR btrim(cust.first_name) = ''
              OR public.text_contains_contact_info(cust.first_name)
              OR public.text_contains_pre_hire_contact(cust.first_name)
              THEN 'Customer'
            ELSE btrim(cust.first_name)
          END
      END AS other_party_label,
      (
        SELECT m.created_at
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message_at,
      (
        SELECT left(m.body, 140)
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_preview,
      coalesce((
        SELECT m.sender_profile_id = (SELECT auth.uid())
        FROM public.project_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ), false) AS last_sender_is_viewer,
      coalesce((
        SELECT count(*)::int
        FROM public.project_messages m
        WHERE m.thread_id = t.id
          AND m.sender_profile_id IS DISTINCT FROM (SELECT auth.uid())
          AND m.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz)
      ), 0) AS unread_count,
      rd.last_read_at,
      (
        SELECT b.id
        FROM public.bookings b
        WHERE b.project_id = pairs.project_id
          AND b.contractor_profile_id = pairs.contractor_profile_id
          AND b.status IS DISTINCT FROM 'CANCELLED'
        ORDER BY b.created_at DESC
        LIMIT 1
      ) AS booking_id,
      (
        SELECT o.id
        FROM public.opportunities o
        WHERE o.project_id = pairs.project_id
          AND o.contractor_profile_id = pairs.contractor_profile_id
        ORDER BY o.created_at DESC
        LIMIT 1
      ) AS opportunity_id
    FROM pairs
    JOIN public.projects p ON p.id = pairs.project_id
    JOIN public.profiles cust ON cust.id = p.customer_id
    JOIN public.contractor_profiles cp ON cp.id = pairs.contractor_profile_id
    LEFT JOIN public.project_message_threads t
      ON t.project_id = pairs.project_id
     AND t.contractor_profile_id = pairs.contractor_profile_id
    LEFT JOIN public.project_message_reads rd
      ON rd.thread_id = t.id
     AND rd.profile_id = (SELECT auth.uid())
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'thread_id', rows.thread_id,
        'project_id', rows.project_id,
        'contractor_profile_id', rows.contractor_profile_id,
        'project_title', rows.project_title,
        'project_reference_number', rows.project_reference_number,
        'city', rows.city,
        'state', rows.state,
        'contractor_label', rows.contractor_label,
        'other_party_label', rows.other_party_label,
        'last_message_at', rows.last_message_at,
        'last_preview', rows.last_preview,
        'last_sender_is_viewer', rows.last_sender_is_viewer,
        'unread_count', rows.unread_count,
        'last_read_at', rows.last_read_at,
        'booking_id', rows.booking_id,
        'opportunity_id', rows.opportunity_id
      )
      ORDER BY rows.last_message_at DESC NULLS LAST, rows.project_title
    ),
    '[]'::jsonb
  )
  FROM rows;
$$;

COMMENT ON FUNCTION public.list_my_message_threads() IS
  'Inbox rows after a $4.99 connection entitlement. Customers see the contractor business name. Contractors see the customer first name. Includes project_reference_number. No phone, email, or street.';

REVOKE ALL ON FUNCTION public.list_my_message_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_message_threads() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_estimates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
BEGIN
  cid := public.current_contractor_profile_id();
  IF cid IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not a contractor';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(item ORDER BY coalesce(item->>'submitted_at', item->>'created_at') DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', e.id,
        'project_id', e.project_id,
        'opportunity_id', e.opportunity_id,
        'project_title', p.title,
        'project_reference_number', p.reference_number,
        'status', e.status,
        'total_cents', e.total_cents,
        'submitted_at', e.submitted_at,
        'first_viewed_at', e.first_viewed_at,
        'last_viewed_at', e.last_viewed_at,
        'view_count', e.view_count,
        'accepted_at', e.accepted_at,
        'declined_at', e.declined_at,
        'decline_reason', e.decline_reason,
        'withdrawn_at', e.withdrawn_at,
        'created_at', e.created_at
      ) AS item
      FROM public.estimates e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.contractor_profile_id = cid
    ) q
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.list_my_estimates() IS
  'Contractor estimate list. Includes project_reference_number from the project row. Does not mark VIEWED and does not return contact fields.';
