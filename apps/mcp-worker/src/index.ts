import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { validateApiKey, getMetaToken, verifyOAuthAccessToken, type AuthResult } from "./auth";
import { checkRateLimit } from "./rate-limit";
import { logUsage } from "./usage";
import { registerAllTools } from "./tools";
import { routeOAuth } from "./oauth/router";
import type { Env, WorkspaceContext } from "./types";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // -------------------------------------------------------
    // Health check
    // -------------------------------------------------------
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    // -------------------------------------------------------
    // CORS preflight
    // -------------------------------------------------------
    if (request.method === "OPTIONS") {
      return handleCors();
    }

    // -------------------------------------------------------
    // OAuth endpoints (/.well-known/*, /authorize, /token, etc.)
    // -------------------------------------------------------
    const oauthResponse = await routeOAuth(request, url, env);
    if (oauthResponse) return oauthResponse;

    // -------------------------------------------------------
    // Only handle POST /mcp (stateless HTTP transport)
    // -------------------------------------------------------
    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method === "GET") {
      // SSE streaming not supported on Workers — tell client not to retry
      return new Response("SSE not supported", {
        status: 405,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    if (request.method === "DELETE") {
      // No sessions to close in stateless mode
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // -------------------------------------------------------
    // 1. Authenticate (API key or OAuth token)
    // -------------------------------------------------------
    const authResult = await authenticateRequest(request, url, env);
    if (!authResult.ok) {
      const isNoCredentials = authResult.error === "no_credentials";
      const message = isNoCredentials
        ? "Unauthorized. Use API key or OAuth to authenticate."
        : authResult.error;
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message },
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "WWW-Authenticate": `Bearer resource_metadata="${env.MCP_SERVER_URL}/.well-known/oauth-protected-resource"`,
          },
        }
      );
    }
    const workspace = authResult.workspace;

    // -------------------------------------------------------
    // 3. Rate limit
    // -------------------------------------------------------
    const rateResult = await checkRateLimit(workspace, env);
    if (rateResult.limited) {
      return jsonRpcError(
        -32600,
        `Rate limit exceeded (${rateResult.limit}/hr). Retry after ${rateResult.retryAfter}s`,
        null,
        429
      );
    }

    // -------------------------------------------------------
    // 4. Fetch Meta token for this workspace
    // -------------------------------------------------------
    const metaToken = await getMetaToken(workspace.workspaceId, env);

    // -------------------------------------------------------
    // 5. Handle MCP via stateless HTTP transport (POST only)
    // -------------------------------------------------------
    const startTime = Date.now();

    const server = buildServer(metaToken, workspace, env);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request);
    const responseTime = Date.now() - startTime;

    // -------------------------------------------------------
    // 6. Log usage (non-blocking)
    // -------------------------------------------------------
    ctx.waitUntil(
      logUsage(
        {
          workspaceId: workspace.workspaceId,
          apiKeyId: workspace.apiKeyId,
          toolName: "mcp_request",
          method: request.method,
          statusCode: response.status,
          responseTimeMs: responseTime,
          isError: !response.ok,
        },
        env
      )
    );

    // -------------------------------------------------------
    // 7. Return with CORS headers
    // -------------------------------------------------------
    const corsResponse = new Response(response.body, response);
    corsResponse.headers.set("Access-Control-Allow-Origin", "*");
    corsResponse.headers.set("X-Response-Time", `${responseTime}ms`);
    return corsResponse;
  },
};

// ============================================================
// MCP Server builder (new instance per request)
// ============================================================

function buildServer(
  metaToken: string | null,
  workspace: WorkspaceContext,
  env: Env
): McpServer {
  const server = new McpServer({
    name: "vibefly",
    version: "1.0.0",
  });

  if (!metaToken) {
    // No token connected — register a single tool that explains how to connect
    server.tool(
      "connect_required",
      "No Meta account connected to this workspace",
      {},
      async () => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error:
                "No Meta account connected. Go to your dashboard to paste your Meta access token.",
              help: "https://yourdomain.com/dashboard",
            }),
          },
        ],
        isError: true,
      })
    );
    return server;
  }

  registerAllTools({ server, token: metaToken, tier: workspace.tier, env, workspaceId: workspace.workspaceId, allowedAccounts: workspace.allowedAccounts });
  return server;
}

// ============================================================
// Helpers
// ============================================================

async function authenticateRequest(
  request: Request,
  url: URL,
  env: Env
): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");

  // API key via header
  if (authHeader?.startsWith("Bearer mads_")) {
    return validateApiKey(authHeader.slice(7), env);
  }

  // OAuth access token via header
  if (authHeader?.startsWith("Bearer ")) {
    return verifyOAuthAccessToken(authHeader.slice(7), env);
  }

  // API key via query param
  const keyParam = url.searchParams.get("key");
  if (keyParam?.startsWith("mads_")) {
    return validateApiKey(keyParam, env);
  }

  return { ok: false, error: "no_credentials" };
}

function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Accept, Mcp-Session-Id",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function jsonRpcError(
  code: number,
  message: string,
  id: string | number | null | undefined,
  httpStatus = 200
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message },
    }),
    {
      status: httpStatus,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
