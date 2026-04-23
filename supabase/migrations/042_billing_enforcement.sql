-- ============================================================
-- 042_billing_enforcement.sql
-- ------------------------------------------------------------
-- Closes the billing-enforcement gap:
--   * Adds payment-failure / grace-period columns on subscriptions.
--   * Updates validate_api_key + get_organization_context to honor
--     grace periods and reject non-active subscriptions.
--   * Updates analytics.get_site_by_public_key to only return
--     sites for orgs with an active (or grace-covered past_due)
--     paid subscription. Free-tier or lapsed orgs → no row → the
--     track worker returns 404 and stops forwarding to Meta CAPI.
--   * Adds mark_subscription_past_due / clear_subscription_past_due
--     / reconcile_expired_subscriptions helpers used by the webhook
--     and janitor cron.
-- ============================================================

-- ----------------------------------------------------------------
-- Columns
-- ----------------------------------------------------------------

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_failure_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.subscriptions.grace_period_end IS
    'When a payment fails the subscription keeps paid access until this timestamp. After it, the reconcile job downgrades to free.';
COMMENT ON COLUMN public.subscriptions.payment_failed_at IS
    'First payment failure in the current dunning cycle. Cleared on successful renewal.';
COMMENT ON COLUMN public.subscriptions.payment_failure_count IS
    'Attempts failed in the current dunning cycle.';

-- ----------------------------------------------------------------
-- Helper: the "paid access is live" predicate used by every RPC.
-- Returns true when the subscription row should grant paid access:
--   * status=active or trialing, OR
--   * status=past_due AND grace period not yet expired.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.subscription_grants_paid_access(
    p_status subscription_status,
    p_grace_period_end TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
    SELECT CASE
        WHEN p_status IN ('active', 'trialing') THEN true
        WHEN p_status = 'past_due'
             AND p_grace_period_end IS NOT NULL
             AND p_grace_period_end > now() THEN true
        ELSE false
    END;
$$ LANGUAGE sql IMMUTABLE;

GRANT EXECUTE ON FUNCTION public.subscription_grants_paid_access(subscription_status, TIMESTAMPTZ)
    TO service_role;

-- ----------------------------------------------------------------
-- validate_api_key: tighten the LEFT JOIN so past_due beyond grace
-- collapses to free tier (coalesce path). Return subscription_status
-- so the worker can surface a meaningful error to the user.
-- ----------------------------------------------------------------

DROP FUNCTION IF EXISTS public.validate_api_key(TEXT);

CREATE OR REPLACE FUNCTION public.validate_api_key(
    p_api_key TEXT
) RETURNS TABLE(
    organization_id UUID,
    api_key_id UUID,
    tier subscription_tier,
    subscription_status subscription_status,
    grace_period_end TIMESTAMPTZ,
    requests_per_minute INT,
    requests_per_hour INT,
    requests_per_day INT,
    max_mcp_connections INT,
    max_ad_accounts INT,
    enable_meta_mutations BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ak.organization_id,
        ak.id AS api_key_id,
        COALESCE(s.tier, 'free'::subscription_tier) AS tier,
        COALESCE(s.status, 'canceled'::subscription_status) AS subscription_status,
        s.grace_period_end,
        COALESCE(s.requests_per_minute, 0) AS requests_per_minute,
        COALESCE(s.requests_per_hour, 0) AS requests_per_hour,
        COALESCE(s.requests_per_day, 0) AS requests_per_day,
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_mcp_connections, -1)
        END AS max_mcp_connections,
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_ad_accounts, -1)
        END AS max_ad_accounts,
        o.enable_meta_mutations
    FROM public.api_keys ak
    INNER JOIN public.organizations o ON o.id = ak.organization_id
    LEFT JOIN public.subscriptions s
        ON s.organization_id = ak.organization_id
        AND public.subscription_grants_paid_access(s.status, s.grace_period_end)
    WHERE ak.key_hash = crypt(p_api_key, ak.key_hash)
      AND ak.is_active = true
      AND (ak.expires_at IS NULL OR ak.expires_at > now());

    UPDATE public.api_keys
    SET last_used_at = now()
    WHERE key_hash = crypt(p_api_key, key_hash)
      AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.validate_api_key(TEXT) TO service_role;

-- ----------------------------------------------------------------
-- get_organization_context: same rule as validate_api_key.
-- ----------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_organization_context(UUID);

CREATE OR REPLACE FUNCTION public.get_organization_context(
    p_organization_id UUID
) RETURNS TABLE(
    organization_id UUID,
    tier subscription_tier,
    subscription_status subscription_status,
    grace_period_end TIMESTAMPTZ,
    requests_per_minute INT,
    requests_per_hour INT,
    requests_per_day INT,
    max_mcp_connections INT,
    max_ad_accounts INT,
    enable_meta_mutations BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id AS organization_id,
        COALESCE(s.tier, 'free'::subscription_tier) AS tier,
        COALESCE(s.status, 'canceled'::subscription_status) AS subscription_status,
        s.grace_period_end,
        COALESCE(s.requests_per_minute, 0) AS requests_per_minute,
        COALESCE(s.requests_per_hour, 0) AS requests_per_hour,
        COALESCE(s.requests_per_day, 0) AS requests_per_day,
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_mcp_connections, -1)
        END AS max_mcp_connections,
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_ad_accounts, -1)
        END AS max_ad_accounts,
        o.enable_meta_mutations
    FROM public.organizations o
    LEFT JOIN public.subscriptions s
        ON s.organization_id = o.id
        AND public.subscription_grants_paid_access(s.status, s.grace_period_end)
    WHERE o.id = p_organization_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_organization_context(UUID) TO service_role;

