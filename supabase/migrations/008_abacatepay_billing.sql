-- ============================================================
-- AbacatePay Billing Integration
-- ============================================================
-- Adds 'max' tier, replaces Stripe with AbacatePay fields,
-- switches rate limiting from per-minute to per-hour,
-- adds MCP connection limits, and creates billing_events table.

-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction.
-- Supabase CLI runs each migration file outside a transaction when
-- it detects ALTER TYPE ... ADD VALUE, so this is safe.
ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'max' AFTER 'pro';

-- ============================================================
-- Rename Stripe columns to AbacatePay
-- ============================================================

ALTER TABLE public.subscriptions
    RENAME COLUMN stripe_customer_id TO abacatepay_customer_id;

ALTER TABLE public.subscriptions
    RENAME COLUMN stripe_subscription_id TO abacatepay_subscription_id;

-- ============================================================
-- Switch from per-minute to per-hour rate limiting
-- ============================================================

ALTER TABLE public.subscriptions
    RENAME COLUMN requests_per_minute TO requests_per_hour;

-- Update default values for new subscriptions
ALTER TABLE public.subscriptions
    ALTER COLUMN requests_per_hour SET DEFAULT 20;

ALTER TABLE public.subscriptions
    ALTER COLUMN requests_per_day SET DEFAULT 20;

-- ============================================================
-- Add new billing columns
-- ============================================================

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS billing_cycle TEXT
        CHECK (billing_cycle IN ('monthly', 'annually'));

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS max_mcp_connections INT NOT NULL DEFAULT 1;

-- Update existing free-tier subscriptions to correct new defaults
UPDATE public.subscriptions
SET requests_per_day = 20,
    requests_per_hour = 20,
    max_mcp_connections = 1
WHERE tier = 'free';

-- ============================================================
-- Billing events table (webhook idempotency + audit trail)
-- ============================================================

CREATE TABLE public.billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    abacatepay_subscription_id TEXT,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_billing_events_workspace
    ON public.billing_events(workspace_id, processed_at DESC);

-- RLS: no user access, only service role writes
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Update create_workspace function
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_workspace(
    p_name TEXT,
    p_slug TEXT,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    INSERT INTO public.workspaces (name, slug)
    VALUES (p_name, p_slug)
    RETURNING id INTO v_workspace_id;

    INSERT INTO public.memberships (user_id, workspace_id, role)
    VALUES (p_user_id, v_workspace_id, 'owner');

    INSERT INTO public.subscriptions (
        workspace_id, tier, status,
        requests_per_hour, requests_per_day, max_mcp_connections
    )
    VALUES (v_workspace_id, 'free', 'active', 20, 20, 1);

    RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Update validate_api_key function
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_api_key(
    p_api_key TEXT
) RETURNS TABLE(
    workspace_id UUID,
    api_key_id UUID,
    tier subscription_tier,
    requests_per_hour INT,
    requests_per_day INT,
    max_mcp_connections INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ak.workspace_id,
        ak.id AS api_key_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_hour, 20),
        COALESCE(s.requests_per_day, 20),
        COALESCE(s.max_mcp_connections, 1)
    FROM public.api_keys ak
    LEFT JOIN public.subscriptions s
        ON s.workspace_id = ak.workspace_id
        AND s.status = 'active'
    WHERE ak.key_hash = crypt(p_api_key, ak.key_hash)
      AND ak.is_active = true
      AND (ak.expires_at IS NULL OR ak.expires_at > now());

    UPDATE public.api_keys
    SET last_used_at = now()
    WHERE key_hash = crypt(p_api_key, key_hash)
      AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Update get_workspace_context function
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_workspace_context(
    p_workspace_id UUID
) RETURNS TABLE(
    workspace_id UUID,
    tier subscription_tier,
    requests_per_hour INT,
    requests_per_day INT,
    max_mcp_connections INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id AS workspace_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_hour, 20),
        COALESCE(s.requests_per_day, 20),
        COALESCE(s.max_mcp_connections, 1)
    FROM public.workspaces w
    LEFT JOIN public.subscriptions s
        ON s.workspace_id = w.id
        AND s.status = 'active'
    WHERE w.id = p_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_context(UUID) TO service_role;
