-- Rollback for 20261020200001_connection_checkout_validity_and_refunds.sql
--
-- Order: redeploy the previous edge functions FIRST (create-connection-checkout, connection-fee-webhook,
-- reconcile-connection-checkout from the commit before this PR), then run this file.
-- The new functions call these RPCs; removing the RPCs first would make the new functions error.
--
-- Data: connection_fee_refunds holds the Stripe refund ids. Back it up before dropping:
--   CREATE TABLE IF NOT EXISTS private.connection_fee_refunds_backup AS TABLE public.connection_fee_refunds;
-- (or export it as CSV from the Table Editor). Refunds already issued in Stripe are NOT undone by this file.
-- connection_checkout_sessions / project_connections needs_refund flags written by these functions are kept.

BEGIN;

DROP FUNCTION IF EXISTS public.connection_fee_refund_reconcile_report();
DROP FUNCTION IF EXISTS public.connection_fee_refund_reconcile_rows();
DROP FUNCTION IF EXISTS public.record_connection_fee_refund_verification(text, text, integer, text, text);
DROP FUNCTION IF EXISTS public.record_connection_fee_refund_result(uuid, text, text, integer, text);
DROP FUNCTION IF EXISTS public.connection_fee_refund_status_from_stripe(text);
DROP FUNCTION IF EXISTS public.prepare_connection_fee_refund(text, text, integer, text, boolean, text, boolean);
DROP FUNCTION IF EXISTS public.alert_admins_connection_fee_refund(uuid, text, text);
DROP FUNCTION IF EXISTS public.connection_checkout_session_validity(text);
DROP FUNCTION IF EXISTS public.assert_connection_checkout_allowed(uuid, uuid);
DROP FUNCTION IF EXISTS public.connection_checkout_blocker(uuid, uuid);

DROP TRIGGER IF EXISTS connection_fee_refunds_protect_row ON public.connection_fee_refunds;
DROP FUNCTION IF EXISTS public.protect_connection_fee_refund_row();
DROP TABLE IF EXISTS public.connection_fee_refunds;

-- Restore #131 admin_alert_refund_flagged exactly as it was live before this migration (md5 8ea9d776).
CREATE OR REPLACE FUNCTION public.admin_alert_refund_flagged()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kind text;
  v_entity_type text;
  v_project uuid;
  v_ref integer;
  v_path text;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'project_connections' THEN
      v_kind := 'connect';
      v_entity_type := 'project_connection';
      v_project := NEW.project_id;
      SELECT pr.reference_number INTO v_ref FROM public.projects pr WHERE pr.id = v_project;
      v_path := public.admin_path_for_reference(v_ref);
    ELSE
      v_kind := 'activation';
      v_entity_type := 'signup_fee_charge';
      v_project := NULL;
      v_ref := NULL;
      v_path := '/app/admin';
    END IF;

    PERFORM public.write_audit_log(
      auth.uid(),
      'payment.flagged_for_refund',
      v_entity_type,
      NEW.id,
      jsonb_build_object(
        'payment_kind', v_kind,
        'reason', NEW.refund_reason,
        'project_id', v_project,
        'reference_number', v_ref
      )
    );

    PERFORM public.notify_admins(
      'admin.refund_flagged',
      'Payment flagged for refund',
      CASE WHEN v_kind = 'connect'
        THEN 'A paid Connect was flagged for a refund. Nothing was refunded automatically.'
        ELSE 'A paid activation was flagged for a refund. Nothing was refunded automatically.'
      END,
      v_entity_type,
      NEW.id,
      jsonb_build_object(
        'payment_kind', v_kind,
        'reason', NEW.refund_reason,
        'project_id', v_project,
        'reference_number', v_ref,
        'path', v_path
      ),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never break the payment path that set the flag.
    RAISE WARNING 'admin refund alert skipped for %', NEW.id;
  END;
  RETURN NULL;
END;
$function$;

COMMIT;