-- ----------------------------------------------------------------
-- get_site_by_public_key: require an org-level paid subscription.
-- If the org is on free/canceled/past_due-expired, the site is
-- invisible to the track worker (returns 404). `is_active` stays
-- as the admin kill switch on top of that.
-- ----------------------------------------------------------------

DROP FUNCTION IF EXISTS analytics.get_site_by_public_key(TEXT);

CREATE FUNCTION analytics.get_site_by_public_key(
    p_public_key TEXT
) RETURNS TABLE (
    id UUID,
    organization_id UUID,
    domain TEXT,
    is_active BOOLEAN,
    block_bots BOOLEAN,
    track_outbound BOOLEAN,
    track_performance BOOLEAN,
    excluded_ips TEXT[],
    excluded_countries TEXT[],
    pixel_id TEXT,
    capi_encrypted_token TEXT,
    has_capi_token BOOLEAN
) AS $$
    SELECT
        s.id,
        s.organization_id,
        s.domain,
        s.is_active,
        s.block_bots,
        s.track_outbound,
        s.track_performance,
        s.excluded_ips,
        s.excluded_countries,
        s.pixel_id,
        s.capi_encrypted_token::TEXT,
        s.capi_encrypted_token IS NOT NULL AS has_capi_token
    FROM analytics.sites s
    INNER JOIN public.subscriptions sub
        ON sub.organization_id = s.organization_id
        AND sub.tier <> 'free'
        AND public.subscription_grants_paid_access(sub.status, sub.grace_period_end)
    WHERE s.public_key = p_public_key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION analytics.get_site_by_public_key(TEXT) TO service_role;

-- ----------------------------------------------------------------
-- Dunning helpers
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_subscription_past_due(
    p_organization_id UUID,
    p_grace_period_days INT DEFAULT 7
) RETURNS TABLE (
    organization_id UUID,
    grace_period_end TIMESTAMPTZ,
    payment_failure_count INT
) AS $$
BEGIN
    RETURN QUERY
    UPDATE public.subscriptions s
    SET status = 'past_due',
        payment_failed_at = COALESCE(s.payment_failed_at, now()),
        payment_failure_count = s.payment_failure_count + 1,
        grace_period_end = COALESCE(
            s.grace_period_end,
            now() + make_interval(days => p_grace_period_days)
        ),
        updated_at = now()
    WHERE s.organization_id = p_organization_id
      AND s.tier <> 'free'
    RETURNING s.organization_id, s.grace_period_end, s.payment_failure_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.mark_subscription_past_due(UUID, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_subscription_past_due(
    p_organization_id UUID
) RETURNS void AS $$
BEGIN
    UPDATE public.subscriptions
    SET status = 'active',
        payment_failed_at = NULL,
        payment_failure_count = 0,
        grace_period_end = NULL,
        updated_at = now()
    WHERE organization_id = p_organization_id
      AND status = 'past_due';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.clear_subscription_past_due(UUID) TO service_role;

-- ----------------------------------------------------------------
-- Reconcile job: runs periodically (Cloudflare cron). Expires any
-- past_due subscription whose grace window has closed, downgrading
-- it to free-tier limits. Returns the affected orgs so the caller
-- can log / emit audit events.
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

    -- Reconcile downstream resources so the UI stays consistent.
    -- reconcile_ad_account_plan_limits was added in migration 033 and
    -- handles disabling ad accounts over the free-tier cap.
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

-- ----------------------------------------------------------------
-- Helper used by the webhook handler to identify orgs past the
-- grace window (emit audit / notify ops) without actually mutating
-- them — useful for observability dashboards.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_subscriptions_needing_reconcile()
RETURNS TABLE (
    organization_id UUID,
    tier subscription_tier,
    status subscription_status,
    grace_period_end TIMESTAMPTZ,
    payment_failure_count INT
) AS $$
    SELECT s.organization_id, s.tier, s.status, s.grace_period_end, s.payment_failure_count
    FROM public.subscriptions s
    WHERE s.tier <> 'free'
      AND (
          (s.status = 'past_due'
              AND s.grace_period_end IS NOT NULL
              AND s.grace_period_end < now())
          OR s.status = 'canceled'
      );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.list_subscriptions_needing_reconcile() TO service_role;

-- ----------------------------------------------------------------
-- Index: speed up reconcile scan (tiny table today but cheap).
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_subscriptions_grace_period_scan
    ON public.subscriptions (status, grace_period_end)
    WHERE tier <> 'free';
