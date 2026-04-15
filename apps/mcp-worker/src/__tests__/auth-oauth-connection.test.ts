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
 * Tests for verifyOAuthAccessToken with the new Supabase connection checks.
 * Workspace-enabled ad accounts are loaded via REST and intersected with
 * OAuth allowed_accounts (empty OAuth list = full workspace-enabled set).
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
  workspace_id: "ws-1",
  user_id: "user-1",
  scope: "mcp",
  allowed_accounts: ["act_from_kv"],
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  created_at: Math.floor(Date.now() / 1000) - 60,
};

const WORKSPACE_ROW = {
  workspace_id: "ws-1",
  tier: "pro" as const,
  requests_per_minute: 30,
  requests_per_hour: 200,
  requests_per_day: 1000,
  max_mcp_connections: -1,
  max_ad_accounts: 5,
  enable_meta_mutations: true,
};

describe("verifyOAuthAccessToken — connection checks", () => {
  const originalFetch = globalThis.fetch;
  let env: Env;
  let oauthConnectionRows: Array<{
    connection_id: string;
    is_active: boolean;
    allowed_accounts: string[];
  }>;
  let workspaceEnabledMetaIds: string[];

  beforeEach(() => {
    oauthConnectionRows = [];
    workspaceEnabledMetaIds = [
      "act_from_kv",
      "act_from_db_1",
      "act_from_db_2",
      "act_1",
    ];
    env = createMockEnv();
    (env.OAUTH_KV.get as any).mockResolvedValue(STORED_TOKEN);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = fetchUrl(input);
      if (url.includes("rpc/get_workspace_context")) {
        return jsonResponse([WORKSPACE_ROW]);
      }
      if (url.includes("rpc/get_oauth_connection")) {
        return jsonResponse(oauthConnectionRows);
      }
      if (url.includes("/rest/v1/ad_accounts?")) {
        return jsonResponse(
          workspaceEnabledMetaIds.map((meta_account_id) => ({ meta_account_id })),
        );
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

  it("returns failure for unknown token (not in KV)", async () => {
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

  it("returns failure when get_workspace_context returns empty", async () => {
    (globalThis.fetch as any).mockImplementation(async (input: RequestInfo | URL) => {
      const url = fetchUrl(input);
      if (url.includes("rpc/get_workspace_context")) {
        return jsonResponse([]);
      }
      return jsonResponse({});
    });

    const result = await verifyOAuthAccessToken("test-token", env);
    expect(result.ok).toBe(false);
  });

  it("falls back to KV allowed_accounts when no DB connection exists", async () => {
    oauthConnectionRows = [];

    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));

    expect(result.workspace.allowedAccounts).toEqual(["act_from_kv"]);
  });

  it("intersects OAuth allowed_accounts with workspace-enabled accounts", async () => {
    oauthConnectionRows = [];
    workspaceEnabledMetaIds = ["act_other"];

    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));

    expect(result.workspace.allowedAccounts).toEqual([]);
  });

  it("returns failure when connection is revoked (is_active=false)", async () => {
    oauthConnectionRows = [
      {
        connection_id: "conn-1",
        is_active: false,
        allowed_accounts: ["act_whatever"],
      },
    ];

    const result = await verifyOAuthAccessToken("test-token", env);
    expect(result.ok).toBe(false);
  });

  it("overrides allowed_accounts from DB connection (source of truth)", async () => {
    oauthConnectionRows = [
      {
        connection_id: "conn-1",
        is_active: true,
        allowed_accounts: ["act_from_db_1", "act_from_db_2"],
      },
    ];

    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));

    expect(result.workspace.allowedAccounts).toEqual([
      "act_from_db_1",
      "act_from_db_2",
    ]);
  });

  it("falls back to KV when get_oauth_connection RPC fails", async () => {
    (globalThis.fetch as any).mockImplementation(async (input: RequestInfo | URL) => {
      const url = fetchUrl(input);
      if (url.includes("rpc/get_workspace_context")) {
        return jsonResponse([WORKSPACE_ROW]);
      }
      if (url.includes("rpc/get_oauth_connection")) {
        return new Response("", { status: 500 });
      }
      if (url.includes("/rest/v1/ad_accounts?")) {
        return jsonResponse([{ meta_account_id: "act_from_kv" }]);
      }
      return jsonResponse({});
    });

    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));

    expect(result.workspace.allowedAccounts).toEqual(["act_from_kv"]);
  });

  it("sets apiKeyId to 'oauth:{client_id}'", async () => {
    oauthConnectionRows = [];

    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));

    expect(result.workspace.apiKeyId).toBe("oauth:client_abc");
  });

  it("returns correct tier and rate limits from workspace context", async () => {
    oauthConnectionRows = [];

    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));

    expect(result.workspace.workspaceId).toBe("ws-1");
    expect(result.workspace.tier).toBe("pro");
    expect(result.workspace.requestsPerHour).toBe(200);
    expect(result.workspace.requestsPerDay).toBe(1000);
  });

  it("fires last_used_at update when connection exists", async () => {
    oauthConnectionRows = [
      {
        connection_id: "conn-1",
        is_active: true,
        allowed_accounts: ["act_1"],
      },
    ];

    await verifyOAuthAccessToken("test-token", env);

    await new Promise((r) => setTimeout(r, 10));

    const calls = (globalThis.fetch as any).mock.calls as [string, RequestInit?][];
    const patchCall = calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("oauth_connections?id=eq."),
    );
    expect(patchCall).toBeDefined();
    expect(patchCall![1]?.method).toBe("PATCH");
    expect(JSON.parse(patchCall![1]!.body as string)).toHaveProperty("last_used_at");
  });

  it("calls get_oauth_connection RPC with correct params", async () => {
    oauthConnectionRows = [];

    await verifyOAuthAccessToken("test-token", env);

    const calls = (globalThis.fetch as any).mock.calls as [string, RequestInit?][];
    const connCall = calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("rpc/get_oauth_connection"),
    );
    expect(connCall).toBeDefined();
    expect(connCall![1]?.method).toBe("POST");
    const body = JSON.parse(connCall![1]!.body as string);
    expect(body.p_workspace_id).toBe("ws-1");
    expect(body.p_client_id).toBe("client_abc");
  });

  it("falls back to all workspace accounts when none are explicitly enabled", async () => {
    oauthConnectionRows = [
      {
        connection_id: "conn-1",
        is_active: true,
        allowed_accounts: [], // Empty OAuth filter means no extra restriction
      },
    ];
    workspaceEnabledMetaIds = [];

    (globalThis.fetch as any).mockImplementation(async (input: RequestInfo | URL) => {
      const url = fetchUrl(input);
      if (url.includes("rpc/get_workspace_context")) {
        return jsonResponse([WORKSPACE_ROW]);
      }
      if (url.includes("rpc/get_oauth_connection")) {
        return jsonResponse(oauthConnectionRows);
      }
      if (url.includes("/rest/v1/ad_accounts?")) {
        // First call: is_enabled=eq.true returns empty (no explicit enabled)
        if (url.includes("is_enabled=eq.true")) {
          return jsonResponse([]);
        }
        // Second call (fallback): fetch all accounts returns all accounts
        return jsonResponse([
          { meta_account_id: "act_fallback_1" },
          { meta_account_id: "act_fallback_2" },
        ]);
      }
      if (url.includes("oauth_connections?id=eq.") || url.includes("upsert_oauth_connection")) {
        return jsonResponse({});
      }
      return jsonResponse({});
    });

    const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));

    // Should fallback to all accounts when none are explicitly enabled + empty OAuth filter
    expect(result.workspace.allowedAccounts).toEqual([
      "act_fallback_1",
      "act_fallback_2",
    ]);
  });
});
