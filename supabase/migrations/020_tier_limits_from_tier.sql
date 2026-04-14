-- ============================================================
-- Tier limits: derive standard-plan caps from tier
-- ============================================================
-- Fixes workspaces where tier was updated (e.g. Pro → Max) but
-- max_mcp_connections / max_ad_accounts stayed stale, which made
-- the MCP worker enforce Pro limits (1 connection) on a Max plan.

-- Repair existing rows (standard tiers only; enterprise keeps column values)
UPDATE public.subscriptions AS s
SET
    max_mcp_connections = CASE s.tier
        WHEN 'free' THEN 0
        WHEN 'pro' THEN 1
        WHEN 'max' THEN 5
        ELSE s.max_mcp_connections
    END,
    max_ad_accounts = CASE s.tier
        WHEN 'free' THEN 0
        WHEN 'pro' THEN 1
        WHEN 'max' THEN 5
        ELSE s.max_ad_accounts
    END,
    updated_at = now()
WHERE s.tier IN ('free', 'pro', 'max')
  AND (
    s.max_mcp_connections IS DISTINCT FROM (
        CASE s.tier
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
        END
    )
    OR s.max_ad_accounts IS DISTINCT FROM (
        CASE s.tier
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
        END
    )
  );

-- --- get_workspace_context: return limits aligned with tier for free/pro/max

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
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_mcp_connections, -1)
        END,
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_ad_accounts, -1)
        END,
        w.enable_meta_mutations
    FROM public.workspaces w
    LEFT JOIN public.subscriptions s
        ON s.workspace_id = w.id
        AND s.status = 'active'
    WHERE w.id = p_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_context(UUID) TO service_role;

-- --- validate_api_key: same alignment for API-key auth

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
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_mcp_connections, -1)
        END,
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_ad_accounts, -1)
        END,
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

GRANT EXECUTE ON FUNCTION public.validate_api_key(TEXT) TO service_role;
