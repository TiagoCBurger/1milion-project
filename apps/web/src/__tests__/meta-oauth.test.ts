import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFacebookAuthUrl } from "@/lib/meta-oauth";

describe("Meta OAuth", () => {
  describe("buildFacebookAuthUrl", () => {
    it("builds a valid Facebook OAuth URL", () => {
      const url = buildFacebookAuthUrl({
        appId: "1234567890",
        redirectUri: "https://example.com/callback",
        state: "random-state-123",
      });

      const parsed = new URL(url);
      expect(parsed.hostname).toBe("www.facebook.com");
      expect(parsed.pathname).toContain("/dialog/oauth");
      expect(parsed.searchParams.get("client_id")).toBe("1234567890");
      expect(parsed.searchParams.get("redirect_uri")).toBe("https://example.com/callback");
      expect(parsed.searchParams.get("state")).toBe("random-state-123");
      expect(parsed.searchParams.get("response_type")).toBe("code");
    });

    it("includes all required OAuth scopes", () => {
      const url = buildFacebookAuthUrl({
        appId: "123",
        redirectUri: "https://example.com/cb",
        state: "state",
      });

      const parsed = new URL(url);
      const scopes = parsed.searchParams.get("scope")!;

      expect(scopes).toContain("ads_management");
      expect(scopes).toContain("ads_read");
      expect(scopes).toContain("business_management");
      expect(scopes).toContain("pages_manage_ads");
      expect(scopes).toContain("pages_read_engagement");
    });

    it("does not include deprecated read_insights scope", () => {
      const url = buildFacebookAuthUrl({
        appId: "123",
        redirectUri: "https://example.com/cb",
        state: "state",
      });
      const parsed = new URL(url);
      const scopes = parsed.searchParams.get("scope")!;
      expect(scopes).not.toContain("read_insights");
    });

    it("properly encodes redirect URI", () => {
      const url = buildFacebookAuthUrl({
        appId: "123",
        redirectUri: "https://example.com/api/auth/facebook/callback?foo=bar",
        state: "state",
      });
      // URL constructor handles encoding
      expect(url).toContain("redirect_uri=");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("redirect_uri")).toBe(
        "https://example.com/api/auth/facebook/callback?foo=bar"
      );
    });
  });
});
