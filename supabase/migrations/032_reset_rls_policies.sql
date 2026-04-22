-- ============================================================
-- 032_reset_rls_policies.sql
-- Rebuilds every RLS policy that depends on workspace/organization
-- identity. Environments where 026 was partially applied still carry
-- policies that reference:
--   * workspace_id (now renamed to organization_id) — silently false
--   * is_workspace_member() helper (no longer exists)
-- which makes organizations invisible to owners in the UI.
--
-- Safe to re-run: every policy is DROP IF EXISTS + CREATE POLICY.
-- Every helper is CREATE OR REPLACE.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- Helpers (ensure both old and new helpers coexist safely).
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_organization_member(p_organization_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.memberships
        WHERE organization_id = p_organization_id
          AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_organization_owner(p_organization_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.memberships
        WHERE organization_id = p_organization_id
          AND user_id = auth.uid()
          AND role = 'owner'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_organization_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_organization_owner(UUID) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- Drop every known variant of each policy (old + new names).
-- Policies must be dropped before the legacy helpers they depend on.
-- ───────────────────────────────────────────────────────────

-- memberships
DROP POLICY IF EXISTS "Users can view own memberships" ON public.memberships;
DROP POLICY IF EXISTS "Members can view co-members" ON public.memberships;
DROP POLICY IF EXISTS "Owners can manage memberships" ON public.memberships;

-- organizations (post-rename)
DROP POLICY IF EXISTS "Members can view organization" ON public.organizations;
DROP POLICY IF EXISTS "Owners/admins can update organization" ON public.organizations;
DROP POLICY IF EXISTS "Members can view workspace" ON public.organizations;
DROP POLICY IF EXISTS "Owners/admins can update workspace" ON public.organizations;

-- meta_tokens
DROP POLICY IF EXISTS "Members can view token metadata" ON public.meta_tokens;
DROP POLICY IF EXISTS "Owners/admins can manage tokens" ON public.meta_tokens;

-- api_keys
DROP POLICY IF EXISTS "Members can view workspace api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Members can view organization api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Owners/admins can manage api_keys" ON public.api_keys;

-- subscriptions
DROP POLICY IF EXISTS "Members can view subscription" ON public.subscriptions;

-- usage_logs
DROP POLICY IF EXISTS "Members can view workspace usage" ON public.usage_logs;
DROP POLICY IF EXISTS "Members can view organization usage" ON public.usage_logs;

-- business_managers
DROP POLICY IF EXISTS "Members can view business managers" ON public.business_managers;
DROP POLICY IF EXISTS "Owners/admins can manage business managers" ON public.business_managers;

-- ad_accounts
DROP POLICY IF EXISTS "Members can view ad accounts" ON public.ad_accounts;
DROP POLICY IF EXISTS "Owners/admins can manage ad accounts" ON public.ad_accounts;

-- oauth_connections
DROP POLICY IF EXISTS "Members can view oauth connections" ON public.oauth_connections;
DROP POLICY IF EXISTS "Owners/admins can manage oauth connections" ON public.oauth_connections;

-- ad_images
DROP POLICY IF EXISTS "Members can view workspace images" ON public.ad_images;
DROP POLICY IF EXISTS "Members can view organization images" ON public.ad_images;
DROP POLICY IF EXISTS "Owners/admins can manage images" ON public.ad_images;

-- projects
DROP POLICY IF EXISTS "Members can view projects" ON public.projects;
DROP POLICY IF EXISTS "Owners/admins can manage projects" ON public.projects;

-- requests.integration_requests
DROP POLICY IF EXISTS "Members can view integration requests in workspace" ON requests.integration_requests;
DROP POLICY IF EXISTS "Members can view integration requests in organization" ON requests.integration_requests;
DROP POLICY IF EXISTS "Members can insert own integration requests" ON requests.integration_requests;
DROP POLICY IF EXISTS "Owners and admins can update integration requests in workspace" ON requests.integration_requests;
DROP POLICY IF EXISTS "Owners and admins can update integration requests" ON requests.integration_requests;

-- analytics.sites + downstream
DROP POLICY IF EXISTS "sites_read_members" ON analytics.sites;
DROP POLICY IF EXISTS "sites_write_admins" ON analytics.sites;
DROP POLICY IF EXISTS "custom_events_read_members" ON analytics.custom_events;
DROP POLICY IF EXISTS "user_profiles_read_members" ON analytics.user_profiles;
DROP POLICY IF EXISTS "goals_read_members" ON analytics.goals;
DROP POLICY IF EXISTS "goals_write_admins" ON analytics.goals;
DROP POLICY IF EXISTS "funnels_read_members" ON analytics.funnels;
DROP POLICY IF EXISTS "funnels_write_admins" ON analytics.funnels;

-- ───────────────────────────────────────────────────────────
-- Now that no policy references them, drop the legacy helpers.
-- ───────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.is_workspace_member(UUID);
DROP FUNCTION IF EXISTS public.is_workspace_owner(UUID);

-- ───────────────────────────────────────────────────────────
-- Recreate with the organization-aware helpers.
-- ───────────────────────────────────────────────────────────

-- memberships
CREATE POLICY "Users can view own memberships"
    ON public.memberships FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Members can view co-members"
    ON public.memberships FOR SELECT
    USING (user_id = auth.uid() OR public.is_organization_member(organization_id));

CREATE POLICY "Owners can manage memberships"
    ON public.memberships FOR ALL
    USING (public.is_organization_owner(organization_id));

-- organizations
CREATE POLICY "Members can view organization"
    ON public.organizations FOR SELECT
    USING (public.is_organization_member(id));

CREATE POLICY "Owners/admins can update organization"
    ON public.organizations FOR UPDATE
    USING (public.is_organization_owner(id));

-- meta_tokens
CREATE POLICY "Members can view token metadata"
    ON public.meta_tokens FOR SELECT
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Owners/admins can manage tokens"
    ON public.meta_tokens FOR ALL
    USING (public.is_organization_owner(organization_id));

-- api_keys
CREATE POLICY "Members can view organization api_keys"
    ON public.api_keys FOR SELECT
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Owners/admins can manage api_keys"
    ON public.api_keys FOR ALL
    USING (public.is_organization_owner(organization_id));

-- subscriptions
CREATE POLICY "Members can view subscription"
    ON public.subscriptions FOR SELECT
    USING (public.is_organization_member(organization_id));

-- usage_logs
CREATE POLICY "Members can view organization usage"
    ON public.usage_logs FOR SELECT
    USING (public.is_organization_member(organization_id));

-- business_managers
CREATE POLICY "Members can view business managers"
    ON public.business_managers FOR SELECT
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Owners/admins can manage business managers"
    ON public.business_managers FOR ALL
    USING (public.is_organization_owner(organization_id));

-- ad_accounts
CREATE POLICY "Members can view ad accounts"
    ON public.ad_accounts FOR SELECT
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Owners/admins can manage ad accounts"
    ON public.ad_accounts FOR ALL
    USING (public.is_organization_owner(organization_id));

-- oauth_connections
CREATE POLICY "Members can view oauth connections"
    ON public.oauth_connections FOR SELECT
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Owners/admins can manage oauth connections"
    ON public.oauth_connections FOR ALL
    USING (public.is_organization_owner(organization_id));

-- ad_images
CREATE POLICY "Members can view organization images"
    ON public.ad_images FOR SELECT
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Owners/admins can manage images"
    ON public.ad_images FOR ALL
    USING (public.is_organization_owner(organization_id));

-- projects
CREATE POLICY "Members can view projects"
    ON public.projects FOR SELECT
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Owners/admins can manage projects"
    ON public.projects FOR ALL
    USING (public.is_organization_owner(organization_id));

-- requests.integration_requests
CREATE POLICY "Members can view integration requests in organization"
    ON requests.integration_requests FOR SELECT TO authenticated
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Members can insert own integration requests"
    ON requests.integration_requests FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.is_organization_member(organization_id));

CREATE POLICY "Owners and admins can update integration requests"
    ON requests.integration_requests FOR UPDATE TO authenticated
    USING (public.is_organization_owner(organization_id))
    WITH CHECK (public.is_organization_owner(organization_id));

-- analytics.sites
CREATE POLICY "sites_read_members" ON analytics.sites FOR SELECT
    USING (public.is_organization_member(organization_id));

CREATE POLICY "sites_write_admins" ON analytics.sites FOR ALL
    USING (public.is_organization_owner(organization_id));

-- analytics.custom_events
CREATE POLICY "custom_events_read_members" ON analytics.custom_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            WHERE s.id = custom_events.site_id
              AND public.is_organization_member(s.organization_id)
        )
    );

-- analytics.user_profiles
CREATE POLICY "user_profiles_read_members" ON analytics.user_profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            WHERE s.id = user_profiles.site_id
              AND public.is_organization_member(s.organization_id)
        )
    );

-- analytics.goals
CREATE POLICY "goals_read_members" ON analytics.goals FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            WHERE s.id = goals.site_id
              AND public.is_organization_member(s.organization_id)
        )
    );

CREATE POLICY "goals_write_admins" ON analytics.goals FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            WHERE s.id = goals.site_id
              AND public.is_organization_owner(s.organization_id)
        )
    );

-- analytics.funnels
CREATE POLICY "funnels_read_members" ON analytics.funnels FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            WHERE s.id = funnels.site_id
              AND public.is_organization_member(s.organization_id)
        )
    );

CREATE POLICY "funnels_write_admins" ON analytics.funnels FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            WHERE s.id = funnels.site_id
              AND public.is_organization_owner(s.organization_id)
        )
    );
