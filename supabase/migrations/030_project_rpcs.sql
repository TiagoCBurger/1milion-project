-- ============================================================
-- 030_project_rpcs.sql
-- Final RPC surface for projects:
--   - create_organization now seeds a Default project atomically
--   - ensure_default_project trigger guarantees one default per org
--   - list_projects, get_project, move_* and delete_project helpers
--   - get_project_meta_account_ids used by MCP worker during auth
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- create_organization: seed Default project in one transaction
-- ───────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.create_organization(TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.create_organization(
    p_name TEXT,
    p_slug TEXT,
    p_user_id UUID
) RETURNS TABLE(
    organization_id UUID,
    default_project_id UUID,
    default_project_slug TEXT
) AS $$
DECLARE
    v_org_id UUID;
    v_project_id UUID;
    v_project_slug TEXT;
BEGIN
    -- The ensure_default_project AFTER INSERT trigger will create the
    -- Default project with slug 'default'. Avoid duplicating it here.
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
    UPDATE public.projects
    SET created_by = p_user_id
    WHERE organization_id = v_org_id AND is_default = true
    RETURNING id, slug INTO v_project_id, v_project_slug;

    RETURN QUERY SELECT v_org_id, v_project_id, v_project_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, UUID) TO service_role;

-- ───────────────────────────────────────────────────────────
-- Safety net trigger: any direct insert into organizations
-- (e.g. admin scripts) still gets a Default project.
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_default_project()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.projects
        WHERE organization_id = NEW.id AND is_default = true
    ) THEN
        INSERT INTO public.projects (organization_id, name, slug, is_default)
        VALUES (NEW.id, 'Default', 'default', true);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS organizations_ensure_default_project ON public.organizations;
CREATE TRIGGER organizations_ensure_default_project
    AFTER INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.ensure_default_project();

-- ───────────────────────────────────────────────────────────
-- list_projects: used by UI and MCP to render selector with counts
-- ───────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────
-- get_project_meta_account_ids: one hop to resolve
-- MCP tool scope from (project_ids[]) → meta_account_id[].
-- Only returns ENABLED ad accounts (plan cap aware).
-- If any project has zero enabled accounts, ALL accounts are
-- returned (prevents lock-out when is_enabled defaults to false).
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_project_meta_account_ids(p_project_ids UUID[])
RETURNS TABLE(project_id UUID, meta_account_id TEXT) AS $$
BEGIN
    RETURN QUERY
    WITH scope AS (
        SELECT DISTINCT project_id FROM UNNEST(p_project_ids) AS project_id
    ),
    enabled AS (
        SELECT a.project_id, a.meta_account_id
        FROM public.ad_accounts a
        JOIN scope s ON s.project_id = a.project_id
        WHERE a.is_enabled = true
    ),
    projects_with_none AS (
        SELECT s.project_id
        FROM scope s
        WHERE NOT EXISTS (
            SELECT 1 FROM enabled e WHERE e.project_id = s.project_id
        )
    ),
    fallback AS (
        SELECT a.project_id, a.meta_account_id
        FROM public.ad_accounts a
        JOIN projects_with_none pn ON pn.project_id = a.project_id
    )
    SELECT * FROM enabled
    UNION ALL
    SELECT * FROM fallback;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_project_meta_account_ids(UUID[]) TO service_role;

-- ───────────────────────────────────────────────────────────
-- Mutations on resources: keep org consistency in one place
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.move_ad_account_to_project(
    p_account_id UUID,
    p_project_id UUID
) RETURNS void AS $$
DECLARE
    v_account_org UUID;
    v_project_org UUID;
BEGIN
    SELECT organization_id INTO v_account_org
    FROM public.ad_accounts
    WHERE id = p_account_id;

    IF v_account_org IS NULL THEN
        RAISE EXCEPTION 'ad account not found';
    END IF;

    SELECT organization_id INTO v_project_org
    FROM public.projects
    WHERE id = p_project_id;

    IF v_project_org IS NULL THEN
        RAISE EXCEPTION 'project not found';
    END IF;

    IF v_account_org <> v_project_org THEN
        RAISE EXCEPTION 'project belongs to a different organization';
    END IF;

    IF NOT public.is_organization_owner(v_account_org) THEN
        RAISE EXCEPTION 'only owners/admins can move resources';
    END IF;

    UPDATE public.ad_accounts
    SET project_id = p_project_id
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.move_site_to_project(
    p_site_id UUID,
    p_project_id UUID
) RETURNS void AS $$
DECLARE
    v_site_org UUID;
    v_project_org UUID;
