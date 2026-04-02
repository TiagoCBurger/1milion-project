-- ============================================================
-- Business Managers & Ad Accounts
-- Stores BMs and their ad accounts after Facebook OAuth
-- ============================================================

CREATE TABLE public.business_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    meta_bm_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, meta_bm_id)
);

CREATE INDEX idx_business_managers_workspace
    ON public.business_managers(workspace_id);

CREATE TABLE public.ad_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_manager_id UUID NOT NULL REFERENCES public.business_managers(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    meta_account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    account_status INT,
    currency TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, meta_account_id)
);

CREATE INDEX idx_ad_accounts_bm
    ON public.ad_accounts(business_manager_id);

CREATE INDEX idx_ad_accounts_workspace
    ON public.ad_accounts(workspace_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.business_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;

-- business_managers
CREATE POLICY "Members can view business managers"
    ON public.business_managers FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = business_managers.workspace_id
              AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins can manage business managers"
    ON public.business_managers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = business_managers.workspace_id
              AND memberships.user_id = auth.uid()
              AND memberships.role IN ('owner', 'admin')
        )
    );

-- ad_accounts
CREATE POLICY "Members can view ad accounts"
    ON public.ad_accounts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = ad_accounts.workspace_id
              AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins can manage ad accounts"
    ON public.ad_accounts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = ad_accounts.workspace_id
              AND memberships.user_id = auth.uid()
              AND memberships.role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- FUNCTION: Sync BMs and ad accounts after OAuth
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_business_managers(
    p_workspace_id UUID,
    p_business_managers JSONB
) RETURNS void AS $$
BEGIN
    -- Remove old BMs and ad accounts (CASCADE deletes ad_accounts)
    DELETE FROM public.business_managers
    WHERE workspace_id = p_workspace_id;

    -- Insert BMs
    INSERT INTO public.business_managers (workspace_id, meta_bm_id, name)
    SELECT
        p_workspace_id,
        bm->>'id',
        bm->>'name'
    FROM jsonb_array_elements(p_business_managers) AS bm;

    -- Insert ad accounts for each BM
    INSERT INTO public.ad_accounts (business_manager_id, workspace_id, meta_account_id, name, account_status, currency)
    SELECT
        bm_row.id,
        p_workspace_id,
        acc->>'id',
        acc->>'name',
        (acc->>'account_status')::INT,
        acc->>'currency'
    FROM jsonb_array_elements(p_business_managers) AS bm
    JOIN public.business_managers bm_row
        ON bm_row.workspace_id = p_workspace_id
        AND bm_row.meta_bm_id = bm->>'id'
    CROSS JOIN jsonb_array_elements(COALESCE(bm->'ad_accounts', '[]'::jsonb)) AS acc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
