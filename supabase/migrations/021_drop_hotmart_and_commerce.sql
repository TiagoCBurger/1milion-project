-- ============================================================
-- 021_drop_hotmart_and_commerce.sql
-- Removes the Hotmart integration and its generalized commerce layer.
-- Runs idempotently so re-applying or applying on environments that
-- never had these tables does not break the deploy.
-- Historical migrations 013/014/016 are kept as-is.
-- ============================================================

-- RPC (from 014)
DROP FUNCTION IF EXISTS public.reconcile_commerce_sale_products(UUID, TEXT);

-- Commerce multisource tables (from 014). Order respects FK deps.
DROP TABLE IF EXISTS public.commerce_refund_sources CASCADE;
DROP TABLE IF EXISTS public.commerce_refunds CASCADE;
DROP TABLE IF EXISTS public.commerce_sale_sources CASCADE;
DROP TABLE IF EXISTS public.commerce_sales CASCADE;
DROP TABLE IF EXISTS public.commerce_customer_sources CASCADE;
DROP TABLE IF EXISTS public.commerce_customers CASCADE;
DROP TABLE IF EXISTS public.commerce_product_sources CASCADE;
DROP TABLE IF EXISTS public.commerce_products CASCADE;

-- Hotmart tables (from 013)
DROP TABLE IF EXISTS public.hotmart_sync_log CASCADE;
DROP TABLE IF EXISTS public.hotmart_webhook_events CASCADE;
DROP TABLE IF EXISTS public.hotmart_refunds CASCADE;
DROP TABLE IF EXISTS public.hotmart_sales CASCADE;
DROP TABLE IF EXISTS public.hotmart_customers CASCADE;
DROP TABLE IF EXISTS public.hotmart_products CASCADE;
DROP TABLE IF EXISTS public.hotmart_credentials CASCADE;
