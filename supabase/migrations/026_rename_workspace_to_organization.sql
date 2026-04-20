-- ============================================================
-- 026_rename_workspace_to_organization.sql
-- Pure rename: workspaces → organizations, workspace_id → organization_id
-- across every live table, RLS helper, policy, index, and RPC.
-- No data migration or semantic change. Safe to re-apply (idempotent
-- where possible).
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 1: drop RLS policies that reference "workspace" in name
-- or rely on the is_workspace_* helpers / workspace_id columns
-- ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own memberships" ON public.memberships;
DROP POLICY IF EXISTS "Members can view co-members" ON public.memberships;
DROP POLICY IF EXISTS "Owners can manage memberships" ON public.memberships;

DROP POLICY IF EXISTS "Members can view workspace" ON public.workspaces;
DROP POLICY IF EXISTS "Owners/admins can update workspace" ON public.workspaces;

DROP POLICY IF EXISTS "Members can view token metadata" ON public.meta_tokens;
DROP POLICY IF EXISTS "Owners/admins can manage tokens" ON public.meta_tokens;

DROP POLICY IF EXISTS "Members can view workspace api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Owners/admins can manage api_keys" ON public.api_keys;

DROP POLICY IF EXISTS "Members can view subscription" ON public.subscriptions;

DROP POLICY IF EXISTS "Members can view workspace usage" ON public.usage_logs;

DROP POLICY IF EXISTS "Members can view business managers" ON public.business_managers;
DROP POLICY IF EXISTS "Owners/admins can manage business managers" ON public.business_managers;

DROP POLICY IF EXISTS "Members can view ad accounts" ON public.ad_accounts;
DROP POLICY IF EXISTS "Owners/admins can manage ad accounts" ON public.ad_accounts;

DROP POLICY IF EXISTS "Members can view oauth connections" ON public.oauth_connections;
DROP POLICY IF EXISTS "Owners/admins can manage oauth connections" ON public.oauth_connections;

DROP POLICY IF EXISTS "Members can view workspace images" ON public.ad_images;
DROP POLICY IF EXISTS "Owners/admins can manage images" ON public.ad_images;

DROP POLICY IF EXISTS "Members can view integration requests in workspace" ON requests.integration_requests;
DROP POLICY IF EXISTS "Members can insert own integration requests" ON requests.integration_requests;
DROP POLICY IF EXISTS "Owners and admins can update integration requests in workspace" ON requests.integration_requests;

DROP POLICY IF EXISTS "sites_read_members" ON analytics.sites;
DROP POLICY IF EXISTS "sites_write_admins" ON analytics.sites;
DROP POLICY IF EXISTS "custom_events_read_members" ON analytics.custom_events;
DROP POLICY IF EXISTS "user_profiles_read_members" ON analytics.user_profiles;
DROP POLICY IF EXISTS "goals_read_members" ON analytics.goals;
DROP POLICY IF EXISTS "goals_write_admins" ON analytics.goals;
DROP POLICY IF EXISTS "funnels_read_members" ON analytics.funnels;
DROP POLICY IF EXISTS "funnels_write_admins" ON analytics.funnels;

