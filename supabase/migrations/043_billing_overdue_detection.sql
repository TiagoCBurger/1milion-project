-- ============================================================
-- 043_billing_overdue_detection.sql
-- ------------------------------------------------------------
-- AbacatePay v2 does not emit a "payment failed" webhook. When
-- renewal fails, it retries internally and, on final failure,
-- emits `subscription.cancelled` directly (or, in the worst case,
-- nothing at all if the webhook is dropped).
--
-- We cover that gap here by detecting subscriptions whose
-- `current_period_end` is in the past and whose renewal webhook
-- never arrived. The janitor cron calls this function every run:
--   * Paid + active + current_period_end < now - tolerance  →
--     mark past_due, start grace period, and (optionally) send
--     a payment-failure email.
--   * Grace period already expired → reconcile_expired_subscriptions
--     (already defined in 042) downgrades to free.
-- ============================================================

CREATE OR REPLACE FUNCTION public.detect_overdue_subscriptions(
    p_grace_period_days INT DEFAULT 7,
    -- Webhook can take a few minutes to arrive after current_period_end.
    -- A small tolerance avoids false positives at the exact renewal
    -- moment (the renewed webhook could be in flight).
    p_tolerance_minutes INT DEFAULT 30
) RETURNS TABLE (
    organization_id UUID,
    tier subscription_tier,
    current_period_end TIMESTAMPTZ,
    grace_period_end TIMESTAMPTZ,
    payment_failure_count INT,
    newly_marked BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH newly AS (
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
        n.organization_id,
        n.tier,
        n.current_period_end,
        n.grace_period_end,
        n.payment_failure_count,
        true AS newly_marked
    FROM newly n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_overdue_subscriptions(INT, INT) TO service_role;

-- Supporting index: the janitor scans status+current_period_end, so an
-- index keyed on that pair (constrained to paid tiers) keeps the scan
-- constant-time even as the subscriptions table grows.
CREATE INDEX IF NOT EXISTS idx_subscriptions_overdue_scan
    ON public.subscriptions (status, current_period_end)
    WHERE tier <> 'free';

-- ----------------------------------------------------------------
-- Dunning notification bookkeeping
-- ------------------------------------------------------------
-- Stamp on each BillingFailedEmail dispatch so the janitor doesn't
-- re-notify the same user every 10-minute tick. Cleared whenever a
-- renewal succeeds (webhook `subscription.renewed`) or the grace
-- window closes (reconcile downgrades to free).
-- ----------------------------------------------------------------

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS dunning_notified_at TIMESTAMPTZ;

-- Helper for the /api/internal/billing/notify-dunning endpoint. Returns the
-- owner email + current dunning state for orgs that have been marked
-- past_due but not yet notified (or not notified in the last 24 h — a
-- second reminder is acceptable, a loop is not).
CREATE OR REPLACE FUNCTION public.list_dunning_candidates(
    p_organization_ids UUID[],
    p_remind_after_hours INT DEFAULT 24
) RETURNS TABLE (
    organization_id UUID,
    organization_name TEXT,
    owner_email TEXT,
    owner_name TEXT,
    tier subscription_tier,
    grace_period_end TIMESTAMPTZ,
    already_notified BOOLEAN
) AS $$
    SELECT
        s.organization_id,
        o.name AS organization_name,
        u.email AS owner_email,
        COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email) AS owner_name,
        s.tier,
        s.grace_period_end,
        (s.dunning_notified_at IS NOT NULL
            AND s.dunning_notified_at
                > now() - make_interval(hours => p_remind_after_hours)
        ) AS already_notified
    FROM public.subscriptions s
    JOIN public.organizations o ON o.id = s.organization_id
    JOIN public.memberships m ON m.organization_id = s.organization_id AND m.role = 'owner'
    JOIN auth.users u ON u.id = m.user_id
    WHERE s.organization_id = ANY(p_organization_ids)
      AND s.tier <> 'free'
      AND s.status = 'past_due'
      AND s.grace_period_end IS NOT NULL
      AND s.grace_period_end > now();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.list_dunning_candidates(UUID[], INT) TO service_role;

-- Small helper the janitor polls every tick: returns orgs still in their
-- grace window that haven't been notified in the last p_remind_after_hours.
-- Covers both "newly marked past_due this tick" and "marked earlier but the
-- email send failed" — detect_overdue_subscriptions only returns the former.
CREATE OR REPLACE FUNCTION public.list_orgs_needing_dunning_email(
    p_remind_after_hours INT DEFAULT 24
) RETURNS TABLE (organization_id UUID) AS $$
    SELECT s.organization_id
    FROM public.subscriptions s
    WHERE s.tier <> 'free'
      AND s.status = 'past_due'
      AND s.grace_period_end IS NOT NULL
      AND s.grace_period_end > now()
      AND (
          s.dunning_notified_at IS NULL
          OR s.dunning_notified_at
              < now() - make_interval(hours => p_remind_after_hours)
      );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.list_orgs_needing_dunning_email(INT) TO service_role;

-- Called after a successful BillingFailedEmail send to avoid double-sending.
CREATE OR REPLACE FUNCTION public.mark_dunning_notified(
    p_organization_id UUID
) RETURNS void AS $$
BEGIN
    UPDATE public.subscriptions
    SET dunning_notified_at = now(),
        updated_at = now()
    WHERE organization_id = p_organization_id
      AND status = 'past_due';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.mark_dunning_notified(UUID) TO service_role;

-- ----------------------------------------------------------------
-- Re-define reconcile_expired_subscriptions (originally from 042) so
-- the downgrade path also clears dunning_notified_at — the column only
-- exists after this migration, so 042 couldn't reference it.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reconcile_expired_subscriptions()
RETURNS TABLE (
    organization_id UUID,
    previous_tier subscription_tier,
    previous_status subscription_status,
    reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH targets AS (
        SELECT
            s.id,
            s.organization_id,
            s.tier AS previous_tier,
            s.status AS previous_status,
            CASE
                WHEN s.status = 'past_due' THEN 'grace_period_expired'::TEXT
                WHEN s.status = 'canceled' THEN 'cancel_not_reverted'::TEXT
                ELSE 'unknown'::TEXT
            END AS reason
        FROM public.subscriptions s
        WHERE s.tier <> 'free'
          AND (
              (s.status = 'past_due'
                  AND s.grace_period_end IS NOT NULL
                  AND s.grace_period_end < now())
              OR s.status = 'canceled'
          )
    ),
    updated AS (
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
        FROM targets t
        WHERE s.id = t.id
        RETURNING t.organization_id, t.previous_tier, t.previous_status, t.reason
    )
    SELECT u.organization_id, u.previous_tier, u.previous_status, u.reason
    FROM updated u;

    PERFORM public.reconcile_ad_account_plan_limits(t.organization_id)
    FROM (
        SELECT s.organization_id
        FROM public.subscriptions s
        WHERE s.tier = 'free'
          AND s.updated_at > now() - INTERVAL '1 minute'
    ) AS t;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reconcile_expired_subscriptions() TO service_role;
