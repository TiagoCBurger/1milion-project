import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateApiKey, getMetaToken } from "../auth";
import { createMockEnv } from "./helpers";
import type { Env } from "../types";

describe("validateApiKey", () => {
  const originalFetch = globalThis.fetch;
  let env: Env;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    env = createMockEnv();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns workspace context for valid API key", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          workspace_id: "ws-1",
          api_key_id: "key-1",
          tier: "pro",
          requests_per_minute: 100,
          requests_per_day: 5000,
        },
      ],
    });

    const result = await validateApiKey("mads_test123", env);

    expect(result).toEqual({
      workspaceId: "ws-1",
      apiKeyId: "key-1",
      tier: "pro",
      requestsPerMinute: 100,
      requestsPerDay: 5000,
    });
  });

  it("returns null for invalid API key (empty rows)", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await validateApiKey("mads_invalid", env);
    expect(result).toBeNull();
  });

  it("returns null on Supabase error", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const result = await validateApiKey("mads_test", env);
    expect(result).toBeNull();
  });

  it("returns cached result on second call", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          workspace_id: "ws-1",
          api_key_id: "key-1",
          tier: "free",
          requests_per_minute: 20,
          requests_per_day: 500,
        },
      ],
    });

    // First call: hits Supabase
    const result1 = await validateApiKey("mads_cached", env);
    expect(result1).not.toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Second call: should get from KV cache
    const result2 = await validateApiKey("mads_cached", env);
    expect(result2).toEqual(result1);
    // fetch is not called again because KV.get returned the cached value
  });

  it("calls Supabase RPC with correct params", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    await validateApiKey("mads_mykey", env);

    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe(
      "https://test.supabase.co/rest/v1/rpc/validate_api_key",
    );
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ p_api_key: "mads_mykey" });
    expect(opts.headers.apikey).toBe("test-service-role-key");
  });
});

describe("getMetaToken", () => {
  const originalFetch = globalThis.fetch;
  let env: Env;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    env = createMockEnv();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns decrypted token on success", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "EAA_meta_token_123" }),
    });

    const result = await getMetaToken("ws-1", env);
    expect(result).toBe("EAA_meta_token_123");
  });

  it("returns null when Edge Function returns error", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });

    const result = await getMetaToken("ws-nonexistent", env);
    expect(result).toBeNull();
  });

  it("returns null when token is empty", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "" }),
    });

    const result = await getMetaToken("ws-1", env);
    expect(result).toBeNull();
  });

  it("caches token in KV after first call", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "EAA_cached" }),
    });

    await getMetaToken("ws-cache", env);

    expect(env.CACHE_KV.put).toHaveBeenCalledWith(
      "token:ws-cache",
      "EAA_cached",
      { expirationTtl: 300 },
    );
  });

  it("calls correct Supabase Edge Function", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "tok" }),
    });

    await getMetaToken("ws-1", env);

    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe(
      "https://test.supabase.co/functions/v1/decrypt-token",
    );
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ workspaceId: "ws-1" });
  });
});
