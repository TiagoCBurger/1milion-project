-- ============================================================
-- Pending plan changes for upgrade/downgrade at next cycle
-- ============================================================

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS pending_tier subscription_tier,
    ADD COLUMN IF NOT EXISTS pending_billing_cycle TEXT
        CHECK (pending_billing_cycle IN ('monthly', 'annually'));
