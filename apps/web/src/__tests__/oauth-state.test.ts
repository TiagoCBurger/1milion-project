import { describe, it, expect } from "vitest";
import {
  createOAuthStateCookie,
  validateOAuthStateCookie,
  parseFbOAuthCookie,
  clearOAuthStateCookie,
} from "@/lib/oauth-state";

describe("OAuth State Cookie", () => {
  const workspaceId = "ws-abc-123";
  const slug = "my-workspace";

  describe("createOAuthStateCookie", () => {
    it("generates a 64-char hex state", () => {
      const { state } = createOAuthStateCookie(workspaceId, slug, true);
      expect(state).toMatch(/^[a-f0-9]{64}$/);
    });

    it("generates unique state on each call", () => {
      const a = createOAuthStateCookie(workspaceId, slug, true);
      const b = createOAuthStateCookie(workspaceId, slug, true);
      expect(a.state).not.toBe(b.state);
    });

    it("sets HttpOnly flag", () => {
      const { cookieHeader } = createOAuthStateCookie(workspaceId, slug, true);
      expect(cookieHeader).toContain("HttpOnly");
    });

    it("sets SameSite=Lax", () => {
      const { cookieHeader } = createOAuthStateCookie(workspaceId, slug, true);
      expect(cookieHeader).toContain("SameSite=Lax");
    });

    it("sets Secure flag when isSecure=true", () => {
      const { cookieHeader } = createOAuthStateCookie(workspaceId, slug, true);
      expect(cookieHeader).toContain("Secure");
    });

    it("omits Secure flag when isSecure=false", () => {
      const { cookieHeader } = createOAuthStateCookie(workspaceId, slug, false);
      expect(cookieHeader).not.toContain("Secure");
    });

    it("sets Max-Age to 600 seconds", () => {
      const { cookieHeader } = createOAuthStateCookie(workspaceId, slug, true);
      expect(cookieHeader).toContain("Max-Age=600");
    });

    it("scopes cookie path to /api/auth/facebook", () => {
      const { cookieHeader } = createOAuthStateCookie(workspaceId, slug, true);
      expect(cookieHeader).toContain("Path=/api/auth/facebook");
    });
  });

  describe("validateOAuthStateCookie", () => {
    it("validates a matching state and returns workspace info", () => {
      const { state, cookieHeader } = createOAuthStateCookie(workspaceId, slug, true);
      const cookieValue = cookieHeader.split("=")[1].split(";")[0];

      const result = validateOAuthStateCookie(cookieValue, state);
      expect(result).toEqual({ workspaceId, slug });
    });

    it("rejects mismatched state", () => {
      const { cookieHeader } = createOAuthStateCookie(workspaceId, slug, true);
      const cookieValue = cookieHeader.split("=")[1].split(";")[0];

      const result = validateOAuthStateCookie(cookieValue, "wrong-state");
      expect(result).toBeNull();
    });

    it("returns null for undefined cookie", () => {
      const result = validateOAuthStateCookie(undefined, "some-state");
      expect(result).toBeNull();
    });

    it("returns null for corrupted cookie value", () => {
      const result = validateOAuthStateCookie("not-valid-base64url!!!", "some-state");
      expect(result).toBeNull();
    });

    it("returns null for valid base64 but invalid JSON", () => {
      const encoded = Buffer.from("not json").toString("base64url");
      const result = validateOAuthStateCookie(encoded, "some-state");
      expect(result).toBeNull();
    });
  });

  describe("parseFbOAuthCookie", () => {
    it("extracts cookie value from header", () => {
      const result = parseFbOAuthCookie("other=xyz; fb_oauth_state=abc123; foo=bar");
      expect(result).toBe("abc123");
    });

    it("works when fb_oauth_state is first cookie", () => {
      const result = parseFbOAuthCookie("fb_oauth_state=abc123; other=xyz");
      expect(result).toBe("abc123");
    });

    it("returns undefined when cookie not present", () => {
      const result = parseFbOAuthCookie("other=xyz; another=123");
      expect(result).toBeUndefined();
    });

    it("returns undefined for null header", () => {
      const result = parseFbOAuthCookie(null);
      expect(result).toBeUndefined();
    });
  });

  describe("clearOAuthStateCookie", () => {
    it("sets Max-Age=0 to expire the cookie", () => {
      const header = clearOAuthStateCookie(true);
      expect(header).toContain("Max-Age=0");
    });

    it("clears the value", () => {
      const header = clearOAuthStateCookie(true);
      expect(header).toMatch(/^fb_oauth_state=;/);
    });
  });
});
