-- ============================================================
-- Hotmart integration: credentials, catalog, sales, webhooks
-- ============================================================

-- ------------------------------------------------------------
-- hotmart_credentials
-- ------------------------------------------------------------
CREATE TABLE public.hotmart_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
    encrypted_client_id BYTEA,
    encrypted_client_secret BYTEA,
    encrypted_basic_token BYTEA,
    encrypted_access_token BYTEA,
    token_expires_at TIMESTAMPTZ,
    webhook_hottok TEXT NOT NULL,
    webhook_url TEXT,
    webhook_confirmed_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotmart_credentials_workspace ON public.hotmart_credentials(workspace_id);

-- ------------------------------------------------------------
-- hotmart_products
-- ------------------------------------------------------------
CREATE TABLE public.hotmart_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    hotmart_id BIGINT NOT NULL,
    name TEXT,
    ucode TEXT,
    status TEXT,
    format TEXT,
    price_value NUMERIC,
    price_currency TEXT,
    created_at_hotmart TIMESTAMPTZ,
    raw JSONB NOT NULL DEFAULT '{}',
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, hotmart_id)
);

CREATE INDEX idx_hotmart_products_workspace ON public.hotmart_products(workspace_id);
CREATE INDEX idx_hotmart_products_status ON public.hotmart_products(workspace_id, status);

-- ------------------------------------------------------------
-- hotmart_customers
-- ------------------------------------------------------------
CREATE TABLE public.hotmart_customers (
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

CREATE INDEX idx_hotmart_customers_workspace_email ON public.hotmart_customers(workspace_id, email);

-- ------------------------------------------------------------
-- hotmart_sales
-- ------------------------------------------------------------
CREATE TABLE public.hotmart_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL,
    hotmart_product_id BIGINT,
    product_id UUID REFERENCES public.hotmart_products(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.hotmart_customers(id) ON DELETE SET NULL,
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, transaction_id)
);

CREATE INDEX idx_hotmart_sales_workspace_purchase ON public.hotmart_sales(workspace_id, purchase_date DESC);
CREATE INDEX idx_hotmart_sales_workspace_status ON public.hotmart_sales(workspace_id, status);
CREATE INDEX idx_hotmart_sales_workspace_product ON public.hotmart_sales(workspace_id, product_id);
CREATE INDEX idx_hotmart_sales_workspace_hotmart_product ON public.hotmart_sales(workspace_id, hotmart_product_id);

-- ------------------------------------------------------------
-- hotmart_refunds
-- ------------------------------------------------------------
CREATE TABLE public.hotmart_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES public.hotmart_sales(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL,
    refund_date TIMESTAMPTZ,
    amount NUMERIC,
    reason TEXT,
    raw JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, transaction_id)
);

CREATE INDEX idx_hotmart_refunds_sale ON public.hotmart_refunds(sale_id);

-- ------------------------------------------------------------
-- hotmart_webhook_events
-- ------------------------------------------------------------
CREATE TABLE public.hotmart_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    event_type TEXT,
    payload JSONB NOT NULL DEFAULT '{}',
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    error TEXT,
    UNIQUE (workspace_id, event_id)
);

CREATE INDEX idx_hotmart_webhook_events_workspace ON public.hotmart_webhook_events(workspace_id);

-- ------------------------------------------------------------
-- hotmart_sync_log
-- ------------------------------------------------------------
CREATE TABLE public.hotmart_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    entity TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    records_synced INT NOT NULL DEFAULT 0,
    error TEXT,
    trigger TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotmart_sync_log_workspace ON public.hotmart_sync_log(workspace_id, started_at DESC);

-- ============================================================
-- updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hotmart_credentials_updated
    BEFORE UPDATE ON public.hotmart_credentials
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER hotmart_products_updated
    BEFORE UPDATE ON public.hotmart_products
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER hotmart_customers_updated
    BEFORE UPDATE ON public.hotmart_customers
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER hotmart_sales_updated
    BEFORE UPDATE ON public.hotmart_sales
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER hotmart_refunds_updated
    BEFORE UPDATE ON public.hotmart_refunds
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- RPC: upsert credentials (owners/admins)
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_hotmart_credentials(
    p_workspace_id UUID,
    p_encryption_key TEXT,
    p_client_id TEXT,
    p_client_secret TEXT,
    p_basic_token TEXT,
    p_access_token TEXT,
    p_token_expires_at TIMESTAMPTZ,
    p_webhook_hottok TEXT,
    p_webhook_url TEXT
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.workspace_id = p_workspace_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
    ) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    INSERT INTO public.hotmart_credentials (
        workspace_id,
        encrypted_client_id,
        encrypted_client_secret,
        encrypted_basic_token,
        encrypted_access_token,
        token_expires_at,
        webhook_hottok,
        webhook_url,
        is_active,
        webhook_confirmed_at
    ) VALUES (
        p_workspace_id,
        pgp_sym_encrypt(p_client_id, p_encryption_key),
        pgp_sym_encrypt(p_client_secret, p_encryption_key),
        pgp_sym_encrypt(p_basic_token, p_encryption_key),
        pgp_sym_encrypt(p_access_token, p_encryption_key),
        p_token_expires_at,
        p_webhook_hottok,
        p_webhook_url,
        true,
        NULL
    )
    ON CONFLICT (workspace_id) DO UPDATE SET
        encrypted_client_id = EXCLUDED.encrypted_client_id,
        encrypted_client_secret = EXCLUDED.encrypted_client_secret,
        encrypted_basic_token = EXCLUDED.encrypted_basic_token,
        encrypted_access_token = EXCLUDED.encrypted_access_token,
        token_expires_at = EXCLUDED.token_expires_at,
        webhook_hottok = EXCLUDED.webhook_hottok,
        webhook_url = EXCLUDED.webhook_url,
        is_active = true,
        webhook_confirmed_at = NULL,
        updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: disconnect (owners/admins) — keeps historical rows