-- ───────────────────────────────────────────────────────────
-- STEP 2: drop RPCs that reference workspace tables/columns.
-- Function bodies hold literal identifiers, so rename alone
-- is not enough — we CREATE OR REPLACE below with new bodies.
-- ───────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.create_workspace(TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.validate_api_key(TEXT);
DROP FUNCTION IF EXISTS public.get_workspace_context(UUID);
DROP FUNCTION IF EXISTS public.upsert_oauth_connection(UUID, TEXT, TEXT, UUID, TEXT[]);
DROP FUNCTION IF EXISTS public.get_oauth_connection(UUID, TEXT);
DROP FUNCTION IF EXISTS public.sync_business_managers(UUID, JSONB);
DROP FUNCTION IF EXISTS public.reconcile_ad_account_plan_limits(UUID);
DROP FUNCTION IF EXISTS public.encrypt_meta_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.decrypt_meta_token(UUID, TEXT);
DROP FUNCTION IF EXISTS public.generate_api_key(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.create_integration_request(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.is_workspace_member(UUID);
DROP FUNCTION IF EXISTS public.is_workspace_owner(UUID);

DROP FUNCTION IF EXISTS analytics.get_site_by_public_key(TEXT);

-- ───────────────────────────────────────────────────────────
-- STEP 3: rename table and columns (workspace_id → organization_id)
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.workspaces RENAME TO organizations;

ALTER TABLE public.memberships          RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE public.meta_tokens          RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE public.api_keys             RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE public.subscriptions        RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE public.usage_logs           RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE public.business_managers    RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE public.ad_accounts          RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE public.oauth_connections    RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE public.billing_events       RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE public.ad_images            RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE public.email_events         RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE requests.integration_requests RENAME COLUMN workspace_id TO organization_id;
ALTER TABLE analytics.sites             RENAME COLUMN workspace_id TO organization_id;

-- ───────────────────────────────────────────────────────────
-- STEP 4: rename indexes for consistency
-- ───────────────────────────────────────────────────────────

ALTER INDEX IF EXISTS idx_usage_logs_workspace_created     RENAME TO idx_usage_logs_organization_created;
ALTER INDEX IF EXISTS idx_business_managers_workspace      RENAME TO idx_business_managers_organization;
ALTER INDEX IF EXISTS idx_ad_accounts_workspace            RENAME TO idx_ad_accounts_organization;
ALTER INDEX IF EXISTS idx_oauth_connections_workspace      RENAME TO idx_oauth_connections_organization;
ALTER INDEX IF EXISTS idx_billing_events_workspace         RENAME TO idx_billing_events_organization;
ALTER INDEX IF EXISTS idx_ad_images_workspace              RENAME TO idx_ad_images_organization;
ALTER INDEX IF EXISTS idx_email_events_workspace           RENAME TO idx_email_events_organization;
ALTER INDEX IF EXISTS idx_integration_requests_workspace_created
                                                           RENAME TO idx_integration_requests_organization_created;
ALTER INDEX IF EXISTS idx_sites_workspace                  RENAME TO idx_sites_organization;

-- ───────────────────────────────────────────────────────────
-- STEP 5: recreate helper functions with organization_* names
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
-- STEP 6: recreate RLS policies using new helper names
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

-- ───────────────────────────────────────────────────────────
-- STEP 7: recreate RPCs with organization_id signatures/bodies.
-- create_organization below is the intermediate form (no
-- project creation). Migration 030 replaces it with the final
-- version that also seeds the Default project.
-- ───────────────────────────────────────────────────────────

-- Token encryption
CREATE OR REPLACE FUNCTION public.encrypt_meta_token(
    p_organization_id UUID,
    p_token TEXT,
    p_encryption_key TEXT,
    p_token_type TEXT DEFAULT 'long_lived',
    p_meta_user_id TEXT DEFAULT NULL,
    p_scopes TEXT[] DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.meta_tokens (
        organization_id, encrypted_token, token_type, meta_user_id, scopes, expires_at, is_valid, last_validated_at
    ) VALUES (
        p_organization_id,
        pgp_sym_encrypt(p_token, p_encryption_key),
        p_token_type,
        p_meta_user_id,
        p_scopes,
        p_expires_at,
        true,
        now()
    )
    ON CONFLICT (organization_id) DO UPDATE SET
        encrypted_token = pgp_sym_encrypt(p_token, p_encryption_key),
        token_type = EXCLUDED.token_type,
        meta_user_id = EXCLUDED.meta_user_id,
        scopes = EXCLUDED.scopes,
        expires_at = EXCLUDED.expires_at,
        is_valid = true,
        last_validated_at = now(),
        updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrypt_meta_token(
    p_organization_id UUID,
    p_encryption_key TEXT
) RETURNS TEXT AS $$
DECLARE
    v_token TEXT;
BEGIN
    SELECT pgp_sym_decrypt(encrypted_token, p_encryption_key)
    INTO v_token
    FROM public.meta_tokens
    WHERE organization_id = p_organization_id
      AND is_valid = true
      AND (expires_at IS NULL OR expires_at > now());
    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- API key generation
CREATE OR REPLACE FUNCTION public.generate_api_key(
    p_organization_id UUID,
    p_created_by UUID,
    p_name TEXT DEFAULT 'Default'
) RETURNS TABLE(id UUID, raw_key TEXT, key_prefix TEXT) AS $$
DECLARE
    v_id UUID;
    v_raw_key TEXT;
    v_prefix TEXT;
BEGIN
    v_raw_key := 'mads_' || encode(gen_random_bytes(24), 'hex');
    v_prefix := substring(v_raw_key, 1, 12);

    INSERT INTO public.api_keys (organization_id, created_by, key_hash, key_prefix, name)
    VALUES (
        p_organization_id,
        p_created_by,
        crypt(v_raw_key, gen_salt('bf')),
        v_prefix,
        p_name
    )
    RETURNING api_keys.id INTO v_id;

    RETURN QUERY SELECT v_id, v_raw_key, v_prefix;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- API key validation (tier-aligned limits, matches migration 022 shape)
CREATE OR REPLACE FUNCTION public.validate_api_key(
    p_api_key TEXT
) RETURNS TABLE(
    organization_id UUID,
    api_key_id UUID,
    tier subscription_tier,
    requests_per_minute INT,
    requests_per_hour INT,
    requests_per_day INT,
    max_mcp_connections INT,
    max_ad_accounts INT,
    enable_meta_mutations BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ak.organization_id,
        ak.id AS api_key_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_minute, 0),
        COALESCE(s.requests_per_hour, 0),
        COALESCE(s.requests_per_day, 0),
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_mcp_connections, -1)
        END,
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_ad_accounts, -1)
        END,
        o.enable_meta_mutations
    FROM public.api_keys ak
    INNER JOIN public.organizations o ON o.id = ak.organization_id
    LEFT JOIN public.subscriptions s
        ON s.organization_id = ak.organization_id
        AND s.status = 'active'
    WHERE ak.key_hash = crypt(p_api_key, ak.key_hash)
      AND ak.is_active = true
      AND (ak.expires_at IS NULL OR ak.expires_at > now());

    UPDATE public.api_keys
    SET last_used_at = now()
    WHERE key_hash = crypt(p_api_key, key_hash)
      AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.validate_api_key(TEXT) TO service_role;

-- get_organization_context
CREATE OR REPLACE FUNCTION public.get_organization_context(
    p_organization_id UUID
) RETURNS TABLE(
    organization_id UUID,
    tier subscription_tier,
    requests_per_minute INT,
    requests_per_hour INT,
    requests_per_day INT,
    max_mcp_connections INT,
    max_ad_accounts INT,
    enable_meta_mutations BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id AS organization_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_minute, 0),
        COALESCE(s.requests_per_hour, 0),
        COALESCE(s.requests_per_day, 0),
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_mcp_connections, -1)
        END,
        CASE COALESCE(s.tier, 'free'::subscription_tier)
            WHEN 'free' THEN 0
            WHEN 'pro' THEN 1
            WHEN 'max' THEN 5
            ELSE COALESCE(s.max_ad_accounts, -1)
        END,
        o.enable_meta_mutations
    FROM public.organizations o
    LEFT JOIN public.subscriptions s
        ON s.organization_id = o.id
        AND s.status = 'active'
    WHERE o.id = p_organization_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_organization_context(UUID) TO service_role;

-- OAuth connections (still keyed by allowed_accounts — 029 adds allowed_projects)
CREATE OR REPLACE FUNCTION public.upsert_oauth_connection(
    p_organization_id UUID,
    p_client_id TEXT,
    p_client_name TEXT,
    p_user_id UUID,
    p_allowed_accounts TEXT[]
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.oauth_connections (
        organization_id, client_id, client_name, user_id, allowed_accounts, is_active, granted_at
    ) VALUES (
        p_organization_id, p_client_id, p_client_name, p_user_id, p_allowed_accounts, true, now()
    )
    ON CONFLICT (organization_id, client_id) DO UPDATE SET
        client_name = EXCLUDED.client_name,
        user_id = EXCLUDED.user_id,
        allowed_accounts = EXCLUDED.allowed_accounts,
        is_active = true,
        granted_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_oauth_connection(
    p_organization_id UUID,
    p_client_id TEXT
) RETURNS TABLE (
    connection_id UUID,
    is_active BOOLEAN,
    allowed_accounts TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT oc.id, oc.is_active, oc.allowed_accounts
    FROM public.oauth_connections oc
    WHERE oc.organization_id = p_organization_id
      AND oc.client_id = p_client_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.upsert_oauth_connection TO service_role;
GRANT EXECUTE ON FUNCTION public.get_oauth_connection TO service_role;

-- Business managers sync
CREATE OR REPLACE FUNCTION public.sync_business_managers(
    p_organization_id UUID,
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
        is_enabled
    )
    SELECT
        bm_row.id,
        p_organization_id,
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
        ON bm_row.organization_id = p_organization_id
        AND bm_row.meta_bm_id = bm->>'id'
    CROSS JOIN jsonb_array_elements(COALESCE(bm->'ad_accounts', '[]'::jsonb)) AS acc;

    PERFORM public.reconcile_ad_account_plan_limits(p_organization_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Plan caps reconciler
CREATE OR REPLACE FUNCTION public.reconcile_ad_account_plan_limits(p_organization_id UUID)
RETURNS void AS $$
DECLARE
    v_max INT;
BEGIN
    SELECT COALESCE(s.max_ad_accounts, 0) INTO v_max
    FROM public.organizations o
    LEFT JOIN public.subscriptions s
        ON s.organization_id = o.id AND s.status = 'active'
    WHERE o.id = p_organization_id;

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
        WHERE organization_id = p_organization_id;
        RETURN;
    END IF;

    UPDATE public.ad_accounts a
    SET is_enabled = false
    WHERE a.organization_id = p_organization_id
      AND a.is_enabled = true
      AND a.id NOT IN (
          SELECT id FROM public.ad_accounts
          WHERE organization_id = p_organization_id AND is_enabled = true
          ORDER BY meta_account_id ASC
          LIMIT v_max
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Intermediate create_organization (replaced by migration 030)
CREATE OR REPLACE FUNCTION public.create_organization(
    p_name TEXT,
    p_slug TEXT,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_organization_id UUID;
BEGIN
    INSERT INTO public.organizations (name, slug)
    VALUES (p_name, p_slug)
    RETURNING id INTO v_organization_id;

    INSERT INTO public.memberships (user_id, organization_id, role)
    VALUES (p_user_id, v_organization_id, 'owner');

    INSERT INTO public.subscriptions (
        organization_id, tier, status,
        requests_per_hour, requests_per_day,
        max_mcp_connections, max_ad_accounts
    )
    VALUES (v_organization_id, 'free', 'active', 0, 0, 0, 0);

    RETURN v_organization_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Integration requests RPC
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
    v_organization_id uuid;
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

    SELECT o.id INTO v_organization_id
    FROM public.organizations o
    INNER JOIN public.memberships m ON m.organization_id = o.id AND m.user_id = v_user_id
    WHERE o.slug = trim(p_slug);

    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'organization not found';
    END IF;

    INSERT INTO requests.integration_requests (
        organization_id,
        user_id,
        integration_name,
        details
    )
    VALUES (
        v_organization_id,
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

-- analytics.get_site_by_public_key: organization_id in return type
CREATE FUNCTION analytics.get_site_by_public_key(
    p_public_key TEXT
) RETURNS TABLE (
    id UUID,
    organization_id UUID,
    domain TEXT,
    is_active BOOLEAN,
    block_bots BOOLEAN,
    track_outbound BOOLEAN,
    track_performance BOOLEAN,
    excluded_ips TEXT[],
    excluded_countries TEXT[],
    pixel_id TEXT,
    capi_encrypted_token TEXT,
    has_capi_token BOOLEAN
) AS $$
    SELECT
        s.id,
        s.organization_id,
        s.domain,
        s.is_active,
        s.block_bots,
        s.track_outbound,
        s.track_performance,
        s.excluded_ips,
        s.excluded_countries,
        s.pixel_id,
        s.capi_encrypted_token::TEXT,
        s.capi_encrypted_token IS NOT NULL AS has_capi_token
    FROM analytics.sites s
    WHERE s.public_key = p_public_key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION analytics.get_site_by_public_key(TEXT) TO service_role;