BEGIN
    SELECT organization_id INTO v_site_org
    FROM analytics.sites
    WHERE id = p_site_id;

    IF v_site_org IS NULL THEN
        RAISE EXCEPTION 'site not found';
    END IF;

    SELECT organization_id INTO v_project_org
    FROM public.projects
    WHERE id = p_project_id;

    IF v_project_org IS NULL THEN
        RAISE EXCEPTION 'project not found';
    END IF;

    IF v_site_org <> v_project_org THEN
        RAISE EXCEPTION 'project belongs to a different organization';
    END IF;

    IF NOT public.is_organization_owner(v_site_org) THEN
        RAISE EXCEPTION 'only owners/admins can move resources';
    END IF;

    UPDATE analytics.sites
    SET project_id = p_project_id
    WHERE id = p_site_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.move_ad_account_to_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_site_to_project(UUID, UUID) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- delete_project: forbidden for default; reassign required when
-- resources exist on the target project.
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_project(
    p_project_id UUID,
    p_reassign_to UUID
) RETURNS void AS $$
DECLARE
    v_org_id UUID;
    v_is_default BOOLEAN;
    v_has_accounts BOOLEAN;
    v_has_sites BOOLEAN;
    v_target_org UUID;
BEGIN
    SELECT organization_id, is_default INTO v_org_id, v_is_default
    FROM public.projects
    WHERE id = p_project_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'project not found';
    END IF;

    IF v_is_default THEN
        RAISE EXCEPTION 'default project cannot be deleted';
    END IF;

    IF NOT public.is_organization_owner(v_org_id) THEN
        RAISE EXCEPTION 'only owners/admins can delete projects';
    END IF;

    SELECT EXISTS(SELECT 1 FROM public.ad_accounts WHERE project_id = p_project_id) INTO v_has_accounts;
    SELECT EXISTS(SELECT 1 FROM analytics.sites WHERE project_id = p_project_id) INTO v_has_sites;

    IF v_has_accounts OR v_has_sites THEN
        IF p_reassign_to IS NULL THEN
            RAISE EXCEPTION 'project has resources; pass p_reassign_to to move them before delete';
        END IF;

        SELECT organization_id INTO v_target_org
        FROM public.projects WHERE id = p_reassign_to;

        IF v_target_org IS NULL THEN
            RAISE EXCEPTION 'target project not found';
        END IF;

        IF v_target_org <> v_org_id THEN
            RAISE EXCEPTION 'target project belongs to a different organization';
        END IF;

        UPDATE public.ad_accounts SET project_id = p_reassign_to WHERE project_id = p_project_id;
        UPDATE analytics.sites   SET project_id = p_reassign_to WHERE project_id = p_project_id;
    END IF;

    DELETE FROM public.projects WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_project(UUID, UUID) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- rename_project: dedicated RPC keeps validation next to the data
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rename_project(
    p_project_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_description TEXT
) RETURNS void AS $$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT organization_id INTO v_org_id
    FROM public.projects WHERE id = p_project_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'project not found';
    END IF;

    IF NOT public.is_organization_owner(v_org_id) THEN
        RAISE EXCEPTION 'only owners/admins can rename projects';
    END IF;

    UPDATE public.projects
    SET
        name = COALESCE(NULLIF(trim(p_name), ''), name),
        slug = COALESCE(NULLIF(trim(p_slug), ''), slug),
        description = p_description
    WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rename_project(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- set_default_project: toggling ensures only one default per org.
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_default_project(p_project_id UUID)
RETURNS void AS $$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT organization_id INTO v_org_id
    FROM public.projects WHERE id = p_project_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'project not found';
    END IF;

    IF NOT public.is_organization_owner(v_org_id) THEN
        RAISE EXCEPTION 'only owners/admins can set default project';
    END IF;

    UPDATE public.projects SET is_default = false
    WHERE organization_id = v_org_id AND is_default = true AND id <> p_project_id;

    UPDATE public.projects SET is_default = true
    WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_default_project(UUID) TO authenticated;
