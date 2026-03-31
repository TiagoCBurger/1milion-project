-- ============================================================
-- Meta Ads Cloud - Initial Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TYPES
-- ============================================================

CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing');

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    email TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    meta_business_id TEXT,
    meta_business_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    role membership_role NOT NULL DEFAULT 'member',
    invited_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, workspace_id)
);

CREATE TABLE public.meta_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
    encrypted_token BYTEA NOT NULL,
    token_type TEXT NOT NULL DEFAULT 'long_lived',
    meta_user_id TEXT,
    scopes TEXT[],
    expires_at TIMESTAMPTZ,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    last_validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Default',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash) WHERE is_active = true;

CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
    tier subscription_tier NOT NULL DEFAULT 'free',
    status subscription_status NOT NULL DEFAULT 'active',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    requests_per_minute INT NOT NULL DEFAULT 20,
    requests_per_day INT NOT NULL DEFAULT 500,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id),
    api_key_id UUID REFERENCES public.api_keys(id),
    tool_name TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'tools/call',
    status_code INT,
    response_time_ms INT,
    is_error BOOLEAN NOT NULL DEFAULT false,
    error_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_workspace_created
    ON public.usage_logs(workspace_id, created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- workspaces (now memberships table exists)
CREATE POLICY "Members can view workspace"
    ON public.workspaces FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = workspaces.id
              AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins can update workspace"
    ON public.workspaces FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = workspaces.id
              AND memberships.user_id = auth.uid()
              AND memberships.role IN ('owner', 'admin')
        )
    );

-- memberships
CREATE POLICY "Users can view own memberships"
    ON public.memberships FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Members can view co-members"
    ON public.memberships FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m2
            WHERE m2.workspace_id = memberships.workspace_id
              AND m2.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners can manage memberships"
    ON public.memberships FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships m2
            WHERE m2.workspace_id = memberships.workspace_id
              AND m2.user_id = auth.uid()
              AND m2.role = 'owner'
        )
    );

-- meta_tokens
CREATE POLICY "Members can view token metadata"
    ON public.meta_tokens FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = meta_tokens.workspace_id
              AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins can manage tokens"
    ON public.meta_tokens FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = meta_tokens.workspace_id
              AND memberships.user_id = auth.uid()
              AND memberships.role IN ('owner', 'admin')
        )
    );

-- api_keys
CREATE POLICY "Members can view workspace api_keys"
    ON public.api_keys FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = api_keys.workspace_id
              AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners/admins can manage api_keys"
    ON public.api_keys FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = api_keys.workspace_id
              AND memberships.user_id = auth.uid()
              AND memberships.role IN ('owner', 'admin')
        )
    );

-- subscriptions
CREATE POLICY "Members can view subscription"
    ON public.subscriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = subscriptions.workspace_id
              AND memberships.user_id = auth.uid()
        )
    );

-- usage_logs
CREATE POLICY "Members can view workspace usage"
    ON public.usage_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE memberships.workspace_id = usage_logs.workspace_id
              AND memberships.user_id = auth.uid()
        )
    );

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.encrypt_meta_token(
    p_workspace_id UUID,
    p_token TEXT,
    p_encryption_key TEXT,
    p_token_type TEXT DEFAULT 'long_lived',
    p_meta_user_id TEXT DEFAULT NULL,
    p_scopes TEXT[] DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.meta_tokens (
        workspace_id, encrypted_token, token_type, meta_user_id, scopes, expires_at, is_valid, last_validated_at
    ) VALUES (
        p_workspace_id,
        pgp_sym_encrypt(p_token, p_encryption_key),
        p_token_type,
        p_meta_user_id,
        p_scopes,
        p_expires_at,
        true,
        now()
    )
    ON CONFLICT (workspace_id) DO UPDATE SET
        encrypted_token = pgp_sym_encrypt(p_token, p_encryption_key),
        token_type = EXCLUDED.token_type,
        meta_user_id = EXCLUDED.meta_user_id,
        scopes = EXCLUDED.scopes,
        expires_at = EXCLUDED.expires_at,
        is_valid = true,
        last_validated_at = now(),
        updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrypt_meta_token(
    p_workspace_id UUID,
    p_encryption_key TEXT
) RETURNS TEXT AS $$
DECLARE
    v_token TEXT;
BEGIN
    SELECT pgp_sym_decrypt(encrypted_token, p_encryption_key)
    INTO v_token
    FROM public.meta_tokens
    WHERE workspace_id = p_workspace_id
      AND is_valid = true
      AND (expires_at IS NULL OR expires_at > now());

    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.generate_api_key(
    p_workspace_id UUID,
    p_created_by UUID,
    p_name TEXT DEFAULT 'Default'
) RETURNS TABLE(id UUID, raw_key TEXT, key_prefix TEXT) AS $$
DECLARE
    v_id UUID;
    v_raw_key TEXT;
    v_prefix TEXT;
BEGIN
    v_raw_key := 'mads_' || encode(gen_random_bytes(24), 'hex');
    v_prefix := substring(v_raw_key, 1, 12);

    INSERT INTO public.api_keys (workspace_id, created_by, key_hash, key_prefix, name)
    VALUES (
        p_workspace_id,
        p_created_by,
        crypt(v_raw_key, gen_salt('bf')),
        v_prefix,
        p_name
    )
    RETURNING api_keys.id INTO v_id;

    RETURN QUERY SELECT v_id, v_raw_key, v_prefix;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.validate_api_key(
    p_api_key TEXT
) RETURNS TABLE(
    workspace_id UUID,
    api_key_id UUID,
    tier subscription_tier,
    requests_per_minute INT,
    requests_per_day INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ak.workspace_id,
        ak.id AS api_key_id,
        COALESCE(s.tier, 'free'::subscription_tier),
        COALESCE(s.requests_per_minute, 20),
        COALESCE(s.requests_per_day, 500)
    FROM public.api_keys ak
    LEFT JOIN public.subscriptions s
        ON s.workspace_id = ak.workspace_id
        AND s.status = 'active'
    WHERE ak.key_hash = crypt(p_api_key, ak.key_hash)
      AND ak.is_active = true
      AND (ak.expires_at IS NULL OR ak.expires_at > now());

    UPDATE public.api_keys
    SET last_used_at = now()
    WHERE key_hash = crypt(p_api_key, key_hash)
      AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.create_workspace(
    p_name TEXT,
    p_slug TEXT,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    INSERT INTO public.workspaces (name, slug)
    VALUES (p_name, p_slug)
    RETURNING id INTO v_workspace_id;

    INSERT INTO public.memberships (user_id, workspace_id, role)
    VALUES (p_user_id, v_workspace_id, 'owner');

    INSERT INTO public.subscriptions (workspace_id, tier, status, requests_per_minute, requests_per_day)
    VALUES (v_workspace_id, 'free', 'active', 20, 500);

    RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
