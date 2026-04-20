-- ============================================================
-- 028_add_project_id_to_resources.sql
-- Wires ad_accounts and analytics.sites to projects.
-- Step 1: seed one Default project per existing organization.
-- Step 2: add project_id column (nullable), backfill, enforce NOT NULL.
-- Step 3: use a composite FK so project_id always belongs to the
--         same organization as the resource (no silent drift).
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 1: Default project per organization
-- ───────────────────────────────────────────────────────────

INSERT INTO public.projects (organization_id, name, slug, is_default, description)
SELECT o.id, 'Default', 'default', true, 'Projeto padrão criado na migração de projetos.'
FROM public.organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.organization_id = o.id AND p.is_default = true
);

-- ───────────────────────────────────────────────────────────
-- STEP 2: composite uniqueness used by resource FKs
-- (projects.id is already PK; this UNIQUE makes (id, organization_id)
-- referenceable, enforcing org consistency on child rows.)
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.projects
    ADD CONSTRAINT projects_id_org_unique UNIQUE (id, organization_id);

-- ───────────────────────────────────────────────────────────
-- STEP 3: ad_accounts.project_id
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.ad_accounts
    ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT;

UPDATE public.ad_accounts a
SET project_id = p.id
FROM public.projects p
WHERE p.organization_id = a.organization_id
  AND p.is_default = true;

ALTER TABLE public.ad_accounts
    ALTER COLUMN project_id SET NOT NULL;

-- Drop the simple FK we just added and replace with the composite
-- FK that also binds organization_id (prevents project from another org).
ALTER TABLE public.ad_accounts
    DROP CONSTRAINT ad_accounts_project_id_fkey;

ALTER TABLE public.ad_accounts
    ADD CONSTRAINT ad_accounts_project_org_fkey
    FOREIGN KEY (project_id, organization_id)
    REFERENCES public.projects(id, organization_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_ad_accounts_project ON public.ad_accounts(project_id);

-- ───────────────────────────────────────────────────────────
-- STEP 4: analytics.sites.project_id (same pattern)
-- ───────────────────────────────────────────────────────────

ALTER TABLE analytics.sites
    ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT;

UPDATE analytics.sites s
SET project_id = p.id
FROM public.projects p
WHERE p.organization_id = s.organization_id
  AND p.is_default = true;

ALTER TABLE analytics.sites
    ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE analytics.sites
    DROP CONSTRAINT sites_project_id_fkey;

ALTER TABLE analytics.sites
    ADD CONSTRAINT sites_project_org_fkey
    FOREIGN KEY (project_id, organization_id)
    REFERENCES public.projects(id, organization_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_sites_project ON analytics.sites(project_id);
