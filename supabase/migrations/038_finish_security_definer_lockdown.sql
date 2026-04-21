-- ============================================================
-- 038_finish_security_definer_lockdown.sql
--
-- Follow-up to 037. A live `pg_proc` audit revealed more
-- SECURITY DEFINER functions still reachable via PUBLIC:
--
--   * server-side-only helpers called from mcp-worker /
--     track-worker / web service-role routes — no reason to
--     expose them on PostgREST to anon/authenticated.
--   * `create_organization` still accepted a caller-supplied
--     `p_user_id` with no `auth.uid()` check, so a signed-in
--     user could create an organization owned by any victim.
--   * five `*_hotmart_*` functions whose tables were dropped
--     in migration 021 but the functions themselves were
--     never cleaned up — they're dead code and still PUBLIC.
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- 1. Server-side-only RPCs: restrict to service_role.
-- ─────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.validate_api_key(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_api_key(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.validate_api_key(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_api_key(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.get_organization_context(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_organization_context(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_organization_context(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_context(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_oauth_connection(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_oauth_connection(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_oauth_connection(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_oauth_connection(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_oauth_connection(UUID, TEXT, TEXT, UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_oauth_connection(UUID, TEXT, TEXT, UUID, UUID[]) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_oauth_connection(UUID, TEXT, TEXT, UUID, UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_oauth_connection(UUID, TEXT, TEXT, UUID, UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_project_meta_account_ids(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_project_meta_account_ids(UUID[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_project_meta_account_ids(UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_meta_account_ids(UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.count_active_upload_leases(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_active_upload_leases(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.count_active_upload_leases(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_upload_leases(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.expire_stale_upload_leases() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_stale_upload_leases() FROM anon;
REVOKE ALL ON FUNCTION public.expire_stale_upload_leases() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_upload_leases() TO service_role;

REVOKE ALL ON FUNCTION analytics.decrypt_capi_token(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION analytics.decrypt_capi_token(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION analytics.decrypt_capi_token(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION analytics.decrypt_capi_token(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION analytics.get_site_by_public_key(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION analytics.get_site_by_public_key(TEXT) FROM anon;
REVOKE ALL ON FUNCTION analytics.get_site_by_public_key(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION analytics.get_site_by_public_key(TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────
-- 2. create_organization must bind owner to auth.uid().
--    Previously any authenticated caller could pass an
--    arbitrary victim UUID and create a spoofed org owned
--    by them. `service_role` bypasses auth.uid() so we keep
--    the param to let the admin client seed fixtures.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_organization(
    p_name TEXT,
    p_slug TEXT,
    p_user_id UUID
) RETURNS TABLE(
    out_organization_id UUID,
    out_default_project_id UUID,
    out_default_project_slug TEXT
) AS $$
DECLARE
    v_caller UUID;
    v_org_id UUID;
    v_project_id UUID;
    v_project_slug TEXT;
BEGIN
    v_caller := auth.uid();

    -- When invoked through PostgREST with an end-user JWT we
    -- force the owner to be that user. Service-role callers
    -- (auth.uid() IS NULL) may pass any UUID — those paths are
    -- trusted and are needed for test fixtures / admin scripts.
    IF v_caller IS NOT NULL AND v_caller <> p_user_id THEN
        RAISE EXCEPTION 'p_user_id must match the authenticated caller'
            USING ERRCODE = '42501';
    END IF;

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

    UPDATE public.projects p
    SET created_by = p_user_id
    WHERE p.organization_id = v_org_id
      AND p.is_default = true
    RETURNING p.id, p.slug INTO v_project_id, v_project_slug;

    RETURN QUERY SELECT v_org_id, v_project_id, v_project_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep the existing grants: the user-facing create-org wizard
-- calls this with an end-user JWT.
REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────
-- 3. Drop leftover Hotmart helpers. The tables were removed
--    in migration 021 but these SECURITY DEFINER functions
--    survived and still have PUBLIC EXECUTE. None of the app
--    code references them anymore.
-- ─────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.decrypt_hotmart_credentials(UUID, TEXT);
DROP FUNCTION IF EXISTS public.disconnect_hotmart(UUID);
DROP FUNCTION IF EXISTS public.reconcile_hotmart_sale_products(UUID);
DROP FUNCTION IF EXISTS public.update_hotmart_access_token(UUID, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.upsert_hotmart_credentials(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
);
