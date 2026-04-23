-- ============================================================
-- 047_dunning_cron_to_vercel.sql
-- ------------------------------------------------------------
-- Reroutes the billing-dunning cron to call the Vercel-hosted
-- endpoint instead of the Supabase Edge Function.
--
-- Why: the Vercel app is already the transactional-email hub
-- (BillingReceiptEmail, PlanCancelingEmail from the webhook all
-- go through Resend there). Centralizing here removes the need
-- to duplicate RESEND_API_KEY on Supabase and keeps a single
-- React-Email template set in @vibefly/email.
--
-- Prerequisites (run ONCE per project, outside this migration):
--
--   (a) Vercel app deployed with INTERNAL_API_TOKEN env var set.
--
--   (b) Same INTERNAL_API_TOKEN value stored in Supabase vault
--       under the secret name 'internal_api_token':
--
--         SELECT vault.create_secret(
--           '<same value as Vercel env var>',
--           'internal_api_token',
--           'Shared secret for pg_cron -> Vercel internal API'
--         );
--
--   (c) (Optional) Delete the now-unused billing-dunning Edge
--       Function from the Supabase dashboard.
-- ============================================================

-- Drop the previous incarnation so this migration is idempotent.
DO $$
BEGIN
    PERFORM cron.unschedule('billing-dunning-email');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
    'billing-dunning-email',
    '*/10 * * * *',
    $cron$
        SELECT net.http_post(
            url := 'https://vibefly.app/api/internal/billing/notify-dunning',
            headers := jsonb_build_object(
                'Content-Type',        'application/json',
                'x-internal-api-token', (
                    SELECT decrypted_secret
                    FROM vault.decrypted_secrets
                    WHERE name = 'internal_api_token'
                    LIMIT 1
                )
            ),
            body := jsonb_build_object(
                'organization_ids',
                COALESCE(
                    (SELECT array_agg(organization_id::text)
                     FROM public.list_orgs_needing_dunning_email(24)),
                    ARRAY[]::text[]
                )
            ),
            timeout_milliseconds := 30000
        );
    $cron$
);
