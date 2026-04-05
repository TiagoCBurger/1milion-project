import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUserData, sendCapiEvent } from "../capi";
import type { TrackPayload, Env } from "../types";

describe("buildUserData", () => {
  it("always includes IP and User-Agent", async () => {
    const payload: TrackPayload = {
      workspace_id: "ws-1",
      event_name: "PageView",
      event_id: "evt-1",
    };
    const result = await buildUserData(payload, "1.2.3.4", "Mozilla/5.0");
    expect(result.client_ip_address).toBe("1.2.3.4");
    expect(result.client_user_agent).toBe("Mozilla/5.0");
  });

  it("hashes email and phone when provided", async () => {
    const payload: TrackPayload = {
      workspace_id: "ws-1",
      event_name: "Lead",
      event_id: "evt-2",
      user_data: {
        email: "Test@Example.com",
        phone: "+55 11 99999-9999",
      },
    };
    const result = await buildUserData(payload, "1.2.3.4", "UA");
    expect(result.em).toHaveLength(1);
    expect(result.em![0]).toMatch(/^[a-f0-9]{64}$/);
    expect(result.ph).toHaveLength(1);
    expect(result.ph![0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("passes through fbc and fbp without hashing", async () => {
    const payload: TrackPayload = {
      workspace_id: "ws-1",
      event_name: "PageView",
      event_id: "evt-3",
      user_data: {
        fbc: "fb.1.123.abc",
        fbp: "fb.1.456.def",
      },
    };
    const result = await buildUserData(payload, "1.2.3.4", "UA");
    expect(result.fbc).toBe("fb.1.123.abc");
    expect(result.fbp).toBe("fb.1.456.def");
  });

  it("hashes all PII fields when provided", async () => {
    const payload: TrackPayload = {
      workspace_id: "ws-1",
      event_name: "Purchase",
      event_id: "evt-4",
      user_data: {
        email: "john@test.com",
        phone: "1234567890",
        first_name: "John",
        last_name: "Doe",
        city: "São Paulo",
        state: "SP",
        zip: "01000-000",
        country: "BR",
        external_id: "user-123",
      },
    };
    const result = await buildUserData(payload, "10.0.0.1", "Chrome");
    expect(result.em).toHaveLength(1);
    expect(result.ph).toHaveLength(1);
    expect(result.fn).toHaveLength(1);
    expect(result.ln).toHaveLength(1);
    expect(result.ct).toHaveLength(1);
    expect(result.st).toHaveLength(1);
    expect(result.zp).toHaveLength(1);
    expect(result.country).toHaveLength(1);
    expect(result.external_id).toHaveLength(1);
    // All should be SHA-256 hex
    for (const field of [result.em, result.ph, result.fn, result.ln, result.ct, result.st, result.zp, result.country, result.external_id]) {
      expect(field![0]).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("skips empty optional fields", async () => {
    const payload: TrackPayload = {
      workspace_id: "ws-1",
      event_name: "PageView",
      event_id: "evt-5",
      user_data: {
        email: "test@test.com",
      },
    };
    const result = await buildUserData(payload, "1.2.3.4", "UA");
    expect(result.em).toHaveLength(1);
    expect(result.ph).toBeUndefined();
    expect(result.fn).toBeUndefined();
  });
});

describe("sendCapiEvent", () => {
  const mockEnv: Env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    ALLOWED_ORIGINS: "http://localhost:3000",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends event to Meta CAPI endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendCapiEvent("123456", "EAAtoken", {
      event_name: "PageView",
      event_time: 1700000000,
      event_id: "evt-1",
      action_source: "website",
      user_data: { client_ip_address: "1.2.3.4", client_user_agent: "UA" },
    }, mockEnv);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/123456/events");
    const body = JSON.parse(options.body);
    expect(body.data[0].event_name).toBe("PageView");
    expect(body.data[0].event_id).toBe("evt-1");
    expect(body.access_token).toBe("EAAtoken");
  });

  it("includes test_event_code when set in env", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const envWithTest = { ...mockEnv, META_TEST_EVENT_CODE: "TEST12345" };
    await sendCapiEvent("123456", "EAAtoken", {
      event_name: "PageView",
      event_time: 1700000000,
      event_id: "evt-1",
      action_source: "website",
      user_data: {},
    }, envWithTest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.test_event_code).toBe("TEST12345");
  });

  it("returns error on failed request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error": "invalid pixel"}',
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendCapiEvent("bad-pixel", "token", {
      event_name: "PageView",
      event_time: 1700000000,
      event_id: "evt-1",
      action_source: "website",
      user_data: {},
    }, mockEnv);

    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid pixel");
  });
});
