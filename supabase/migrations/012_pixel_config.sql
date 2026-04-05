-- Add Meta Pixel + CAPI configuration to workspaces
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS capi_access_token TEXT;

COMMENT ON COLUMN workspaces.pixel_id IS 'Meta Pixel ID for client-side tracking';
COMMENT ON COLUMN workspaces.capi_access_token IS 'Meta Conversions API access token for server-side tracking';
