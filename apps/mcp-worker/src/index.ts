import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { validateApiKey, getMetaToken } from "./auth";
import { checkRateLimit } from "./rate-limit";
import { logUsage } from "./usage";
import { registerAllTools } from "./tools";
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
    // Only handle POST /mcp (stateless HTTP transport)
    // -------------------------------------------------------
    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method === "GET") {
      // SSE streaming not supported on Workers — return server info
      return new Response(
        JSON.stringify({ name: "meta-ads-cloud", version: "1.0.0", status: "ok" }),
        { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }
    if (request.method === "DELETE") {
      // No sessions to close in stateless mode
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // -------------------------------------------------------
    // 1. Extract API key
    // -------------------------------------------------------
    const apiKey = extractApiKey(request, url);
    if (!apiKey) {
      return jsonRpcError(
        -32600,
        "Missing or invalid API key. Use header 'Authorization: Bearer mads_...' or query param '?key=mads_...'",
        null
      );
    }

    // -------------------------------------------------------
    // 2. Validate API key → workspace context
    // -------------------------------------------------------
    const workspace = await validateApiKey(apiKey, env);
    if (!workspace) {
      return jsonRpcError(-32600, "Invalid or expired API key", null);
    }

    // -------------------------------------------------------
    // 3. Rate limit
    // -------------------------------------------------------
    const rateResult = await checkRateLimit(workspace, env);
    if (rateResult.limited) {
      return jsonRpcError(
        -32600,
        `Rate limit exceeded (${rateResult.limit}/min). Retry after ${rateResult.retryAfter}s`,
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

    const server = buildServer(metaToken, workspace);
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
  workspace: WorkspaceContext
): McpServer {
  const server = new McpServer({
    name: "meta-ads-cloud",
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

  registerAllTools(server, metaToken, workspace.tier);
  return server;
}

// ============================================================
// Helpers
// ============================================================

function extractApiKey(request: Request, url: URL): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer mads_")) {
    return authHeader.slice(7);
  }
  const keyParam = url.searchParams.get("key");
  if (keyParam?.startsWith("mads_")) {
    return keyParam;
  }
  return null;
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
