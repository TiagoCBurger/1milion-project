-- ============================================================
-- 027_create_projects.sql
-- Adds the "projects" layer inside each organization.
-- Projects group ad_accounts and sites for dashboard + MCP scoping.
-- Memberships remain org-level; project membership comes in a
-- future migration when we need granular permissions.
--
-- Idempotent: safe to re-run if a previous apply partially failed.
-- Also self-repairs when an earlier buggy attempt left behind a
-- `projects` table with a different column shape, and re-creates the
-- is_organization_member / is_organization_owner helpers if 026 was
-- applied from an older revision that lacked them.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- RLS helpers (defensive: 026 should have created these, but older
-- snapshots of 026 did not). CREATE OR REPLACE is idempotent.
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

DO $$
DECLARE
    v_row_count bigint;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'projects'
    ) THEN
        -- Case A: table already matches (has organization_id) → nothing to do.
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'projects'
              AND column_name = 'organization_id'
        ) THEN
            RAISE NOTICE 'public.projects already has organization_id — nothing to repair.';

        -- Case B: legacy column name workspace_id → rename it.
        ELSIF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'projects'
              AND column_name = 'workspace_id'
        ) THEN
            RAISE NOTICE 'public.projects has legacy workspace_id — renaming.';
            ALTER TABLE public.projects RENAME COLUMN workspace_id TO organization_id;

        -- Case C: table exists but is unrecognisable.
        --   * If empty, drop it so CREATE TABLE below recreates cleanly.
        --   * Otherwise abort with a helpful message.
        ELSE
            EXECUTE 'SELECT COUNT(*) FROM public.projects' INTO v_row_count;
            IF v_row_count = 0 THEN
                RAISE NOTICE 'public.projects exists with no organization/workspace column and is empty — dropping so the migration can recreate it.';
                DROP TABLE public.projects CASCADE;
            ELSE
                RAISE EXCEPTION
                    'public.projects exists with % row(s) and no organization_id/workspace_id column. This is not a schema created by migration 027. Inspect the table and run DROP TABLE public.projects CASCADE; then re-apply migrations.',
                    v_row_count;
            END IF;
        END IF;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.projects (
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

-- Ensure every column is present even if the table predates this
-- migration with a narrower schema. New columns added here are nullable
-- or default so they work against a populated table.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_organization ON public.projects(organization_id);

-- Exactly one default project per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_default_per_org
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

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.projects_set_updated_at();

-- ───────────────────────────────────────────────────────────
-- Row level security
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view projects" ON public.projects;
CREATE POLICY "Members can view projects"
    ON public.projects FOR SELECT
    USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS "Owners/admins can manage projects" ON public.projects;
CREATE POLICY "Owners/admins can manage projects"
    ON public.projects FOR ALL
    USING (public.is_organization_owner(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
