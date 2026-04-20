-- ============================================================
-- 031_fix_rpc_ambiguous_columns.sql
-- create_organization had a RETURNS TABLE column called
-- `organization_id` that shadowed public.projects.organization_id
-- inside the function body, causing:
--   "column reference \"organization_id\" is ambiguous".
--
-- Fix: drop and recreate the RPC with out_ prefixed return columns.
-- Also tighten get_project_meta_account_ids similarly to avoid
-- shadowing inside its CTEs.
--
-- Safe to re-run: every function uses CREATE OR REPLACE after DROP.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- create_organization: return columns renamed to avoid shadowing
-- ───────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.create_organization(TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.create_organization(
    p_name TEXT,
    p_slug TEXT,
    p_user_id UUID
) RETURNS TABLE(
    out_organization_id UUID,
    out_default_project_id UUID,
    out_default_project_slug TEXT
) AS $$
DECLARE
    v_org_id UUID;
    v_project_id UUID;
    v_project_slug TEXT;
BEGIN
    -- The ensure_default_project AFTER INSERT trigger seeds the Default
    -- project for the newly created org. Avoid duplicating it here.
    INSERT INTO public.organizations (name, slug)
    VALUES (p_name, p_slug)
    RETURNING id INTO v_org_id;

    INSERT INTO public.memberships (user_id, organization_id, role)
    VALUES (p_user_id, v_org_id, 'owner');

    INSERT INTO public.subscriptions (
        organization_id, tier, status,
        requests_per_hour, requests_per_day,
        max_mcp_connections, max_ad_accounts
    )
    VALUES (v_org_id, 'free', 'active', 0, 0, 0, 0);

    -- Tag the trigger-created project as created_by this user.
    UPDATE public.projects p
    SET created_by = p_user_id
    WHERE p.organization_id = v_org_id
      AND p.is_default = true
    RETURNING p.id, p.slug INTO v_project_id, v_project_slug;

    RETURN QUERY SELECT v_org_id, v_project_id, v_project_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, UUID) TO service_role;

-- ───────────────────────────────────────────────────────────
-- get_project_meta_account_ids: same shadowing risk in the CTE.
-- ───────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_project_meta_account_ids(UUID[]);

CREATE OR REPLACE FUNCTION public.get_project_meta_account_ids(p_project_ids UUID[])
RETURNS TABLE(project_id UUID, meta_account_id TEXT) AS $$
BEGIN
    RETURN QUERY
    WITH scope AS (
        SELECT DISTINCT unnest_pid AS pid
        FROM UNNEST(p_project_ids) AS unnest_pid
    ),
    enabled AS (
        SELECT a.project_id AS pid, a.meta_account_id AS mid
        FROM public.ad_accounts a
        JOIN scope s ON s.pid = a.project_id
        WHERE a.is_enabled = true
    ),
    projects_with_none AS (
        SELECT s.pid
        FROM scope s
        WHERE NOT EXISTS (
            SELECT 1 FROM enabled e WHERE e.pid = s.pid
        )
    ),
    fallback AS (
        SELECT a.project_id AS pid, a.meta_account_id AS mid
        FROM public.ad_accounts a
        JOIN projects_with_none pn ON pn.pid = a.project_id
    )
    SELECT pid, mid FROM enabled
    UNION ALL
    SELECT pid, mid FROM fallback;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_project_meta_account_ids(UUID[]) TO service_role;
