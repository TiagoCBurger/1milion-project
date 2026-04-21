-- ============================================================
-- 034_creative_upload_pipeline.sql
-- Foundation for the secure creative upload pipeline:
--   * extends ad_images with sanitization + lease metadata
--   * adds upload_leases (slot reservation across batch uploads)
--   * adds upload_audit_log (rejected/accepted upload events)
-- All tables use organization_id + RLS via existing helpers
-- (is_organization_member, is_organization_owner from migration 032).
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE POLICY.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1. Extend ad_images
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.ad_images
    ADD COLUMN IF NOT EXISTS sha256          TEXT,
    ADD COLUMN IF NOT EXISTS lease_id        UUID,
    ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'ready'
        CHECK (status IN ('pending', 'ready', 'failed', 'rejected')),
    ADD COLUMN IF NOT EXISTS sanitized       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS original_size   BIGINT,
    ADD COLUMN IF NOT EXISTS sanitized_size  BIGINT,
    ADD COLUMN IF NOT EXISTS uploaded_via    TEXT NOT NULL DEFAULT 'web'
        CHECK (uploaded_via IN ('web', 'mcp', 'mcp_legacy', 'hydrate'));

CREATE INDEX IF NOT EXISTS idx_ad_images_sha256
    ON public.ad_images(organization_id, sha256)
    WHERE sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ad_images_lease
    ON public.ad_images(lease_id)
    WHERE lease_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────
-- 2. upload_leases — slot reservation
-- ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.upload_leases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    account_id      TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('image', 'video')),
    expected_count  INT  NOT NULL CHECK (expected_count > 0),
    expected_bytes  BIGINT NOT NULL CHECK (expected_bytes > 0),
    finalized_count INT  NOT NULL DEFAULT 0,
    -- Per-item metadata locked at request_upload time so finalize can verify
    -- that the bytes uploaded match what was approved (size, MIME, sha256).
    -- Shape: [{ key, file_name, expected_size, declared_mime, expected_sha256 }]
    items_meta      JSONB NOT NULL DEFAULT '[]'::jsonb,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'finalized', 'cancelled', 'expired', 'partial')),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalized_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_upload_leases_org_status_expires
    ON public.upload_leases(organization_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_upload_leases_active
    ON public.upload_leases(organization_id)
    WHERE status = 'pending';

-- ───────────────────────────────────────────────────────────
-- 3. upload_audit_log — every accept/reject decision
-- ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.upload_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    lease_id        UUID,
    account_id      TEXT,
    r2_key          TEXT,
    sha256          TEXT,
    mime_declared   TEXT,
    mime_actual     TEXT,
    size_bytes      BIGINT,
    action          TEXT NOT NULL
        CHECK (action IN ('request', 'finalize', 'reject', 'cancel', 'sanitize', 'hydrate', 'legacy_upload', 'download')),
    reason          TEXT,
    ip              INET,
    user_agent      TEXT,
    actor_user_id   UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_audit_log_org_created
    ON public.upload_audit_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upload_audit_log_action_reject
    ON public.upload_audit_log(organization_id, created_at DESC)
    WHERE action = 'reject';

CREATE INDEX IF NOT EXISTS idx_upload_audit_log_action_download
    ON public.upload_audit_log(organization_id, created_at DESC)
    WHERE action = 'download';

CREATE INDEX IF NOT EXISTS idx_upload_audit_log_action_finalize
    ON public.upload_audit_log(organization_id, created_at DESC)
    WHERE action = 'finalize';

CREATE INDEX IF NOT EXISTS idx_upload_audit_log_sha256
    ON public.upload_audit_log(sha256)
    WHERE sha256 IS NOT NULL;

-- ───────────────────────────────────────────────────────────
-- 4. RLS
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.upload_leases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_audit_log  ENABLE ROW LEVEL SECURITY;

-- upload_leases: members read, owners/admins manage (writes flow via service_role anyway)
DROP POLICY IF EXISTS "Members can view leases"          ON public.upload_leases;
DROP POLICY IF EXISTS "Owners/admins can manage leases"  ON public.upload_leases;

CREATE POLICY "Members can view leases"
    ON public.upload_leases FOR SELECT
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Owners/admins can manage leases"
    ON public.upload_leases FOR ALL
    USING (public.is_organization_owner(organization_id));

-- upload_audit_log: members read (debugging), no client writes
DROP POLICY IF EXISTS "Members can view audit log"       ON public.upload_audit_log;

CREATE POLICY "Members can view audit log"
    ON public.upload_audit_log FOR SELECT
    USING (public.is_organization_member(organization_id));

-- ───────────────────────────────────────────────────────────
-- 5. Grants
-- ───────────────────────────────────────────────────────────

GRANT ALL ON public.upload_leases    TO service_role;
GRANT ALL ON public.upload_audit_log TO service_role;

GRANT SELECT ON public.upload_leases    TO authenticated;
GRANT SELECT ON public.upload_audit_log TO authenticated;

-- ───────────────────────────────────────────────────────────
-- 6. Helper RPC: count active (pending, non-expired) leases
-- Used by the request_upload code path to enforce concurrent_leases.
-- SECURITY DEFINER so the worker can call it with anon-equivalent
-- credentials when needed.
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.count_active_upload_leases(p_organization_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INT
    FROM public.upload_leases
    WHERE organization_id = p_organization_id
      AND status = 'pending'
      AND expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION public.count_active_upload_leases(UUID) TO service_role;

-- ───────────────────────────────────────────────────────────
-- 7. Helper RPC: expire stale leases (for the janitor cron)
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_stale_upload_leases()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.upload_leases
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at <= now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_upload_leases() TO service_role;
