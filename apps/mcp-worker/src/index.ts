import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { validateApiKey, getMetaToken, verifyOAuthAccessToken, type AuthResult } from "./auth";
import { checkRateLimit } from "./rate-limit";
import { logUsage } from "./usage";
import { registerAllTools } from "./tools";
import { wrapServerWithAudit } from "./audit";
import { routeOAuth } from "./oauth/router";
import { runJanitor } from "./janitor";
import type { Env, OrganizationContext } from "./types";

export { RateLimitDO } from "./rate-limit-do";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      return await handleFetch(request, env, ctx);
    } catch (err) {
      console.error("[mcp-worker] unhandled:", err);
      const message =
        err instanceof Error ? err.message : "Internal server error";
      return new Response(
        JSON.stringify({
          error: "server_error",
          error_description: message,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const result = await runJanitor(env);
        console.log("[janitor]", JSON.stringify(result));
      })(),
    );
  },
};

async function handleFetch(
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
    // 3. Free tier — no API access
    // -------------------------------------------------------
    if (workspace.tier === "free") {
      return jsonRpcError(
        -32600,
        "A free plan does not include API access. Upgrade to Pro or Max at vibefly.app/dashboard.",
        null,
        403
      );
    }

    // -------------------------------------------------------
    // 4. Rate limit
    // -------------------------------------------------------
    const rateResult = await checkRateLimit(workspace, env);
    if (rateResult.limited) {
      const scopeLabel = rateResult.scope === "minute" ? "min" : rateResult.scope === "day" ? "day" : "hr";
      return jsonRpcError(
        -32600,
        `Rate limit exceeded (${rateResult.limit}/${scopeLabel}). Retry after ${rateResult.retryAfter}s`,
        null,
        429
      );
    }

    // -------------------------------------------------------
    // 4. Fetch Meta token for this organization
    // -------------------------------------------------------
    const metaToken = await getMetaToken(workspace.organizationId, env);

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
          organizationId: workspace.organizationId,
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
}

// ============================================================
// MCP Server builder (new instance per request)
// ============================================================

function buildServer(
  metaToken: string | null,
  workspace: OrganizationContext,
  env: Env
): McpServer {
  const server = new McpServer(
    {
      name: "vibefly",
      version: "1.0.0",
    },
    {
      instructions: [
        "This server is scoped by project. A project groups ad accounts and sites.",
        "Before any data or mutation tool, call list_projects to discover the projects this connection has access to.",
        "Pass the chosen project_id to subsequent tools. If only one project is authorized, project_id may be omitted.",
      ].join(" "),
    }
  );

  if (!metaToken) {
    // No token connected — register a single tool that explains how to connect
    server.tool(
      "connect_required",
      "No Meta account connected to this organization",
      {},
      async () => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error:
                "No Meta account connected. Go to your dashboard to paste your Meta access token.",
              help: "https://vibefly.app/dashboard",
            }),
          },
        ],
        isError: true,
      })
    );
    return server;
  }

  const auditedServer = wrapServerWithAudit(server, {
    env,
    organizationId: workspace.organizationId,
    apiKeyId: workspace.apiKeyId,
  });

  registerAllTools({
    server: auditedServer,
    token: metaToken,
    tier: workspace.tier,
    env,
    organizationId: workspace.organizationId,
    enableMetaMutations: workspace.enableMetaMutations,
    availableProjects: workspace.availableProjects,
    allowedProjectIds: workspace.allowedProjectIds,
  });
  return server;
}

// ============================================================
// Helpers
// ============================================================

async function authenticateRequest(
  request: Request,
  _url: URL,
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

  // Deliberately no query-param fallback: URLs end up in CDN access logs,
  // browser history, and Referer headers — never accept the API key there.
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
