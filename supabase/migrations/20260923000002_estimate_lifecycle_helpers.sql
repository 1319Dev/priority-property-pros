-- Estimate lifecycle helpers, contact detection, and profile-edit guards.
-- Additive. Does not enable Stripe. Does not weaken contact-access privacy.

CREATE OR REPLACE FUNCTION public.text_contains_contact_info(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN false
    WHEN p_text ~* '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}' THEN true
    WHEN p_text ~* '(https?://|www\.)' THEN true
    WHEN p_text ~* '(instagram|facebook|tiktok|twitter|linkedin|snapchat|whatsapp|telegram|threads\.net|x\.com)' THEN true
    WHEN p_text ~* '(^|[^[:alnum:]])@[A-Za-z][A-Za-z0-9._]{2,}' THEN true
    WHEN p_text ~* '(\+?1[\s.\-]?)?\(?[0-9]{3}\)?[\s.\-][0-9]{3}[\s.\-][0-9]{4}' THEN true
    WHEN p_text ~* 'tel:\+?[0-9]{7,}' THEN true
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.text_contains_contact_info(text) IS
  'Obvious phone/email/URL/handle detector for notes, bios, and messages. Not surveillance.';

CREATE OR REPLACE FUNCTION public.contact_info_blocked_message()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Contact info is shared after connection through PPP. Please remove phone numbers, emails, links, and social handles.';
$$;

CREATE OR REPLACE FUNCTION public.write_estimate_event(
  p_estimate_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.estimate_events (estimate_id, actor_id, event_type, payload)
  VALUES (p_estimate_id, auth.uid(), p_event_type, coalesce(p_payload, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_recipient_profile_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nid uuid;
BEGIN
  IF p_recipient_profile_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_kind IN ('estimate.viewed', 'estimate.accepted', 'estimate.declined', 'estimate.withdrawn') THEN
    INSERT INTO public.notifications (
      recipient_profile_id, kind, title, body, entity_type, entity_id, payload, channel
    )
    VALUES (
      p_recipient_profile_id, p_kind, p_title, p_body, p_entity_type, p_entity_id,
      coalesce(p_payload, '{}'::jsonb), 'in_app'
    )
    ON CONFLICT (recipient_profile_id, kind, entity_id)
      WHERE kind IN ('estimate.viewed', 'estimate.accepted', 'estimate.declined', 'estimate.withdrawn')
        AND entity_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO nid;
  ELSE
    INSERT INTO public.notifications (
      recipient_profile_id, kind, title, body, entity_type, entity_id, payload, channel
    )
    VALUES (
      p_recipient_profile_id, p_kind, p_title, p_body, p_entity_type, p_entity_id,
      coalesce(p_payload, '{}'::jsonb), 'in_app'
    )
    RETURNING id INTO nid;
  END IF;
  RETURN nid;
END;
$$;

CREATE OR REPLACE FUNCTION public.contractor_owner_profile_id(p_contractor_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.profile_id FROM public.contractor_profiles cp WHERE cp.id = p_contractor_profile_id;
$$;

CREATE OR REPLACE FUNCTION public.protect_contractor_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fields text[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.text_contains_contact_info(NEW.bio)
     OR public.text_contains_contact_info(NEW.headline) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;

  IF NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     AND OLD.onboarding_status IN ('SUBMITTED', 'COMPLETE')
     AND NOT public.is_admin() THEN
    NEW.onboarding_status := OLD.onboarding_status;
  END IF;

  IF (
    NEW.license_number IS DISTINCT FROM OLD.license_number
    OR NEW.insurance_carrier IS DISTINCT FROM OLD.insurance_carrier
  ) AND NOT public.is_admin() THEN
    IF NEW.license_number IS DISTINCT FROM OLD.license_number THEN
      v_fields := array_append(v_fields, 'license_number');
    END IF;
    IF NEW.insurance_carrier IS DISTINCT FROM OLD.insurance_carrier THEN
      v_fields := array_append(v_fields, 'insurance_carrier');
    END IF;
    NEW.identity_review_required := true;
    NEW.identity_review_at := now();
    NEW.identity_review_fields := v_fields;
  END IF;

  IF NOT public.is_admin() THEN
    IF OLD.identity_review_required AND NEW.identity_review_required IS DISTINCT FROM TRUE THEN
      NEW.identity_review_required := OLD.identity_review_required;
      NEW.identity_review_at := OLD.identity_review_at;
      NEW.identity_review_fields := OLD.identity_review_fields;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contractor_profiles_protect_fields ON public.contractor_profiles;
CREATE TRIGGER contractor_profiles_protect_fields
  BEFORE UPDATE ON public.contractor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_contractor_profile_fields();

CREATE OR REPLACE FUNCTION public.protect_estimate_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
     OR NEW.contractor_profile_id IS DISTINCT FROM OLD.contractor_profile_id THEN
    RAISE EXCEPTION 'estimate ownership cannot change';
  END IF;

  IF NEW.notes IS DISTINCT FROM OLD.notes AND public.text_contains_contact_info(NEW.notes) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      public.ppp_rpc_is('submit_estimate')
      OR public.ppp_rpc_is('withdraw_estimate')
      OR public.ppp_rpc_is('select_estimate')
      OR public.ppp_rpc_is('mark_estimate_viewed')
      OR public.ppp_rpc_is('decline_estimate')
      OR public.ppp_rpc_is('update_customer_project')
      OR public.ppp_rpc_is('cancel_customer_project')
      OR public.ppp_rpc_is('cancel_pending_booking')
    ) THEN
      RAISE EXCEPTION 'estimate status can only change through submit, withdraw, select, view, decline, or owner scope/cancel RPCs';
    END IF;
    IF OLD.status = 'VIEWED' AND NEW.status IN ('SENT', 'SUBMITTED') THEN
      RAISE EXCEPTION 'estimate status cannot regress from VIEWED to SENT';
    END IF;
    IF NEW.status = 'ACCEPTED'
       AND NOT public.ppp_rpc_is('select_estimate')
       AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'contractors cannot self-set ACCEPTED';
    END IF;
  END IF;

  IF (
    NEW.first_viewed_at IS DISTINCT FROM OLD.first_viewed_at
    OR NEW.last_viewed_at IS DISTINCT FROM OLD.last_viewed_at
    OR NEW.view_count IS DISTINCT FROM OLD.view_count
  ) AND NOT public.ppp_rpc_is('mark_estimate_viewed') THEN
    RAISE EXCEPTION 'estimate view timestamps are server-authoritative';
  END IF;

  IF OLD.first_viewed_at IS NOT NULL
     AND NEW.first_viewed_at IS DISTINCT FROM OLD.first_viewed_at THEN
    RAISE EXCEPTION 'first_viewed_at is immutable once set';
  END IF;

  IF (
    NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.declined_at IS DISTINCT FROM OLD.declined_at
  ) AND NOT (
    public.ppp_rpc_is('select_estimate')
    OR public.ppp_rpc_is('decline_estimate')
  ) THEN
    RAISE EXCEPTION 'estimate decision timestamps are server-authoritative';
  END IF;

  IF (
    NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
    OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
    OR NEW.fee_cents IS DISTINCT FROM OLD.fee_cents
    OR NEW.fee_bps IS DISTINCT FROM OLD.fee_bps
    OR NEW.contractor_earnings_cents IS DISTINCT FROM OLD.contractor_earnings_cents
  ) AND NOT (
    public.ppp_rpc_is('recompute_estimate_totals')
    OR public.ppp_rpc_is('submit_estimate')
  ) THEN
    RAISE EXCEPTION 'estimate money columns are computed in the database';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_estimate_insert_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.text_contains_contact_info(NEW.notes) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_protect_insert_contact ON public.estimates;
CREATE TRIGGER estimates_protect_insert_contact
  BEFORE INSERT ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_estimate_insert_contact();

CREATE OR REPLACE FUNCTION public.protect_estimate_question_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.text_contains_contact_info(NEW.prompt)
     OR public.text_contains_contact_info(NEW.answer_text) THEN
    RAISE EXCEPTION '%', public.contact_info_blocked_message();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimate_questions_protect_contact ON public.estimate_questions;
CREATE TRIGGER estimate_questions_protect_contact
  BEFORE INSERT OR UPDATE ON public.estimate_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_estimate_question_contact();

CREATE OR REPLACE FUNCTION public.protect_notification_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND coalesce(current_setting('ppp.rpc', true), '') = '' THEN
      RAISE EXCEPTION 'notifications cannot be inserted from the client';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'notifications cannot be deleted from the client';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.recipient_profile_id IS DISTINCT FROM OLD.recipient_profile_id
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.channel IS DISTINCT FROM OLD.channel
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'notifications are immutable except read_at';
    END IF;
    IF NEW.recipient_profile_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'not your notification';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_protect_row ON public.notifications;
CREATE TRIGGER notifications_protect_row
  BEFORE INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_notification_row();
