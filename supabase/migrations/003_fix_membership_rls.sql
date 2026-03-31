-- Fix: "Members can view co-members" causes infinite recursion
-- because it queries memberships from within a memberships policy.

-- Drop the recursive policies
DROP POLICY "Members can view co-members" ON public.memberships;
DROP POLICY "Owners can manage memberships" ON public.memberships;

-- Helper function to check membership without triggering RLS (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.memberships
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_workspace_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.memberships
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
          AND role = 'owner'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Re-create co-members policy using the helper function (no recursion)
CREATE POLICY "Members can view co-members"
    ON public.memberships FOR SELECT
    USING (
        user_id = auth.uid()
        OR public.is_workspace_member(workspace_id)
    );

-- Re-create owners manage policy using the helper function
CREATE POLICY "Owners can manage memberships"
    ON public.memberships FOR ALL
    USING (public.is_workspace_owner(workspace_id));

-- Also fix workspace policies to use helper (avoids nested RLS on memberships)
DROP POLICY "Members can view workspace" ON public.workspaces;
CREATE POLICY "Members can view workspace"
    ON public.workspaces FOR SELECT
    USING (public.is_workspace_member(id));

DROP POLICY "Owners/admins can update workspace" ON public.workspaces;
CREATE POLICY "Owners/admins can update workspace"
    ON public.workspaces FOR UPDATE
    USING (public.is_workspace_owner(id));

-- Fix other tables that reference memberships in policies
DROP POLICY "Members can view token metadata" ON public.meta_tokens;
CREATE POLICY "Members can view token metadata"
    ON public.meta_tokens FOR SELECT
    USING (public.is_workspace_member(workspace_id));

DROP POLICY "Owners/admins can manage tokens" ON public.meta_tokens;
CREATE POLICY "Owners/admins can manage tokens"
    ON public.meta_tokens FOR ALL
    USING (public.is_workspace_owner(workspace_id));

DROP POLICY "Members can view workspace api_keys" ON public.api_keys;
CREATE POLICY "Members can view workspace api_keys"
    ON public.api_keys FOR SELECT
    USING (public.is_workspace_member(workspace_id));

DROP POLICY "Owners/admins can manage api_keys" ON public.api_keys;
CREATE POLICY "Owners/admins can manage api_keys"
    ON public.api_keys FOR ALL
    USING (public.is_workspace_owner(workspace_id));

DROP POLICY "Members can view subscription" ON public.subscriptions;
CREATE POLICY "Members can view subscription"
    ON public.subscriptions FOR SELECT
    USING (public.is_workspace_member(workspace_id));

DROP POLICY "Members can view workspace usage" ON public.usage_logs;
CREATE POLICY "Members can view workspace usage"
    ON public.usage_logs FOR SELECT
    USING (public.is_workspace_member(workspace_id));

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(UUID) TO authenticated;
