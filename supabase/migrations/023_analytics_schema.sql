-- ═══════════════════════════════════════════════════════════════
-- 023_analytics_schema.sql
-- Analytics feature:
--   - Pageviews + outbound + performance → Cloudflare Analytics Engine
--   - Custom events with JSONB props → this schema
--   - Sites / goals / funnels / user profiles → this schema
--
-- Manual step (post-migration):
--   Supabase Dashboard → Settings → API → Exposed schemas
--   Add: analytics
-- ═══════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS analytics;

-- Grants for Supabase roles. PostgREST needs USAGE on schema to reach it.
GRANT USAGE ON SCHEMA analytics TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
    GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
    GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
    GRANT USAGE, SELECT ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
    GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- Drop legacy test columns from public.workspaces
-- (pixel config moves to analytics.sites, per-site granularity)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.workspaces
    DROP COLUMN IF EXISTS pixel_id,
    DROP COLUMN IF EXISTS capi_access_token;

-- ═══════════════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════════════

-- ─── sites: tracked domains per workspace ────────────────────────
CREATE TABLE analytics.sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    public_key TEXT NOT NULL UNIQUE
        DEFAULT ('site_' || encode(gen_random_bytes(12), 'hex')),

    -- Tracking toggles
    block_bots BOOLEAN NOT NULL DEFAULT true,
    track_outbound BOOLEAN NOT NULL DEFAULT true,
    track_performance BOOLEAN NOT NULL DEFAULT false,
    track_url_params BOOLEAN NOT NULL DEFAULT false,
    excluded_ips TEXT[] NOT NULL DEFAULT '{}',
    excluded_countries TEXT[] NOT NULL DEFAULT '{}',

    -- Meta CAPI (per-site)
    pixel_id TEXT,
    capi_encrypted_token BYTEA,
    capi_test_event_code TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (workspace_id, domain)
);

CREATE INDEX idx_sites_workspace ON analytics.sites (workspace_id);
CREATE INDEX idx_sites_public_key ON analytics.sites (public_key);

COMMENT ON TABLE analytics.sites IS
    'Tracked domains per workspace. One workspace can own multiple sites.';
COMMENT ON COLUMN analytics.sites.public_key IS
    'Public key used in <script data-site-id="...">. Safe to expose on client.';
COMMENT ON COLUMN analytics.sites.capi_encrypted_token IS
    'pgp_sym_encrypt-wrapped Meta CAPI access token. Use analytics.decrypt_capi_token(id, key) to read.';

