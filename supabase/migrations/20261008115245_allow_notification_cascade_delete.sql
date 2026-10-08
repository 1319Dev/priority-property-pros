CREATE OR REPLACE FUNCTION public.protect_notification_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL
       AND coalesce(current_setting('ppp.rpc', true), '') = ''
       AND coalesce(current_setting('ppp.notify', true), '') IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'notifications cannot be inserted from the client';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- Allow server-side deletes (service role / account deletion) and FK cascades
    -- from a profile delete; block direct client deletes.
    IF auth.uid() IS NOT NULL AND pg_trigger_depth() <= 1 AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'notifications cannot be deleted from the client';
    END IF;
    RETURN OLD;
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
$function$;
