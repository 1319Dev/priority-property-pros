-- Connection Fee: block invalid $4.99 checkouts and refund paid-but-unprovidable connections.
--
-- What this adds (nothing existing is dropped, fees and Price IDs are unchanged):
--   1. connection_checkout_blocker(project, contractor)  -> reason text or NULL
--   2. assert_connection_checkout_allowed(project, auth user)   service role, called before reserve
--   3. connection_checkout_session_validity(session id)          service role, called by the webhook before fulfill
--   4. connection_fee_refunds table: one row per Stripe Checkout session (UNIQUE), refund id + status stored
--   5. prepare_connection_fee_refund / record_connection_fee_refund_result /
--      record_connection_fee_refund_verification   service role, idempotent, audited, admins alerted
--   6. connection_fee_refund_reconcile_report()     service role + admin_connection_fee_refund_reconcile() for admins
--
-- A connection that is already PAID or COMPLETED by this same session is never refunded here.
-- A second paid session on an already PAID connection (duplicate charge) is refunded.

CREATE TABLE IF NOT EXISTS public.connection_fee_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_checkout_session_id text NOT NULL,
  stripe_payment_intent_id text,
  connection_id uuid,
  project_id uuid,
  contractor_profile_id uuid,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  livemode boolean NOT NULL,
  reason text NOT NULL,
  auto_refund boolean NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  idempotency_key text,
  stripe_refund_id text,
  stripe_refund_status text,
  last_error text,
  requested_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  verified_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_fee_refunds_session_key UNIQUE (stripe_checkout_session_id),
  CONSTRAINT connection_fee_refunds_refund_key UNIQUE (stripe_refund_id),
  CONSTRAINT connection_fee_refunds_amount_check CHECK (amount_cents = 499),
  CONSTRAINT connection_fee_refunds_currency_check CHECK (currency = 'usd'),
  CONSTRAINT connection_fee_refunds_pi_prefix CHECK (stripe_payment_intent_id IS NULL OR left(stripe_payment_intent_id, 3) = 'pi_'),
  CONSTRAINT connection_fee_refunds_re_prefix CHECK (stripe_refund_id IS NULL OR left(stripe_refund_id, 3) = 're_'),
  CONSTRAINT connection_fee_refunds_status_check CHECK (status IN (
    'PENDING', 'REQUESTED', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REQUIRES_ACTION', 'MANUAL_REVIEW'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS connection_fee_refunds_pi_key
  ON public.connection_fee_refunds (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON TABLE public.connection_fee_refunds IS
  'One row per Connection Fee Checkout session that needed a refund. Service-role writes only. Stripe refund id and status are stored for independent verification.';

ALTER TABLE public.connection_fee_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.connection_fee_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.connection_fee_refunds TO service_role;

CREATE OR REPLACE FUNCTION public.protect_connection_fee_refund_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'connection fee refunds cannot be deleted';
  END IF;
  IF NOT (public.ppp_rpc_is('prepare_connection_fee_refund')
          OR public.ppp_rpc_is('record_connection_fee_refund_result')
          OR public.ppp_rpc_is('record_connection_fee_refund_verification')) THEN
    RAISE EXCEPTION 'connection fee refunds are written only by the refund functions';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.livemode IS DISTINCT FROM OLD.livemode
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (OLD.stripe_refund_id IS NOT NULL AND NEW.stripe_refund_id IS DISTINCT FROM OLD.stripe_refund_id)
       OR (OLD.stripe_payment_intent_id IS NOT NULL AND NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id) THEN
      RAISE EXCEPTION 'connection fee refund identity columns are immutable';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS connection_fee_refunds_protect_row ON public.connection_fee_refunds;
CREATE TRIGGER connection_fee_refunds_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.connection_fee_refunds
  FOR EACH ROW EXECUTE FUNCTION public.protect_connection_fee_refund_row();

-- 1. Why can this contractor not connect on this project right now? NULL = allowed.
-- Mirrors reserve_connection_checkout and adds customer, block, draft, and selected-elsewhere checks.
CREATE OR REPLACE FUNCTION public.connection_checkout_blocker(p_project_id uuid, p_contractor_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj public.projects;
  cp_profile uuid;
  cp_approval public.approval_status;
  contractor_account public.account_status;
  customer_account public.account_status;
BEGIN
  SELECT * INTO proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN 'project_not_found';
  END IF;
  IF proj.status = 'CANCELLED' OR proj.cancelled_at IS NOT NULL THEN
    RETURN 'project_cancelled';
  END IF;
  IF proj.status = 'DRAFT' THEN
    RETURN 'project_not_posted';
  END IF;
  IF proj.accepting_connections IS NOT TRUE THEN
    RETURN 'connections_closed';
  END IF;
  IF proj.selected_contractor_profile_id IS NOT NULL
     AND proj.selected_contractor_profile_id IS DISTINCT FROM p_contractor_profile_id THEN
    RETURN 'project_contractor_selected';
  END IF;

  SELECT p.account_status INTO customer_account FROM public.profiles p WHERE p.id = proj.customer_id;
  IF customer_account IS DISTINCT FROM 'ACTIVE' THEN
    RETURN 'customer_unavailable';
  END IF;

  SELECT cp.profile_id, cp.approval_status INTO cp_profile, cp_approval
  FROM public.contractor_profiles cp
  WHERE cp.id = p_contractor_profile_id;
  IF cp_profile IS NULL THEN
    RETURN 'contractor_not_found';
  END IF;
  SELECT p.account_status INTO contractor_account FROM public.profiles p WHERE p.id = cp_profile;
  IF contractor_account IS DISTINCT FROM 'ACTIVE' OR cp_approval IS DISTINCT FROM 'APPROVED' THEN
    RETURN 'contractor_ineligible';
  END IF;
  IF cp_profile = proj.customer_id THEN
    RETURN 'contractor_is_customer';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_contractor_blocks b
    WHERE b.customer_profile_id = proj.customer_id
      AND b.contractor_profile_id = p_contractor_profile_id
  ) THEN
    RETURN 'contractor_blocked';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.project_id = p_project_id
      AND o.contractor_profile_id = p_contractor_profile_id
      AND o.status IN ('AVAILABLE', 'ACCEPTED')
      AND (o.expires_at IS NULL OR o.expires_at > now())
  ) THEN
    RETURN 'opportunity_unavailable';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.connection_checkout_blocker(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connection_checkout_blocker(uuid, uuid) TO service_role;

-- 2. Called by create-connection-checkout before reserve. Never writes.
CREATE OR REPLACE FUNCTION public.assert_connection_checkout_allowed(p_project_id uuid, p_auth_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contractor_id uuid;
  reason text;
  paid_exists boolean;
BEGIN
  PERFORM public.require_service_role();
  IF p_auth_user_id IS NULL OR p_project_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  SELECT cp.id INTO contractor_id FROM public.contractor_profiles cp WHERE cp.profile_id = p_auth_user_id LIMIT 1;
  IF contractor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'contractor_not_found');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.project_connections c
    WHERE c.project_id = p_project_id
      AND c.contractor_profile_id = contractor_id
      AND c.status IN ('PAID', 'COMPLETED')
  ) INTO paid_exists;
  IF paid_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_connected');
  END IF;
  reason := public.connection_checkout_blocker(p_project_id, contractor_id);
  RETURN jsonb_build_object('ok', reason IS NULL, 'reason', reason, 'contractor_profile_id', contractor_id);
END;
$$;

REVOKE ALL ON FUNCTION public.assert_connection_checkout_allowed(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_connection_checkout_allowed(uuid, uuid) TO service_role;

-- 3. Webhook re-validation for a paid session, before fulfill. Never writes.
--    PAID/COMPLETED connections answer ok so a retried webhook never refunds a delivered connection.
CREATE OR REPLACE FUNCTION public.connection_checkout_session_validity(p_stripe_checkout_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.connection_checkout_sessions;
  conn public.project_connections;
  reason text;
BEGIN
  PERFORM public.require_service_role();
  SELECT * INTO sess FROM public.connection_checkout_sessions WHERE stripe_checkout_session_id = p_stripe_checkout_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'checkout_session_not_found');
  END IF;
  SELECT * INTO conn FROM public.project_connections WHERE id = sess.connection_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'connection_not_found');
  END IF;
  IF conn.status IN ('PAID', 'COMPLETED') THEN
    RETURN jsonb_build_object('ok', true, 'reason', NULL, 'already_paid', true);
  END IF;
  reason := public.connection_checkout_blocker(conn.project_id, conn.contractor_profile_id);
  RETURN jsonb_build_object('ok', reason IS NULL, 'reason', reason, 'already_paid', false);
END;
$$;

REVOKE ALL ON FUNCTION public.connection_checkout_session_validity(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connection_checkout_session_validity(text) TO service_role;

-- Admin in-app alert. Notifications carry no contact data.
CREATE OR REPLACE FUNCTION public.alert_admins_connection_fee_refund(p_refund_id uuid, p_title text, p_body text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id uuid;
  n integer := 0;
BEGIN
  FOR admin_id IN
    SELECT p.id FROM public.profiles p WHERE p.account_type = 'ADMIN' AND p.account_status = 'ACTIVE'
  LOOP
    PERFORM public.enqueue_notification(
      admin_id, 'admin.connection_fee_refund', p_title, p_body,
      'connection_fee_refund', p_refund_id, jsonb_build_object('refund_id', p_refund_id)
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.alert_admins_connection_fee_refund(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;

-- 4. Decide and reserve a refund attempt. Idempotent per Checkout session.
--    p_reason: a known reason from the webhook (validity check, integrity failure), or NULL to let the DB decide
--    from the session/connection state (fulfill needs_refund flags or a duplicate paid session).
--    p_auto=false records MANUAL_REVIEW without calling Stripe (integrity failures).
CREATE OR REPLACE FUNCTION public.prepare_connection_fee_refund(
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_amount_cents integer,
  p_currency text,
  p_livemode boolean,
  p_reason text DEFAULT NULL,
  p_auto boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.connection_checkout_sessions;
  conn public.project_connections;
  ref public.connection_fee_refunds;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_pi text := public.normalized_stripe_payment_intent_id(p_stripe_payment_intent_id);
  v_auto boolean := coalesce(p_auto, true);
  v_new boolean := false;
BEGIN
  PERFORM public.require_service_role();

  SELECT * INTO sess FROM public.connection_checkout_sessions
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout session not found';
  END IF;
  SELECT * INTO conn FROM public.project_connections WHERE id = sess.connection_id FOR UPDATE;

  IF v_reason IS NULL THEN
    IF sess.needs_refund OR coalesce(conn.needs_refund, false) AND conn.stripe_checkout_session_id IS NOT DISTINCT FROM sess.stripe_checkout_session_id THEN
      v_reason := coalesce(sess.refund_reason, conn.refund_reason, 'needs_refund');
    ELSIF conn.status IN ('PAID', 'COMPLETED')
          AND conn.stripe_checkout_session_id IS DISTINCT FROM sess.stripe_checkout_session_id THEN
      v_reason := 'duplicate_payment';
    ELSE
      RETURN jsonb_build_object('refund', false, 'proceed', false, 'reason', NULL);
    END IF;
  END IF;

  -- Safety: never refund the session that delivered a PAID connection.
  IF conn.status IN ('PAID', 'COMPLETED')
     AND conn.stripe_checkout_session_id IS NOT DISTINCT FROM sess.stripe_checkout_session_id THEN
    RETURN jsonb_build_object('refund', false, 'proceed', false, 'reason', 'delivered_connection_not_refunded');
  END IF;

  IF NOT sess.needs_refund THEN
    PERFORM public.flag_connection_checkout_needs_refund(p_stripe_checkout_session_id, v_reason);
  END IF;
  PERFORM public.ppp_set_rpc('prepare_connection_fee_refund');

  IF p_amount_cents IS DISTINCT FROM 499 OR lower(coalesce(p_currency, '')) IS DISTINCT FROM 'usd'
     OR p_livemode IS DISTINCT FROM sess.livemode OR v_pi IS NULL THEN
    v_auto := false;
  END IF;

  INSERT INTO public.connection_fee_refunds (
    stripe_checkout_session_id, stripe_payment_intent_id, connection_id, project_id, contractor_profile_id,
    amount_cents, currency, livemode, reason, auto_refund, status, idempotency_key
  ) VALUES (
    sess.stripe_checkout_session_id, v_pi, sess.connection_id, sess.project_id, sess.contractor_profile_id,
    499, 'usd', sess.livemode, v_reason, v_auto,
    CASE WHEN v_auto THEN 'PENDING' ELSE 'MANUAL_REVIEW' END,
    NULL
  )
  ON CONFLICT (stripe_checkout_session_id) DO NOTHING
  RETURNING * INTO ref;
  v_new := ref.id IS NOT NULL;
  IF NOT v_new THEN
    SELECT * INTO ref FROM public.connection_fee_refunds
    WHERE stripe_checkout_session_id = sess.stripe_checkout_session_id
    FOR UPDATE;
  END IF;

  IF v_new THEN
    PERFORM public.write_audit_log(NULL, 'connection_fee.refund.flagged', 'connection_fee_refund', ref.id,
      jsonb_build_object('checkout_session_id', ref.stripe_checkout_session_id, 'connection_id', ref.connection_id,
        'reason', ref.reason, 'auto_refund', ref.auto_refund, 'amount_cents', 499, 'livemode', ref.livemode));
    IF ref.connection_id IS NOT NULL THEN
      PERFORM public.write_connection_event(ref.connection_id, 'connection.refund.flagged',
        jsonb_build_object('refund_id', ref.id, 'reason', ref.reason, 'auto_refund', ref.auto_refund));
    END IF;
    PERFORM public.alert_admins_connection_fee_refund(ref.id,
      CASE WHEN ref.auto_refund THEN 'Connection Fee refund started' ELSE 'Connection Fee needs a manual refund review' END,
      'A $4.99 Connection Fee was paid but the connection could not be provided (' || ref.reason || '). '
        || CASE WHEN ref.auto_refund THEN 'An automatic refund is being issued.' ELSE 'Review it in Stripe before refunding.' END);
  END IF;

  IF ref.status IN ('SUCCEEDED', 'MANUAL_REVIEW', 'CANCELED')
     OR (ref.status IN ('REQUESTED', 'REQUIRES_ACTION') AND ref.stripe_refund_id IS NOT NULL)
     OR NOT ref.auto_refund THEN
    RETURN jsonb_build_object('refund', true, 'proceed', false, 'refund_id', ref.id, 'status', ref.status,
      'stripe_refund_id', ref.stripe_refund_id, 'reason', ref.reason);
  END IF;
  -- Another worker holds a fresh attempt. Let it finish.
  IF ref.status = 'PENDING' AND ref.attempts > 0 AND ref.updated_at > now() - interval '2 minutes' THEN
    RETURN jsonb_build_object('refund', true, 'proceed', false, 'in_progress', true, 'refund_id', ref.id,
      'status', ref.status, 'reason', ref.reason);
  END IF;

  UPDATE public.connection_fee_refunds
  SET attempts = attempts + 1,
      status = 'PENDING',
      idempotency_key = 'ppp_conn_refund_' || stripe_checkout_session_id || '_a' || (attempts + 1)::text,
      requested_at = coalesce(requested_at, now())
  WHERE id = ref.id
  RETURNING * INTO ref;

  RETURN jsonb_build_object('refund', true, 'proceed', true, 'refund_id', ref.id, 'status', ref.status,
    'attempt', ref.attempts, 'idempotency_key', ref.idempotency_key,
    'stripe_payment_intent_id', ref.stripe_payment_intent_id, 'amount_cents', 499,
    'connection_id', ref.connection_id, 'reason', ref.reason);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_connection_fee_refund(text, text, integer, text, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_connection_fee_refund(text, text, integer, text, boolean, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.connection_fee_refund_status_from_stripe(p_stripe_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_stripe_status, ''))
    WHEN 'succeeded' THEN 'SUCCEEDED'
    WHEN 'pending' THEN 'REQUESTED'
    WHEN 'requires_action' THEN 'REQUIRES_ACTION'
    WHEN 'failed' THEN 'FAILED'
    WHEN 'canceled' THEN 'CANCELED'
    ELSE 'FAILED'
  END;
$$;

-- 5a. Store the Stripe answer (or the error) for an attempt.
CREATE OR REPLACE FUNCTION public.record_connection_fee_refund_result(
  p_refund_id uuid,
  p_stripe_refund_id text,
  p_stripe_status text,
  p_amount_cents integer,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref public.connection_fee_refunds;
  v_status text;
  v_refund text := nullif(btrim(coalesce(p_stripe_refund_id, '')), '');
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('record_connection_fee_refund_result');
  SELECT * INTO ref FROM public.connection_fee_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund not found';
  END IF;
  IF v_refund IS NOT NULL AND left(v_refund, 3) IS DISTINCT FROM 're_' THEN
    RAISE EXCEPTION 'invalid Stripe refund id';
  END IF;

  IF v_refund IS NULL THEN
    v_status := 'FAILED';
  ELSIF p_amount_cents IS DISTINCT FROM 499 THEN
    v_status := 'MANUAL_REVIEW';
  ELSE
    v_status := public.connection_fee_refund_status_from_stripe(p_stripe_status);
  END IF;

  UPDATE public.connection_fee_refunds
  SET stripe_refund_id = coalesce(stripe_refund_id, v_refund),
      stripe_refund_status = coalesce(lower(nullif(btrim(coalesce(p_stripe_status, '')), '')), stripe_refund_status),
      status = v_status,
      last_error = CASE WHEN v_refund IS NULL THEN left(coalesce(p_error, 'refund failed'), 500)
                        WHEN p_amount_cents IS DISTINCT FROM 499 THEN 'refund amount was not 499 cents'
                        ELSE NULL END,
      completed_at = CASE WHEN v_status = 'SUCCEEDED' THEN coalesce(completed_at, now()) ELSE completed_at END
  WHERE id = ref.id
  RETURNING * INTO ref;

  PERFORM public.write_audit_log(NULL, 'connection_fee.refund.' || lower(v_status), 'connection_fee_refund', ref.id,
    jsonb_build_object('checkout_session_id', ref.stripe_checkout_session_id, 'stripe_refund_id', ref.stripe_refund_id,
      'stripe_status', ref.stripe_refund_status, 'attempt', ref.attempts, 'error', ref.last_error));
  IF ref.connection_id IS NOT NULL THEN
    PERFORM public.write_connection_event(ref.connection_id, 'connection.refund.' || lower(v_status),
      jsonb_build_object('refund_id', ref.id, 'stripe_refund_id', ref.stripe_refund_id));
  END IF;
  IF v_status IN ('FAILED', 'MANUAL_REVIEW', 'REQUIRES_ACTION', 'CANCELED') THEN
    PERFORM public.alert_admins_connection_fee_refund(ref.id, 'Connection Fee refund needs attention',
      'An automatic $4.99 refund did not finish (' || lower(v_status) || '). It will be retried, or check it in Stripe.');
  END IF;

  RETURN jsonb_build_object('refund_id', ref.id, 'status', ref.status, 'stripe_refund_id', ref.stripe_refund_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_connection_fee_refund_result(uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_connection_fee_refund_result(uuid, text, text, integer, text) TO service_role;

-- 5b. Independent check: what Stripe says now about a stored refund (refund.updated webhook or verify job).
CREATE OR REPLACE FUNCTION public.record_connection_fee_refund_verification(
  p_stripe_refund_id text,
  p_stripe_status text,
  p_amount_cents integer,
  p_stripe_payment_intent_id text,
  p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref public.connection_fee_refunds;
  v_status text;
  v_mismatch text;
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('record_connection_fee_refund_verification');
  SELECT * INTO ref FROM public.connection_fee_refunds WHERE stripe_refund_id = p_stripe_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF p_amount_cents IS DISTINCT FROM 499 THEN
    v_mismatch := 'amount';
  ELSIF ref.stripe_payment_intent_id IS NOT NULL
        AND public.normalized_stripe_payment_intent_id(p_stripe_payment_intent_id) IS DISTINCT FROM ref.stripe_payment_intent_id THEN
    v_mismatch := 'payment_intent';
  END IF;
  v_status := CASE WHEN v_mismatch IS NOT NULL THEN 'MANUAL_REVIEW'
                   ELSE public.connection_fee_refund_status_from_stripe(p_stripe_status) END;

  UPDATE public.connection_fee_refunds
  SET status = v_status,
      stripe_refund_status = lower(coalesce(p_stripe_status, '')),
      verified_at = now(),
      verified_status = lower(coalesce(p_stripe_status, '')) || coalesce(':mismatch_' || v_mismatch, ''),
      completed_at = CASE WHEN v_status = 'SUCCEEDED' THEN coalesce(completed_at, now()) ELSE completed_at END
  WHERE id = ref.id;

  IF v_status IS DISTINCT FROM ref.status OR v_mismatch IS NOT NULL THEN
    PERFORM public.write_audit_log(NULL, 'connection_fee.refund.verified', 'connection_fee_refund', ref.id,
      jsonb_build_object('stripe_refund_id', p_stripe_refund_id, 'from', ref.status, 'to', v_status,
        'stripe_status', p_stripe_status, 'mismatch', v_mismatch, 'source', left(coalesce(p_source, ''), 40)));
    IF v_status IN ('FAILED', 'MANUAL_REVIEW', 'CANCELED') THEN
      PERFORM public.alert_admins_connection_fee_refund(ref.id, 'Connection Fee refund needs attention',
        'Stripe reports this $4.99 refund as ' || lower(v_status) || '. Check it in Stripe.');
    END IF;
  END IF;

  RETURN jsonb_build_object('found', true, 'refund_id', ref.id, 'status', v_status, 'mismatch', v_mismatch);
END;
$$;

REVOKE ALL ON FUNCTION public.record_connection_fee_refund_verification(text, text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_connection_fee_refund_verification(text, text, integer, text, text) TO service_role;

-- 6. Reconcile: anything paid-and-flagged without a finished, verified refund.
CREATE OR REPLACE FUNCTION public.connection_fee_refund_reconcile_rows()
RETURNS TABLE (
  kind text,
  stripe_checkout_session_id text,
  refund_id uuid,
  refund_status text,
  stripe_refund_id text,
  reason text,
  livemode boolean,
  flagged_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'flagged_without_refund_row', s.stripe_checkout_session_id, NULL::uuid, NULL::text, NULL::text,
         s.refund_reason, s.livemode, s.updated_at
  FROM public.connection_checkout_sessions s
  WHERE s.needs_refund IS TRUE
    AND NOT EXISTS (SELECT 1 FROM public.connection_fee_refunds r WHERE r.stripe_checkout_session_id = s.stripe_checkout_session_id)
  UNION ALL
  SELECT 'refund_not_finished', r.stripe_checkout_session_id, r.id, r.status, r.stripe_refund_id, r.reason, r.livemode, r.created_at
  FROM public.connection_fee_refunds r
  WHERE r.status <> 'SUCCEEDED'
  UNION ALL
  SELECT 'refund_not_verified', r.stripe_checkout_session_id, r.id, r.status, r.stripe_refund_id, r.reason, r.livemode, r.created_at
  FROM public.connection_fee_refunds r
  WHERE r.status = 'SUCCEEDED' AND r.verified_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.connection_fee_refund_reconcile_rows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connection_fee_refund_reconcile_rows() TO service_role;

CREATE OR REPLACE FUNCTION public.connection_fee_refund_reconcile_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin or service role required';
  END IF;
  RETURN jsonb_build_object(
    'generated_at', now(),
    'issues', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.flagged_at) FROM public.connection_fee_refund_reconcile_rows() x), '[]'::jsonb),
    'refunds_succeeded', (SELECT count(*) FROM public.connection_fee_refunds WHERE status = 'SUCCEEDED'),
    'refunds_open', (SELECT count(*) FROM public.connection_fee_refunds WHERE status <> 'SUCCEEDED')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.connection_fee_refund_reconcile_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connection_fee_refund_reconcile_report() TO authenticated, service_role;

COMMENT ON FUNCTION public.connection_fee_refund_reconcile_report() IS
  'Admins and service role. Lists flagged Connection Fee sessions without a refund row, refunds not SUCCEEDED, and SUCCEEDED refunds not yet verified against Stripe. Read only.';
