-- ============================================================
-- Expose requests_per_minute through auth RPCs
-- ============================================================
-- We now rate-limit per minute in the RateLimitDO, so the RPCs must surface
-- the value. The column existed in 001_initial but was dropped from some
-- environments; re-create defensively.
--
-- Defaults align with shared TIER_LIMITS: free=0, pro=30, max=60, enterprise=0.

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS requests_per_minute INT NOT NULL DEFAULT 0;

-- Seed per-minute defaults for standard tiers. For fresh columns this sets
-- every existing row; for pre-existing columns it overrides default-ish values
-- (0 or the legacy 20) while preserving per-account overrides above the cap.
UPDATE public.subscriptions
SET requests_per_minute = 30, updated_at = now()
WHERE tier = 'pro' AND requests_per_minute IN (0, 20);

UPDATE public.subscriptions
SET requests_per_minute = 60, updated_at = now()
WHERE tier = 'max' AND requests_per_minute IN (0, 20);

UPDATE public.subscriptions
SET requests_per_minute = 0, updated_at = now()
WHERE tier = 'free' AND requests_per_minute <> 0;

-- --- get_workspace_context

DROP FUNCTION IF EXISTS public.get_workspace_context(UUID);

CREATE OR REPLACE FUNCTION public.get_workspace_context(
    p_workspace_id UUID
) RETURNS TABLE(
    workspace_id UUID,
    tier subscription_tier,
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
        w.id AS workspace_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_minute, 0),
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

-- --- validate_api_key

DROP FUNCTION IF EXISTS public.validate_api_key(TEXT);

CREATE OR REPLACE FUNCTION public.validate_api_key(
    p_api_key TEXT
) RETURNS TABLE(
    workspace_id UUID,
    api_key_id UUID,
    tier subscription_tier,
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
        ak.workspace_id,
        ak.id AS api_key_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_minute, 0),
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
