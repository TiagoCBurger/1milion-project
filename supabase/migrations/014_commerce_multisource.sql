-- ============================================================
-- Commerce canonical tables (multi-integration ready)
-- ============================================================

-- ------------------------------------------------------------
-- commerce_products
-- ------------------------------------------------------------
CREATE TABLE public.commerce_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT,
    status TEXT,
    format TEXT,
    price_value NUMERIC,
    price_currency TEXT,
    created_at_source TIMESTAMPTZ,
    raw JSONB NOT NULL DEFAULT '{}',
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commerce_products_workspace ON public.commerce_products(workspace_id);
CREATE INDEX idx_commerce_products_status ON public.commerce_products(workspace_id, status);

-- ------------------------------------------------------------
-- commerce_product_sources
-- ------------------------------------------------------------
CREATE TABLE public.commerce_product_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.commerce_products(id) ON DELETE CASCADE,
    integration_provider TEXT NOT NULL CHECK (char_length(integration_provider) > 0),
    external_id TEXT NOT NULL,
    external_code TEXT,
    raw JSONB NOT NULL DEFAULT '{}',
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, integration_provider, external_id)
);

CREATE INDEX idx_commerce_product_sources_product ON public.commerce_product_sources(product_id);
CREATE INDEX idx_commerce_product_sources_provider ON public.commerce_product_sources(workspace_id, integration_provider);

-- ------------------------------------------------------------
-- commerce_customers
-- ------------------------------------------------------------
CREATE TABLE public.commerce_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    doc TEXT,
    phone TEXT,
    country TEXT,
    raw JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, email)
);

CREATE INDEX idx_commerce_customers_workspace_email ON public.commerce_customers(workspace_id, email);

-- ------------------------------------------------------------
-- commerce_customer_sources
-- ------------------------------------------------------------
CREATE TABLE public.commerce_customer_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.commerce_customers(id) ON DELETE CASCADE,
    integration_provider TEXT NOT NULL CHECK (char_length(integration_provider) > 0),
    external_id TEXT NOT NULL,
    raw JSONB NOT NULL DEFAULT '{}',
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, integration_provider, external_id)
);

CREATE INDEX idx_commerce_customer_sources_customer ON public.commerce_customer_sources(customer_id);
CREATE INDEX idx_commerce_customer_sources_provider ON public.commerce_customer_sources(workspace_id, integration_provider);

-- ------------------------------------------------------------
-- commerce_sales
-- ------------------------------------------------------------
CREATE TABLE public.commerce_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.commerce_products(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.commerce_customers(id) ON DELETE SET NULL,
    status TEXT NOT NULL,
    amount NUMERIC,
    currency TEXT,
    commission_total NUMERIC,
    purchase_date TIMESTAMPTZ,
    payment_type TEXT,
    offer_code TEXT,
    src TEXT,
    raw JSONB NOT NULL DEFAULT '{}',
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commerce_sales_workspace_purchase ON public.commerce_sales(workspace_id, purchase_date DESC);
CREATE INDEX idx_commerce_sales_workspace_status ON public.commerce_sales(workspace_id, status);
CREATE INDEX idx_commerce_sales_workspace_product ON public.commerce_sales(workspace_id, product_id);
CREATE INDEX idx_commerce_sales_workspace_customer ON public.commerce_sales(workspace_id, customer_id);

-- ------------------------------------------------------------
-- commerce_sale_sources
-- ------------------------------------------------------------
CREATE TABLE public.commerce_sale_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
    integration_provider TEXT NOT NULL CHECK (char_length(integration_provider) > 0),
    external_transaction_id TEXT NOT NULL,
    external_product_id TEXT,
    raw JSONB NOT NULL DEFAULT '{}',
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, integration_provider, external_transaction_id)
);

CREATE INDEX idx_commerce_sale_sources_sale ON public.commerce_sale_sources(sale_id);
CREATE INDEX idx_commerce_sale_sources_provider ON public.commerce_sale_sources(workspace_id, integration_provider);

-- ------------------------------------------------------------
-- commerce_refunds
-- ------------------------------------------------------------
CREATE TABLE public.commerce_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
    amount NUMERIC,
    reason TEXT,
    refund_date TIMESTAMPTZ,
    raw JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commerce_refunds_sale ON public.commerce_refunds(sale_id);
CREATE INDEX idx_commerce_refunds_workspace_date ON public.commerce_refunds(workspace_id, refund_date DESC);

-- ------------------------------------------------------------
-- commerce_refund_sources
-- ------------------------------------------------------------
CREATE TABLE public.commerce_refund_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    refund_id UUID NOT NULL REFERENCES public.commerce_refunds(id) ON DELETE CASCADE,
    integration_provider TEXT NOT NULL CHECK (char_length(integration_provider) > 0),
    external_transaction_id TEXT NOT NULL,
    raw JSONB NOT NULL DEFAULT '{}',
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, integration_provider, external_transaction_id)
);

