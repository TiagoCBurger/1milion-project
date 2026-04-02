import type { Env } from "../types";
import { sha256Hex, jsonResponse, oauthError } from "./utils";

/**
 * POST /revoke — Token revocation (RFC 7009).
 */
export async function handleRevoke(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return oauthError("invalid_request", "Method not allowed", 405);
  }

  let params: URLSearchParams;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, string>;
    params = new URLSearchParams(body);
  } else {
    params = new URLSearchParams(await request.text());
  }

  const token = params.get("token");
  if (!token) {
    return oauthError("invalid_request", "Missing token parameter");
  }

  const tokenHash = await sha256Hex(token);
  const tokenType = params.get("token_type_hint") || "access_token";

  // Try to delete both access and refresh token (best effort)
  if (tokenType === "refresh_token") {
    await env.OAUTH_KV.delete(`oauth:refresh:${tokenHash}`);
  } else {
    await env.OAUTH_KV.delete(`oauth:token:${tokenHash}`);
  }

  // RFC 7009: always return 200 regardless of whether token existed
  return jsonResponse({}, 200);
}
