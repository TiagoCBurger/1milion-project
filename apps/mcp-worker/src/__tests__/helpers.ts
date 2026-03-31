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
 * Create a mock Env for testing.
 */
export function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    RATE_LIMIT_KV: createMockKV(),
    CACHE_KV: createMockKV(),
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
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
    requestsPerMinute: 100,
    requestsPerDay: 5000,
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
