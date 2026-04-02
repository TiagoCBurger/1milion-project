-- ============================================================
-- OAuth Connections
-- Persists MCP OAuth grants so workspace admins can view,
-- modify allowed_accounts, and revoke connections.
-- ============================================================

CREATE TABLE public.oauth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    client_name TEXT,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    allowed_accounts TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    UNIQUE(workspace_id, client_id)
);

CREATE INDEX idx_oauth_connections_workspace
    ON public.oauth_connections(workspace_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view oauth connections"
    ON public.oauth_connections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = oauth_connections.workspace_id
              AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins can manage oauth connections"
    ON public.oauth_connections FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = oauth_connections.workspace_id
              AND memberships.user_id = auth.uid()
              AND memberships.role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- FUNCTION: Upsert connection (called by MCP worker via service role)
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_oauth_connection(
    p_workspace_id UUID,
    p_client_id TEXT,
    p_client_name TEXT,
    p_user_id UUID,
    p_allowed_accounts TEXT[]
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.oauth_connections (
        workspace_id, client_id, client_name, user_id, allowed_accounts, is_active, granted_at
    ) VALUES (
        p_workspace_id, p_client_id, p_client_name, p_user_id, p_allowed_accounts, true, now()
    )
    ON CONFLICT (workspace_id, client_id) DO UPDATE SET
        client_name = EXCLUDED.client_name,
        user_id = EXCLUDED.user_id,
        allowed_accounts = EXCLUDED.allowed_accounts,
        is_active = true,
        granted_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: Get active connection for token validation
-- Returns allowed_accounts from DB (source of truth)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_oauth_connection(
    p_workspace_id UUID,
    p_client_id TEXT
) RETURNS TABLE (
    connection_id UUID,
    is_active BOOLEAN,
    allowed_accounts TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT oc.id, oc.is_active, oc.allowed_accounts
    FROM public.oauth_connections oc
    WHERE oc.workspace_id = p_workspace_id
      AND oc.client_id = p_client_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- GRANTS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.upsert_oauth_connection TO service_role;
GRANT EXECUTE ON FUNCTION public.get_oauth_connection TO service_role;
