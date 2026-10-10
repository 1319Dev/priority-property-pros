-- Portfolio photo privacy.
-- Closes the live self-approval hole without changing payments, matching,
-- contact unlock, or older migrations:
--   1. A contractor can INSERT or UPDATE privacy_state to PUBLIC_SAFE, and that
--      publishes the caption on Find a Pro. This trigger forces REVIEW_REQUIRED
--      on insert and rejects a direct privacy change.
--   2. In production today, other signed-in users cannot read portfolio files.
--      The old storage SELECT policy looks at contractor_profiles, and that
--      table's RLS hides the contractor row from them, so the EXISTS check
--      fails. This migration intentionally changes that: every signed-in user
--      can read a PUBLIC_SAFE portfolio object when the contractor is APPROVED
--      and the profile is ACTIVE. Signed URLs are minted in the browser, so
--      storage SELECT is that gate.
--   3. After a photo is PUBLIC_SAFE, a non-admin must not land new bytes on
--      that object name. Insert covers copy and upsert. Update covers in-place
--      edits and move/rename (an UPDATE of objects.name). USING locks the old
--      name. WITH CHECK locks the new name, so deleting the approved file and
--      renaming another object onto it is denied. Delete of the object stays
--      allowed. The portfolio row is unchanged, so the name stays locked.
--
-- Non-admin JWT callers are auth.uid() IS NOT NULL AND NOT is_admin().
-- Service role (no JWT sub) and admins are unchanged.
--
-- Column privileges stay table-level, matching production. A column-level
-- revoke of contractor_profile_id would not remove UPDATE, because UPDATE is
-- already granted on the whole table. A column GRANT would add
-- pg_attribute.attacl entries production does not have. The trigger rejects a
-- change of contractor_profile_id and a direct change of privacy_state. INSERT
-- still sends contractor_profile_id. A client that still names privacy_state
-- reaches this trigger: INSERT is forced to REVIEW_REQUIRED, and a direct
-- UPDATE raises a friendly error.
--
-- Existing data: applying this file does not INSERT, UPDATE, or DELETE
-- public.contractor_portfolio, and it does not INSERT, UPDATE, or DELETE
-- storage.objects. The two production REVIEW_REQUIRED portfolio rows and their
-- uploaded files stay as they are, including privacy_state. The UPDATE inside
-- admin_set_portfolio_privacy runs only when an admin calls that RPC later.

CREATE OR REPLACE FUNCTION public.contractor_portfolio_owner_profile_id(p_contractor_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT cp.profile_id
  FROM public.contractor_profiles cp
  WHERE cp.id = p_contractor_profile_id;
$fn$;

COMMENT ON FUNCTION public.contractor_portfolio_owner_profile_id(uuid) IS
  'Profile id (auth uid folder) that owns a contractor_profiles row. SECURITY DEFINER so portfolio triggers can check the storage prefix without depending on contractor_profiles RLS.';

REVOKE ALL ON FUNCTION public.contractor_portfolio_owner_profile_id(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_contractor_portfolio_privacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
  v_prefix text;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.contractor_profile_id IS DISTINCT FROM OLD.contractor_profile_id THEN
    RAISE EXCEPTION 'You cannot move a portfolio photo to another contractor.';
  END IF;

  v_owner := public.contractor_portfolio_owner_profile_id(NEW.contractor_profile_id);
  v_prefix := coalesce(v_owner::text, '') || '/portfolio/';
  IF v_owner IS NULL OR coalesce(NEW.storage_path, '') = '' OR position(v_prefix in NEW.storage_path) <> 1 THEN
    RAISE EXCEPTION 'Portfolio photos must stay in your own portfolio folder.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.privacy_state := 'REVIEW_REQUIRED';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description THEN
      NEW.privacy_state := 'REVIEW_REQUIRED';
    ELSIF NEW.privacy_state IS DISTINCT FROM OLD.privacy_state THEN
      RAISE EXCEPTION 'Photo visibility is reviewed by Priority Property Pros. You cannot change it yourself.';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_contractor_portfolio_privacy() IS
  'SECURITY DEFINER, search_path public. auth.uid() reads request.jwt claims, not current_user, so the definer owner is not treated as the caller. is_admin() uses auth.uid() the same way. For non-admin JWT callers: force REVIEW_REQUIRED on insert, reject privacy_state and owner changes, reset review when the photo or caption changes, and keep storage_path under the owner profile folder.';

REVOKE ALL ON FUNCTION public.enforce_contractor_portfolio_privacy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_contractor_portfolio_privacy() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_enforce_contractor_portfolio_privacy ON public.contractor_portfolio;
CREATE TRIGGER trg_enforce_contractor_portfolio_privacy
  BEFORE INSERT OR UPDATE ON public.contractor_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_contractor_portfolio_privacy();

-- Partial index for the storage-policy lookups below. Both helpers filter
-- privacy_state = PUBLIC_SAFE and compare storage_path to the object name.
CREATE INDEX IF NOT EXISTS contractor_portfolio_public_safe_path_idx
  ON public.contractor_portfolio (storage_path)
  WHERE privacy_state = 'PUBLIC_SAFE';

CREATE OR REPLACE FUNCTION public.portfolio_storage_is_publicly_readable(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_portfolio pf
    JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE pf.storage_path = p_object_name
      AND pf.privacy_state = 'PUBLIC_SAFE'
      AND cp.approval_status = 'APPROVED'
      AND p.account_status = 'ACTIVE'
  );
$fn$;

COMMENT ON FUNCTION public.portfolio_storage_is_publicly_readable(text) IS
  'True when a portfolio object is PUBLIC_SAFE and the contractor is APPROVED with an ACTIVE profile. SECURITY DEFINER so storage SELECT does not depend on contractor_portfolio RLS. Does not expose the row.';

CREATE OR REPLACE FUNCTION public.portfolio_storage_is_public_safe(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.contractor_portfolio pf
    WHERE pf.storage_path = p_object_name
      AND pf.privacy_state = 'PUBLIC_SAFE'
  );
$fn$;

COMMENT ON FUNCTION public.portfolio_storage_is_public_safe(text) IS
  'True when any portfolio row already published this object name. Used to block non-admin overwrites of approved photo bytes.';

REVOKE ALL ON FUNCTION public.portfolio_storage_is_publicly_readable(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portfolio_storage_is_public_safe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portfolio_storage_is_publicly_readable(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portfolio_storage_is_public_safe(text) TO authenticated;

DROP POLICY IF EXISTS contractor_docs_storage_select ON storage.objects;
CREATE POLICY contractor_docs_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'contractor-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
      OR (
        (storage.foldername(name))[2] = 'portfolio'
        AND public.portfolio_storage_is_publicly_readable(name)
      )
    )
  );

-- Non-admins cannot insert a new object at a path a PUBLIC_SAFE row already
-- names. Delete of the object stays allowed: the portfolio row is left as it
-- is, so this check still fails and the owner cannot put unreviewed bytes
-- back at that path. Deleting the portfolio row and inserting it again is a
-- new row, and the trigger forces REVIEW_REQUIRED.
DROP POLICY IF EXISTS contractor_docs_storage_insert ON storage.objects;
CREATE POLICY contractor_docs_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contractor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] = ANY (ARRAY['portfolio', 'credentials'])
    AND (
      public.is_admin()
      OR (storage.foldername(name))[2] IS DISTINCT FROM 'portfolio'
      OR NOT public.portfolio_storage_is_public_safe(name)
    )
  );

