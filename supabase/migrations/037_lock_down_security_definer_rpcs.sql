-- ============================================================
-- 037_lock_down_security_definer_rpcs.sql
--
-- These SECURITY DEFINER RPCs take `p_organization_id` as a
-- trusted parameter and perform cross-tenant writes/reads. They
-- were previously callable by the `authenticated` role (or by
-- `PUBLIC` via Postgres defaults when a DROP + CREATE cycle lost
-- prior grants), which let any signed-up user:
--
--   * encrypt_meta_token      → overwrite any org's Meta token
--   * decrypt_meta_token      → read any org's token (given key)
--   * generate_api_key        → mint an API key for any org
--   * sync_business_managers  → wipe & re-populate any org's BMs
--   * reconcile_ad_account_plan_limits → toggle ad_accounts
--
-- We restrict execution to service_role only. Every legitimate
-- caller in the repo is a server-side route that already
-- validates the user's membership/role, so switching those
-- callers to a service-role Supabase client preserves the flow
-- while removing the cross-tenant primitive from PostgREST.
-- ============================================================

-- Drop any ambient grants coming from prior migrations or from
-- Postgres's default `TO PUBLIC` on public-schema functions.
REVOKE ALL ON FUNCTION public.encrypt_meta_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.encrypt_meta_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.encrypt_meta_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_meta_token(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION public.decrypt_meta_token(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_meta_token(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.decrypt_meta_token(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_meta_token(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.generate_api_key(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_api_key(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.generate_api_key(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_api_key(UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.sync_business_managers(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_business_managers(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.sync_business_managers(UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_business_managers(UUID, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_ad_account_plan_limits(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_ad_account_plan_limits(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_ad_account_plan_limits(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_ad_account_plan_limits(UUID) TO service_role;

-- While we're at it, harden the analytics CAPI RPC too: nothing
-- in the app calls it from user JWTs; the only legitimate path is
-- the analytics sites PATCH handler running with the analytics
-- admin (service-role) client.
REVOKE ALL ON FUNCTION analytics.encrypt_capi_token(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION analytics.encrypt_capi_token(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION analytics.encrypt_capi_token(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION analytics.encrypt_capi_token(UUID, TEXT, TEXT) TO service_role;
