-- Local regression for 20261020200001_connection_checkout_validity_and_refunds.sql.
-- Builds a minimal schema (production shapes for the tables touched), applies the migration,
-- exercises every path, then applies the rollback and the migration again. Raises on failure.
-- Not a production script. Does not call Stripe.
--
--   createdb conn_refunds && psql -d conn_refunds -v ON_ERROR_STOP=1 -f supabase/tests/connection_checkout_validity_and_refunds_test.sql

\set ON_ERROR_STOP on
SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
-- role comes from a session setting so the test can switch between service_role and a user.
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role') $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

CREATE TYPE public.account_type AS ENUM ('CUSTOMER', 'CONTRACTOR', 'VERIFIER', 'ADMIN');
CREATE TYPE public.account_status AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED');
CREATE TYPE public.approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE public.project_status AS ENUM ('DRAFT','POSTED','MATCHING','CONTRACTORS_RESPONDING','ESTIMATES_AVAILABLE','CONTRACTOR_SELECTED','CANCELLED');
CREATE TYPE public.opportunity_status AS ENUM ('AVAILABLE','ACCEPTED','PASSED','EXPIRED','CLOSED');
CREATE TYPE public.connection_status AS ENUM ('PAYMENT_DISABLED','RESERVED','PAID','COMPLETED','EXPIRED','FAILED','CANCELLED');

CREATE TABLE public.profiles (id uuid PRIMARY KEY, account_type public.account_type NOT NULL, account_status public.account_status NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE public.contractor_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL, approval_status public.approval_status NOT NULL DEFAULT 'APPROVED');
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL, status public.project_status NOT NULL DEFAULT 'POSTED',
  accepting_connections boolean NOT NULL DEFAULT true, selected_contractor_profile_id uuid, cancelled_at timestamptz);
CREATE TABLE public.opportunities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, contractor_profile_id uuid NOT NULL,
  status public.opportunity_status NOT NULL DEFAULT 'AVAILABLE', expires_at timestamptz);
CREATE TABLE public.project_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, contractor_profile_id uuid NOT NULL,
  status public.connection_status NOT NULL, needs_refund boolean NOT NULL DEFAULT false, refund_reason text, stripe_checkout_session_id text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.connection_checkout_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES public.project_connections(id) ON DELETE CASCADE,
  project_id uuid NOT NULL, contractor_profile_id uuid NOT NULL, stripe_checkout_session_id text NOT NULL UNIQUE, stripe_payment_intent_id text,
  livemode boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'OPEN', needs_refund boolean NOT NULL DEFAULT false, refund_reason text,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.customer_contractor_blocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_profile_id uuid NOT NULL, contractor_profile_id uuid NOT NULL);
CREATE TABLE public.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, action text NOT NULL, entity_type text NOT NULL, entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.connection_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL);
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_profile_id uuid NOT NULL, kind text NOT NULL, title text NOT NULL,
  body text NOT NULL, entity_type text NOT NULL, entity_id uuid, payload jsonb NOT NULL DEFAULT '{}');

