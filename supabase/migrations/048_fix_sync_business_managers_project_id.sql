-- Migration 028 added ad_accounts.project_id NOT NULL, but
-- sync_business_managers (recreated in 033) never inserted it,
-- so every Meta connection since 028 silently failed with a
-- 23502 NOT NULL violation, leaving business_managers and
-- ad_accounts empty for the org.
--
-- Recreate the RPC to:
--   * Preserve each ad account's existing project_id mapping
--     (so re-syncs don't yank manual project assignments back
--     to the default project).
--   * Fall back to the org's default project for new accounts.
--   * Bail with a clear error if the org has no default project.

DROP FUNCTION IF EXISTS public.sync_business_managers(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.sync_business_managers(
    p_organization_id UUID,
    p_business_managers JSONB
) RETURNS void AS $$
DECLARE
    v_default_project_id UUID;
BEGIN
    SELECT id INTO v_default_project_id
    FROM public.projects
    WHERE organization_id = p_organization_id
      AND is_default = true
    LIMIT 1;

    IF v_default_project_id IS NULL THEN
        RAISE EXCEPTION 'organization % has no default project', p_organization_id;
    END IF;

    CREATE TEMP TABLE _preserved_accounts ON COMMIT DROP AS
    SELECT meta_account_id, project_id, is_enabled
    FROM public.ad_accounts
    WHERE organization_id = p_organization_id;

    DELETE FROM public.business_managers
    WHERE organization_id = p_organization_id;

    INSERT INTO public.business_managers (organization_id, meta_bm_id, name)
    SELECT
        p_organization_id,
        bm->>'id',
        bm->>'name'
    FROM jsonb_array_elements(p_business_managers) AS bm;

    INSERT INTO public.ad_accounts (
        business_manager_id,
        organization_id,
        meta_account_id,
        name,
        account_status,
        currency,
        is_enabled,
        project_id
    )
    SELECT
        bm_row.id,
        p_organization_id,
        acc->>'id',
        acc->>'name',
        (acc->>'account_status')::INT,
        acc->>'currency',
        COALESCE(prev.is_enabled, false),
        COALESCE(prev.project_id, v_default_project_id)
    FROM jsonb_array_elements(p_business_managers) AS bm
    JOIN public.business_managers bm_row
        ON bm_row.organization_id = p_organization_id
        AND bm_row.meta_bm_id = bm->>'id'
    CROSS JOIN jsonb_array_elements(COALESCE(bm->'ad_accounts', '[]'::jsonb)) AS acc
    LEFT JOIN _preserved_accounts prev
        ON prev.meta_account_id = acc->>'id';

    DROP TABLE IF EXISTS _preserved_accounts;

    PERFORM public.reconcile_ad_account_plan_limits(p_organization_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.sync_business_managers(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_business_managers(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.sync_business_managers(UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_business_managers(UUID, JSONB) TO service_role;
