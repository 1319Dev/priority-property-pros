-- Contractor-owned DRAFT estimates can be hard-deleted.
-- Sent estimates stay on withdraw_estimate (history kept, not deleted).
-- Never hard-delete ACCEPTED. Clients do not get GRANT DELETE on estimates.

CREATE OR REPLACE FUNCTION public.delete_estimate(p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  est public.estimates;
BEGIN
  PERFORM public.ppp_set_rpc('delete_estimate');

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO est FROM public.estimates WHERE id = p_estimate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate not found';
  END IF;
  IF est.contractor_profile_id IS DISTINCT FROM public.current_contractor_profile_id()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your estimate';
  END IF;
  IF est.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'accepted estimates cannot be deleted';
  END IF;
  IF est.status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'only draft estimates can be deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.estimate_id = est.id) THEN
    RAISE EXCEPTION 'accepted estimates cannot be deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projects p WHERE p.selected_estimate_id = est.id) THEN
    RAISE EXCEPTION 'accepted estimates cannot be deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.estimate_events ev WHERE ev.estimate_id = est.id) THEN
    RAISE EXCEPTION 'only draft estimates can be deleted';
  END IF;

  DELETE FROM public.estimate_items WHERE estimate_id = est.id;
  DELETE FROM public.estimates WHERE id = est.id;

  PERFORM public.write_audit_log(
    auth.uid(),
    'estimate.deleted',
    'estimates',
    est.id,
    jsonb_build_object(
      'status', est.status,
      'project_id', est.project_id,
      'opportunity_id', est.opportunity_id
    )
  );

  RETURN jsonb_build_object(
    'estimate_id', est.id,
    'deleted', true,
    'status', 'DRAFT'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_estimate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_estimate(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_estimate(uuid) IS
  'Owner contractor (or admin) hard-deletes a DRAFT estimate they own. Sent estimates must be withdrawn, not deleted. ACCEPTED cannot be deleted. Does not notify the customer. Does not GRANT DELETE on estimates to the Data API.';
