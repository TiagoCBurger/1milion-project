-- ============================================================
-- 033_recreate_rpcs_with_organization.sql
-- Recreates every public RPC that 026 was meant to rewrite.
-- In environments where 026 was tracked as applied but did not run,
-- these functions still have `p_workspace_id` parameters and bodies
-- referencing the old workspace_id column (which 028 already renamed
-- to organization_id). Calls fail with either:
--   * "Could not find the function … in the schema cache"
--   * "column workspace_id does not exist"
--
-- All statements use DROP FUNCTION IF EXISTS + CREATE OR REPLACE so
-- this migration is safe to re-run on a fully-migrated DB too.
-- ============================================================

-- Token encryption -------------------------------------------------

DROP FUNCTION IF EXISTS public.encrypt_meta_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ);

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

DROP FUNCTION IF EXISTS public.decrypt_meta_token(UUID, TEXT);

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

-- API key generation + validation ---------------------------------

DROP FUNCTION IF EXISTS public.generate_api_key(UUID, UUID, TEXT);

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

DROP FUNCTION IF EXISTS public.validate_api_key(TEXT);

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

-- Organization context --------------------------------------------

DROP FUNCTION IF EXISTS public.get_workspace_context(UUID);
DROP FUNCTION IF EXISTS public.get_organization_context(UUID);

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

-- Business managers sync + plan caps ------------------------------

DROP FUNCTION IF EXISTS public.sync_business_managers(UUID, JSONB);

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

DROP FUNCTION IF EXISTS public.reconcile_ad_account_plan_limits(UUID);

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

-- OAuth connections (mirrors 029; safe to re-apply) ---------------

DROP FUNCTION IF EXISTS public.upsert_oauth_connection(UUID, TEXT, TEXT, UUID, TEXT[]);
DROP FUNCTION IF EXISTS public.upsert_oauth_connection(UUID, TEXT, TEXT, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.upsert_oauth_connection(
    p_organization_id UUID,
    p_client_id TEXT,
    p_client_name TEXT,
    p_user_id UUID,
    p_allowed_projects UUID[]
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.oauth_connections (
        organization_id, client_id, client_name, user_id,
        allowed_projects, allowed_accounts,
        is_active, granted_at
    ) VALUES (
        p_organization_id, p_client_id, p_client_name, p_user_id,
        COALESCE(p_allowed_projects, ARRAY[]::uuid[]),
        NULL,
        true, now()
    )
    ON CONFLICT (organization_id, client_id) DO UPDATE SET
        client_name = EXCLUDED.client_name,
        user_id = EXCLUDED.user_id,
        allowed_projects = EXCLUDED.allowed_projects,
        is_active = true,
        granted_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.get_oauth_connection(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_oauth_connection(
    p_organization_id UUID,
    p_client_id TEXT
) RETURNS TABLE (
    connection_id UUID,
    is_active BOOLEAN,
    allowed_projects UUID[],
    allowed_accounts TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT oc.id, oc.is_active, oc.allowed_projects, oc.allowed_accounts
    FROM public.oauth_connections oc
    WHERE oc.organization_id = p_organization_id
      AND oc.client_id = p_client_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.upsert_oauth_connection(UUID, TEXT, TEXT, UUID, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_oauth_connection(UUID, TEXT) TO service_role;

-- Integration requests --------------------------------------------

DROP FUNCTION IF EXISTS public.create_integration_request(text, text, text);

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

-- Analytics site lookup -------------------------------------------

DROP FUNCTION IF EXISTS analytics.get_site_by_public_key(TEXT);

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

-- Legacy create_workspace: drop if still around.
DROP FUNCTION IF EXISTS public.create_workspace(TEXT, TEXT, UUID);
