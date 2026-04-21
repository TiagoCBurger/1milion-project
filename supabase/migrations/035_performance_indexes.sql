-- ============================================================
-- 035_performance_indexes.sql
--
-- Performance-only migration. No schema or policy changes.
-- Adds indexes that were missing for hot query paths surfaced
-- during the perf audit:
--
--   1. memberships(organization_id)
--      The UNIQUE (user_id, organization_id) auto-index only
--      supports lookups starting with user_id. RLS policies like
--      "Members can view co-members" and RPCs that scan by
--      organization_id alone were seq-scanning.
--
--   2. GIN on custom_events.props
--      Event-explorer filters like `props->>'value' > 100` had
--      no index support and were seq-scanning the full event
--      history per site.
--
--   3. ad_accounts(organization_id, is_enabled)
--      getEnabledAdAccounts runs on every dashboard navigation
--      and pages the whole org's account list.
--
--   4. meta_tokens(is_valid, expires_at)
--      Powers the janitor's "find tokens expiring in 7d" query.
--
-- Everything uses IF NOT EXISTS so re-running the migration
-- against an already-patched DB is a no-op.
-- ============================================================

-- 1. memberships by organization
CREATE INDEX IF NOT EXISTS idx_memberships_organization
    ON public.memberships (organization_id, role);

-- 2. custom_events JSONB props
CREATE INDEX IF NOT EXISTS idx_custom_events_props_gin
    ON analytics.custom_events USING GIN (props jsonb_path_ops);

-- 3. ad_accounts hot filter
CREATE INDEX IF NOT EXISTS idx_ad_accounts_organization_enabled
    ON public.ad_accounts (organization_id, is_enabled)
    WHERE is_enabled = true;

-- 4. meta_tokens expiry watcher
CREATE INDEX IF NOT EXISTS idx_meta_tokens_valid_expiry
    ON public.meta_tokens (expires_at)
    WHERE is_valid = true AND expires_at IS NOT NULL;

-- 5. oauth_connections active lookup (used by mcp-worker's conn-limit HEAD)
CREATE INDEX IF NOT EXISTS idx_oauth_connections_org_active
    ON public.oauth_connections (organization_id, is_active)
    WHERE is_active = true;
