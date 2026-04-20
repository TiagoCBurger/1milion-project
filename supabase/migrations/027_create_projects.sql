-- ============================================================
-- 027_create_projects.sql
-- Adds the "projects" layer inside each organization.
-- Projects group ad_accounts and sites for dashboard + MCP scoping.
-- Memberships remain org-level; project membership comes in a
-- future migration when we need granular permissions.
-- ============================================================

CREATE TABLE public.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT projects_slug_not_blank CHECK (length(trim(slug)) > 0),
    CONSTRAINT projects_name_not_blank CHECK (length(trim(name)) > 0),
    UNIQUE (organization_id, slug)
);

CREATE INDEX idx_projects_organization ON public.projects(organization_id);

-- Exactly one default project per organization
CREATE UNIQUE INDEX idx_projects_default_per_org
    ON public.projects(organization_id)
    WHERE is_default = true;

COMMENT ON TABLE public.projects IS
    'Projects group ad_accounts and analytics.sites inside an organization. '
    'Used as the scoping boundary for the MCP server and dashboard filters.';

-- updated_at auto-bump
CREATE OR REPLACE FUNCTION public.projects_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_set_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.projects_set_updated_at();

-- ───────────────────────────────────────────────────────────
-- Row level security
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view projects"
    ON public.projects FOR SELECT
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Owners/admins can manage projects"
    ON public.projects FOR ALL
    USING (public.is_organization_owner(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
