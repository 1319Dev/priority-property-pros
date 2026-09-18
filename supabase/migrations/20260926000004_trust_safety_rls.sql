-- RLS, grants, directory rating filters, and profile-protect exceptions for trust RPCs.
-- Does not open private contact or public contractor identity.
-- Preview/staging only: giiskdvitimksdewnelc. Do NOT apply to production bersftkjpbzpgtahbqwd.
-- ppp.rpc tokens must match the helper function names in 20260926000003.

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rpc text := coalesce(current_setting('ppp.rpc', true), '');
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email
     AND NOT public.is_admin()
     AND rpc <> 'request_account_deletion' THEN
    RAISE EXCEPTION 'email cannot be changed from the client';
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    IF NEW.account_type = 'ADMIN' AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'ADMIN cannot be assigned from the client';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'account_type cannot be changed by the account owner';
    END IF;
  END IF;

  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND rpc NOT IN (
       'apply_rating_suspension_if_needed',
       'maybe_clear_rating_suspension',
       'request_account_deletion',
       'admin_resolve_trust_dispute'
     ) THEN
    RAISE EXCEPTION 'account_status cannot be changed by the account owner';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.profile_rating_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_dispute_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profile_rating_stats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.account_lifecycle_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trust_disputes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trust_dispute_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.profile_rating_stats TO authenticated;
GRANT SELECT ON TABLE public.account_lifecycle_events TO authenticated;
GRANT SELECT ON TABLE public.trust_disputes TO authenticated;
GRANT SELECT ON TABLE public.trust_dispute_events TO authenticated;

DROP POLICY IF EXISTS profile_rating_stats_select_own_or_admin ON public.profile_rating_stats;
CREATE POLICY profile_rating_stats_select_own_or_admin
  ON public.profile_rating_stats FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS account_lifecycle_events_select_own_or_admin ON public.account_lifecycle_events;
CREATE POLICY account_lifecycle_events_select_own_or_admin
  ON public.account_lifecycle_events FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS trust_disputes_select_filer_or_admin ON public.trust_disputes;
CREATE POLICY trust_disputes_select_filer_or_admin
  ON public.trust_disputes FOR SELECT TO authenticated
  USING (filer_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS trust_dispute_events_select_filer_or_admin ON public.trust_dispute_events;
CREATE POLICY trust_dispute_events_select_filer_or_admin
  ON public.trust_dispute_events FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.trust_disputes d
      WHERE d.id = dispute_id AND d.filer_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.protect_trust_dispute_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'disputes cannot be deleted from the client';
    END IF;
    RETURN OLD;
  END IF;
  IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'disputes cannot be written from the client';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trust_disputes_protect_row ON public.trust_disputes;
CREATE TRIGGER trust_disputes_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.trust_disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_trust_dispute_row();

CREATE OR REPLACE FUNCTION public.forbid_trust_dispute_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'trust_dispute_events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trust_dispute_events_forbid_update ON public.trust_dispute_events;
CREATE TRIGGER trust_dispute_events_forbid_update
  BEFORE UPDATE ON public.trust_dispute_events
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_trust_dispute_event_mutation();

DROP TRIGGER IF EXISTS trust_dispute_events_forbid_delete ON public.trust_dispute_events;
CREATE TRIGGER trust_dispute_events_forbid_delete
  BEFORE DELETE ON public.trust_dispute_events
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_trust_dispute_event_mutation();

CREATE OR REPLACE FUNCTION public.protect_lifecycle_and_rating_rows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'rating and lifecycle rows cannot be deleted from the client';
    END IF;
    RETURN OLD;
  END IF;
  IF coalesce(current_setting('ppp.rpc', true), '') = '' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'rating and lifecycle rows cannot be written from the client';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_rating_stats_protect_row ON public.profile_rating_stats;
CREATE TRIGGER profile_rating_stats_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.profile_rating_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_lifecycle_and_rating_rows();

DROP TRIGGER IF EXISTS account_lifecycle_events_protect_row ON public.account_lifecycle_events;
CREATE TRIGGER account_lifecycle_events_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.account_lifecycle_events
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_lifecycle_and_rating_rows();

-- Public ratings: legitimate completed-job customer→contractor reviews only.
DROP VIEW IF EXISTS public.contractor_public_ratings;
CREATE VIEW public.contractor_public_ratings
WITH (security_invoker = false)
AS
SELECT
  r.contractor_profile_id,
  round(avg(r.rating)::numeric, 1) AS rating_average,
  count(*)::integer AS rating_count
FROM public.booking_reviews r
JOIN public.bookings b ON b.id = r.booking_id
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.included_in_rating = true
  AND r.reviewer_role = 'CUSTOMER'
  AND r.reviewer_id <> r.reviewee_profile_id
  AND b.status = 'COMPLETED'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE'
GROUP BY r.contractor_profile_id;

DROP VIEW IF EXISTS public.contractor_public_reviews;
CREATE VIEW public.contractor_public_reviews
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
  END AS body
FROM public.booking_reviews r
JOIN public.bookings b ON b.id = r.booking_id
JOIN public.contractor_profiles cp ON cp.id = r.contractor_profile_id
JOIN public.profiles p ON p.id = cp.profile_id
WHERE r.is_verified = true
  AND r.included_in_rating = true
  AND r.reviewer_role = 'CUSTOMER'
  AND r.reviewer_id <> r.reviewee_profile_id
  AND b.status = 'COMPLETED'
  AND cp.approval_status = 'APPROVED'
  AND p.account_status = 'ACTIVE';

GRANT SELECT ON public.contractor_public_ratings TO anon, authenticated;
GRANT SELECT ON public.contractor_public_reviews TO anon, authenticated;
REVOKE ALL ON TABLE public.booking_reviews FROM anon;

DROP POLICY IF EXISTS dispute_evidence_storage_select ON storage.objects;
CREATE POLICY dispute_evidence_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dispute-evidence'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS dispute_evidence_storage_insert ON storage.objects;
CREATE POLICY dispute_evidence_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dispute-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

REVOKE ALL ON FUNCTION public.submit_booking_review(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_booking_review(uuid, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_trust_dispute(public.trust_dispute_category, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trust_dispute(public.trust_dispute_category, text, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_trust_disputes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_trust_disputes() TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_trust_dispute(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_trust_dispute(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_admin_trust_disputes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_trust_disputes(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_trust_dispute(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_trust_dispute(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_resolve_trust_dispute(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_trust_dispute(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.request_account_deletion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated;

REVOKE ALL ON FUNCTION public.my_rating_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_rating_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.list_public_fee_schedule() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_fee_schedule() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rating_suspension_min_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rating_suspension_min_reviews() TO authenticated;

REVOKE ALL ON FUNCTION public.apply_rating_suspension_if_needed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maybe_clear_rating_suspension(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_profile_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_account_lifecycle(uuid, public.account_status, public.account_status, public.account_restriction_reason, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_may_start_new_marketplace_work(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_new_marketplace_participation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_trust_dispute_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forbid_trust_dispute_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_lifecycle_and_rating_rows() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_caller_can_start_marketplace_work() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_caller_can_start_marketplace_work() TO authenticated;
