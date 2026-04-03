-- ============================================================
-- Email System: events log + user preferences
-- ============================================================

-- ── Tables ─────────────────────────────────────────────────

-- Immutable log of Resend webhook events (delivery tracking)
CREATE TABLE public.email_events (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resend_email_id  TEXT NOT NULL,
    event_type       TEXT NOT NULL,  -- sent | delivered | bounced | complained | opened | clicked
    to_email         TEXT NOT NULL,
    subject          TEXT,
    tags             JSONB NOT NULL DEFAULT '{}',
    metadata         JSONB NOT NULL DEFAULT '{}',
    workspace_id     UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_events_resend_id   ON public.email_events(resend_email_id);
CREATE INDEX idx_email_events_to          ON public.email_events(to_email, created_at DESC);
CREATE INDEX idx_email_events_workspace   ON public.email_events(workspace_id, created_at DESC);
CREATE INDEX idx_email_events_type        ON public.email_events(event_type, created_at DESC);

-- Per-user marketing preferences
CREATE TABLE public.email_preferences (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    marketing_opted_in  BOOLEAN NOT NULL DEFAULT true,
    product_updates     BOOLEAN NOT NULL DEFAULT true,
    tips_and_tricks     BOOLEAN NOT NULL DEFAULT true,
    unsubscribed_at     TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_preferences_user ON public.email_preferences(user_id);

-- ── Row Level Security ──────────────────────────────────────

ALTER TABLE public.email_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

-- email_events: service_role only (no user access, same as billing_events)

-- email_preferences: users read/update their own row
CREATE POLICY "Users can view own email preferences"
    ON public.email_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own email preferences"
    ON public.email_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- ── Grants ──────────────────────────────────────────────────

GRANT ALL ON public.email_events      TO service_role;
GRANT ALL ON public.email_preferences TO service_role;
GRANT SELECT, UPDATE ON public.email_preferences TO authenticated;

-- ── Extend handle_new_user trigger ─────────────────────────
-- Adds default email preferences row when a new user signs up

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    );

    INSERT INTO public.email_preferences (user_id, marketing_opted_in)
    VALUES (NEW.id, true);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
