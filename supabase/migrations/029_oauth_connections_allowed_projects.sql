-- ============================================================
-- 029_oauth_connections_allowed_projects.sql
-- Shifts OAuth MCP scoping from "which ad accounts" to "which
-- projects". allowed_accounts is kept DEPRECATED for one
-- deprecation window so tokens minted before this migration
-- continue to validate via the worker's compat shim.
-- ============================================================

ALTER TABLE public.oauth_connections
    ADD COLUMN allowed_projects uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.oauth_connections.allowed_projects IS
    'Project IDs this connection is authorized to operate on. Source of truth for MCP scoping.';

COMMENT ON COLUMN public.oauth_connections.allowed_accounts IS
    'DEPRECATED after migration 029. New flow uses allowed_projects. '
    'Kept for pre-refactor tokens still living in Workers KV.';

-- Relax NOT NULL on the legacy column so new code can write null
-- when it has no reason to populate ad-account-level scoping.
ALTER TABLE public.oauth_connections
    ALTER COLUMN allowed_accounts DROP NOT NULL;

-- ───────────────────────────────────────────────────────────
-- Backfill: grant every live connection access to the org's
-- Default project. Users can tighten scope in the UI afterwards.
-- ───────────────────────────────────────────────────────────

UPDATE public.oauth_connections oc
SET allowed_projects = ARRAY[p.id]
FROM public.projects p
WHERE p.organization_id = oc.organization_id
  AND p.is_default = true
  AND (oc.allowed_projects IS NULL OR cardinality(oc.allowed_projects) = 0);

-- ───────────────────────────────────────────────────────────
-- Drop+recreate RPCs with allowed_projects in signature.
-- ───────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.upsert_oauth_connection(UUID, TEXT, TEXT, UUID, TEXT[]);
DROP FUNCTION IF EXISTS public.get_oauth_connection(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.upsert_oauth_connection(
    p_organization_id UUID,
    p_client_id TEXT,
    p_client_name TEXT,
    p_user_id UUID,
    p_allowed_projects UUID[]
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.oauth_connections (
        organization_id, client_id, client_name, user_id,
        allowed_projects, allowed_accounts,
        is_active, granted_at
    ) VALUES (
        p_organization_id, p_client_id, p_client_name, p_user_id,
        COALESCE(p_allowed_projects, ARRAY[]::uuid[]),
        NULL,
        true, now()
    )
    ON CONFLICT (organization_id, client_id) DO UPDATE SET
        client_name = EXCLUDED.client_name,
        user_id = EXCLUDED.user_id,
        allowed_projects = EXCLUDED.allowed_projects,
        is_active = true,
        granted_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_oauth_connection(
    p_organization_id UUID,
    p_client_id TEXT
) RETURNS TABLE (
    connection_id UUID,
    is_active BOOLEAN,
    allowed_projects UUID[],
    allowed_accounts TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT oc.id, oc.is_active, oc.allowed_projects, oc.allowed_accounts
    FROM public.oauth_connections oc
    WHERE oc.organization_id = p_organization_id
      AND oc.client_id = p_client_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.upsert_oauth_connection(UUID, TEXT, TEXT, UUID, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_oauth_connection(UUID, TEXT) TO service_role;
