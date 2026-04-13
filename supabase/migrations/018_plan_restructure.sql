-- ============================================================
-- Plan Restructure
-- ============================================================
-- New plan structure:
--   free: no access (0/hr, 0/day, 0 ad accounts, 0 MCP connections)
--   pro:  R$27/mo — 200/hr, 1000/day, 1 ad account, 1 MCP connection
--   max:  R$97/mo — 200/hr, 5000/day, 5 ad accounts, 5 MCP connections
-- Removes annual billing cycle (monthly only going forward).
-- Adds max_ad_accounts column.

-- ============================================================
-- Add max_ad_accounts column
-- ============================================================

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS max_ad_accounts INT NOT NULL DEFAULT 0;

-- ============================================================
-- Update existing subscriptions to new plan limits
-- ============================================================

UPDATE public.subscriptions
SET requests_per_hour = 0,
    requests_per_day  = 0,
    max_mcp_connections = 0,
    max_ad_accounts     = 0
WHERE tier = 'free';

UPDATE public.subscriptions
SET requests_per_hour   = 200,
    requests_per_day    = 1000,
    max_mcp_connections = 1,
    max_ad_accounts     = 1
WHERE tier = 'pro';

UPDATE public.subscriptions
SET requests_per_hour   = 200,
    requests_per_day    = 5000,
    max_mcp_connections = 5,
    max_ad_accounts     = 5
WHERE tier = 'max';

-- ============================================================
-- Update billing_cycle constraint: remove 'annually'
-- Migrate any existing annually subscriptions to monthly first
-- ============================================================

UPDATE public.subscriptions
SET billing_cycle = 'monthly'
WHERE billing_cycle = 'annually';

ALTER TABLE public.subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_billing_cycle_check;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_billing_cycle_check
    CHECK (billing_cycle IN ('monthly'));

-- ============================================================
-- Update create_workspace: free tier starts with 0 limits
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
        requests_per_hour, requests_per_day,
        max_mcp_connections, max_ad_accounts
    )
    VALUES (v_workspace_id, 'free', 'active', 0, 0, 0, 0);

    RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Update validate_api_key: add max_ad_accounts
-- Must DROP first because return type changed
-- ============================================================

DROP FUNCTION IF EXISTS public.validate_api_key(TEXT);

CREATE OR REPLACE FUNCTION public.validate_api_key(
    p_api_key TEXT
) RETURNS TABLE(
    workspace_id UUID,
    api_key_id UUID,
    tier subscription_tier,
    requests_per_hour INT,
    requests_per_day INT,
    max_mcp_connections INT,
    max_ad_accounts INT,
    enable_meta_mutations BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ak.workspace_id,
        ak.id AS api_key_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_hour, 0),
        COALESCE(s.requests_per_day, 0),
        COALESCE(s.max_mcp_connections, 0),
        COALESCE(s.max_ad_accounts, 0),
        w.enable_meta_mutations
    FROM public.api_keys ak
    INNER JOIN public.workspaces w ON w.id = ak.workspace_id
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
-- Update get_workspace_context: add max_ad_accounts
-- Must DROP first because return type changed
-- ============================================================

DROP FUNCTION IF EXISTS public.get_workspace_context(UUID);

CREATE OR REPLACE FUNCTION public.get_workspace_context(
    p_workspace_id UUID
) RETURNS TABLE(
    workspace_id UUID,
    tier subscription_tier,
    requests_per_hour INT,
    requests_per_day INT,
    max_mcp_connections INT,
    max_ad_accounts INT,
    enable_meta_mutations BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id AS workspace_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_hour, 0),
        COALESCE(s.requests_per_day, 0),
        COALESCE(s.max_mcp_connections, 0),
        COALESCE(s.max_ad_accounts, 0),
        w.enable_meta_mutations
    FROM public.workspaces w
    LEFT JOIN public.subscriptions s
        ON s.workspace_id = w.id
        AND s.status = 'active'
    WHERE w.id = p_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_context(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_api_key(TEXT) TO service_role;
