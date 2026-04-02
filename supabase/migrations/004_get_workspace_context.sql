-- RPC used by MCP worker to resolve workspace tier/limits after OAuth authentication
CREATE OR REPLACE FUNCTION public.get_workspace_context(
    p_workspace_id UUID
) RETURNS TABLE(
    workspace_id UUID,
    tier subscription_tier,
    requests_per_minute INT,
    requests_per_day INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id AS workspace_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_minute, 20),
        COALESCE(s.requests_per_day, 500)
    FROM public.workspaces w
    LEFT JOIN public.subscriptions s
        ON s.workspace_id = w.id
        AND s.status = 'active'
    WHERE w.id = p_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_context(UUID) TO service_role;
