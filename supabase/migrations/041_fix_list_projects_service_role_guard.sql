-- ============================================================
-- 041_fix_list_projects_service_role_guard.sql
--
-- Migration 036 added an is_organization_member() guard to
-- list_projects to block cross-tenant enumeration via PostgREST.
-- That guard calls auth.uid(), which is NULL when the caller uses
-- the service_role key (e.g. the MCP worker). Because the function
-- is SECURITY DEFINER the membership check always fails for
-- service_role callers, returning 42501.
--
-- Fix: only enforce the guard when auth.uid() is non-null
-- (authenticated user calls). Service-role callers are trusted
-- at the Supabase layer and already require GRANT EXECUTE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_projects(p_organization_id UUID)
RETURNS TABLE(
    id UUID,
    name TEXT,
    slug TEXT,
    description TEXT,
    is_default BOOLEAN,
    ad_account_count BIGINT,
    site_count BIGINT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Only enforce membership for authenticated-user callers.
    -- service_role has no auth.uid() context and is trusted by grant.
    IF auth.uid() IS NOT NULL AND NOT public.is_organization_member(p_organization_id) THEN
        RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.name,
        p.slug,
        p.description,
        p.is_default,
        COALESCE(ac.cnt, 0) AS ad_account_count,
        COALESCE(sc.cnt, 0) AS site_count,
        p.created_at
    FROM public.projects p
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt
        FROM public.ad_accounts a
        WHERE a.project_id = p.id
    ) ac ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt
        FROM analytics.sites s
        WHERE s.project_id = p.id
    ) sc ON TRUE
    WHERE p.organization_id = p_organization_id
    ORDER BY p.is_default DESC, p.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.list_projects(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_projects(UUID) TO service_role;
