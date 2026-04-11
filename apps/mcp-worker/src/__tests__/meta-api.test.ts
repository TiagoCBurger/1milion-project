import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  metaApiGet,
  metaApiPost,
  ensureActPrefix,
  textResult,
  centsToAmount,
  sanitizeMetaApiPayloadForClient,
} from "../meta-api";

describe("ensureActPrefix", () => {
  it("adds act_ prefix when missing", () => {
    expect(ensureActPrefix("123456")).toBe("act_123456");
  });

  it("does not double-prefix", () => {
    expect(ensureActPrefix("act_123456")).toBe("act_123456");
  });
});

describe("centsToAmount", () => {
  it("converts cents to dollars for USD", () => {
    expect(centsToAmount(1500, "USD")).toBe("15.00");
  });

  it("converts cents to euros for EUR", () => {
    expect(centsToAmount(999, "EUR")).toBe("9.99");
  });

  it("does not divide for zero-decimal currencies (JPY)", () => {
    expect(centsToAmount(1500, "JPY")).toBe("1500");
  });

  it("does not divide for KRW", () => {
    expect(centsToAmount(50000, "KRW")).toBe("50000");
  });

  it("handles zero", () => {
    expect(centsToAmount(0, "USD")).toBe("0.00");
  });

  it("returns string for NaN input", () => {
    expect(centsToAmount("invalid", "USD")).toBe("invalid");
  });

  it("handles string number input", () => {
    expect(centsToAmount("2500", "USD")).toBe("25.00");
  });
});

describe("sanitizeMetaApiPayloadForClient", () => {
  it("removes paging.next and paging.previous but keeps cursors", () => {
    const raw = {
      data: [{ id: "1" }],
      paging: {
        cursors: { before: "abc", after: "def" },
        next: "https://graph.facebook.com/v24.0/act_1/ads?access_token=SECRET&after=def",
        previous: "https://graph.facebook.com/v24.0/act_1/ads?access_token=SECRET&before=abc",
      },
    };
    expect(sanitizeMetaApiPayloadForClient(raw)).toEqual({
      data: [{ id: "1" }],
      paging: {
        cursors: { before: "abc", after: "def" },
      },
    });
  });

  it("sanitizes nested paging objects", () => {
    const raw = {
      outer: {
        paging: { next: "https://example.com?access_token=x", cursors: {} },
      },
    };
    const out = sanitizeMetaApiPayloadForClient(raw) as typeof raw;
    expect(out.outer.paging).not.toHaveProperty("next");
    expect(out.outer.paging).toEqual({ cursors: {} });
  });
});

describe("textResult", () => {
  it("wraps object as JSON text content", () => {
    const result = textResult({ ok: true });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual({ ok: true });
    expect(result.isError).toBe(false);
  });

  it("strips tokenized paging URLs from serialized objects", () => {
    const result = textResult({
      paging: {
        cursors: { after: "cursor1" },
        next: "https://graph.facebook.com/v24.0/x?access_token=LEAK",
      },
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.paging).toEqual({ cursors: { after: "cursor1" } });
    expect(JSON.stringify(parsed)).not.toContain("LEAK");
    expect(JSON.stringify(parsed)).not.toContain("access_token");
  });

  it("wraps string as text content directly", () => {
    const result = textResult("hello");
    expect(result.content[0].text).toBe("hello");
    expect(result.isError).toBe(false);
  });

  it("sets isError flag", () => {
    const result = textResult({ error: "bad" }, true);
    expect(result.isError).toBe(true);
  });
});

describe("metaApiGet", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("builds correct URL with token and params", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      json: async () => ({ data: [] }),
    });

    await metaApiGet("me/adaccounts", "test_token", {
      fields: "id,name",
      limit: 10,
    });

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    const url = new URL(calledUrl);
    expect(url.pathname).toBe("/v24.0/me/adaccounts");
    expect(url.searchParams.get("access_token")).toBe("test_token");
    expect(url.searchParams.get("fields")).toBe("id,name");
    expect(url.searchParams.get("limit")).toBe("10");
  });

  it("skips null/undefined params", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      json: async () => ({ data: [] }),
    });

    await metaApiGet("me/adaccounts", "tok", {
      fields: "id",
      nothing: undefined,
      empty: null,
    } as any);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    const url = new URL(calledUrl);
    expect(url.searchParams.has("nothing")).toBe(false);
    expect(url.searchParams.has("empty")).toBe(false);
  });

  it("JSON-stringifies non-string params", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      json: async () => ({}),
    });

    await metaApiGet("search", "tok", {
      type: "adinterest",
      limit: 25,
    });

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    const url = new URL(calledUrl);
    expect(url.searchParams.get("type")).toBe("adinterest");
    expect(url.searchParams.get("limit")).toBe("25");
  });

  it("returns NetworkError object when fetch throws", async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error("DNS failure"));

    const result = await metaApiGet("me/adaccounts", "tok");

    expect((result as any).error).toBeDefined();
    expect((result as any).error.type).toBe("NetworkError");
    expect((result as any).error.message).toContain("DNS failure");
  });
});

describe("metaApiPost", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends POST with form-encoded body", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      json: async () => ({ id: "123" }),
    });

    await metaApiPost("act_123/campaigns", "test_token", {
      name: "My Campaign",
      objective: "OUTCOME_TRAFFIC",
    });

    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v24.0/act_123/campaigns");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );

    const body = new URLSearchParams(opts.body);
    expect(body.get("access_token")).toBe("test_token");
    expect(body.get("name")).toBe("My Campaign");
    expect(body.get("objective")).toBe("OUTCOME_TRAFFIC");
  });
});
