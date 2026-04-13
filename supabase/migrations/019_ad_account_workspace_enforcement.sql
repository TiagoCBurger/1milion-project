-- ============================================================
-- Workspace ad accounts: plan caps + sync preservation
-- ============================================================
-- - New ad accounts default to disabled until explicitly enabled
--   or within plan limit after reconcile.
-- - sync_business_managers preserves is_enabled for meta_account_id
--   still present after re-sync, then applies plan cap.
-- - reconcile_ad_account_plan_limits enforces max_ad_accounts from
--   the active subscription (-1 = unlimited).

ALTER TABLE public.ad_accounts
    ALTER COLUMN is_enabled SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.reconcile_ad_account_plan_limits(p_workspace_id UUID)
RETURNS void AS $$
DECLARE
    v_max INT;
BEGIN
    SELECT COALESCE(s.max_ad_accounts, 0) INTO v_max
    FROM public.workspaces w
    LEFT JOIN public.subscriptions s
        ON s.workspace_id = w.id AND s.status = 'active'
    WHERE w.id = p_workspace_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_max IS NULL THEN
        v_max := 0;
    END IF;

    IF v_max = -1 THEN
        RETURN;
    END IF;

    IF v_max <= 0 THEN
        UPDATE public.ad_accounts
        SET is_enabled = false
        WHERE workspace_id = p_workspace_id;
        RETURN;
    END IF;

    UPDATE public.ad_accounts a
    SET is_enabled = false
    WHERE a.workspace_id = p_workspace_id
      AND a.is_enabled = true
      AND a.id NOT IN (
          SELECT id FROM public.ad_accounts
          WHERE workspace_id = p_workspace_id AND is_enabled = true
          ORDER BY meta_account_id ASC
          LIMIT v_max
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sync_business_managers(
    p_workspace_id UUID,
    p_business_managers JSONB
) RETURNS void AS $$
DECLARE
    preserved_enabled TEXT[];
BEGIN
    SELECT COALESCE(
        array_agg(meta_account_id) FILTER (WHERE is_enabled),
        ARRAY[]::TEXT[]
    )
    INTO preserved_enabled
    FROM public.ad_accounts
    WHERE workspace_id = p_workspace_id;

    DELETE FROM public.business_managers
    WHERE workspace_id = p_workspace_id;

    INSERT INTO public.business_managers (workspace_id, meta_bm_id, name)
    SELECT
        p_workspace_id,
        bm->>'id',
        bm->>'name'
    FROM jsonb_array_elements(p_business_managers) AS bm;

    INSERT INTO public.ad_accounts (
        business_manager_id,
        workspace_id,
        meta_account_id,
        name,
        account_status,
        currency,
        is_enabled
    )
    SELECT
        bm_row.id,
        p_workspace_id,
        acc->>'id',
        acc->>'name',
        (acc->>'account_status')::INT,
        acc->>'currency',
        CASE
            WHEN (acc->>'id') = ANY(preserved_enabled) THEN true
            ELSE false
        END
    FROM jsonb_array_elements(p_business_managers) AS bm
    JOIN public.business_managers bm_row
        ON bm_row.workspace_id = p_workspace_id
        AND bm_row.meta_bm_id = bm->>'id'
    CROSS JOIN jsonb_array_elements(COALESCE(bm->'ad_accounts', '[]'::jsonb)) AS acc;

    PERFORM public.reconcile_ad_account_plan_limits(p_workspace_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply plan caps to existing workspaces (enterprise -1 unchanged)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id AS workspace_id FROM public.workspaces LOOP
        PERFORM public.reconcile_ad_account_plan_limits(r.workspace_id);
    END LOOP;
END $$;
