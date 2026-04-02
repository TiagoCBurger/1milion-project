import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleToken } from "../../oauth/token";
import { createMockEnv } from "../helpers";
import type { Env } from "../../types";

/**
 * Tests that issueTokens records OAuth connections in Supabase.
 *
 * We test through handleToken (the exported entry point).
 * We need to mock:
 * - OAUTH_KV: client registration, auth codes, refresh tokens
 * - crypto utils: sha256Hex, verifyPkce, generateToken
 * - globalThis.fetch: for Supabase RPC calls
 */

// Mock crypto/token utils for deterministic testing
vi.mock("../../oauth/utils", async () => {
  const actual = await vi.importActual<typeof import("../../oauth/utils")>(
    "../../oauth/utils",
  );
  return {
    ...actual,
    sha256Hex: vi.fn().mockResolvedValue("mock_hash"),
    verifyPkce: vi.fn().mockResolvedValue(true),
    generateToken: vi.fn().mockReturnValue("mock_generated_token"),
  };
});

const CLIENT_ID = "client_test";
const CLIENT_SECRET = "secret_test";
const NOW = Math.floor(Date.now() / 1000);

const STORED_CLIENT = {
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  client_id_issued_at: NOW - 100,
  client_secret_expires_at: NOW + 86400,
  redirect_uris: ["http://localhost/callback"],
  client_name: "My MCP App",
  token_endpoint_auth_method: "client_secret_post",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
};

const STORED_AUTH_CODE = {
  client_id: CLIENT_ID,
  workspace_id: "ws-1",
  user_id: "user-1",
  code_challenge: "test_challenge",
  redirect_uri: "http://localhost/callback",
  scope: "mcp",
  allowed_accounts: ["act_111", "act_222"],
  created_at: NOW,
};

const STORED_REFRESH_TOKEN = {
  client_id: CLIENT_ID,
  workspace_id: "ws-1",
  user_id: "user-1",
  scope: "mcp",
  allowed_accounts: ["act_333"],
  created_at: NOW,
};

