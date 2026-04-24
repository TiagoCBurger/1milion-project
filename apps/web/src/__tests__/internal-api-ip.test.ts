import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateInternalRequest } from "@/lib/internal-api-auth";

const VALID_TOKEN = "a".repeat(32); // 32-char token

function makeRequest(token: string | null, ip?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== null) headers["x-internal-api-token"] = token;
  if (ip) headers["CF-Connecting-IP"] = ip;
  return new Request("http://localhost/api/internal/test", { headers });
}

describe("validateInternalRequest — token authentication", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_TOKEN", VALID_TOKEN);
    vi.stubEnv("INTERNAL_API_ALLOWED_IPS", ""); // no IP allowlist
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null (authorized) for a valid token", () => {
    const result = validateInternalRequest(makeRequest(VALID_TOKEN));
    expect(result).toBeNull();
  });

  it("returns 401 when token is missing", () => {
    const result = validateInternalRequest(makeRequest(null));
    expect(result?.status).toBe(401);
  });

  it("returns 401 when token is wrong", () => {
    const result = validateInternalRequest(makeRequest("b".repeat(32)));
    expect(result?.status).toBe(401);
  });

  it("returns 503 when INTERNAL_API_TOKEN is not configured", () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "");
    const result = validateInternalRequest(makeRequest(VALID_TOKEN));
    expect(result?.status).toBe(503);
  });

  it("returns 503 when INTERNAL_API_TOKEN is shorter than 32 chars", () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "short");
    const result = validateInternalRequest(makeRequest("short"));
    expect(result?.status).toBe(503);
  });

  it("uses constant-time comparison (rejects token with same length but different bytes)", () => {
    const almostRight = "a".repeat(31) + "b"; // same length, different last byte
    const result = validateInternalRequest(makeRequest(almostRight));
    expect(result?.status).toBe(401);
  });
});

describe("validateInternalRequest — IP allowlist (API Internas IP Allowlist)", () => {
  const ALLOWED_IP = "10.0.0.1";
  const BLOCKED_IP = "1.2.3.4";

  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_TOKEN", VALID_TOKEN);
    vi.stubEnv("INTERNAL_API_ALLOWED_IPS", ALLOWED_IP);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows request from an IP in the allowlist", () => {
    const result = validateInternalRequest(makeRequest(VALID_TOKEN, ALLOWED_IP));
    expect(result).toBeNull();
  });

  it("blocks request from an IP NOT in the allowlist", async () => {
    const result = validateInternalRequest(makeRequest(VALID_TOKEN, BLOCKED_IP));
    expect(result?.status).toBe(403);
    const body = await result?.json();
    expect(body.error).toBe("Forbidden");
  });

  it("blocks request with no IP header when allowlist is configured", () => {
    const result = validateInternalRequest(makeRequest(VALID_TOKEN)); // no IP header
    expect(result?.status).toBe(403);
  });

  it("allows multiple IPs from a comma-separated allowlist", () => {
    vi.stubEnv("INTERNAL_API_ALLOWED_IPS", "10.0.0.1, 10.0.0.2, 10.0.0.3");
    const result = validateInternalRequest(makeRequest(VALID_TOKEN, "10.0.0.2"));
    expect(result).toBeNull();
  });

  it("does NOT enforce IP allowlist when env var is empty (backward compatible)", () => {
    vi.stubEnv("INTERNAL_API_ALLOWED_IPS", "");
    // Any IP (or no IP) should pass when allowlist is not configured
    const result = validateInternalRequest(makeRequest(VALID_TOKEN, BLOCKED_IP));
    expect(result).toBeNull();
  });

  it("extracts IP from X-Forwarded-For when CF-Connecting-IP is absent", () => {
    const req = new Request("http://localhost/api/internal/test", {
      headers: {
        "x-internal-api-token": VALID_TOKEN,
        "X-Forwarded-For": `${ALLOWED_IP}, 172.16.0.1`,
      },
    });
    const result = validateInternalRequest(req);
    expect(result).toBeNull();
  });

  it("prefers CF-Connecting-IP over X-Forwarded-For", () => {
    const req = new Request("http://localhost/api/internal/test", {
      headers: {
        "x-internal-api-token": VALID_TOKEN,
        "CF-Connecting-IP": BLOCKED_IP,
        "X-Forwarded-For": ALLOWED_IP, // would pass, but CF header takes priority
      },
    });
    const result = validateInternalRequest(req);
    expect(result?.status).toBe(403);
  });
});
