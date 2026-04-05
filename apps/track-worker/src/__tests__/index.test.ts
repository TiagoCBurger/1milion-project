import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../index";
import type { Env } from "../types";

const mockEnv: Env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  ALLOWED_ORIGINS: "http://localhost:3000,https://vibefly.app",
};

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function makeRequest(method: string, url: string, body?: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      "CF-Connecting-IP": "203.0.113.1",
      "User-Agent": "TestAgent/1.0",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("track-worker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("responds to health check", async () => {
    const req = makeRequest("GET", "http://localhost/health");
    const res = await worker.fetch(req, mockEnv, mockCtx());
    expect(res.status).toBe(200);
    const data = await res.json() as { status: string };
    expect(data.status).toBe("ok");
  });

  it("handles CORS preflight", async () => {
    const req = makeRequest("OPTIONS", "http://localhost/track");
    const res = await worker.fetch(req, mockEnv, mockCtx());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("returns 404 for unknown paths", async () => {
    const req = makeRequest("GET", "http://localhost/unknown");
    const res = await worker.fetch(req, mockEnv, mockCtx());
    expect(res.status).toBe(404);
  });

  it("rejects invalid JSON", async () => {
    const req = new Request("http://localhost/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: "not json",
    });
    const res = await worker.fetch(req, mockEnv, mockCtx());
    expect(res.status).toBe(400);
  });

  it("rejects missing required fields", async () => {
    const req = makeRequest("POST", "http://localhost/track", {
      workspace_id: "ws-1",
      // missing event_name and event_id
    });
    const res = await worker.fetch(req, mockEnv, mockCtx());
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("event_name");
  });

  it("returns 404 when workspace has no pixel config", async () => {
    // Mock Supabase returning empty result
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ pixel_id: null, capi_access_token: null }],
    });
    vi.stubGlobal("fetch", mockFetch);

    const req = makeRequest("POST", "http://localhost/track", {
      workspace_id: "ws-no-config",
      event_name: "PageView",
      event_id: "evt-1",
    });
    const res = await worker.fetch(req, mockEnv, mockCtx());
    expect(res.status).toBe(404);
  });

  it("processes valid track request and returns success", async () => {
    const supabaseCall = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ pixel_id: "999888777", capi_access_token: "EAAtoken" }],
    });
    const capiCall = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    });
    // First call = supabase config lookup, second = CAPI send
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(supabaseCall)
      .mockImplementationOnce(capiCall));

    const ctx = mockCtx();
    const req = makeRequest("POST", "http://localhost/track", {
      workspace_id: "ws-1",
      event_name: "Lead",
      event_id: "evt-lead-1",
      user_data: {
        email: "test@example.com",
        phone: "+5511999999999",
        fbc: "fb.1.123.abc",
      },
      custom_data: {
        value: 99.90,
        currency: "BRL",
      },
    });

    const res = await worker.fetch(req, mockEnv, ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as { success: boolean; event_id: string };
    expect(data.success).toBe(true);
    expect(data.event_id).toBe("evt-lead-1");
    // waitUntil should have been called (for CAPI fire-and-forget)
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("sets CORS headers on response", async () => {
    const req = makeRequest("GET", "http://localhost/health");
    const res = await worker.fetch(req, mockEnv, mockCtx());
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("validates event_name is provided", async () => {
    const req = makeRequest("POST", "http://localhost/track", {
      workspace_id: "ws-1",
      event_name: "",
      event_id: "evt-1",
    });
    const res = await worker.fetch(req, mockEnv, mockCtx());
    expect(res.status).toBe(400);
  });
});