function makeTokenRequest(body: Record<string, string>): Request {
  return new Request("http://localhost/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

describe("Token endpoint — connection recording", () => {
  const originalFetch = globalThis.fetch;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    env = createMockEnv();

    // Setup KV to return client and auth code based on key pattern
    (env.OAUTH_KV.get as any).mockImplementation(async (key: string, opts?: any) => {
      if (key === `oauth:client:${CLIENT_ID}`) return STORED_CLIENT;
      if (key === `oauth:code:mock_hash`) return STORED_AUTH_CODE;
      if (key === `oauth:refresh:mock_hash`) return STORED_REFRESH_TOKEN;
      // For client_name lookup during recordConnection
      if (key === `oauth:client:${CLIENT_ID}` && opts === "json") return STORED_CLIENT;
      return null;
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls upsert_oauth_connection on authorization_code grant", async () => {
    const request = makeTokenRequest({
      grant_type: "authorization_code",
      code: "test_code",
      code_verifier: "test_verifier",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const response = await handleToken(request, env);
    expect(response.status).toBe(200);

    // Wait for fire-and-forget recordConnection
    await new Promise((r) => setTimeout(r, 20));

    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const upsertCall = fetchCalls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("upsert_oauth_connection"),
    );

    expect(upsertCall).toBeDefined();
    const body = JSON.parse(upsertCall[1].body);
    expect(body.p_workspace_id).toBe("ws-1");
    expect(body.p_client_id).toBe(CLIENT_ID);
    expect(body.p_user_id).toBe("user-1");
  });

  it("passes allowed_accounts from auth code to recordConnection", async () => {
    const request = makeTokenRequest({
      grant_type: "authorization_code",
      code: "test_code",
      code_verifier: "test_verifier",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    await handleToken(request, env);
    await new Promise((r) => setTimeout(r, 20));

    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const upsertCall = fetchCalls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("upsert_oauth_connection"),
    );

    const body = JSON.parse(upsertCall[1].body);
    expect(body.p_allowed_accounts).toEqual(["act_111", "act_222"]);
  });

  it("calls upsert_oauth_connection on refresh_token grant", async () => {
    const request = makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "test_refresh",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const response = await handleToken(request, env);
    expect(response.status).toBe(200);

    await new Promise((r) => setTimeout(r, 20));

    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const upsertCall = fetchCalls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("upsert_oauth_connection"),
    );

    expect(upsertCall).toBeDefined();
    const body = JSON.parse(upsertCall[1].body);
    expect(body.p_allowed_accounts).toEqual(["act_333"]);
  });

  it("uses client_name from KV client registration", async () => {
    const request = makeTokenRequest({
      grant_type: "authorization_code",
      code: "test_code",
      code_verifier: "test_verifier",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    await handleToken(request, env);
    await new Promise((r) => setTimeout(r, 20));

    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const upsertCall = fetchCalls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("upsert_oauth_connection"),
    );

    const body = JSON.parse(upsertCall[1].body);
    expect(body.p_client_name).toBe("My MCP App");
  });

  it("falls back to client_id when no client_name stored", async () => {
    // Override KV to return client without client_name for the meta lookup
    (env.OAUTH_KV.get as any).mockImplementation(async (key: string) => {
      if (key === `oauth:client:${CLIENT_ID}`) {
        return { ...STORED_CLIENT, client_name: undefined };
      }
      if (key === `oauth:code:mock_hash`) return STORED_AUTH_CODE;
      return null;
    });

    const request = makeTokenRequest({
      grant_type: "authorization_code",
      code: "test_code",
      code_verifier: "test_verifier",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    await handleToken(request, env);
    await new Promise((r) => setTimeout(r, 20));

    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const upsertCall = fetchCalls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("upsert_oauth_connection"),
    );

    const body = JSON.parse(upsertCall[1].body);
    expect(body.p_client_name).toBe(CLIENT_ID);
  });

  it("passes empty array when allowed_accounts is undefined", async () => {
    // Auth code without allowed_accounts
    (env.OAUTH_KV.get as any).mockImplementation(async (key: string) => {
      if (key === `oauth:client:${CLIENT_ID}`) return STORED_CLIENT;
      if (key === `oauth:code:mock_hash`) {
        return { ...STORED_AUTH_CODE, allowed_accounts: undefined };
      }
      return null;
    });

    const request = makeTokenRequest({
      grant_type: "authorization_code",
      code: "test_code",
      code_verifier: "test_verifier",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    await handleToken(request, env);
    await new Promise((r) => setTimeout(r, 20));

    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const upsertCall = fetchCalls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("upsert_oauth_connection"),
    );

    const body = JSON.parse(upsertCall[1].body);
    expect(body.p_allowed_accounts).toEqual([]);
  });

  it("does not block token issuance if recordConnection fails", async () => {
    // Make the upsert fetch reject
    (globalThis.fetch as any).mockRejectedValue(new Error("Network error"));

    const request = makeTokenRequest({
      grant_type: "authorization_code",
      code: "test_code",
      code_verifier: "test_verifier",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const response = await handleToken(request, env);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("access_token");
    expect(data).toHaveProperty("refresh_token");
  });

  it("returns valid token response with expected fields", async () => {
    const request = makeTokenRequest({
      grant_type: "authorization_code",
      code: "test_code",
      code_verifier: "test_verifier",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const response = await handleToken(request, env);
    expect(response.status).toBe(200);

    const data = (await response.json()) as Record<string, unknown>;
    expect(data.access_token).toBeDefined();
    expect(data.refresh_token).toBeDefined();
    expect(data.token_type).toBe("bearer");
    expect(data.expires_in).toBe(3600);
    expect(data.scope).toBe("mcp");
  });
});
