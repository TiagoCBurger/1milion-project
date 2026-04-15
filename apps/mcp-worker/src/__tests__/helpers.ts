import { vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env, WorkspaceContext } from "../types";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

/**
 * Captures tool handlers registered on an McpServer by spying on server.tool().
 * Returns a map of tool name → handler function that can be called directly.
 */
export function createToolCapture(): {
  server: McpServer;
  callTool: (name: string, args: Record<string, unknown>) => Promise<any>;
} {
  const handlers = new Map<string, ToolHandler>();

  // Create a fake server that captures tool registrations
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;

  return {
    server,
    callTool: async (name: string, args: Record<string, unknown>) => {
      const handler = handlers.get(name);
      if (!handler) {
        throw new Error(`Tool "${name}" not registered`);
      }
      return handler(args);
    },
  };
}

/**
 * Create a mock KV namespace for testing.
 */
export function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; metadata?: unknown }>();

  return {
    get: vi.fn(async (key: string, opts?: any) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (opts === "json" || opts?.type === "json") {
        return JSON.parse(entry.value);
      }
      return entry.value;
    }),
    put: vi.fn(async (key: string, value: string, _opts?: any) => {
      store.set(key, { value });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({
      keys: [],
      list_complete: true,
      cursor: "",
    })),
    getWithMetadata: vi.fn(async () => ({
      value: null,
      metadata: null,
    })),
  } as unknown as KVNamespace;
}

/**
 * Create a mock RATE_LIMIT_DO namespace that emulates the DO fetch interface
 * with in-memory per-workspace counters, so rate-limit.ts can be tested.
 */
export function createMockRateLimitDO(): DurableObjectNamespace {
  type Counters = { minute: number; hour: number; day: number; uploads: Record<string, number> };
  const byId = new Map<string, Counters>();

  function counters(id: string): Counters {
    let c = byId.get(id);
    if (!c) {
      c = { minute: 0, hour: 0, day: 0, uploads: {} };
      byId.set(id, c);
    }
    return c;
  }

  function makeStub(id: string) {
    return {
      fetch: vi.fn(async (url: string | Request, init?: RequestInit) => {
        const path = new URL(typeof url === "string" ? url : url.url).pathname;
        const body = JSON.parse(String(init?.body ?? "{}"));
        const c = counters(id);

        if (path === "/check-rate") {
          if (body.perMinute > 0 && c.minute >= body.perMinute) {
            return Response.json({ limited: true, limit: body.perMinute, retryAfter: 60, scope: "minute", minuteCount: c.minute, hourCount: c.hour, dayCount: c.day });
          }
          if (body.perHour > 0 && c.hour >= body.perHour) {
            return Response.json({ limited: true, limit: body.perHour, retryAfter: 3600, scope: "hour", minuteCount: c.minute, hourCount: c.hour, dayCount: c.day });
          }
          if (body.perDay > 0 && c.day >= body.perDay) {
            return Response.json({ limited: true, limit: body.perDay, retryAfter: 86400, scope: "day", minuteCount: c.minute, hourCount: c.hour, dayCount: c.day });
          }
          c.minute += 1; c.hour += 1; c.day += 1;
          return Response.json({ limited: false, minuteCount: c.minute, hourCount: c.hour, dayCount: c.day });
        }
        if (path === "/check-upload") {
          const key = body.kind;
          const current = c.uploads[key] ?? 0;
          if (current >= body.perDay) {
            return Response.json({ allowed: false, current, limit: body.perDay });
          }
          c.uploads[key] = current + 1;
          return Response.json({ allowed: true, current: c.uploads[key], limit: body.perDay });
        }
        return new Response("Not found", { status: 404 });
      }),
    } as unknown as DurableObjectStub;
  }

  return {
    idFromName: (name: string) => ({ toString: () => name, name }) as unknown as DurableObjectId,
    idFromString: (id: string) => ({ toString: () => id, name: id }) as unknown as DurableObjectId,
    newUniqueId: () => ({ toString: () => "unique", name: "unique" }) as unknown as DurableObjectId,
    get: (id: DurableObjectId) => makeStub(String(id.toString())),
  } as unknown as DurableObjectNamespace;
}

/**
 * Create a mock Env for testing.
 */
export function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    RATE_LIMIT_KV: createMockKV(),
    CACHE_KV: createMockKV(),
    OAUTH_KV: createMockKV(),
    RATE_LIMIT_DO: createMockRateLimitDO(),
    CREATIVES_R2: {} as R2Bucket,
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    R2_PUBLIC_URL: "https://pub-test.r2.dev",
    OAUTH_SIGNING_SECRET: "test-oauth-signing-secret",
    MCP_SERVER_URL: "http://localhost:8787",
    WEB_APP_URL: "http://localhost:3000",
    ...overrides,
  };
}

/**
 * Create a mock WorkspaceContext.
 */
export function createMockWorkspace(
  overrides?: Partial<WorkspaceContext>,
): WorkspaceContext {
  return {
    workspaceId: "ws-123",
    apiKeyId: "key-456",
    tier: "pro",
    requestsPerMinute: 30,
    requestsPerHour: 200,
    requestsPerDay: 1000,
    maxMcpConnections: 1,
    maxAdAccounts: 1,
    enableMetaMutations: true,
    ...overrides,
  };
}

/**
 * Parse the text content from an MCP tool result.
 */
export function parseToolResult(result: {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}): unknown {
  const text = result.content[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
