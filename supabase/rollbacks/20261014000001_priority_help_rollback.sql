-- Rolls back 20261014000001_priority_help.sql.
-- Drops only objects that migration created. Does not restore dropped data.
-- Does not change is_admin(), purge_account_owned_rows(), fees, or Stripe.

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS support_desk_presence_select ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS support_desk_presence_insert ON realtime.messages';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_agent_status'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.support_agent_status;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.support_messages;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_conversations'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.support_conversations;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS support_purge_on_profile_delete ON public.profiles;
DROP TRIGGER IF EXISTS support_conversations_set_updated_at ON public.support_conversations;
DROP TRIGGER IF EXISTS support_kb_articles_set_updated_at ON public.support_kb_articles;
DROP TRIGGER IF EXISTS support_canned_set_updated_at ON public.support_canned_responses;
DROP TRIGGER IF EXISTS support_agent_status_set_updated_at ON public.support_agent_status;
DROP TRIGGER IF EXISTS support_settings_set_updated_at ON public.support_settings;
DROP TRIGGER IF EXISTS support_messages_touch_conversation ON public.support_messages;
DROP TRIGGER IF EXISTS support_guest_secrets_one_active ON public.support_guest_secrets;

DROP FUNCTION IF EXISTS public.admin_support_purge_expired();
DROP FUNCTION IF EXISTS public.admin_support_set_retention(integer);
DROP FUNCTION IF EXISTS public.admin_support_canned_delete(uuid);
DROP FUNCTION IF EXISTS public.admin_support_canned_save(uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_support_canned_list();
DROP FUNCTION IF EXISTS public.admin_support_kb_save(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_support_kb_list();
DROP FUNCTION IF EXISTS public.admin_support_analytics(integer);
DROP FUNCTION IF EXISTS public.admin_support_heartbeat();
DROP FUNCTION IF EXISTS public.admin_support_set_presence(text);
DROP FUNCTION IF EXISTS public.admin_support_note(uuid, text);
DROP FUNCTION IF EXISTS public.admin_support_reply(uuid, text);
DROP FUNCTION IF EXISTS public.admin_support_takeover(uuid);
DROP FUNCTION IF EXISTS public.admin_support_set_priority(uuid, text);
DROP FUNCTION IF EXISTS public.admin_support_set_status(uuid, text);
DROP FUNCTION IF EXISTS public.admin_support_search(text);
DROP FUNCTION IF EXISTS public.admin_support_get(uuid);
DROP FUNCTION IF EXISTS public.admin_support_list(text, integer);
DROP FUNCTION IF EXISTS public.support_service_context(text);
DROP FUNCTION IF EXISTS public.support_service_escalate(uuid, text, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.support_service_assistant_message(uuid, text);
DROP FUNCTION IF EXISTS public.support_service_customer_message(uuid, text, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.support_service_history(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.support_service_open(uuid, text, text);
DROP FUNCTION IF EXISTS public.support_search_kb(text, integer);
DROP FUNCTION IF EXISTS public.support_public_pricing();
DROP FUNCTION IF EXISTS public.support_desk_availability();
DROP FUNCTION IF EXISTS public.support_notify_admins(uuid, text);
DROP FUNCTION IF EXISTS public.support_assert_owner(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.support_conversation_payload(uuid, boolean);
DROP FUNCTION IF EXISTS public.support_message_json(public.support_messages);
DROP FUNCTION IF EXISTS public.support_reference_label(bigint);
DROP FUNCTION IF EXISTS public.support_rate_limit_hit(text, integer, integer);
DROP FUNCTION IF EXISTS public.support_require_admin();
DROP FUNCTION IF EXISTS public.support_one_active_guest();
DROP FUNCTION IF EXISTS public.support_touch_conversation();
DROP FUNCTION IF EXISTS public.support_reject_html(text);
DROP FUNCTION IF EXISTS public.support_set_updated_at();
DROP FUNCTION IF EXISTS public.purge_support_on_profile_delete();

DROP TABLE IF EXISTS public.support_settings;
DROP TABLE IF EXISTS public.support_rate_limits;
DROP TABLE IF EXISTS public.support_agent_status;
DROP TABLE IF EXISTS public.support_canned_responses;
DROP TABLE IF EXISTS public.support_kb_articles;
DROP TABLE IF EXISTS public.support_assignments;
DROP TABLE IF EXISTS public.support_messages;
DROP TABLE IF EXISTS public.support_guest_secrets;
DROP TABLE IF EXISTS public.support_conversations;

DROP SEQUENCE IF EXISTS public.support_ticket_ref_seq;
