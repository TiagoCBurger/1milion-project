-- ============================================================
-- 039_tighten_project_crud_grants.sql
--
-- A follow-up audit showed the project-CRUD RPCs still had
-- PUBLIC + anon EXECUTE despite having internal
-- is_organization_owner / is_organization_member guards. The
-- guards make these calls non-exploitable from anon today, but
-- the extra grants are unnecessary attack surface:
--
--   * any regression that drops the internal guard immediately
--     becomes a bypass,
--   * PostgREST exposes them to the anon key, muddying audit
--     expectations.
--
-- Restrict them to `authenticated` + `service_role` only,
-- matching `create_organization` after 038.
-- ============================================================

-- create_integration_request
REVOKE ALL ON FUNCTION public.create_integration_request(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_integration_request(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_integration_request(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_integration_request(TEXT, TEXT, TEXT) TO service_role;

-- list_projects
REVOKE ALL ON FUNCTION public.list_projects(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_projects(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_projects(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_projects(UUID) TO service_role;

-- delete_project
REVOKE ALL ON FUNCTION public.delete_project(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_project(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_project(UUID, UUID) TO service_role;

-- rename_project
REVOKE ALL ON FUNCTION public.rename_project(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rename_project(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rename_project(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_project(UUID, TEXT, TEXT, TEXT) TO service_role;

-- set_default_project
REVOKE ALL ON FUNCTION public.set_default_project(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_default_project(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_default_project(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_project(UUID) TO service_role;

-- move_ad_account_to_project
REVOKE ALL ON FUNCTION public.move_ad_account_to_project(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_ad_account_to_project(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_ad_account_to_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_ad_account_to_project(UUID, UUID) TO service_role;

-- move_site_to_project
REVOKE ALL ON FUNCTION public.move_site_to_project(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_site_to_project(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_site_to_project(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_site_to_project(UUID, UUID) TO service_role;