CREATE INDEX idx_commerce_refund_sources_refund ON public.commerce_refund_sources(refund_id);
CREATE INDEX idx_commerce_refund_sources_provider ON public.commerce_refund_sources(workspace_id, integration_provider);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER commerce_products_updated
    BEFORE UPDATE ON public.commerce_products
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER commerce_product_sources_updated
    BEFORE UPDATE ON public.commerce_product_sources
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER commerce_customers_updated
    BEFORE UPDATE ON public.commerce_customers
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER commerce_customer_sources_updated
    BEFORE UPDATE ON public.commerce_customer_sources
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER commerce_sales_updated
    BEFORE UPDATE ON public.commerce_sales
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER commerce_sale_sources_updated
    BEFORE UPDATE ON public.commerce_sale_sources
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER commerce_refunds_updated
    BEFORE UPDATE ON public.commerce_refunds
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER commerce_refund_sources_updated
    BEFORE UPDATE ON public.commerce_refund_sources
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.commerce_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_product_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_customer_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_sale_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_refund_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view commerce_products"
    ON public.commerce_products FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_products.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage commerce_products"
    ON public.commerce_products FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_products.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view commerce_product_sources"
    ON public.commerce_product_sources FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_product_sources.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage commerce_product_sources"
    ON public.commerce_product_sources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_product_sources.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view commerce_customers"
    ON public.commerce_customers FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_customers.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage commerce_customers"
    ON public.commerce_customers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_customers.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view commerce_customer_sources"
    ON public.commerce_customer_sources FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_customer_sources.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage commerce_customer_sources"
    ON public.commerce_customer_sources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_customer_sources.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view commerce_sales"
    ON public.commerce_sales FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_sales.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage commerce_sales"
    ON public.commerce_sales FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_sales.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view commerce_sale_sources"
    ON public.commerce_sale_sources FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_sale_sources.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage commerce_sale_sources"
    ON public.commerce_sale_sources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_sale_sources.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view commerce_refunds"
    ON public.commerce_refunds FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_refunds.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage commerce_refunds"
    ON public.commerce_refunds FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_refunds.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view commerce_refund_sources"
    ON public.commerce_refund_sources FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_refund_sources.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage commerce_refund_sources"
    ON public.commerce_refund_sources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = commerce_refund_sources.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- Backfill from hotmart_* tables
-- ============================================================
WITH mapped_products AS (
    INSERT INTO public.commerce_products (
        workspace_id,
        name,
        status,
        format,
        price_value,
        price_currency,
        created_at_source,
        raw,
        synced_at,
        created_at,
        updated_at
    )
    SELECT
        hp.workspace_id,
        hp.name,
        hp.status,
        hp.format,
        hp.price_value,
        hp.price_currency,
        hp.created_at_hotmart,
        hp.raw,
        hp.synced_at,
        hp.created_at,
        hp.updated_at
    FROM public.hotmart_products hp
    ON CONFLICT DO NOTHING
    RETURNING id, workspace_id, raw
), all_products AS (
    SELECT cp.id, cp.workspace_id, cp.raw
    FROM public.commerce_products cp
), source_payload AS (
    SELECT
        hp.workspace_id,
        cp.id AS product_id,
        hp.hotmart_id::text AS external_id,
        hp.ucode AS external_code,
        hp.raw,
        hp.synced_at,
        hp.created_at,
        hp.updated_at
    FROM public.hotmart_products hp
    JOIN all_products cp
      ON cp.workspace_id = hp.workspace_id
     AND cp.raw = hp.raw
)
INSERT INTO public.commerce_product_sources (
    workspace_id,
    product_id,
    integration_provider,
    external_id,
    external_code,
    raw,
    synced_at,
    created_at,
    updated_at
)
SELECT
    sp.workspace_id,
    sp.product_id,
    'hotmart',
    sp.external_id,
    sp.external_code,
    sp.raw,
    sp.synced_at,
    sp.created_at,
    sp.updated_at
FROM source_payload sp
ON CONFLICT (workspace_id, integration_provider, external_id) DO UPDATE
SET product_id = EXCLUDED.product_id,
    external_code = EXCLUDED.external_code,
    raw = EXCLUDED.raw,
    synced_at = EXCLUDED.synced_at,
    updated_at = now();

INSERT INTO public.commerce_customers (
    workspace_id,
    email,
    name,
    doc,
    phone,
    country,
    raw,
    created_at,
    updated_at
)
SELECT
    hc.workspace_id,
    hc.email,
    hc.name,
    hc.doc,
    hc.phone,
    hc.country,
    hc.raw,
    hc.created_at,
    hc.updated_at
