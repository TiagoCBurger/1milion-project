-- Workspace-level gate for Meta write operations (MCP + web API + dashboard).
-- Fail-closed: existing rows get false until toggled in Supabase Studio.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS enable_meta_mutations BOOLEAN NOT NULL DEFAULT false;

-- Return type change: drop and recreate
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
    enable_meta_mutations BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ak.workspace_id,
        ak.id AS api_key_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_hour, 20),
        COALESCE(s.requests_per_day, 20),
        COALESCE(s.max_mcp_connections, 1),
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

DROP FUNCTION IF EXISTS public.get_workspace_context(UUID);

CREATE OR REPLACE FUNCTION public.get_workspace_context(
    p_workspace_id UUID
) RETURNS TABLE(
    workspace_id UUID,
    tier subscription_tier,
    requests_per_hour INT,
    requests_per_day INT,
    max_mcp_connections INT,
    enable_meta_mutations BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id AS workspace_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_hour, 20),
        COALESCE(s.requests_per_day, 20),
        COALESCE(s.max_mcp_connections, 1),
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
