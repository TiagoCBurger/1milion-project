import type { Env } from "../types";
import {
  handleProtectedResourceMetadata,
  handleAuthServerMetadata,
} from "./metadata";
import { handleRegister } from "./register";
import { handleAuthorize, handleOAuthCallback } from "./authorize";
import { handleToken } from "./token";
import { handleRevoke } from "./revoke";

/**
 * Routes OAuth-related requests. Returns a Response if handled, null otherwise.
 */
export async function routeOAuth(
  request: Request,
  url: URL,
  env: Env
): Promise<Response | null> {
  const path = url.pathname;

  // Well-known metadata endpoints (GET only)
  if (path === "/.well-known/oauth-protected-resource") {
    return handleProtectedResourceMetadata(env);
  }
  if (path === "/.well-known/oauth-authorization-server") {
    return handleAuthServerMetadata(env);
  }

  // Dynamic client registration
  if (path === "/register") {
    return handleRegister(request, env);
  }

  // Authorization endpoint
  if (path === "/authorize" && request.method === "GET") {
    return handleAuthorize(request, env);
  }

  // Callback from web app after user consent
  if (path === "/oauth/callback" && request.method === "GET") {
    return handleOAuthCallback(request, env);
  }

  // Token endpoint
  if (path === "/token") {
    return handleToken(request, env);
  }

  // Token revocation
  if (path === "/revoke") {
    return handleRevoke(request, env);
  }

  return null;
}
