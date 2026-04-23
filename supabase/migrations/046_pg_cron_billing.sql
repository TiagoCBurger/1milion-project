-- ============================================================
-- 046_pg_cron_billing.sql
-- ------------------------------------------------------------
-- Moves the billing cron from the Cloudflare Worker janitor into
-- pg_cron so it runs co-located with the data it manipulates.
--
-- Three jobs, each at */10 * * * *:
--
--   1. billing-detect-overdue
--      Scans for subscriptions whose current_period_end has
--      elapsed and flags them as past_due (or downgrades them
--      if they were already scheduled for voluntary cancel).
--      Pure SQL — no external calls.
--
--   2. billing-reconcile-expired
--      Any past_due whose grace window has closed, plus any
--      "canceled but tier != free" ghosts, get rolled down to
--      free and their ad_accounts reconciled. Pure SQL.
--
--   3. billing-dunning-email
--      Calls the `billing-dunning` Edge Function (deployed via
--      `supabase functions deploy billing-dunning`) which sends
--      BillingFailedEmail via Resend for any past_due org that
--      hasn't been notified in the last 24 h.
--
-- Prerequisites (run ONCE per project, outside this migration):
--
--   (a) Enable extensions (Supabase: already enabled in most projects)
--       CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
--       CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
--       CREATE EXTENSION IF NOT EXISTS supabase_vault;
--
--   (b) Store the service_role JWT in vault so pg_cron can sign the
--       pg_net POST to the Edge Function:
--
--         SELECT vault.create_secret(
--           '<your-service-role-jwt-here>',
--           'service_role_key',
--           'Service role JWT used by billing-cron pg_net calls'
--         );
--
--   (c) Set the project URL (used to build the Edge Function URL):
--
--         ALTER DATABASE postgres
--           SET app.supabase_functions_base_url =
--             'https://<project-ref>.supabase.co/functions/v1';
--
--       Or replace inline in the cron.schedule call below.
--
-- If the project migrates between Supabase environments (e.g. a
-- production clone for staging), step (b) and (c) must be re-run.
-- ============================================================

-- Safety: ensure extensions exist (idempotent). On Supabase these
-- already exist in most projects but we can't assume.
CREATE EXTENSION IF NOT EXISTS pg_cron  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;

-- ------------------------------------------------------------------
-- Unschedule previous incarnations so this migration is re-runnable.
-- cron.unschedule throws if the job doesn't exist, so guard each call.
-- ------------------------------------------------------------------

DO $$
BEGIN
    PERFORM cron.unschedule('billing-detect-overdue');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
    PERFORM cron.unschedule('billing-reconcile-expired');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
    PERFORM cron.unschedule('billing-dunning-email');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ------------------------------------------------------------------
-- 1. Overdue detection.
-- ------------------------------------------------------------------
SELECT cron.schedule(
    'billing-detect-overdue',
    '*/10 * * * *',
    $cron$
        SELECT public.detect_overdue_subscriptions(
            p_grace_period_days  => 7,
            p_tolerance_minutes  => 30
        );
    $cron$
);

-- ------------------------------------------------------------------
-- 2. Grace-window reconcile.
-- ------------------------------------------------------------------
SELECT cron.schedule(
    'billing-reconcile-expired',
    '*/10 * * * *',
    $cron$
        SELECT public.reconcile_expired_subscriptions();
    $cron$
);

-- ------------------------------------------------------------------
-- 3. Dunning email via Edge Function.
--
-- The Edge Function URL must be known at schedule time because
-- cron.schedule captures the SQL literally. We read:
--   * `app.supabase_functions_base_url` (project URL base)
--   * vault secret 'service_role_key'
-- both of which must be populated by the project owner (see header).
--
-- If either is missing at run time the pg_net call returns a 4xx/5xx
-- and pg_cron records the job as success (pg_net is fire-and-forget).
-- Use `SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;`
-- to investigate recent responses.
-- ------------------------------------------------------------------
SELECT cron.schedule(
    'billing-dunning-email',
    '*/10 * * * *',
    $cron$
        SELECT net.http_post(
            url := coalesce(
                current_setting('app.supabase_functions_base_url', true),
                ''
            ) || '/billing-dunning',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || (
                    SELECT decrypted_secret
                    FROM vault.decrypted_secrets
                    WHERE name = 'service_role_key'
                    LIMIT 1
                )
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 30000
        );
    $cron$
);

-- ------------------------------------------------------------------
-- Convenience view: last run per billing job, for quick ops checks.
-- ------------------------------------------------------------------
CREATE OR REPLACE VIEW public.billing_cron_status AS
SELECT
    j.jobname,
    j.schedule,
    j.active,
    last.status,
    last.return_message,
    last.start_time,
    last.end_time
FROM cron.job j
LEFT JOIN LATERAL (
    SELECT status, return_message, start_time, end_time
    FROM cron.job_run_details
    WHERE jobid = j.jobid
    ORDER BY end_time DESC NULLS LAST
    LIMIT 1
) last ON true
WHERE j.jobname LIKE 'billing-%';

GRANT SELECT ON public.billing_cron_status TO service_role;
