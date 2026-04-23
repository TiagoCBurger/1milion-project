-- ============================================================
-- 044_cancel_at_period_end.sql
-- ------------------------------------------------------------
-- Replaces detect_overdue_subscriptions with a version that
-- distinguishes two end-of-period situations:
--
--   A. Voluntary cancellation that has reached period_end:
--        pending_tier='free' AND current_period_end < now()
--      → downgrade to free right away (no grace, no dunning,
--        no BillingFailedEmail).
--
--   B. Renewal webhook never arrived:
--        pending_tier IS NULL AND status='active'
--        AND current_period_end < now() - tolerance
--      → mark past_due with a grace window so the user still
--        has access while we chase the payment issue.
--
-- Without this split, voluntarily-cancelled subscriptions would
-- enter the dunning flow and trigger BillingFailedEmail — the
-- opposite of what the user just asked for.
-- ============================================================

DROP FUNCTION IF EXISTS public.detect_overdue_subscriptions(INT, INT);

CREATE OR REPLACE FUNCTION public.detect_overdue_subscriptions(
    p_grace_period_days INT DEFAULT 7,
    p_tolerance_minutes INT DEFAULT 30
) RETURNS TABLE (
    organization_id UUID,
    tier subscription_tier,
    current_period_end TIMESTAMPTZ,
    grace_period_end TIMESTAMPTZ,
    payment_failure_count INT,
    action TEXT
) AS $$
BEGIN
    -- Branch A: voluntary cancellation that has reached period_end.
    -- Downgrade directly to free; no past_due / no dunning.
    RETURN QUERY
    WITH voluntary AS (
        UPDATE public.subscriptions s
        SET tier = 'free',
            status = 'canceled',
            billing_cycle = NULL,
            current_period_end = NULL,
            abacatepay_subscription_id = NULL,
            pending_tier = NULL,
            pending_billing_cycle = NULL,
            grace_period_end = NULL,
            payment_failed_at = NULL,
            payment_failure_count = 0,
            dunning_notified_at = NULL,
            requests_per_minute = 0,
            requests_per_hour = 0,
            requests_per_day = 0,
            max_mcp_connections = 0,
            max_ad_accounts = 0,
            updated_at = now()
        WHERE s.tier <> 'free'
          AND s.pending_tier = 'free'
          AND s.current_period_end IS NOT NULL
          AND s.current_period_end < now()
        RETURNING
            s.organization_id,
            'free'::subscription_tier AS tier,
            NULL::TIMESTAMPTZ AS current_period_end,
            NULL::TIMESTAMPTZ AS grace_period_end,
            0 AS payment_failure_count
    )
    SELECT
        v.organization_id,
        v.tier,
        v.current_period_end,
        v.grace_period_end,
        v.payment_failure_count,
        'voluntary_cancel_downgrade'::TEXT AS action
    FROM voluntary v;

    -- Downstream cleanup (ad accounts over free cap, etc.) for the
    -- voluntary-cancel set. Done here because both branches need it —
    -- tied to any org that was just downgraded to free.
    PERFORM public.reconcile_ad_account_plan_limits(t.organization_id)
    FROM (
        SELECT s.organization_id
        FROM public.subscriptions s
        WHERE s.tier = 'free'
          AND s.updated_at > now() - INTERVAL '1 minute'
    ) AS t;

    -- Branch B: payment renewal missing past the tolerance window.
    -- Mark past_due and open a grace window. Exclude rows with
    -- pending_tier='free' so voluntary cancels never enter dunning.
    RETURN QUERY
    WITH dunning AS (
        UPDATE public.subscriptions s
        SET status = 'past_due',
            payment_failed_at = COALESCE(s.payment_failed_at, now()),
            payment_failure_count = s.payment_failure_count + 1,
            grace_period_end = COALESCE(
                s.grace_period_end,
                now() + make_interval(days => p_grace_period_days)
            ),
            updated_at = now()
        WHERE s.tier <> 'free'
          AND s.status = 'active'
          AND (s.pending_tier IS NULL OR s.pending_tier <> 'free')
          AND s.current_period_end IS NOT NULL
          AND s.current_period_end
              < now() - make_interval(mins => p_tolerance_minutes)
        RETURNING
            s.organization_id,
            s.tier,
            s.current_period_end,
            s.grace_period_end,
            s.payment_failure_count
    )
    SELECT
        d.organization_id,
        d.tier,
        d.current_period_end,
        d.grace_period_end,
        d.payment_failure_count,
        'marked_past_due'::TEXT AS action
    FROM dunning d;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_overdue_subscriptions(INT, INT) TO service_role;

COMMENT ON FUNCTION public.detect_overdue_subscriptions(INT, INT) IS
    'Single cron entry point that separates voluntary end-of-period cancels from missed renewals. The former downgrades directly; the latter enters the 7-day dunning window.';
