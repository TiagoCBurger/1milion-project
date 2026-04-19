-- get_site_by_public_key: include is_active (migration 024) and
-- capi_encrypted_token so the track-worker can honor the kill switch
-- and dispatch Meta CAPI without a second round-trip.

DROP FUNCTION IF EXISTS analytics.get_site_by_public_key(TEXT);

CREATE FUNCTION analytics.get_site_by_public_key(
    p_public_key TEXT
) RETURNS TABLE (
    id UUID,
    workspace_id UUID,
    domain TEXT,
    is_active BOOLEAN,
    block_bots BOOLEAN,
    track_outbound BOOLEAN,
    track_performance BOOLEAN,
    excluded_ips TEXT[],
    excluded_countries TEXT[],
    pixel_id TEXT,
    capi_encrypted_token TEXT,
    has_capi_token BOOLEAN
) AS $$
    SELECT
        s.id,
        s.workspace_id,
        s.domain,
        s.is_active,
        s.block_bots,
        s.track_outbound,
        s.track_performance,
        s.excluded_ips,
        s.excluded_countries,
        s.pixel_id,
        s.capi_encrypted_token,
        s.capi_encrypted_token IS NOT NULL AS has_capi_token
    FROM analytics.sites s
    WHERE s.public_key = p_public_key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION analytics.get_site_by_public_key(TEXT) TO service_role;