-- ============================================================
CREATE OR REPLACE FUNCTION public.disconnect_hotmart(
    p_workspace_id UUID
) RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.workspace_id = p_workspace_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
    ) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    UPDATE public.hotmart_credentials
    SET is_active = false,
        encrypted_client_id = NULL,
        encrypted_client_secret = NULL,
        encrypted_basic_token = NULL,
        encrypted_access_token = NULL,
        token_expires_at = NULL,
        updated_at = now()
    WHERE workspace_id = p_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: decrypt credentials (service role / Edge only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.decrypt_hotmart_credentials(
    p_workspace_id UUID,
    p_encryption_key TEXT
) RETURNS JSONB AS $$
DECLARE
    r RECORD;
    v_client_id TEXT;
    v_client_secret TEXT;
    v_basic TEXT;
    v_access TEXT;
BEGIN
    SELECT * INTO r
    FROM public.hotmart_credentials c
    WHERE c.workspace_id = p_workspace_id
      AND c.is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF r.encrypted_client_id IS NULL OR r.encrypted_client_secret IS NULL OR r.encrypted_basic_token IS NULL THEN
        RETURN NULL;
    END IF;

    v_client_id := pgp_sym_decrypt(r.encrypted_client_id, p_encryption_key)::text;
    v_client_secret := pgp_sym_decrypt(r.encrypted_client_secret, p_encryption_key)::text;
    v_basic := pgp_sym_decrypt(r.encrypted_basic_token, p_encryption_key)::text;

    IF r.encrypted_access_token IS NOT NULL THEN
        v_access := pgp_sym_decrypt(r.encrypted_access_token, p_encryption_key)::text;
    ELSE
        v_access := NULL;
    END IF;

    RETURN jsonb_build_object(
        'client_id', v_client_id,
        'client_secret', v_client_secret,
        'basic_token', v_basic,
        'access_token', v_access,
        'token_expires_at', r.token_expires_at,
        'webhook_hottok', r.webhook_hottok
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: update access token after refresh (service role)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_hotmart_access_token(
    p_workspace_id UUID,
    p_encryption_key TEXT,
    p_access_token TEXT,
    p_token_expires_at TIMESTAMPTZ
) RETURNS VOID AS $$
BEGIN
    UPDATE public.hotmart_credentials
    SET encrypted_access_token = pgp_sym_encrypt(p_access_token, p_encryption_key),
        token_expires_at = p_token_expires_at,
        updated_at = now()
    WHERE workspace_id = p_workspace_id
      AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.hotmart_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view hotmart_credentials"
    ON public.hotmart_credentials FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_credentials.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage hotmart_credentials"
    ON public.hotmart_credentials FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_credentials.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view hotmart_products"
    ON public.hotmart_products FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_products.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage hotmart_products"
    ON public.hotmart_products FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_products.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view hotmart_customers"
    ON public.hotmart_customers FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_customers.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage hotmart_customers"
    ON public.hotmart_customers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_customers.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view hotmart_sales"
    ON public.hotmart_sales FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_sales.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage hotmart_sales"
    ON public.hotmart_sales FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_sales.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view hotmart_refunds"
    ON public.hotmart_refunds FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_refunds.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage hotmart_refunds"
    ON public.hotmart_refunds FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_refunds.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view hotmart_webhook_events"
    ON public.hotmart_webhook_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_webhook_events.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage hotmart_webhook_events"
    ON public.hotmart_webhook_events FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_webhook_events.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Members can view hotmart_sync_log"
    ON public.hotmart_sync_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_sync_log.workspace_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins manage hotmart_sync_log"
    ON public.hotmart_sync_log FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.workspace_id = hotmart_sync_log.workspace_id
              AND m.user_id = auth.uid()
              AND m.role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.upsert_hotmart_credentials(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_hotmart(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_hotmart_credentials(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_hotmart_access_token(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- Link sales to local product rows after products sync
CREATE OR REPLACE FUNCTION public.reconcile_hotmart_sale_products(p_workspace_id UUID)
RETURNS INT AS $$
DECLARE
    n INT;
BEGIN
    UPDATE public.hotmart_sales s
    SET product_id = p.id,
        updated_at = now()
    FROM public.hotmart_products p
    WHERE s.workspace_id = p_workspace_id
      AND p.workspace_id = p_workspace_id
      AND s.hotmart_product_id IS NOT NULL
      AND s.hotmart_product_id = p.hotmart_id
      AND (s.product_id IS DISTINCT FROM p.id);

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reconcile_hotmart_sale_products(UUID) TO service_role;
