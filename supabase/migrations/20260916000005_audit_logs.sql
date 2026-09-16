-- Immutable audit trail. Clients cannot insert, update, or delete rows.

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_idx ON public.audit_logs (actor_id);
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_audit_log(uuid, text, text, uuid, jsonb) TO service_role;

COMMENT ON TABLE public.audit_logs IS
  'Append-only. No UPDATE/DELETE policies for any role including authenticated.';
