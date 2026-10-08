-- Customer project detail: connected pros on a project the caller owns.
-- Business name is returned only after the existing connection entitlement.
-- Otherwise the anonymized pro label is used.
-- Does not change fees, Stripe, checkout, webhooks, payment rows, or fee flags.
-- Does not write project_connections.

CREATE OR REPLACE FUNCTION public.list_my_project_connection_cards(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_agg(item.card ORDER BY item.created_at)
      FROM (
        SELECT
          c.created_at,
          jsonb_build_object(
            'connection_id', c.id,
            'contractor_profile_id', c.contractor_profile_id,
            'display_name',
              CASE
                WHEN public.message_pair_has_connection_entitlement(c.project_id, c.contractor_profile_id) THEN
                  CASE
                    WHEN cp.business_name IS NULL
                      OR btrim(cp.business_name) = ''
                      OR public.text_contains_contact_info(cp.business_name)
                      OR public.text_contains_pre_hire_contact(cp.business_name)
                      THEN public.anonymized_pro_label(cp.primary_trade, NULL)
                    ELSE btrim(cp.business_name)
                  END
                ELSE public.anonymized_pro_label(cp.primary_trade, NULL)
              END,
            'connection_status', c.status,
            'booking_status', (
              SELECT b.status
              FROM public.bookings b
              WHERE b.project_id = c.project_id
                AND b.contractor_profile_id = c.contractor_profile_id
                AND b.status IS DISTINCT FROM 'CANCELLED'
              ORDER BY b.created_at DESC
              LIMIT 1
            ),
            'can_message', public.message_pair_has_connection_entitlement(c.project_id, c.contractor_profile_id)
          ) AS card
        FROM public.project_connections c
        JOIN public.projects p ON p.id = c.project_id
        JOIN public.contractor_profiles cp ON cp.id = c.contractor_profile_id
        WHERE c.project_id = p_project_id
          AND (
            p.customer_id = (SELECT auth.uid())
            OR public.is_admin()
          )
          AND c.status IN ('INITIATED', 'RESERVED', 'PAYMENT_DISABLED', 'PAID', 'COMPLETED')
      ) item
    ),
    '[]'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.list_my_project_connection_cards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_project_connection_cards(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_my_project_connection_cards(uuid) IS
  'Project owner (or admin) connection cards: display name, connection status, booking status, and whether messaging is already unlocked. No phone, email, street, or fee fields. Business name only when message_pair_has_connection_entitlement is already true.';
