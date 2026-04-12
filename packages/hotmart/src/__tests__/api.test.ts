import { describe, it, expect, vi, afterEach } from "vitest";
import {
  hotmartAuth,
  hotmartDataGet,
  HOTMART_OAUTH_URL,
  normalizeHotmartBasicToken,
} from "../api";

describe("hotmart api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizeHotmartBasicToken strips Hotmart portal Basic prefix", () => {
    expect(normalizeHotmartBasicToken("  abc  ")).toBe("abc");
    expect(normalizeHotmartBasicToken("Basic abc")).toBe("abc");
    expect(normalizeHotmartBasicToken("basic\tabc")).toBe("abc");
  });

  it("hotmartAuth POSTs with query params and Basic header", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ access_token: "tok", expires_in: 100 }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await hotmartAuth("cid", "csec", "basic64");
    expect(r).toEqual(
      expect.objectContaining({ accessToken: "tok" })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(HOTMART_OAUTH_URL);
    expect(u.searchParams.get("grant_type")).toBe("client_credentials");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("client_secret")).toBe("csec");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Basic basic64"
    );
    expect(init.body).toBeUndefined();
  });

  it("hotmartAuth accepts Basic value copied from Hotmart UI (no double prefix)", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ access_token: "tok", expires_in: 100 }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await hotmartAuth("cid", "csec", "Basic basic64");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Basic basic64"
    );
  });

  it("hotmartAuth returns error on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: "invalid" }), {
          status: 401,
        });
      })
    );
    const r = await hotmartAuth("a", "b", "c");
    expect(r).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  it("hotmartDataGet sends Bearer token", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await hotmartDataGet("/products/api/v1/products", {}, "bear");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer bear",
    });
  });
});
