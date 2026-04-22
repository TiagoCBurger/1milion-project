/** Stored in KV: oauth:client:{client_id} */
export interface StoredClient {
  client_id: string;
  client_secret: string;
  client_id_issued_at: number;
  client_secret_expires_at: number;
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
}

/** Stored in KV: oauth:authreq:{request_id} */
export interface StoredAuthRequest {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state?: string;
  scope?: string;
  created_at: number;
}

/**
 * Stored in KV: oauth:code:{code_hash}
 *
 * `allowed_accounts` is retained ONLY to interpret pre-029 migration tokens
 * still alive in KV (shim in verifyOAuthAccessToken). New grants only write
 * `allowed_projects`.
 */
export interface StoredAuthCode {
  client_id: string;
  organization_id: string;
  user_id: string;
  code_challenge: string;
  redirect_uri: string;
  scope?: string;
  allowed_projects?: string[];
  /** @deprecated replaced by allowed_projects after migration 029 */
  allowed_accounts?: string[];
  created_at: number;
}

/** Stored in KV: oauth:token:{token_hash} */
export interface StoredAccessToken {
  client_id: string;
  organization_id: string;
  user_id: string;
  scope?: string;
  allowed_projects?: string[];
  /** @deprecated — see StoredAuthCode */
  allowed_accounts?: string[];
  expires_at: number;
  created_at: number;
}

/** Stored in KV: oauth:refresh:{token_hash} */
export interface StoredRefreshToken {
  client_id: string;
  organization_id: string;
  user_id: string;
  scope?: string;
  allowed_projects?: string[];
  /** @deprecated — see StoredAuthCode */
  allowed_accounts?: string[];
  created_at: number;
}

/** JWT payload from web app callback */
export interface CallbackJwtPayload {
  request_id: string;
  user_id: string;
  organization_id: string;
  allowed_projects?: string[];
  /** @deprecated — see StoredAuthCode */
  allowed_accounts?: string[];
  iat: number;
  exp: number;
}
