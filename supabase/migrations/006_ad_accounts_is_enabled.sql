-- ============================================================
-- Add is_enabled flag to ad_accounts
-- Controls whether each account is available via MCP / API
-- ============================================================

ALTER TABLE public.ad_accounts
    ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT true;
