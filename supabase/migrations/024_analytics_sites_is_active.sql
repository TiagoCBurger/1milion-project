-- analytics.sites.is_active: per-site kill switch used by the worker
-- (blocks ingestion when false) and by the dashboard UI (status badge).

ALTER TABLE analytics.sites
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
