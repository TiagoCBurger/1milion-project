import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logUsage } from "../usage";
import { createMockEnv } from "./helpers";
import type { Env } from "../types";

describe("logUsage", () => {
  const originalFetch = globalThis.fetch;
  let env: Env;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    env = createMockEnv();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends usage event to Supabase with correct payload", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true });

    await logUsage(
      {
        workspaceId: "ws-1",
        apiKeyId: "key-1",
        toolName: "get_campaigns",
        method: "POST",
        statusCode: 200,
        responseTimeMs: 150,
        isError: false,
      },
      env,
    );

    const [url, opts] = (globalThis.fetch as any).mock.calls[0];

    expect(url).toBe("https://test.supabase.co/rest/v1/usage_logs");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers.apikey).toBe("test-service-role-key");
    expect(opts.headers.Prefer).toBe("return=minimal");

    const body = JSON.parse(opts.body);
    expect(body.workspace_id).toBe("ws-1");
    expect(body.api_key_id).toBe("key-1");
    expect(body.tool_name).toBe("get_campaigns");
    expect(body.response_time_ms).toBe(150);
    expect(body.is_error).toBe(false);
    expect(body.error_type).toBeNull();
  });

  it("includes error_type when provided", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true });

    await logUsage(
      {
        workspaceId: "ws-1",
        apiKeyId: "key-1",
        toolName: "create_campaign",
        method: "POST",
        statusCode: 500,
        responseTimeMs: 300,
        isError: true,
        errorType: "meta_api_error",
      },
      env,
    );

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.is_error).toBe(true);
    expect(body.error_type).toBe("meta_api_error");
  });

  it("does not throw on fetch failure (fire-and-forget)", async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error("Network error"));

    // Should not throw
    await expect(
      logUsage(
        {
          workspaceId: "ws-1",
          apiKeyId: "key-1",
          toolName: "test",
          method: "POST",
          statusCode: 200,
          responseTimeMs: 100,
          isError: false,
        },
        env,
      ),
    ).resolves.toBeUndefined();
  });

  it("does not throw on HTTP error (fire-and-forget)", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 500 });

    await expect(
      logUsage(
        {
          workspaceId: "ws-1",
          apiKeyId: "key-1",
          toolName: "test",
          method: "POST",
          statusCode: 200,
          responseTimeMs: 100,
          isError: false,
        },
        env,
      ),
    ).resolves.toBeUndefined();
  });
});
