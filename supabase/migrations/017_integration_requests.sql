-- ============================================================
-- Integration requests (schema separado de public)
-- Escrita pelo app: função public.create_integration_request (RPC).
-- Leitura direta pela API: opcionalmente expor o schema "requests" em
-- Settings → API → Exposed schemas (RLS continua valendo).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS requests;

REVOKE ALL ON SCHEMA requests FROM PUBLIC;

CREATE TABLE requests.integration_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    integration_name TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'reviewed', 'declined', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT integration_requests_name_not_blank CHECK (length(trim(integration_name)) > 0)
);

CREATE INDEX idx_integration_requests_workspace_created
    ON requests.integration_requests(workspace_id, created_at DESC);

COMMENT ON TABLE requests.integration_requests IS
    'Pedidos de novas integrações por workspace; RLS restringe por membership.';

ALTER TABLE requests.integration_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view integration requests in workspace"
    ON requests.integration_requests
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.workspace_id = integration_requests.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Members can insert own integration requests"
    ON requests.integration_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.workspace_id = integration_requests.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners and admins can update integration requests in workspace"
    ON requests.integration_requests
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.workspace_id = integration_requests.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.memberships m
            WHERE m.workspace_id = integration_requests.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

GRANT USAGE ON SCHEMA requests TO authenticated;
GRANT USAGE ON SCHEMA requests TO service_role;

GRANT SELECT, INSERT ON requests.integration_requests TO authenticated;
GRANT ALL ON requests.integration_requests TO service_role;

-- Inserção via RPC: não exige expor o schema "requests" no PostgREST; valida membership no servidor.
CREATE OR REPLACE FUNCTION public.create_integration_request(
    p_slug text,
    p_integration_name text,
    p_details text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, requests
AS $$
DECLARE
    v_workspace_id uuid;
    v_user_id uuid;
    v_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    IF p_integration_name IS NULL OR length(trim(p_integration_name)) = 0 THEN
        RAISE EXCEPTION 'integration_name required';
    END IF;

    SELECT w.id INTO v_workspace_id
    FROM public.workspaces w
    INNER JOIN public.memberships m ON m.workspace_id = w.id AND m.user_id = v_user_id
    WHERE w.slug = trim(p_slug);

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace not found';
    END IF;

    INSERT INTO requests.integration_requests (
        workspace_id,
        user_id,
        integration_name,
        details
    )
    VALUES (
        v_workspace_id,
        v_user_id,
        left(trim(p_integration_name), 500),
        CASE
            WHEN p_details IS NOT NULL AND length(trim(p_details)) > 0
            THEN left(trim(p_details), 8000)
            ELSE NULL
        END
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_integration_request(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_integration_request(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_integration_request(text, text, text) TO service_role;