-- ─── custom_events: full JSONB payload (low-volume) ──────────────
CREATE TABLE analytics.custom_events (
    id BIGSERIAL PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES analytics.sites(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,                 -- UUID from browser, for CAPI dedup
    event_name TEXT NOT NULL,               -- e.g. "Purchase", "Lead"
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,                  -- anonymous ID
    pathname TEXT,
    props JSONB NOT NULL DEFAULT '{}'::jsonb,
    channel TEXT,
    country CHAR(2),
    device_type TEXT,

    -- CAPI dispatch tracking
    capi_sent BOOLEAN NOT NULL DEFAULT false,
    capi_response JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (site_id, event_id)
);

CREATE INDEX idx_custom_events_site_created
    ON analytics.custom_events (site_id, created_at DESC);
CREATE INDEX idx_custom_events_site_name_created
    ON analytics.custom_events (site_id, event_name, created_at DESC);
CREATE INDEX idx_custom_events_site_session
    ON analytics.custom_events (site_id, session_id);

COMMENT ON TABLE analytics.custom_events IS
    'Custom events (Purchase, Lead, etc.) with full JSONB props. '
    'High-volume pageviews/outbound/performance go to Cloudflare Analytics Engine.';

-- ─── user_profiles: traits merged across sessions ────────────────
CREATE TABLE analytics.user_profiles (
    site_id UUID NOT NULL REFERENCES analytics.sites(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    email_hash TEXT,                        -- sha256 lowercased
    external_id TEXT,
    traits JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (site_id, user_id)
);

CREATE INDEX idx_user_profiles_site_email
    ON analytics.user_profiles (site_id, email_hash)
    WHERE email_hash IS NOT NULL;
CREATE INDEX idx_user_profiles_site_external
    ON analytics.user_profiles (site_id, external_id)
    WHERE external_id IS NOT NULL;

-- ─── goals: named conversions (pageview- or event-based) ─────────
CREATE TABLE analytics.goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES analytics.sites(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    goal_type TEXT NOT NULL CHECK (goal_type IN ('pageview', 'event')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_site ON analytics.goals (site_id);

COMMENT ON COLUMN analytics.goals.config IS
    'For pageview: {"pathname_pattern": "/checkout/*"}. '
    'For event: {"event_name": "Purchase", "props_filter": {...}}.';

-- ─── funnels: multi-step conversion paths ────────────────────────
CREATE TABLE analytics.funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES analytics.sites(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_funnels_site ON analytics.funnels (site_id);

COMMENT ON COLUMN analytics.funnels.steps IS
    'Array of {type: "pageview"|"event", pattern|event_name, filters?}';

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE analytics.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.custom_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.funnels ENABLE ROW LEVEL SECURITY;

-- ─── sites ────────────────────────────────────────────────────────
CREATE POLICY "sites_read_members" ON analytics.sites FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = sites.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "sites_write_admins" ON analytics.sites FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = sites.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

-- ─── custom_events (read-only via dashboard; writes via service_role) ─
CREATE POLICY "custom_events_read_members" ON analytics.custom_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            JOIN public.memberships m ON m.workspace_id = s.workspace_id
            WHERE s.id = custom_events.site_id
              AND m.user_id = auth.uid()
        )
    );

-- ─── user_profiles ────────────────────────────────────────────────
CREATE POLICY "user_profiles_read_members" ON analytics.user_profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            JOIN public.memberships m ON m.workspace_id = s.workspace_id
            WHERE s.id = user_profiles.site_id
              AND m.user_id = auth.uid()
        )
    );

-- ─── goals ────────────────────────────────────────────────────────
CREATE POLICY "goals_read_members" ON analytics.goals FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            JOIN public.memberships m ON m.workspace_id = s.workspace_id
            WHERE s.id = goals.site_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "goals_write_admins" ON analytics.goals FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            JOIN public.memberships m ON m.workspace_id = s.workspace_id
            WHERE s.id = goals.site_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

-- ─── funnels ──────────────────────────────────────────────────────
CREATE POLICY "funnels_read_members" ON analytics.funnels FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            JOIN public.memberships m ON m.workspace_id = s.workspace_id
            WHERE s.id = funnels.site_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "funnels_write_admins" ON analytics.funnels FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM analytics.sites s
            JOIN public.memberships m ON m.workspace_id = s.workspace_id
            WHERE s.id = funnels.site_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

-- ═══════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- ─── updated_at auto-bump ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sites_set_updated_at
    BEFORE UPDATE ON analytics.sites
    FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at();

-- ─── CAPI token encryption (pgcrypto) ─────────────────────────────
CREATE OR REPLACE FUNCTION analytics.encrypt_capi_token(
    p_site_id UUID,
    p_token TEXT,
    p_encryption_key TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE analytics.sites
    SET capi_encrypted_token = pgp_sym_encrypt(p_token, p_encryption_key),
        updated_at = now()
    WHERE id = p_site_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION analytics.decrypt_capi_token(
    p_site_id UUID,
    p_encryption_key TEXT
) RETURNS TEXT AS $$
    SELECT pgp_sym_decrypt(capi_encrypted_token, p_encryption_key)::TEXT
    FROM analytics.sites
    WHERE id = p_site_id
      AND capi_encrypted_token IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION analytics.encrypt_capi_token(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION analytics.decrypt_capi_token(UUID, TEXT) TO service_role;

-- ─── Site lookup by public_key (hot path: track-worker) ──────────
-- Bypasses RLS via SECURITY DEFINER so Worker can use anon key if needed.
-- In practice the worker will use service_role, but this is useful for
-- edge cases and mirrors the pattern used in meta-ads-cloud.
CREATE OR REPLACE FUNCTION analytics.get_site_by_public_key(
    p_public_key TEXT
) RETURNS TABLE (
    id UUID,
    workspace_id UUID,
    domain TEXT,
    block_bots BOOLEAN,
    track_outbound BOOLEAN,
    track_performance BOOLEAN,
    excluded_ips TEXT[],
    excluded_countries TEXT[],
    pixel_id TEXT,
    has_capi_token BOOLEAN
) AS $$
    SELECT
        s.id,
        s.workspace_id,
        s.domain,
        s.block_bots,
        s.track_outbound,
        s.track_performance,
        s.excluded_ips,
        s.excluded_countries,
        s.pixel_id,
        s.capi_encrypted_token IS NOT NULL AS has_capi_token
    FROM analytics.sites s
    WHERE s.public_key = p_public_key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION analytics.get_site_by_public_key(TEXT) TO service_role;
