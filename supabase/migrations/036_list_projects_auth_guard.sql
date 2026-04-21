-- ============================================================
-- 036_list_projects_auth_guard.sql
-- list_projects is SECURITY DEFINER and therefore bypasses the
-- projects-table RLS. Every sibling RPC in 030 guards on
-- is_organization_owner / is_organization_member; list_projects
-- was the outlier. Redefine it with an explicit membership check
-- so a signed-in user cannot enumerate another organization's
-- projects by calling the RPC directly via PostgREST.
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
    IF NOT public.is_organization_member(p_organization_id) THEN
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
