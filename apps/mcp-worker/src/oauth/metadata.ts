import type { Env } from "../types";
import { jsonResponse } from "./utils";

/**
 * GET /.well-known/oauth-protected-resource
 * RFC 9728 — tells the client where the authorization server is.
 */
export function handleProtectedResourceMetadata(env: Env): Response {
  return jsonResponse({
    resource: `${env.MCP_SERVER_URL}/mcp`,
    authorization_servers: [env.MCP_SERVER_URL],
    bearer_methods_supported: ["header"],
  });
}

/**
 * GET /.well-known/oauth-authorization-server
 * RFC 8414 — advertises all OAuth endpoints and capabilities.
 */
export function handleAuthServerMetadata(env: Env): Response {
  const issuer = env.MCP_SERVER_URL;

  return jsonResponse({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    revocation_endpoint: `${issuer}/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
    ],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp"],
  });
}
