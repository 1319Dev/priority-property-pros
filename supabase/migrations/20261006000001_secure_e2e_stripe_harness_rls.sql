-- Source of truth for the Stripe E2E harness lockdown already applied on
-- production (bersftkjpbzpgtahbqwd) as schema_migrations version
-- 20260922222615. Do not drop the table. These statements are safe to re-run.
-- Skipped when the harness table is absent (it is not created by repo migrations).

DO $$
BEGIN
  IF to_regclass('public._e2e_stripe_harness') IS NULL THEN
    RAISE NOTICE 'public._e2e_stripe_harness does not exist; skipping RLS lockdown';
    RETURN;
  END IF;

  ALTER TABLE public._e2e_stripe_harness ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public._e2e_stripe_harness FORCE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE public._e2e_stripe_harness FROM anon, authenticated;
  GRANT ALL ON TABLE public._e2e_stripe_harness TO service_role;

  COMMENT ON TABLE public._e2e_stripe_harness IS
    'Internal Stripe E2E harness only. RLS forced on; not accessible via anon/authenticated Data API.';
END
$$;
