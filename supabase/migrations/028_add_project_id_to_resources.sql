-- ============================================================
-- 028_add_project_id_to_resources.sql
-- Wires ad_accounts and analytics.sites to projects.
-- Step 0: reconcile 026 (workspaces → organizations) if the tracking
--         row says it was applied but the DB still has workspaces.
-- Step 1: seed one Default project per existing organization.
-- Step 2: add project_id column (nullable), backfill, enforce NOT NULL.
-- Step 3: use a composite FK so project_id always belongs to the
--         same organization as the resource (no silent drift).
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 0: reconcile the 026 rename if it was skipped.
-- Some projects landed in production with 026 marked applied in
-- schema_migrations, but the actual rename never ran. Re-do the
-- essential parts here so 028 can proceed.
-- ───────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'organizations'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'workspaces'
        ) THEN
            RAISE NOTICE 'Reconciling 026: renaming public.workspaces → public.organizations.';
            ALTER TABLE public.workspaces RENAME TO organizations;
        ELSE
            RAISE EXCEPTION 'Neither public.workspaces nor public.organizations exists. Migration 026 has not been applied. Run it before 028.';
        END IF;
    END IF;
END
$$;

-- Per-table column rename (only where still workspace_id).
DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT * FROM (VALUES
            ('public',   'memberships'),
            ('public',   'meta_tokens'),
            ('public',   'api_keys'),
            ('public',   'subscriptions'),
            ('public',   'usage_logs'),
            ('public',   'business_managers'),
            ('public',   'ad_accounts'),
            ('public',   'oauth_connections'),
            ('public',   'billing_events'),
            ('public',   'ad_images'),
            ('public',   'email_events'),
            ('requests', 'integration_requests'),
            ('analytics','sites')
        ) AS t(schema_name, table_name)
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = target.schema_name
              AND table_name = target.table_name
        )
        AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = target.schema_name
              AND table_name = target.table_name
              AND column_name = 'workspace_id'
        )
        AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = target.schema_name
              AND table_name = target.table_name
              AND column_name = 'organization_id'
        )
        THEN
            EXECUTE format(
                'ALTER TABLE %I.%I RENAME COLUMN workspace_id TO organization_id',
                target.schema_name,
                target.table_name
            );
        END IF;
    END LOOP;
END
$$;

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
-- ───────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'projects_id_org_unique'
          AND conrelid = 'public.projects'::regclass
    ) THEN
        ALTER TABLE public.projects
            ADD CONSTRAINT projects_id_org_unique UNIQUE (id, organization_id);
    END IF;
END
$$;

-- ───────────────────────────────────────────────────────────
-- STEP 3: ad_accounts.project_id
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.ad_accounts
    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT;

UPDATE public.ad_accounts a
SET project_id = p.id
FROM public.projects p
WHERE p.organization_id = a.organization_id
  AND p.is_default = true
  AND a.project_id IS NULL;

ALTER TABLE public.ad_accounts
    ALTER COLUMN project_id SET NOT NULL;

-- Replace the simple FK with a composite FK that pins org consistency.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ad_accounts_project_id_fkey'
          AND conrelid = 'public.ad_accounts'::regclass
    ) THEN
        ALTER TABLE public.ad_accounts
            DROP CONSTRAINT ad_accounts_project_id_fkey;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ad_accounts_project_org_fkey'
          AND conrelid = 'public.ad_accounts'::regclass
    ) THEN
        ALTER TABLE public.ad_accounts
            ADD CONSTRAINT ad_accounts_project_org_fkey
            FOREIGN KEY (project_id, organization_id)
            REFERENCES public.projects(id, organization_id)
            ON DELETE RESTRICT;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ad_accounts_project ON public.ad_accounts(project_id);

-- ───────────────────────────────────────────────────────────
-- STEP 4: analytics.sites.project_id
-- ───────────────────────────────────────────────────────────

ALTER TABLE analytics.sites
    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT;

UPDATE analytics.sites s
SET project_id = p.id
FROM public.projects p
WHERE p.organization_id = s.organization_id
  AND p.is_default = true
  AND s.project_id IS NULL;

ALTER TABLE analytics.sites
    ALTER COLUMN project_id SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sites_project_id_fkey'
          AND conrelid = 'analytics.sites'::regclass
    ) THEN
        ALTER TABLE analytics.sites
            DROP CONSTRAINT sites_project_id_fkey;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sites_project_org_fkey'
          AND conrelid = 'analytics.sites'::regclass
    ) THEN
        ALTER TABLE analytics.sites
            ADD CONSTRAINT sites_project_org_fkey
            FOREIGN KEY (project_id, organization_id)
            REFERENCES public.projects(id, organization_id)
            ON DELETE RESTRICT;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_sites_project ON analytics.sites(project_id);