FROM public.hotmart_customers hc
ON CONFLICT (workspace_id, email) DO UPDATE
SET name = EXCLUDED.name,
    doc = EXCLUDED.doc,
    phone = EXCLUDED.phone,
    country = EXCLUDED.country,
    raw = EXCLUDED.raw,
    updated_at = now();

INSERT INTO public.commerce_sales (
    workspace_id,
    product_id,
    customer_id,
    status,
    amount,
    currency,
    commission_total,
    purchase_date,
    payment_type,
    offer_code,
    src,
    raw,
    synced_at,
    created_at,
    updated_at
)
SELECT
    hs.workspace_id,
    hs.product_id,
    cc.id AS customer_id,
    hs.status,
    hs.amount,
    hs.currency,
    hs.commission_total,
    hs.purchase_date,
    hs.payment_type,
    hs.offer_code,
    hs.src,
    hs.raw,
    hs.synced_at,
    hs.created_at,
    hs.updated_at
FROM public.hotmart_sales hs
LEFT JOIN public.hotmart_customers hcx
    ON hcx.id = hs.customer_id
LEFT JOIN public.commerce_customers cc
    ON cc.workspace_id = hs.workspace_id
   AND cc.email = hcx.email
ON CONFLICT DO NOTHING;

INSERT INTO public.commerce_sale_sources (
    workspace_id,
    sale_id,
    integration_provider,
    external_transaction_id,
    external_product_id,
    raw,
    synced_at,
    created_at,
    updated_at
)
SELECT
    hs.workspace_id,
    cs.id AS sale_id,
    'hotmart',
    hs.transaction_id,
    hs.hotmart_product_id::text,
    hs.raw,
    hs.synced_at,
    hs.created_at,
    hs.updated_at
FROM public.hotmart_sales hs
JOIN public.commerce_sales cs
  ON cs.workspace_id = hs.workspace_id
 AND cs.raw = hs.raw
ON CONFLICT (workspace_id, integration_provider, external_transaction_id) DO UPDATE
SET sale_id = EXCLUDED.sale_id,
    external_product_id = EXCLUDED.external_product_id,
    raw = EXCLUDED.raw,
    synced_at = EXCLUDED.synced_at,
    updated_at = now();

INSERT INTO public.commerce_refunds (
    workspace_id,
    sale_id,
    amount,
    reason,
    refund_date,
    raw,
    created_at,
    updated_at
)
SELECT
    hr.workspace_id,
    css.sale_id,
    hr.amount,
    hr.reason,
    hr.refund_date,
    hr.raw,
    hr.created_at,
    hr.updated_at
FROM public.hotmart_refunds hr
JOIN public.commerce_sale_sources css
  ON css.workspace_id = hr.workspace_id
 AND css.integration_provider = 'hotmart'
 AND css.external_transaction_id = hr.transaction_id
ON CONFLICT DO NOTHING;

INSERT INTO public.commerce_refund_sources (
    workspace_id,
    refund_id,
    integration_provider,
    external_transaction_id,
    raw,
    synced_at,
    created_at,
    updated_at
)
SELECT
    hr.workspace_id,
    cr.id AS refund_id,
    'hotmart',
    hr.transaction_id,
    hr.raw,
    NULL,
    hr.created_at,
    hr.updated_at
FROM public.hotmart_refunds hr
JOIN public.commerce_refunds cr
  ON cr.workspace_id = hr.workspace_id
 AND cr.raw = hr.raw
ON CONFLICT (workspace_id, integration_provider, external_transaction_id) DO UPDATE
SET refund_id = EXCLUDED.refund_id,
    raw = EXCLUDED.raw,
    updated_at = now();

-- ============================================================
-- RPC: reconcile product_id in commerce_sales from source ids
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_commerce_sale_products(
    p_workspace_id UUID,
    p_provider TEXT DEFAULT 'hotmart'
) RETURNS INT AS $$
DECLARE
    n INT;
BEGIN
    UPDATE public.commerce_sales s
       SET product_id = psrc.product_id,
           updated_at = now()
      FROM public.commerce_sale_sources ssrc
      JOIN public.commerce_product_sources psrc
        ON psrc.workspace_id = p_workspace_id
       AND psrc.integration_provider = p_provider
       AND psrc.external_id = ssrc.external_product_id
     WHERE s.id = ssrc.sale_id
       AND s.workspace_id = p_workspace_id
       AND ssrc.workspace_id = p_workspace_id
       AND ssrc.integration_provider = p_provider
       AND ssrc.external_product_id IS NOT NULL
       AND (s.product_id IS DISTINCT FROM psrc.product_id);

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reconcile_commerce_sale_products(UUID, TEXT) TO service_role;
