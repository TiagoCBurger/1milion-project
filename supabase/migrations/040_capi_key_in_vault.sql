-- ============================================================
-- 040_capi_key_in_vault.sql
--
-- Security hardening: stop passing CAPI_ENCRYPTION_KEY from the
-- worker / web service into the database on every call.
--
-- Before this migration every invocation of analytics.encrypt_capi_token
-- and analytics.decrypt_capi_token carried the symmetric key in the RPC
-- body. Postgres / PostgREST error logs, network traces, and any future
-- statement logging would capture it. Workers also had to store the key
-- in two places (web + track-worker) with a shared secret.
--
-- Now the key lives in Supabase Vault (vault.secrets), a built-in
-- encrypted-at-rest store. The encrypt/decrypt RPCs read it via
-- vault.decrypted_secrets — callers no longer need (and should not have)
-- direct access to the key material.
--
-- Rollout:
--   1. Populate the secret before deploying the new worker/web:
--        SELECT vault.create_secret(
--          '<hex-key currently in CAPI_ENCRYPTION_KEY>',
--          'analytics.capi_encryption_key'
--        );
--      (Or update an existing secret with vault.update_secret.)
--   2. Deploy this migration.
--   3. Deploy worker/web without CAPI_ENCRYPTION_KEY env var.
--
-- ⚠️ PER-PROJECT ACTION REQUIRED
-- This migration is pure DDL and will apply to any Supabase project
-- (staging, production, previews). The vault secret itself is project-
-- scoped and is NOT carried over when you clone or create a new project.
-- Every time a new Supabase project is created you MUST:
--   a) Populate vault.secrets with 'analytics.capi_encryption_key' using
--      the hex that matches any existing analytics.sites.capi_encrypted_token
--      rows (if you're cloning data) OR generate a fresh hex with
--      `openssl rand -hex 32` if the project starts empty.
--   b) Then run this migration.
-- If step (a) is skipped, analytics.decrypt_capi_token returns NULL and
-- every site's CAPI delivery goes dark.
-- See docs/analytics-ops.md §1a for the full checklist.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Reads the CAPI symmetric key from the vault. Kept private — only the
-- encrypt/decrypt RPCs should ever hit this.
CREATE OR REPLACE FUNCTION analytics.capi_encryption_key()
RETURNS TEXT AS $$
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = 'analytics.capi_encryption_key'
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION analytics.capi_encryption_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION analytics.capi_encryption_key() FROM anon;
REVOKE ALL ON FUNCTION analytics.capi_encryption_key() FROM authenticated;
-- Intentionally no GRANT: only SECURITY DEFINER helpers in this schema
-- should call this (they inherit the definer's permissions).

-- ─── New no-key-arg RPCs ────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.encrypt_capi_token(
    p_site_id UUID,
    p_token TEXT
) RETURNS VOID AS $$
DECLARE
    v_key TEXT := analytics.capi_encryption_key();
BEGIN
    IF v_key IS NULL THEN
        RAISE EXCEPTION 'analytics.capi_encryption_key vault secret is not configured';
    END IF;
    UPDATE analytics.sites
    SET capi_encrypted_token = pgp_sym_encrypt(p_token, v_key),
        updated_at = now()
    WHERE id = p_site_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION analytics.decrypt_capi_token(
    p_site_id UUID
) RETURNS TEXT AS $$
    SELECT pgp_sym_decrypt(capi_encrypted_token, analytics.capi_encryption_key())::TEXT
    FROM analytics.sites
    WHERE id = p_site_id
      AND capi_encrypted_token IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER;

REVOKE ALL ON FUNCTION analytics.encrypt_capi_token(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION analytics.encrypt_capi_token(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION analytics.encrypt_capi_token(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION analytics.encrypt_capi_token(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION analytics.decrypt_capi_token(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION analytics.decrypt_capi_token(UUID) FROM anon;
REVOKE ALL ON FUNCTION analytics.decrypt_capi_token(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION analytics.decrypt_capi_token(UUID) TO service_role;

-- ─── Retire legacy key-carrying RPCs ────────────────────────
-- Any caller still passing p_encryption_key is unsafe; drop those
-- signatures to make the migration failure-closed if a stale client
-- tries to reach them.
DROP FUNCTION IF EXISTS analytics.encrypt_capi_token(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS analytics.decrypt_capi_token(UUID, TEXT);
