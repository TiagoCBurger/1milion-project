import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyOAuthAccessToken, type AuthResult } from "../auth";
import { createMockEnv } from "./helpers";
import type { Env } from "../types";

function requireAuthOk(result: AuthResult): Extract<AuthResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected auth success");
  }
  return result;
}

function jsonResponse(data: unknown, ok = true): Response {
  return new Response(JSON.stringify(data), {
    status: ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof Request) return input.url;
  return (input as URL).href;
}

/**
 * Tests for verifyOAuthAccessToken in the project-scoped world.
 * `allowed_projects` is the new source of truth; availableProjects
 * come from list_projects RPC.
 */

vi.mock("../oauth/utils", async () => {
  const actual = await vi.importActual<typeof import("../oauth/utils")>(
    "../oauth/utils",
  );
  return {
    ...actual,
    sha256Hex: vi.fn().mockResolvedValue("mock_token_hash"),
  };
});

const STORED_TOKEN = {
  client_id: "client_abc",
  organization_id: "org-1",
  user_id: "user-1",
  scope: "mcp",
  allowed_projects: ["proj-default"],
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  created_at: Math.floor(Date.now() / 1000) - 60,
};

const ORG_ROW = {
  organization_id: "org-1",
  tier: "pro" as const,
  requests_per_minute: 30,
  requests_per_hour: 200,
  requests_per_day: 1000,
  max_mcp_connections: -1,
  max_ad_accounts: 5,
  enable_meta_mutations: true,
};

const PROJECT_ROWS = [
  { id: "proj-default", slug: "default", name: "Default", is_default: true },
  { id: "proj-cliente-a", slug: "cliente-a", name: "Cliente A", is_default: false },
];

describe("verifyOAuthAccessToken — project-scoped", () => {
  const originalFetch = globalThis.fetch;
  let env: Env;
  let oauthConnectionRows: Array<{
    connection_id: string;
    is_active: boolean;
    allowed_projects: string[] | null;
    allowed_accounts?: string[] | null;
  }>;

  beforeEach(() => {
    oauthConnectionRows = [];
    env = createMockEnv();
    (env.OAUTH_KV.get as any).mockResolvedValue(STORED_TOKEN);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = fetchUrl(input);
      if (url.includes("rpc/get_organization_context")) {
        return jsonResponse([ORG_ROW]);
      }
      if (url.includes("rpc/get_oauth_connection")) {
        return jsonResponse(oauthConnectionRows);
      }
      if (url.includes("rpc/list_projects")) {
        return jsonResponse(PROJECT_ROWS);
      }
      if (url.includes("oauth_connections?id=eq.") || url.includes("upsert_oauth_connection")) {
        return jsonResponse({});
      }
      return jsonResponse({});
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns failure for unknown token", async () => {
    (env.OAUTH_KV.get as any).mockResolvedValue(null);
    const result = await verifyOAuthAccessToken("unknown-token", env);
    expect(result.ok).toBe(false);
  });

  it("returns failure for expired token", async () => {
    (env.OAUTH_KV.get as any).mockResolvedValue({
      ...STORED_TOKEN,
      expires_at: Math.floor(Date.now() / 1000) - 10,
    });
    const result = await verifyOAuthAccessToken("expired-token", env);
    expect(result.ok).toBe(false);
  });

  it("returns failure when connection is revoked", async () => {
    oauthConnectionRows = [
      {
        connection_id: "conn-1",
        is_active: false,
        allowed_projects: ["proj-default"],
      },
    ];
    const result = await verifyOAuthAccessToken("test-token", env);
    expect(result.ok).toBe(false);
  });

  it("uses allowed_projects from DB as source of truth", async () => {
    oauthConnectionRows = [
      {
        connection_id: "conn-1",
        is_active: true,
        allowed_projects: ["proj-cliente-a"],
      },
    ];

    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));

    expect(result.workspace.allowedProjectIds).toEqual(["proj-cliente-a"]);
    expect(result.workspace.availableProjects).toEqual([
      { id: "proj-cliente-a", slug: "cliente-a", name: "Cliente A", isDefault: false },
    ]);
  });

  it("falls back to stored.allowed_projects when DB has no connection row", async () => {
    oauthConnectionRows = [];
    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));
    expect(result.workspace.allowedProjectIds).toEqual(["proj-default"]);
  });

  it("sets apiKeyId to 'oauth:{client_id}'", async () => {
    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));
    expect(result.workspace.apiKeyId).toBe("oauth:client_abc");
  });

  it("returns tier and rate limits from organization context", async () => {
    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));
    expect(result.workspace.organizationId).toBe("org-1");
    expect(result.workspace.tier).toBe("pro");
    expect(result.workspace.requestsPerHour).toBe(200);
    expect(result.workspace.requestsPerDay).toBe(1000);
  });
});