CREATE FUNCTION public.require_service_role() RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF; END $$;
CREATE FUNCTION public.ppp_set_rpc(p_name text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('ppp.rpc', p_name, true); SELECT NULL::void $$;
CREATE FUNCTION public.ppp_rpc_is(p_name text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('ppp.rpc', true) = p_name $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type = 'ADMIN' AND account_status = 'ACTIVE') $$;
CREATE FUNCTION public.normalized_stripe_payment_intent_id(p_value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN left(btrim(p_value), 3) = 'pi_' AND position(':' in p_value) = 0 AND char_length(btrim(p_value)) > 5 THEN btrim(p_value) END $$;
CREATE FUNCTION public.write_audit_log(p_actor_id uuid, p_action text, p_entity_type text, p_entity_id uuid DEFAULT NULL, p_metadata jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE sql AS $$ INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, coalesce($5, '{}')) RETURNING id $$;
CREATE FUNCTION public.write_connection_event(p_connection_id uuid, p_event_type text, p_payload jsonb) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.connection_events (connection_id, event_type, payload) VALUES ($1, $2, $3); SELECT NULL::void $$;
CREATE FUNCTION public.enqueue_notification(p_recipient_profile_id uuid, p_kind text, p_title text, p_body text, p_entity_type text, p_entity_id uuid, p_payload jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE sql AS $$ INSERT INTO public.notifications (recipient_profile_id, kind, title, body, entity_type, entity_id, payload) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id $$;
-- Production definition (2026-10-11).
CREATE FUNCTION public.flag_connection_checkout_needs_refund(p_stripe_checkout_session_id text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  PERFORM public.require_service_role();
  PERFORM public.ppp_set_rpc('flag_connection_checkout_needs_refund');
  UPDATE public.connection_checkout_sessions SET status = 'NEEDS_REFUND', needs_refund = true, refund_reason = p_reason
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id;
  UPDATE public.project_connections c SET needs_refund = true, refund_reason = p_reason
  FROM public.connection_checkout_sessions s
  WHERE s.stripe_checkout_session_id = p_stripe_checkout_session_id AND s.connection_id = c.id
    AND c.status IS DISTINCT FROM 'PAID' AND c.status IS DISTINCT FROM 'COMPLETED';
  RETURN jsonb_build_object('needs_refund', true, 'reason', p_reason, 'contact_unlocked', false);
END; $function$;

\ir ../migrations/20261020200001_connection_checkout_validity_and_refunds.sql
\ir ../rollbacks/20261020200001_connection_checkout_validity_and_refunds_rollback.sql
DO $$ BEGIN
  IF to_regclass('public.connection_fee_refunds') IS NOT NULL OR to_regprocedure('public.prepare_connection_fee_refund(text,text,integer,text,boolean,text,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left objects behind';
  END IF;
END $$;
\ir ../migrations/20261020200001_connection_checkout_validity_and_refunds.sql

-- Fixtures
INSERT INTO public.profiles VALUES
  ('a0000000-0000-4000-8000-000000000001', 'ADMIN', 'ACTIVE'),
  ('c0000000-0000-4000-8000-000000000001', 'CUSTOMER', 'ACTIVE'),
  ('d0000000-0000-4000-8000-000000000001', 'CONTRACTOR', 'ACTIVE'),
  ('d0000000-0000-4000-8000-000000000002', 'CONTRACTOR', 'ACTIVE');
INSERT INTO public.contractor_profiles (id, profile_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002');
INSERT INTO public.projects (id, customer_id) VALUES ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001');
INSERT INTO public.opportunities (project_id, contractor_profile_id) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002');

DO $$
DECLARE
  p uuid := 'f0000000-0000-4000-8000-000000000001';
  k1 uuid := 'e0000000-0000-4000-8000-000000000001';
  u1 uuid := 'd0000000-0000-4000-8000-000000000001';
  r jsonb;
BEGIN
  -- 1. Allowed project
  IF public.connection_checkout_blocker(p, k1) IS NOT NULL THEN RAISE EXCEPTION 'valid project blocked: %', public.connection_checkout_blocker(p, k1); END IF;
  r := public.assert_connection_checkout_allowed(p, u1);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'assert allowed failed %', r; END IF;

  -- 2. Each blocker
  UPDATE public.projects SET status = 'CANCELLED' WHERE id = p;
  IF public.connection_checkout_blocker(p, k1) IS DISTINCT FROM 'project_cancelled' THEN RAISE EXCEPTION 'cancel not blocked'; END IF;
  UPDATE public.projects SET status = 'POSTED', accepting_connections = false WHERE id = p;
  IF public.connection_checkout_blocker(p, k1) IS DISTINCT FROM 'connections_closed' THEN RAISE EXCEPTION 'closed not blocked'; END IF;
  UPDATE public.projects SET accepting_connections = true, selected_contractor_profile_id = 'e0000000-0000-4000-8000-000000000002' WHERE id = p;
  IF public.connection_checkout_blocker(p, k1) IS DISTINCT FROM 'project_contractor_selected' THEN RAISE EXCEPTION 'selected-elsewhere not blocked'; END IF;
  IF public.connection_checkout_blocker(p, 'e0000000-0000-4000-8000-000000000002') IS NOT NULL THEN RAISE EXCEPTION 'selected contractor blocked'; END IF;
  UPDATE public.projects SET selected_contractor_profile_id = NULL WHERE id = p;
  UPDATE public.opportunities SET status = 'EXPIRED' WHERE contractor_profile_id = k1;
  IF public.connection_checkout_blocker(p, k1) IS DISTINCT FROM 'opportunity_unavailable' THEN RAISE EXCEPTION 'expired opp not blocked'; END IF;
  UPDATE public.opportunities SET status = 'AVAILABLE', expires_at = now() - interval '1 minute' WHERE contractor_profile_id = k1;
  IF public.connection_checkout_blocker(p, k1) IS DISTINCT FROM 'opportunity_unavailable' THEN RAISE EXCEPTION 'past expires_at not blocked'; END IF;
  UPDATE public.opportunities SET expires_at = NULL WHERE contractor_profile_id = k1;
  INSERT INTO public.customer_contractor_blocks (customer_profile_id, contractor_profile_id) VALUES ('c0000000-0000-4000-8000-000000000001', k1);
  IF public.connection_checkout_blocker(p, k1) IS DISTINCT FROM 'contractor_blocked' THEN RAISE EXCEPTION 'block not enforced'; END IF;
  DELETE FROM public.customer_contractor_blocks;
  UPDATE public.profiles SET account_status = 'SUSPENDED' WHERE id = 'c0000000-0000-4000-8000-000000000001';
  IF public.connection_checkout_blocker(p, k1) IS DISTINCT FROM 'customer_unavailable' THEN RAISE EXCEPTION 'customer status not enforced'; END IF;
  UPDATE public.profiles SET account_status = 'ACTIVE' WHERE id = 'c0000000-0000-4000-8000-000000000001';
  UPDATE public.contractor_profiles SET approval_status = 'SUSPENDED' WHERE id = k1;
  IF public.connection_checkout_blocker(p, k1) IS DISTINCT FROM 'contractor_ineligible' THEN RAISE EXCEPTION 'contractor approval not enforced'; END IF;
  UPDATE public.contractor_profiles SET approval_status = 'APPROVED' WHERE id = k1;
  UPDATE public.projects SET status = 'DRAFT' WHERE id = p;
  IF public.connection_checkout_blocker(p, k1) IS DISTINCT FROM 'project_not_posted' THEN RAISE EXCEPTION 'draft not blocked'; END IF;
  UPDATE public.projects SET status = 'POSTED' WHERE id = p;
  IF public.connection_checkout_blocker(gen_random_uuid(), k1) IS DISTINCT FROM 'project_not_found' THEN RAISE EXCEPTION 'missing project not blocked'; END IF;
END $$;

-- Connections and sessions
INSERT INTO public.project_connections (id, project_id, contractor_profile_id, status, stripe_checkout_session_id) VALUES
  ('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'RESERVED', 'cs_test_late'),
  ('10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'PAID', 'cs_test_paidA');
INSERT INTO public.connection_checkout_sessions (connection_id, project_id, contractor_profile_id, stripe_checkout_session_id, status) VALUES
  ('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'cs_test_late', 'OPEN'),
  ('10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'cs_test_paidA', 'CONSUMED'),
  ('10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'cs_test_paidB', 'CONSUMED');

DO $$
DECLARE
  r jsonb;
  r2 jsonb;
  n integer;
  refund_row uuid;
BEGIN
  -- 3. Delivered session is never refunded, and the PAID connection passes validity even if the project is cancelled later.
  UPDATE public.projects SET status = 'CANCELLED';
  r := public.connection_checkout_session_validity('cs_test_paidA');
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'PAID connection failed validity: %', r; END IF;
  r := public.prepare_connection_fee_refund('cs_test_paidA', 'pi_test_A', 499, 'usd', false, NULL, true);
  IF (r->>'refund')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'delivered session refunded: %', r; END IF;
  r := public.prepare_connection_fee_refund('cs_test_paidA', 'pi_test_A', 499, 'usd', false, 'connection_unavailable:project_cancelled', true);
  IF (r->>'refund')::boolean IS NOT FALSE OR r->>'reason' <> 'delivered_connection_not_refunded' THEN RAISE EXCEPTION 'delivered session refunded with reason: %', r; END IF;

  -- 4. Validity fails for the RESERVED connection on a cancelled project.
  r := public.connection_checkout_session_validity('cs_test_late');
  IF (r->>'ok')::boolean OR r->>'reason' <> 'project_cancelled' THEN RAISE EXCEPTION 'cancelled reserved passed: %', r; END IF;

  -- 5. Auto refund plan: flagged, PENDING, attempt 1, deterministic key, audit + admin alert once.
  r := public.prepare_connection_fee_refund('cs_test_late', 'pi_test_late', 499, 'usd', false, 'connection_unavailable:project_cancelled', true);
  IF (r->>'proceed')::boolean IS NOT TRUE OR (r->>'attempt')::int <> 1 OR r->>'idempotency_key' <> 'ppp_conn_refund_cs_test_late_a1' THEN
    RAISE EXCEPTION 'bad plan: %', r; END IF;
  refund_row := (r->>'refund_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.connection_checkout_sessions WHERE stripe_checkout_session_id = 'cs_test_late' AND needs_refund AND status = 'NEEDS_REFUND') THEN
    RAISE EXCEPTION 'session not flagged'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_connections WHERE id = '10000000-0000-4000-8000-000000000001' AND needs_refund) THEN RAISE EXCEPTION 'connection not flagged'; END IF;
  SELECT count(*) INTO n FROM public.audit_logs WHERE action = 'connection_fee.refund.flagged' AND entity_id = refund_row;
  IF n <> 1 THEN RAISE EXCEPTION 'expected one flagged audit, got %', n; END IF;
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'admin.refund_flagged' AND entity_type = 'project_connection' AND recipient_profile_id = 'a0000000-0000-4000-8000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'expected one admin alert, got %', n; END IF;

  -- 6. Concurrent second caller does not proceed while attempt 1 is fresh.
  r2 := public.prepare_connection_fee_refund('cs_test_late', 'pi_test_late', 499, 'usd', false, 'connection_unavailable:project_cancelled', true);
  IF (r2->>'proceed')::boolean OR (r2->>'in_progress')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'concurrent attempt proceeded: %', r2; END IF;

  -- 7. Failure recorded, then retry gets attempt 2 with a new key; admins alerted about the failure.
  PERFORM public.record_connection_fee_refund_result(refund_row, NULL, NULL, NULL, 'api_connection_error');
  IF (SELECT status FROM public.connection_fee_refunds WHERE id = refund_row) <> 'FAILED' THEN RAISE EXCEPTION 'failure not recorded'; END IF;
  r := public.prepare_connection_fee_refund('cs_test_late', 'pi_test_late', 499, 'usd', false, NULL, true);
  IF (r->>'attempt')::int <> 2 OR r->>'idempotency_key' <> 'ppp_conn_refund_cs_test_late_a2' THEN RAISE EXCEPTION 'retry plan wrong: %', r; END IF;

  -- 8. Success stored; later calls never proceed; unique row per session.
  PERFORM public.record_connection_fee_refund_result(refund_row, 're_test_late', 'succeeded', 499, NULL);
  IF (SELECT status FROM public.connection_fee_refunds WHERE id = refund_row) <> 'SUCCEEDED' THEN RAISE EXCEPTION 'success not recorded'; END IF;
  r := public.prepare_connection_fee_refund('cs_test_late', 'pi_test_late', 499, 'usd', false, NULL, true);
  IF (r->>'proceed')::boolean IS NOT FALSE OR r->>'status' <> 'SUCCEEDED' THEN RAISE EXCEPTION 'refunded twice: %', r; END IF;
  SELECT count(*) INTO n FROM public.connection_fee_refunds WHERE stripe_checkout_session_id = 'cs_test_late';
  IF n <> 1 THEN RAISE EXCEPTION 'expected one refund row, got %', n; END IF;

  -- 9. Verification: matching Stripe view marks verified; reconcile shows nothing open for it.
  r := public.record_connection_fee_refund_verification('re_test_late', 'succeeded', 499, 'pi_test_late', 'test');
  IF (SELECT verified_at FROM public.connection_fee_refunds WHERE id = refund_row) IS NULL THEN RAISE EXCEPTION 'not verified'; END IF;
  IF EXISTS (SELECT 1 FROM public.connection_fee_refund_reconcile_rows() WHERE stripe_checkout_session_id = 'cs_test_late') THEN
    RAISE EXCEPTION 'verified refund still in reconcile'; END IF;
  -- mismatch -> MANUAL_REVIEW
  r := public.record_connection_fee_refund_verification('re_test_late', 'succeeded', 100, 'pi_test_late', 'test');
  IF (SELECT status FROM public.connection_fee_refunds WHERE id = refund_row) <> 'MANUAL_REVIEW' THEN RAISE EXCEPTION 'amount mismatch not flagged'; END IF;

  -- 10. Duplicate paid session on an already PAID connection is refunded (DB decides with no reason given).
  r := public.prepare_connection_fee_refund('cs_test_paidB', 'pi_test_B', 499, 'usd', false, NULL, true);
  IF (r->>'proceed')::boolean IS NOT TRUE OR r->>'reason' <> 'duplicate_payment' THEN RAISE EXCEPTION 'duplicate not refunded: %', r; END IF;
  IF (SELECT status FROM public.project_connections WHERE id = '10000000-0000-4000-8000-000000000002') <> 'PAID'
     OR (SELECT needs_refund FROM public.project_connections WHERE id = '10000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'duplicate refund touched the PAID connection'; END IF;

  -- 11. Integrity failure (wrong amount) -> MANUAL_REVIEW, never proceeds.
  INSERT INTO public.project_connections (id, project_id, contractor_profile_id, status) VALUES
    ('10000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'RESERVED');
  INSERT INTO public.connection_checkout_sessions (connection_id, project_id, contractor_profile_id, stripe_checkout_session_id) VALUES
    ('10000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'cs_test_bad');
  r := public.prepare_connection_fee_refund('cs_test_bad', 'pi_test_bad', 999, 'usd', false, 'wrong_amount', false);
  IF (r->>'proceed')::boolean OR r->>'status' <> 'MANUAL_REVIEW' THEN RAISE EXCEPTION 'integrity failure proceeded: %', r; END IF;
  -- missing PaymentIntent also forces manual review
  INSERT INTO public.project_connections (id, project_id, contractor_profile_id, status) VALUES
    ('10000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'RESERVED');
  INSERT INTO public.connection_checkout_sessions (connection_id, project_id, contractor_profile_id, stripe_checkout_session_id) VALUES
    ('10000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'cs_test_nopi');
  r := public.prepare_connection_fee_refund('cs_test_nopi', NULL, 499, 'usd', false, 'connection_unavailable:project_cancelled', true);
  IF (r->>'proceed')::boolean OR r->>'status' <> 'MANUAL_REVIEW' THEN RAISE EXCEPTION 'missing PI proceeded: %', r; END IF;

  -- 12. Reconcile lists open refunds and flagged sessions without rows.
  UPDATE public.connection_checkout_sessions SET needs_refund = true WHERE stripe_checkout_session_id = 'cs_test_paidA';
  IF NOT EXISTS (SELECT 1 FROM public.connection_fee_refund_reconcile_rows() WHERE kind = 'flagged_without_refund_row' AND stripe_checkout_session_id = 'cs_test_paidA') THEN
    RAISE EXCEPTION 'reconcile missed flagged session'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.connection_fee_refund_reconcile_rows() WHERE kind = 'refund_not_finished' AND stripe_checkout_session_id = 'cs_test_bad') THEN
    RAISE EXCEPTION 'reconcile missed manual review'; END IF;
  r := public.connection_fee_refund_reconcile_report();
  IF jsonb_array_length(r->'issues') < 2 THEN RAISE EXCEPTION 'report too small: %', r; END IF;
END $$;

-- 13. Direct writes and client access are refused.
DO $$
BEGIN
  BEGIN
    UPDATE public.connection_fee_refunds SET status = 'SUCCEEDED';
    RAISE EXCEPTION 'direct update allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'connection fee refunds are written only%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.connection_fee_refunds;
    RAISE EXCEPTION 'delete allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'connection fee refunds cannot be deleted%' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.role', 'authenticated', true);
  PERFORM set_config('test.uid', 'd0000000-0000-4000-8000-000000000001', true);
  BEGIN
    PERFORM public.prepare_connection_fee_refund('cs_test_late', 'pi_test_late', 499, 'usd', false, NULL, true);
    RAISE EXCEPTION 'non-service caller prepared a refund';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'service role required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.connection_fee_refund_reconcile_report();
    RAISE EXCEPTION 'contractor read the reconcile report';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'admin or service role required' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.uid', 'a0000000-0000-4000-8000-000000000001', true);
  PERFORM public.connection_fee_refund_reconcile_report();
  PERFORM set_config('test.role', '', true);
  PERFORM set_config('test.uid', '', true);
END $$;

SET client_min_messages = notice;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.connection_fee_refunds', 'SELECT') OR has_table_privilege('authenticated', 'public.connection_fee_refunds', 'SELECT') THEN
    RAISE EXCEPTION 'client roles can read refunds'; END IF;
  IF has_function_privilege('authenticated', 'public.prepare_connection_fee_refund(text,text,integer,text,boolean,text,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.assert_connection_checkout_allowed(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.connection_checkout_blocker(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'client roles can execute service functions'; END IF;
  RAISE NOTICE 'connection_checkout_validity_and_refunds_test: ALL PASS';
END $$;
