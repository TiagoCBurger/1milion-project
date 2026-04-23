-- ============================================================
-- 045_audit_log.sql
-- ------------------------------------------------------------
-- Centralized audit trail for every WRITE reaching the platform
-- (reads are intentionally out of scope).
--
-- Two surfaces feed this table:
--   * apps/web     — REST route handlers in Next.js
--   * apps/mcp-worker — Meta Ads mutations performed via MCP tools
--
-- Design notes:
--   * resource_id is TEXT so Meta IDs (strings, e.g. act_123456) and
--     Postgres UUIDs both fit without casts.
--   * before/after/diff are JSONB so any payload shape is storable.
--     Callers MUST scrub secrets (tokens, API keys) before writing —
--     enforcement is in the `packages/audit` helper, not in the DB.
--   * We do NOT FK actor_user_id onto auth.users. Users can be wiped
--     (GDPR / LGPD) without losing forensic history; on delete the
--     column stays populated with the deleted user's UUID.
--   * Write path is service-role-only. Web uses
--     apps/web/src/lib/supabase/admin.ts; MCP worker already has
--     SUPABASE_SERVICE_ROLE_KEY wired in auth.ts.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Who did it.
    actor_type        TEXT NOT NULL
        CHECK (actor_type IN ('user', 'mcp_oauth', 'mcp_api_key', 'system', 'webhook')),
    actor_user_id     UUID,
    actor_identifier  TEXT,

    -- What was done.
    action            TEXT NOT NULL,            -- e.g. "campaign.update", "billing.cancel_scheduled"
    resource_type     TEXT NOT NULL,            -- e.g. "campaign", "organization"
    resource_id       TEXT,

    -- Scope.
    project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    meta_account_id   TEXT,

    -- State transition.
    before            JSONB,
    after             JSONB,
    diff              JSONB,

    -- Request metadata.
    ip                INET,
    user_agent        TEXT,
    request_id        TEXT,

    -- Outcome.
    status            TEXT NOT NULL DEFAULT 'success'
        CHECK (status IN ('success', 'error')),
    error_message     TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
    ON public.audit_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_action_created
    ON public.audit_log(organization_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_resource
    ON public.audit_log(organization_id, resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user
    ON public.audit_log(actor_user_id)
    WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_error
    ON public.audit_log(organization_id, created_at DESC)
    WHERE status = 'error';

-- ───────────────────────────────────────────────────────────
-- RLS: read-only for org owners; writes are service-role only.
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read org audit log" ON public.audit_log;
CREATE POLICY "Owners can read org audit log"
    ON public.audit_log FOR SELECT
    USING (public.is_organization_owner(organization_id));

-- No INSERT / UPDATE / DELETE policies for authenticated users.
-- service_role bypasses RLS, so writes are implicitly limited to it.

REVOKE ALL ON public.audit_log FROM authenticated, anon;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT INSERT ON public.audit_log TO service_role;

COMMENT ON TABLE public.audit_log IS
    'Forensic trail of every write performed by users, MCP clients, webhooks, or system jobs. Read-only for org owners; only service_role may insert.';
