import { describe, it, expect, vi, afterEach } from "vitest";
import { hotmartAuth, hotmartDataGet, HOTMART_OAUTH_URL } from "../api";

describe("hotmart api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hotmartAuth posts form body and Basic header", async () => {
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
    expect(url).toBe(HOTMART_OAUTH_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Basic basic64"
    );
    const body = init.body as string;
    expect(body).toContain("grant_type=client_credentials");
    expect(body).toContain("client_id=cid");
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
