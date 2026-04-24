import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Supabase ────────────────────────────────────────────

const mockSignUp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signUp: mockSignUp },
  })),
}));

// ── Helper ───────────────────────────────────────────────────

function signupRequest(
  body: Record<string, unknown>,
  ip = "1.2.3.4"
): Request {
  return new Request("http://localhost:3000/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("POST /api/auth/signup — AUTH-VULN-02: account enumeration protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the same generic message when email is already registered", async () => {
    // Supabase returns success (user already exists but response is normalised)
    mockSignUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });

    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest({ email: "existing@test.com", password: "Str0ng!Pass#1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toContain("confirmation link");
  });

  it("returns the identical message for registered and unregistered emails (indistinguishable)", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");

    mockSignUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    const registered = await (await POST(signupRequest({ email: "reg@test.com", password: "Str0ng!Pass#1" }, "5.5.5.1"))).json();

    mockSignUp.mockResolvedValue({ data: null, error: { message: "Error sending confirmation email" } });
    const unregistered = await (await POST(signupRequest({ email: "new@test.com", password: "Str0ng!Pass#1" }, "5.5.5.2"))).json();

    expect(registered.message).toBe(unregistered.message);
  });

  it("returns the same generic message when SMTP fails for unregistered email", async () => {
    // Simulates SMTP not configured — Supabase returns 500-style error
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: "Error sending confirmation email" },
    });

    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest({ email: "newuser@test.com", password: "Str0ng!Pass#1" }));
    const body = await res.json();

    // Must NOT distinguish from the "already registered" case
    expect(res.status).toBe(200);
    expect(body.message).toContain("confirmation link");
    expect(body.error).toBeUndefined();
  });

  it("exposes password-policy errors so the user can fix their password", async () => {
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: "Password should be at least 12 characters" },
    });

    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest({ email: "user@test.com", password: "weak" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("Password");
  });

  it("exposes password-complexity errors", async () => {
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: "Password should contain at least one uppercase letter" },
    });

    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(signupRequest({ email: "user@test.com", password: "alllowercase1!" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("rate-limits after more than 5 attempts from the same IP", async () => {
    mockSignUp.mockResolvedValue({ data: { user: null, session: null }, error: null });

    const { POST } = await import("@/app/api/auth/signup/route");
    const ip = "10.0.0.99"; // unique IP for this test group

    // First 5 requests should pass
    for (let i = 0; i < 5; i++) {
      const res = await POST(signupRequest({ email: `u${i}@test.com`, password: "Str0ng!Pass#1" }, ip));
      expect(res.status).toBe(200);
    }

    // 6th request from the same IP → 429
    const blocked = await POST(
      signupRequest({ email: "extra@test.com", password: "Str0ng!Pass#1" }, ip)
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("900");
  });

  it("allows requests from different IPs independently", async () => {
    mockSignUp.mockResolvedValue({ data: { user: null, session: null }, error: null });

    const { POST } = await import("@/app/api/auth/signup/route");

    const resA = await POST(signupRequest({ email: "a@test.com", password: "Str0ng!Pass#1" }, "192.168.1.1"));
    const resB = await POST(signupRequest({ email: "b@test.com", password: "Str0ng!Pass#1" }, "192.168.1.2"));

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
  });

  it("rejects missing email or password with 400", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");

    const res = await POST(signupRequest({ email: "only@test.com" }));
    expect(res.status).toBe(400);
  });
});