-- USING sees the old objects.name. WITH CHECK sees the name after the update,
-- which is what storage move writes. Both must reject a PUBLIC_SAFE portfolio
-- name for a non-admin. Copy and upsert are inserts and use the insert policy.
DROP POLICY IF EXISTS contractor_docs_storage_update ON storage.objects;
CREATE POLICY contractor_docs_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contractor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.is_admin()
      OR (storage.foldername(name))[2] IS DISTINCT FROM 'portfolio'
      OR NOT public.portfolio_storage_is_public_safe(name)
    )
  )
  WITH CHECK (
    bucket_id = 'contractor-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.is_admin()
      OR (storage.foldername(name))[2] IS DISTINCT FROM 'portfolio'
      OR NOT public.portfolio_storage_is_public_safe(name)
    )
  );

CREATE OR REPLACE FUNCTION public.admin_set_portfolio_privacy(
  p_item_id uuid,
  p_state public.portfolio_privacy_state,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.contractor_portfolio;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can set portfolio photo privacy';
  END IF;

  SELECT * INTO v_row
  FROM public.contractor_portfolio
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portfolio photo not found';
  END IF;

  UPDATE public.contractor_portfolio
  SET privacy_state = p_state
  WHERE id = v_row.id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'portfolio.privacy_set',
    'contractor_portfolio',
    v_row.id,
    jsonb_build_object(
      'contractor_profile_id', v_row.contractor_profile_id,
      'previous_privacy_state', v_row.privacy_state,
      'privacy_state', p_state,
      'note', v_note,
      'storage_path', v_row.storage_path
    )
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'contractor_profile_id', v_row.contractor_profile_id,
    'privacy_state', p_state,
    'title', v_row.title,
    'storage_path', v_row.storage_path
  );
END;
$fn$;

COMMENT ON FUNCTION public.admin_set_portfolio_privacy(uuid, public.portfolio_privacy_state, text) IS
  'ADMIN-only. Sets contractor_portfolio.privacy_state and writes audit_logs. Does not charge or change approval.';

CREATE OR REPLACE FUNCTION public.admin_list_portfolio_review_queue()
RETURNS TABLE (
  id uuid,
  contractor_profile_id uuid,
  contractor_label text,
  title text,
  description text,
  storage_path text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin can list the portfolio review queue';
  END IF;

  RETURN QUERY
  SELECT
    pf.id,
    pf.contractor_profile_id,
    coalesce(
      nullif(btrim(cp.business_name), ''),
      nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'Contractor'
    ) AS contractor_label,
    pf.title,
    pf.description,
    pf.storage_path,
    pf.created_at
  FROM public.contractor_portfolio pf
  JOIN public.contractor_profiles cp ON cp.id = pf.contractor_profile_id
  JOIN public.profiles p ON p.id = cp.profile_id
  WHERE pf.privacy_state = 'REVIEW_REQUIRED'
  ORDER BY pf.created_at ASC, pf.id;
END;
$fn$;

COMMENT ON FUNCTION public.admin_list_portfolio_review_queue() IS
  'ADMIN-only. REVIEW_REQUIRED portfolio photos with a contractor display label and storage_path so an admin can open a signed URL.';

REVOKE ALL ON FUNCTION public.admin_set_portfolio_privacy(uuid, public.portfolio_privacy_state, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_portfolio_review_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_portfolio_privacy(uuid, public.portfolio_privacy_state, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_portfolio_review_queue() TO authenticated;
