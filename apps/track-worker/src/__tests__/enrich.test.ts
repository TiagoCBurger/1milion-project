import { describe, it, expect } from "vitest";
import { detectChannel } from "../enrich/channel";
import { splitUrl } from "../enrich/session";
import { parseUa } from "../enrich/ua";
import { isBotRequest } from "../enrich/bot";

describe("detectChannel", () => {
  it("returns direct when no utm and no referrer", () => {
    expect(detectChannel("https://example.com/", undefined).channel).toBe("direct");
  });

  it("detects paid_search from utm_medium=cpc", () => {
    const r = detectChannel("https://example.com/?utm_source=google&utm_medium=cpc&utm_campaign=brand", undefined);
    expect(r.channel).toBe("paid_search");
    expect(r.utm_source).toBe("google");
    expect(r.utm_campaign).toBe("brand");
  });

  it("detects organic_search from google referrer", () => {
    const r = detectChannel("https://example.com/", "https://www.google.com/search?q=x");
    expect(r.channel).toBe("organic_search");
    expect(r.referrer_domain).toBe("google.com");
  });

  it("detects organic_social from instagram referrer", () => {
    expect(detectChannel("https://example.com/", "https://www.instagram.com/p/abc").channel).toBe("organic_social");
  });

  it("falls back to referral for unknown referrer host", () => {
    expect(detectChannel("https://example.com/", "https://blog.partner.io/x").channel).toBe("referral");
  });

  it("utm_medium takes precedence over referrer", () => {
    const r = detectChannel(
      "https://example.com/?utm_medium=email",
      "https://www.google.com/search",
    );
    expect(r.channel).toBe("email");
  });
});

describe("splitUrl", () => {
  it("strips www and exposes hostname + pathname", () => {
    expect(splitUrl("https://www.example.com/foo/bar?x=1")).toEqual({
      hostname: "example.com",
      pathname: "/foo/bar",
    });
  });

  it("handles invalid URL gracefully", () => {
    expect(splitUrl("not a url")).toEqual({ hostname: "", pathname: "" });
  });
});

describe("parseUa", () => {
  it("parses Chrome on macOS as desktop", () => {
    const r = parseUa(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    );
    expect(r.browser).toBe("Chrome");
    expect(r.os).toMatch(/Mac/i);
    expect(r.device_type).toBe("desktop");
  });

  it("returns empty object for missing UA", () => {
    expect(parseUa(undefined)).toEqual({});
  });
});

describe("isBotRequest", () => {
  it("detects googlebot", () => {
    expect(isBotRequest("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
  });

  it("treats missing UA as bot", () => {
    expect(isBotRequest(undefined)).toBe(true);
  });

  it("accepts real Chrome UA", () => {
    expect(
      isBotRequest(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});
