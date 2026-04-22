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

  it("returns organization context for valid API key", async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string) => {
      if (url.includes("rpc/validate_api_key")) {
        return {
          ok: true,
          json: async () => [
            {
              organization_id: "org-1",
              api_key_id: "key-1",
              tier: "pro",
              requests_per_minute: 30,
              requests_per_hour: 200,
              requests_per_day: 1000,
              max_mcp_connections: 3,
              max_ad_accounts: 2,
              enable_meta_mutations: true,
            },
          ],
        };
      }
      if (url.includes("rpc/list_projects")) {
        return {
          ok: true,
          json: async () => [
            { id: "proj-default", slug: "default", name: "Default", is_default: true },
          ],
        };
      }
      return { ok: false, json: async () => [] };
    });

    const result = await validateApiKey("mads_test123", env);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.workspace.organizationId).toBe("org-1");
    expect(result.workspace.tier).toBe("pro");
    expect(result.workspace.availableProjects).toEqual([
      { id: "proj-default", slug: "default", name: "Default", isDefault: true },
    ]);
    expect(result.workspace.allowedProjectIds).toEqual(["proj-default"]);
  });

  it("returns error for invalid API key (empty rows)", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await validateApiKey("mads_invalid", env);
    expect(result).toEqual({ ok: false, error: "Invalid API key." });
  });

  it("returns error on Supabase error", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const result = await validateApiKey("mads_test", env);
    expect(result).toEqual({
      ok: false,
      error: "Internal error validating API key.",
    });
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

    const result = await getMetaToken("org-1", env);
    expect(result).toBe("EAA_meta_token_123");
  });

  it("returns null when Edge Function returns error", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });

    const result = await getMetaToken("org-nonexistent", env);
    expect(result).toBeNull();
  });

  it("returns null when token is empty", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "" }),
    });

    const result = await getMetaToken("org-1", env);
    expect(result).toBeNull();
  });

  it("caches token in KV after first call", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "EAA_cached" }),
    });

    await getMetaToken("org-cache", env);

    expect(env.CACHE_KV.put).toHaveBeenCalledWith(
      "v2:token:org-cache",
      "EAA_cached",
      { expirationTtl: 300 },
    );
  });

  it("calls correct Supabase Edge Function", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "tok" }),
    });

    await getMetaToken("org-1", env);

    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe(
      "https://test.supabase.co/functions/v1/decrypt-token",
    );
    expect(opts.method).toBe("POST");
    // decrypt-token edge function still accepts legacy `workspaceId` key.
    expect(JSON.parse(opts.body)).toEqual({ workspaceId: "org-1" });
  });
});
