-- ============================================================
-- Ad Images - persistent storage for uploaded image metadata
-- ============================================================

CREATE TABLE public.ad_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    image_hash TEXT NOT NULL,
    r2_key TEXT,
    r2_url TEXT,
    file_name TEXT NOT NULL,
    file_size INT,
    content_type TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_images_workspace
    ON public.ad_images(workspace_id, created_at DESC);

CREATE UNIQUE INDEX idx_ad_images_hash_account
    ON public.ad_images(workspace_id, account_id, image_hash);

-- RLS
ALTER TABLE public.ad_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace images"
    ON public.ad_images FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = ad_images.workspace_id
              AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins can manage images"
    ON public.ad_images FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = ad_images.workspace_id
              AND memberships.user_id = auth.uid()
              AND memberships.role IN ('owner', 'admin')
        )
    );

-- Grant service_role full access
GRANT ALL ON public.ad_images TO service_role;
