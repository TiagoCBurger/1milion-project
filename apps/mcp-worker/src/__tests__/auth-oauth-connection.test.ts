import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyOAuthAccessToken } from "../auth";
import { createMockEnv } from "./helpers";
import type { Env } from "../types";

/**
 * Tests for verifyOAuthAccessToken with the new Supabase connection checks.
 *
 * The function flow:
 * 1. sha256Hex(token) → lookup in OAUTH_KV
 * 2. Check expiration
 * 3. Fetch workspace context via get_workspace_context RPC
 * 4. Fetch oauth connection via get_oauth_connection RPC
 * 5. If connection exists and is_active: use DB allowed_accounts (source of truth)
 * 6. If connection is revoked: return null
 * 7. If no connection record: fall back to KV allowed_accounts
 * 8. Update last_used_at (best-effort)
 */

// Mock sha256Hex to return a predictable hash
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
  expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  created_at: Math.floor(Date.now() / 1000) - 60,
};

const WORKSPACE_ROW = {
  workspace_id: "ws-1",
  tier: "pro" as const,
  requests_per_minute: 100,
  requests_per_day: 5000,
};

describe("verifyOAuthAccessToken — connection checks", () => {
  const originalFetch = globalThis.fetch;
  let env: Env;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    env = createMockEnv();

    // Default: OAUTH_KV returns our stored token
    (env.OAUTH_KV.get as any).mockResolvedValue(STORED_TOKEN);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns null for unknown token (not in KV)", async () => {
    (env.OAUTH_KV.get as any).mockResolvedValue(null);

    const result = await verifyOAuthAccessToken("unknown-token", env);
    expect(result).toBeNull();
  });

  it("returns null for expired token", async () => {
    (env.OAUTH_KV.get as any).mockResolvedValue({
      ...STORED_TOKEN,
      expires_at: Math.floor(Date.now() / 1000) - 10, // expired
    });

    const result = await verifyOAuthAccessToken("expired-token", env);
    expect(result).toBeNull();
  });

  it("returns null when get_workspace_context returns empty", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [], // no workspace rows
    });

    const result = await verifyOAuthAccessToken("test-token", env);
    expect(result).toBeNull();
  });

  it("falls back to KV allowed_accounts when no DB connection exists", async () => {
    // 1st call: get_workspace_context — success
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [WORKSPACE_ROW],
    });

    // 2nd call: get_oauth_connection — empty result (no record)
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await verifyOAuthAccessToken("test-token", env);

    expect(result).not.toBeNull();
    expect(result!.allowedAccounts).toEqual(["act_from_kv"]);
  });

  it("returns null when connection is revoked (is_active=false)", async () => {
    // 1st: workspace context
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [WORKSPACE_ROW],
    });

    // 2nd: connection is revoked
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          connection_id: "conn-1",
          is_active: false,
          allowed_accounts: ["act_whatever"],
        },
      ],
    });

    const result = await verifyOAuthAccessToken("test-token", env);
    expect(result).toBeNull();
  });

  it("overrides allowed_accounts from DB connection (source of truth)", async () => {
    // 1st: workspace context
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [WORKSPACE_ROW],
    });

    // 2nd: connection has different accounts than KV
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          connection_id: "conn-1",
          is_active: true,
          allowed_accounts: ["act_from_db_1", "act_from_db_2"],
        },
      ],
    });

    // 3rd: last_used_at PATCH (fire-and-forget)
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true });

    const result = await verifyOAuthAccessToken("test-token", env);

    expect(result).not.toBeNull();
    expect(result!.allowedAccounts).toEqual([
      "act_from_db_1",
      "act_from_db_2",
    ]);
  });

  it("falls back to KV when get_oauth_connection RPC fails", async () => {
    // 1st: workspace context
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [WORKSPACE_ROW],
    });

    // 2nd: connection RPC fails
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await verifyOAuthAccessToken("test-token", env);

    expect(result).not.toBeNull();
    expect(result!.allowedAccounts).toEqual(["act_from_kv"]);
  });

  it("sets apiKeyId to 'oauth:{client_id}'", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [WORKSPACE_ROW],
    });
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await verifyOAuthAccessToken("test-token", env);

    expect(result).not.toBeNull();
    expect(result!.apiKeyId).toBe("oauth:client_abc");
  });

  it("returns correct tier and rate limits from workspace context", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [WORKSPACE_ROW],
    });
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await verifyOAuthAccessToken("test-token", env);

    expect(result).not.toBeNull();
    expect(result!.workspaceId).toBe("ws-1");
    expect(result!.tier).toBe("pro");
    expect(result!.requestsPerMinute).toBe(100);
    expect(result!.requestsPerDay).toBe(5000);
  });

  it("fires last_used_at update when connection exists", async () => {
    // 1st: workspace context
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [WORKSPACE_ROW],
    });

    // 2nd: active connection
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          connection_id: "conn-1",
          is_active: true,
          allowed_accounts: ["act_1"],
        },
      ],
    });

    // 3rd: last_used_at PATCH (fire-and-forget)
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true });

    await verifyOAuthAccessToken("test-token", env);

    // Wait a tick for the fire-and-forget fetch to execute
    await new Promise((r) => setTimeout(r, 10));

    // Verify the PATCH call was made
    const calls = (globalThis.fetch as any).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(3);

    const patchCall = calls[2];
    expect(patchCall[0]).toContain("oauth_connections");
    expect(patchCall[0]).toContain("conn-1");
    expect(patchCall[1].method).toBe("PATCH");
    expect(JSON.parse(patchCall[1].body)).toHaveProperty("last_used_at");
  });

  it("calls get_oauth_connection RPC with correct params", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [WORKSPACE_ROW],
    });
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await verifyOAuthAccessToken("test-token", env);

    // Second fetch call is get_oauth_connection
    const [url, opts] = (globalThis.fetch as any).mock.calls[1];
    expect(url).toBe(
      "https://test.supabase.co/rest/v1/rpc/get_oauth_connection",
    );
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.p_workspace_id).toBe("ws-1");
    expect(body.p_client_id).toBe("client_abc");
  });
});
